/**
 * Server-side transcript fetching.
 * This file imports Node.js-only packages — do NOT import from client components.
 * For client-safe utils, import from '@/lib/video-utils' instead.
 *
 * Architecture:
 *   Phase 1 — Caption race (Promise.any): CF Worker (Vercel only) + web scrape + caption-extractor + Innertube + yt-dlp
 *   Phase 2 — STT cascade (sequential): Innertube audio → web scrape audio (Groq/Deepgram) → yt-dlp + Whisper
 */

import { execFile } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { readFile, unlink } from 'fs/promises';
import { withRetry, withTimeout } from './retry';
import { isGroqAvailable, transcribeWithGroq } from './stt/groq-whisper';
import { isDeepgramAvailable, transcribeWithDeepgram } from './stt/deepgram';

// Re-export client-safe types and functions so API routes can use them
export type { TranscriptSegment, TranscriptSource, TranscriptResult } from './video-utils';
export { formatTimestamp, parseTimestampLinks, extractVideoId } from './video-utils';
// buildVideoContext was removed — video-chat now sends full transcript with priority markers

import type { TranscriptSegment, TranscriptResult } from './video-utils';

// ─── Constants ──────────────────────────────────────────────────────────────

const IS_VERCEL = !!process.env.VERCEL;
const INNERTUBE_KEY = process.env.YOUTUBE_INNERTUBE_KEY || 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w';
const INNERTUBE_CLIENT_VERSION = process.env.YOUTUBE_CLIENT_VERSION || '19.44.38';
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25MB — Groq's Whisper limit
const ALLOWED_CAPTION_HOSTS = ['www.youtube.com', 'youtube.com', 'www.google.com'];
const ALLOWED_AUDIO_HOSTS = ['rr', 'redirector.googlevideo.com']; // googlevideo CDN uses rr*.googlevideo.com

// ─── Innertube types ───────────────────────────────────────────────────────────

interface InnertubePlayerResponse {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: Array<{
        baseUrl: string;
        languageCode: string;
        kind?: string; // 'asr' for auto-generated
      }>;
    };
  };
  streamingData?: {
    adaptiveFormats?: Array<{
      itag: number;
      url?: string;
      mimeType: string;
      contentLength?: string;
      approxDurationMs?: string;
    }>;
  };
}

interface Json3Response {
  events?: Array<{
    tStartMs: number;
    dDurationMs?: number;
    segs?: Array<{ utf8: string; tOffsetMs?: number }>;
  }>;
}

function extractWords(
  segs: Array<{ utf8: string; tOffsetMs?: number }>,
  eventStartMs: number,
): Array<{ text: string; startMs: number }> | undefined {
  const hasOffsets = segs.some((s) => s.tOffsetMs !== undefined);
  if (!hasOffsets) return undefined;
  const words: Array<{ text: string; startMs: number }> = [];
  for (const s of segs) {
    const text = s.utf8.trim();
    if (!text || text === '\n') continue;
    words.push({ text, startMs: eventStartMs + (s.tOffsetMs ?? 0) });
  }
  return words.length > 0 ? words : undefined;
}

/**
 * Parse YouTube's XML timedtext format (returned by ANDROID client).
 * Format: <timedtext><body><p t="14980" d="1480">text</p>...</body></timedtext>
 */
function parseTimedTextXml(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  // Match <p t="ms" d="ms">text</p> elements
  const regex = /<p\s+t="(\d+)"(?:\s+d="(\d+)")?[^>]*>([^<]*(?:<[^/][^<]*)*?)<\/p>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const offset = parseInt(match[1], 10) / 1000;
    const duration = match[2] ? parseInt(match[2], 10) / 1000 : 0;
    // Decode HTML entities (comprehensive)
    const text = match[3]
      .replace(/<[^>]+>/g, '') // strip inner tags
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&mdash;/g, '\u2014')
      .replace(/&ndash;/g, '\u2013')
      .replace(/&hellip;/g, '\u2026')
      .replace(/&lsquo;/g, '\u2018')
      .replace(/&rsquo;/g, '\u2019')
      .replace(/&ldquo;/g, '\u201C')
      .replace(/&rdquo;/g, '\u201D')
      .trim();
    if (text) {
      segments.push({ text, offset, duration });
    }
  }
  return segments;
}

// ─── Shared: Innertube player request ─────────────────────────────────────────

async function fetchInnertubePlayer(videoId: string): Promise<InnertubePlayerResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}&prettyPrint=false`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `com.google.android.youtube/${INNERTUBE_CLIENT_VERSION} (Linux; U; Android 14)`,
        'X-YouTube-Client-Name': '3',
        'X-YouTube-Client-Version': INNERTUBE_CLIENT_VERSION,
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: INNERTUBE_CLIENT_VERSION,
            androidSdkVersion: 34,
            hl: 'en',
            gl: 'US',
          },
        },
      }),
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`Innertube request failed: ${resp.status}`);
    return (await resp.json()) as InnertubePlayerResponse;
  } finally {
    clearTimeout(timeout);
  }
}

/** Validate that a URL points to a known YouTube/Google domain (SSRF prevention). */
function isAllowedYouTubeUrl(urlStr: string, allowedPrefixes: string[]): boolean {
  try {
    const u = new URL(urlStr);
    return allowedPrefixes.some((prefix) =>
      u.hostname === prefix || u.hostname.endsWith(`.${prefix}`) || u.hostname.endsWith('.googlevideo.com')
    );
  } catch {
    return false;
  }
}

// ─── Tier 1: Innertube API (ANDROID client) ─────────────────────────────────────
//
// YouTube's WEB client no longer returns caption tracks as of early 2025.
// The ANDROID client still returns them, but caption URLs serve XML timedtext
// instead of JSON3 (the fmt param is ignored). We parse the XML directly.

async function fetchTranscriptInnertube(videoId: string): Promise<TranscriptSegment[]> {
  const data = await fetchInnertubePlayer(videoId);
  const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || tracks.length === 0) throw new Error('No caption tracks found');

  // Prefer English manual captions over ASR
  const enTracks = tracks.filter((t) => t.languageCode.startsWith('en'));
  const manual = enTracks.find((t) => t.kind !== 'asr');
  const track = manual || enTracks[0] || tracks[0];

  // SSRF check: ensure caption URL points to YouTube/Google
  if (!isAllowedYouTubeUrl(track.baseUrl, ALLOWED_CAPTION_HOSTS)) {
    throw new Error('Caption URL points to unexpected host');
  }

  // Fetch captions (ANDROID client returns XML timedtext regardless of fmt param)
  const captionController = new AbortController();
  const captionTimeout = setTimeout(() => captionController.abort(), 10000);
  let captionResp;
  try {
    captionResp = await fetch(track.baseUrl, { signal: captionController.signal });
  } finally {
    clearTimeout(captionTimeout);
  }
  if (!captionResp.ok) throw new Error(`Caption fetch failed: ${captionResp.status}`);

  const body = await captionResp.text();

  // Try JSON3 first (in case YouTube changes behavior), fall back to XML
  let segments: TranscriptSegment[];
  try {
    const json3 = JSON.parse(body) as Json3Response;
    if (json3.events) {
      segments = json3.events
        .filter((e) => e.segs && e.segs.length > 0)
        .map((e) => ({
          text: e.segs!.map((s) => s.utf8).join(''),
          offset: e.tStartMs / 1000,
          duration: (e.dDurationMs || 0) / 1000,
          words: extractWords(e.segs!, e.tStartMs),
        }));
    } else {
      segments = [];
    }
  } catch {
    // Not JSON — parse as XML timedtext
    segments = parseTimedTextXml(body);
  }

  if (segments.length === 0) throw new Error('Innertube: returned 0 segments');
  return segments;
}

// ─── Tier 1b: Web page scrape (extract ytInitialPlayerResponse from HTML) ────
//
// Fetches the YouTube watch page with browser-like headers and extracts
// the embedded player response. More reliable from datacenter IPs than
// the Innertube API POST because it looks like a normal page visit.

async function fetchTranscriptWebScrape(videoId: string): Promise<TranscriptSegment[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let resp;
  try {
    resp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!resp.ok) throw new Error(`YouTube page fetch failed: ${resp.status}`);

  const html = await resp.text();

  // Extract ytInitialPlayerResponse from the page source
  const playerMatch = html.match(/var\s+ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\});\s*(?:var|<\/script>)/);
  if (!playerMatch) throw new Error('Could not find ytInitialPlayerResponse in page HTML');

  let playerData: InnertubePlayerResponse;
  try {
    playerData = JSON.parse(playerMatch[1]) as InnertubePlayerResponse;
  } catch {
    throw new Error('Failed to parse ytInitialPlayerResponse JSON');
  }

  const tracks = playerData.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || tracks.length === 0) throw new Error('Web scrape: no caption tracks found');

  // Prefer English manual captions over ASR
  const enTracks = tracks.filter((t) => t.languageCode.startsWith('en'));
  const manual = enTracks.find((t) => t.kind !== 'asr');
  const track = manual || enTracks[0] || tracks[0];

  // Fetch caption URL with JSON3 format
  const captionUrl = new URL(track.baseUrl);
  captionUrl.searchParams.set('fmt', 'json3');

  const captionController = new AbortController();
  const captionTimeout = setTimeout(() => captionController.abort(), 10000);
  let captionResp;
  try {
    captionResp = await fetch(captionUrl.toString(), { signal: captionController.signal });
  } finally {
    clearTimeout(captionTimeout);
  }
  if (!captionResp.ok) throw new Error(`Web scrape caption fetch failed: ${captionResp.status}`);

  const body = await captionResp.text();

  let segments: TranscriptSegment[];
  try {
    const json3 = JSON.parse(body) as Json3Response;
    if (json3.events) {
      segments = json3.events
        .filter((e) => e.segs && e.segs.length > 0)
        .map((e) => ({
          text: e.segs!.map((s) => s.utf8).join(''),
          offset: e.tStartMs / 1000,
          duration: (e.dDurationMs || 0) / 1000,
          words: extractWords(e.segs!, e.tStartMs),
        }));
    } else {
      segments = [];
    }
  } catch {
    // Fall back to XML parsing
    segments = parseTimedTextXml(body);
  }

  if (segments.length === 0) throw new Error('Web scrape: returned 0 segments');
  console.log(`[transcript] web scrape: got ${segments.length} segments`);
  return segments;
}

// ─── Tier 2: yt-dlp CLI (write subs to file) ───────────────────────────────────

async function fetchTranscriptYtDlp(videoId: string): Promise<TranscriptSegment[]> {
  const tempBase = join(tmpdir(), `chalk-subs-${randomBytes(6).toString('hex')}`);
  const expectedSubFile = `${tempBase}.en.json3`;

  try {
    // Use execFile directly so yt-dlp goes through full client negotiation
    // (JS challenge solving, multiple client fallbacks) instead of dumpJson
    // which uses a lightweight metadata path that YouTube now blocks.
    await execFilePromise('yt-dlp', [
      `https://www.youtube.com/watch?v=${videoId}`,
      '--write-auto-sub',
      '--sub-lang', 'en',
      '--sub-format', 'json3',
      '--skip-download',
      '-o', tempBase,
    ], 30_000); // 30s for subtitle extraction

    // yt-dlp writes the sub file as <output>.en.json3
    const raw = await readFile(expectedSubFile, 'utf-8');
    const data = JSON.parse(raw) as Json3Response;

    if (!data.events) throw new Error('No events in json3 subtitle file');

    const segments = data.events
      .filter((e) => e.segs && e.segs.length > 0)
      .map((e) => ({
        text: e.segs!.map((s) => s.utf8).join(''),
        offset: e.tStartMs / 1000,
        duration: (e.dDurationMs || 0) / 1000,
        words: extractWords(e.segs!, e.tStartMs),
      }));

    if (segments.length === 0) throw new Error('yt-dlp: json3 had 0 segments');
    return segments;
  } finally {
    await unlink(expectedSubFile).catch(() => {});
  }
}

// ─── STT: Local Whisper CLI ───────────────────────────────────────────────────

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

interface WhisperOutput {
  segments: WhisperSegment[];
}

function execFilePromise(cmd: string, args: string[], timeoutMs = 60_000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve({ stdout, stderr });
    });
  });
}

/**
 * Returns the path to the local Whisper CLI, or null if not configured/available.
 */
function getWhisperCliPath(): string | null {
  // Explicit env var takes priority
  if (process.env.WHISPER_CLI_PATH) return process.env.WHISPER_CLI_PATH;
  // Dev-only default
  if (process.env.NODE_ENV === 'development') return '/opt/homebrew/bin/whisper';
  return null;
}

async function fetchTranscriptLocalWhisper(audioPath: string): Promise<TranscriptSegment[]> {
  const whisperPath = getWhisperCliPath();
  if (!whisperPath) throw new Error('Local Whisper not available (WHISPER_CLI_PATH not set)');

  const jsonPath = audioPath.replace(/\.wav$/, '.json');

  try {
    console.log(`[transcript] running local Whisper on ${audioPath}...`);
    await execFilePromise(whisperPath, [
      audioPath,
      '--model', 'base',
      '--output_format', 'json',
      '--language', 'en',
      '--output_dir', tmpdir(),
    ], 180_000); // 3 min for Whisper transcription

    const raw = await readFile(jsonPath, 'utf-8');
    const data = JSON.parse(raw) as WhisperOutput;

    if (!data.segments || data.segments.length === 0) {
      throw new Error('Whisper produced no segments');
    }

    return data.segments.map((s) => ({
      text: s.text.trim(),
      offset: s.start,
      duration: s.end - s.start,
    }));
  } finally {
    await unlink(jsonPath).catch(() => {});
  }
}

// ─── Audio download helper for STT tiers ───────────────────────────────────────

/**
 * Download audio from pre-fetched adaptive formats.
 * Selects smallest audio stream, validates SSRF, downloads with size guard.
 */
async function downloadAudioFromFormats(
  formats: NonNullable<InnertubePlayerResponse['streamingData']>['adaptiveFormats'],
  videoId: string,
): Promise<Buffer> {
  if (!formats || formats.length === 0) throw new Error('No streaming formats available');

  // Find an audio-only stream (prefer mp4a/opus, smallest file)
  const audioFormats = formats
    .filter((f) => f.mimeType.startsWith('audio/') && f.url)
    .sort((a, b) => parseInt(a.contentLength || '999999999') - parseInt(b.contentLength || '999999999'));

  if (audioFormats.length === 0) throw new Error('No audio streams with direct URLs');

  const chosen = audioFormats[0];
  const audioUrl = chosen.url!;

  // SSRF check: ensure audio URL points to Google CDN
  if (!isAllowedYouTubeUrl(audioUrl, ALLOWED_AUDIO_HOSTS)) {
    throw new Error('Audio URL points to unexpected host');
  }

  // Pre-check size from metadata
  const declaredSize = parseInt(chosen.contentLength || '0');
  if (declaredSize > MAX_AUDIO_BYTES) {
    throw new Error(`Audio too large (${Math.round(declaredSize / 1024 / 1024)}MB, max ${MAX_AUDIO_BYTES / 1024 / 1024}MB)`);
  }

  console.log(`[transcript] downloading audio via HTTP (itag ${chosen.itag}, ~${Math.round(declaredSize / 1024)}KB)`);

  // Download the audio stream with size enforcement
  const audioController = new AbortController();
  const audioTimeout = setTimeout(() => audioController.abort(), 120000);
  try {
    const audioResp = await fetch(audioUrl, { signal: audioController.signal });
    if (!audioResp.ok) throw new Error(`Audio download failed: ${audioResp.status}`);

    // Check Content-Length header
    const contentLength = parseInt(audioResp.headers.get('content-length') || '0');
    if (contentLength > MAX_AUDIO_BYTES) {
      throw new Error(`Audio too large (${Math.round(contentLength / 1024 / 1024)}MB, max ${MAX_AUDIO_BYTES / 1024 / 1024}MB)`);
    }

    // Stream with size guard
    const reader = audioResp.body?.getReader();
    if (!reader) throw new Error('No response body');
    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalSize += value.byteLength;
      if (totalSize > MAX_AUDIO_BYTES) {
        reader.cancel();
        throw new Error(`Audio exceeded ${MAX_AUDIO_BYTES / 1024 / 1024}MB during download`);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(audioTimeout);
  }
}

/**
 * Download audio from YouTube via Innertube streaming URLs (HTTP-only, no yt-dlp needed).
 * Fetches the player response to get adaptive audio stream URLs, then downloads directly.
 */
export async function downloadAudioHTTP(videoId: string): Promise<Buffer> {
  const data = await fetchInnertubePlayer(videoId);
  return downloadAudioFromFormats(data.streamingData?.adaptiveFormats, videoId);
}

/**
 * Download audio by scraping the YouTube watch page HTML.
 * More reliable from datacenter IPs than the Innertube POST because it looks like a browser visit.
 */
export async function downloadAudioWebScrape(videoId: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let resp;
  try {
    resp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!resp.ok) throw new Error(`YouTube page fetch failed: ${resp.status}`);
  const html = await resp.text();

  const playerMatch = html.match(/var\s+ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\});\s*(?:var|<\/script>)/);
  if (!playerMatch) throw new Error('Could not find ytInitialPlayerResponse in page HTML');

  let playerData: InnertubePlayerResponse;
  try {
    playerData = JSON.parse(playerMatch[1]) as InnertubePlayerResponse;
  } catch {
    throw new Error('Failed to parse ytInitialPlayerResponse JSON');
  }

  const formats = playerData.streamingData?.adaptiveFormats;
  console.log(`[transcript] web scrape audio: got ${formats?.length ?? 0} formats`);
  return downloadAudioFromFormats(formats, videoId);
}

/**
 * Download audio from a YouTube video as WAV (16kHz mono) to a temp file.
 * Uses yt-dlp CLI (not available on Vercel). Use downloadAudioHTTP for serverless.
 */
export async function downloadAudio(videoId: string): Promise<string> {
  const { default: youtubedl } = await import('youtube-dl-exec');
  const tempPath = join(tmpdir(), `chalk-audio-${randomBytes(6).toString('hex')}.wav`);

  await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
    extractAudio: true,
    audioFormat: 'wav',
    output: tempPath,
    postprocessorArgs: 'ffmpeg:-ar 16000 -ac 1',
  } as Parameters<typeof youtubedl>[1]);

  return tempPath;
}

// ─── Cloudflare Worker proxy ────────────────────────────────────────────────────

const CF_WORKER_PER_CALL_TIMEOUT = 15_000; // 15s per individual Worker call
const CF_WORKER_TOTAL_TIMEOUT = 40_000;    // 40s total for all retries

async function fetchTranscriptCfWorker(videoId: string): Promise<TranscriptSegment[]> {
  const url = process.env.CF_TRANSCRIPT_WORKER_URL?.trim();
  if (!url) throw new Error('CF_TRANSCRIPT_WORKER_URL not set');
  const fetchUrl = `${url}?v=${videoId}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CF_WORKER_PER_CALL_TIMEOUT);
  try {
    const resp = await fetch(fetchUrl, { signal: controller.signal });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`CF Worker: ${resp.status} - ${body.slice(0, 200)}`);
    }
    const data = (await resp.json()) as { segments?: TranscriptSegment[]; error?: string };
    if (data.error) throw new Error(`CF Worker: ${data.error}`);
    if (!data.segments?.length) throw new Error('CF Worker: no segments');
    return data.segments;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Phase 1: Caption race ─────────────────────────────────────────────────────

interface CaptionRaceResult {
  segments: TranscriptSegment[];
  source: 'innertube' | 'web-scrape' | 'yt-dlp' | 'caption-extractor' | 'cf-worker';
}

const INNERTUBE_TIMEOUT = 15_000;         // 15s — Innertube is fast when it works
const WEBSCRAPE_TIMEOUT = 20_000;         // 20s — page fetch + caption fetch
const CAPTION_EXTRACTOR_TIMEOUT = 20_000; // 20s — third-party caption extraction
const YTDLP_TIMEOUT = 30_000;            // 30s — yt-dlp needs time for JS challenge solving
const RACE_TIMEOUT = 50_000;             // 50s overall caption race (CF Worker gets 3 retries)
const STT_STRATEGY_TIMEOUT = 60_000;     // 60s per STT strategy (audio download + transcription)
const PIPELINE_TIMEOUT = 240_000;        // 240s overall pipeline (leave 60s buffer for Vercel 300s)

async function fetchTranscriptCaptionExtractor(videoId: string): Promise<TranscriptSegment[]> {
  const { getSubtitles } = await import('youtube-caption-extractor');
  const subtitles = await getSubtitles({ videoID: videoId, lang: 'en' });
  if (!subtitles || subtitles.length === 0) throw new Error('caption-extractor: no subtitles found');
  const segments = subtitles.map((s: { start: string; dur: string; text: string }) => ({
    text: s.text,
    offset: parseFloat(s.start) || 0,
    duration: parseFloat(s.dur) || 0,
  }));
  if (segments.length === 0) throw new Error('caption-extractor: returned 0 segments');
  console.log(`[transcript] caption-extractor: got ${segments.length} segments`);
  return segments;
}

export async function captionRace(videoId: string): Promise<CaptionRaceResult> {
  const raceStart = Date.now();

  // Caption tiers run concurrently — first non-empty result wins.
  // On Vercel, CF Worker is prepended as primary tier (YouTube blocks AWS/Vercel IPs).
  const cfWorkerUrl = process.env.CF_TRANSCRIPT_WORKER_URL?.trim();
  const tiers: Array<{ fn: () => Promise<TranscriptSegment[]>; source: CaptionRaceResult['source']; timeout: number }> = [
    ...(IS_VERCEL && cfWorkerUrl
      ? [{ fn: () => fetchTranscriptCfWorker(videoId), source: 'cf-worker' as const, timeout: CF_WORKER_TOTAL_TIMEOUT }]
      : []),
    { fn: () => fetchTranscriptWebScrape(videoId), source: 'web-scrape' as const, timeout: WEBSCRAPE_TIMEOUT },
    { fn: () => fetchTranscriptCaptionExtractor(videoId), source: 'caption-extractor' as const, timeout: CAPTION_EXTRACTOR_TIMEOUT },
    { fn: () => fetchTranscriptInnertube(videoId), source: 'innertube' as const, timeout: INNERTUBE_TIMEOUT },
  ];

  // Only add yt-dlp tier when NOT on Vercel (binary doesn't exist there)
  if (!IS_VERCEL) {
    tiers.push({ fn: () => fetchTranscriptYtDlp(videoId), source: 'yt-dlp', timeout: YTDLP_TIMEOUT });
  }

  const raceEntries = tiers.map(({ fn, source, timeout }) =>
    withTimeout(
      withRetry(fn, { retries: source === 'cf-worker' ? 3 : 1, delayMs: 1000 }),
      timeout,
      source,
    ).then((segments) => {
      console.log(`[transcript] ${videoId}: ${source} succeeded in ${Date.now() - raceStart}ms (${segments.length} segments)`);
      return { segments, source };
    }).catch((err) => {
      console.warn(`[transcript] ${videoId}: ${source} failed in ${Date.now() - raceStart}ms:`, err instanceof Error ? err.message : err);
      throw err;
    })
  );

  return withTimeout(
    Promise.any(raceEntries),
    RACE_TIMEOUT,
    'Caption race',
  );
}

// ─── CF Worker audio proxy ──────────────────────────────────────────────────────

async function downloadAudioCfWorker(videoId: string): Promise<Buffer> {
  const url = process.env.CF_TRANSCRIPT_WORKER_URL?.trim();
  if (!url) throw new Error('CF_TRANSCRIPT_WORKER_URL not set');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const resp = await fetch(`${url}?v=${videoId}&mode=audio`, { signal: controller.signal });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`CF Worker audio: ${resp.status} - ${errText.slice(0, 200)}`);
    }
    const isPartial = resp.headers.get('x-audio-partial') === 'true';
    const client = resp.headers.get('x-audio-client') || 'unknown';
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 1000) throw new Error('CF Worker audio: response too small (likely error)');
    if (buf.length > MAX_AUDIO_BYTES) throw new Error(`CF Worker audio: too large (${Math.round(buf.length / 1024 / 1024)}MB)`);
    console.log(`[transcript] CF Worker audio: ${buf.length} bytes, client=${client}, partial=${isPartial}`);
    return buf;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Phase 2: STT cascade ──────────────────────────────────────────────────────

export async function sttCascade(videoId: string): Promise<TranscriptResult> {
  const cascadeStart = Date.now();
  console.log(`[transcript] ${videoId}: all captions failed, starting STT cascade`);

  // Helper: run an STT strategy with a timeout
  async function tryStrategy<T>(
    name: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    return withTimeout(fn(), STT_STRATEGY_TIMEOUT, `STT:${name}`);
  }

  // Strategy 1: CF Worker audio proxy → Groq Whisper (primary on Vercel — CF IPs not blocked)
  const cfWorkerUrl = process.env.CF_TRANSCRIPT_WORKER_URL?.trim();
  if (IS_VERCEL && cfWorkerUrl && isGroqAvailable()) {
    try {
      console.log(`[transcript] ${videoId}: trying CF Worker audio + Groq Whisper...`);
      const result = await tryStrategy('cfworker+groq', async () => {
        const audioBuffer = await downloadAudioCfWorker(videoId);
        return transcribeWithGroq(audioBuffer, `${videoId}.webm`);
      });
      if (result.length > 0) {
        console.log(`[transcript] ${videoId}: transcribed via Groq Whisper (CF Worker audio, ${result.length} segments, ${Date.now() - cascadeStart}ms)`);
        return { segments: result, source: 'groq-whisper' };
      }
    } catch (e) {
      console.warn(`[transcript] ${videoId}: CF Worker audio + Groq failed (${Date.now() - cascadeStart}ms):`, e instanceof Error ? e.message : e);
    }
  }

  // Strategy 1b: CF Worker audio proxy → Deepgram (fallback STT for CF audio)
  if (IS_VERCEL && cfWorkerUrl && isDeepgramAvailable()) {
    try {
      console.log(`[transcript] ${videoId}: trying CF Worker audio + Deepgram...`);
      const result = await tryStrategy('cfworker+deepgram', async () => {
        const audioBuffer = await downloadAudioCfWorker(videoId);
        return transcribeWithDeepgram(audioBuffer, `${videoId}.webm`);
      });
      if (result.length > 0) {
        console.log(`[transcript] ${videoId}: transcribed via Deepgram (CF Worker audio, ${result.length} segments, ${Date.now() - cascadeStart}ms)`);
        return { segments: result, source: 'deepgram' };
      }
    } catch (e) {
      console.warn(`[transcript] ${videoId}: CF Worker audio + Deepgram failed (${Date.now() - cascadeStart}ms):`, e instanceof Error ? e.message : e);
    }
  }

  // Strategy 2: Web scrape audio → Groq Whisper
  if (isGroqAvailable()) {
    try {
      console.log(`[transcript] ${videoId}: trying web scrape audio + Groq Whisper...`);
      const result = await tryStrategy('webscrape+groq', async () => {
        const audioBuffer = await downloadAudioWebScrape(videoId);
        return transcribeWithGroq(audioBuffer, `${videoId}.webm`);
      });
      if (result.length > 0) {
        console.log(`[transcript] ${videoId}: transcribed via Groq Whisper (web scrape, ${result.length} segments, ${Date.now() - cascadeStart}ms)`);
        return { segments: result, source: 'groq-whisper' };
      }
    } catch (e) {
      console.warn(`[transcript] ${videoId}: web scrape + Groq failed (${Date.now() - cascadeStart}ms):`, e instanceof Error ? e.message : e);
    }
  }

  // Strategy 2b: Web scrape audio → Deepgram Nova-2 (fallback STT)
  if (isDeepgramAvailable()) {
    try {
      console.log(`[transcript] ${videoId}: trying web scrape audio + Deepgram...`);
      const result = await tryStrategy('webscrape+deepgram', async () => {
        const audioBuffer = await downloadAudioWebScrape(videoId);
        return transcribeWithDeepgram(audioBuffer, `${videoId}.webm`);
      });
      if (result.length > 0) {
        console.log(`[transcript] ${videoId}: transcribed via Deepgram (web scrape, ${result.length} segments, ${Date.now() - cascadeStart}ms)`);
        return { segments: result, source: 'deepgram' };
      }
    } catch (e) {
      console.warn(`[transcript] ${videoId}: web scrape + Deepgram failed (${Date.now() - cascadeStart}ms):`, e instanceof Error ? e.message : e);
    }
  }

  // Strategy 3: Innertube audio → Groq Whisper (may fail from datacenter IPs)
  if (isGroqAvailable()) {
    try {
      console.log(`[transcript] ${videoId}: trying Innertube audio + Groq Whisper...`);
      const result = await tryStrategy('innertube+groq', async () => {
        const audioBuffer = await downloadAudioHTTP(videoId);
        return transcribeWithGroq(audioBuffer, `${videoId}.webm`);
      });
      if (result.length > 0) {
        console.log(`[transcript] ${videoId}: transcribed via Groq Whisper (Innertube, ${result.length} segments, ${Date.now() - cascadeStart}ms)`);
        return { segments: result, source: 'groq-whisper' };
      }
    } catch (e) {
      console.warn(`[transcript] ${videoId}: Innertube + Groq failed (${Date.now() - cascadeStart}ms):`, e instanceof Error ? e.message : e);
    }
  }

  // Strategy 4: yt-dlp audio download → Groq or local Whisper (works locally, NOT on Vercel)
  if (IS_VERCEL) {
    throw new Error('All STT tiers failed (yt-dlp not available on Vercel)');
  }

  let audioPath: string | null = null;
  try {
    audioPath = await downloadAudio(videoId);
  } catch (e) {
    console.warn(`[transcript] ${videoId}: yt-dlp audio download failed:`, e instanceof Error ? e.message : e);
  }

  if (audioPath) {
    try {
      if (isGroqAvailable()) {
        try {
          console.log(`[transcript] ${videoId}: trying Groq Whisper (yt-dlp audio)...`);
          const audioBuffer = await readFile(audioPath);
          const segments = await transcribeWithGroq(audioBuffer, `${videoId}.wav`);
          if (segments.length > 0) {
            console.log(`[transcript] ${videoId}: transcribed via Groq Whisper (${segments.length} segments)`);
            return { segments, source: 'groq-whisper' };
          }
        } catch (e) {
          console.warn(`[transcript] ${videoId}: Groq Whisper failed:`, e instanceof Error ? e.message : e);
        }
      }

      try {
        console.log(`[transcript] ${videoId}: trying local Whisper...`);
        const segments = await fetchTranscriptLocalWhisper(audioPath);
        console.log(`[transcript] ${videoId}: transcribed via local Whisper (${segments.length} segments)`);
        return { segments, source: 'local-whisper' };
      } catch (e) {
        console.warn(`[transcript] ${videoId}: local Whisper failed:`, e instanceof Error ? e.message : e);
      }
    } finally {
      await unlink(audioPath).catch(() => {});
    }
  }

  throw new Error('All STT tiers failed');
}

// ─── Main pipeline ─────────────────────────────────────────────────────────────

/**
 * Fetch transcript for a YouTube video.
 *
 * Phase 1: Caption race (web scrape + caption-extractor + Innertube + yt-dlp in parallel)
 * Phase 2: STT cascade (web scrape audio → Groq/Deepgram → Innertube audio → yt-dlp + Whisper)
 *
 * Wrapped in an overall pipeline timeout to stay within Vercel's maxDuration.
 */
export async function fetchTranscript(videoId: string): Promise<TranscriptResult> {
  const pipelineStart = Date.now();

  const run = async (): Promise<TranscriptResult> => {
    // Phase 1: Caption race
    try {
      const result = await captionRace(videoId);
      console.log(`[transcript] ${videoId}: fetched via ${result.source} (${result.segments.length} segments, total ${Date.now() - pipelineStart}ms)`);
      return result;
    } catch (e) {
      console.warn(`[transcript] ${videoId}: caption race failed (${Date.now() - pipelineStart}ms):`, e instanceof Error ? e.message : e);
    }

    // Phase 2: STT cascade
    try {
      const result = await sttCascade(videoId);
      console.log(`[transcript] ${videoId}: STT succeeded via ${result.source} (total ${Date.now() - pipelineStart}ms)`);
      return result;
    } catch (e) {
      console.error(`[transcript] ${videoId}: all tiers failed (total ${Date.now() - pipelineStart}ms):`, e instanceof Error ? e.message : e);
      throw new Error(`Could not fetch transcript for video ${videoId}`);
    }
  };

  return withTimeout(run(), PIPELINE_TIMEOUT, 'Transcript pipeline');
}

/**
 * Clean transcript segment text by removing common artifacts from auto-captions.
 *
 * Strips: [Music], [Applause], [Laughter], ♪ notes, \n newlines,
 * leading speaker dashes, and normalizes whitespace.
 * Returns cleaned segments with empty-after-cleaning entries removed.
 */
export function cleanSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  const BRACKET_ANNOTATIONS = /\[(?:Music|Applause|Laughter|Inaudible|Silence|Cheering|Cheers|Booing|Singing|Foreign|Background noise|Background music)\]/gi;
  const MUSIC_NOTES = /[♪♫♬]+/g;
  const LEADING_DASH = /^[-–—]\s*/;
  const SPEAKER_LABEL = /^>>\s*[A-Z][A-Za-z\s.'-]*:\s*/;
  const MULTI_SPACE = /\s{2,}/g;

  const result: TranscriptSegment[] = [];

  for (const seg of segments) {
    let text = seg.text;

    // Strip newlines and carriage returns
    text = text.replace(/[\r\n]+/g, ' ');

    // Remove bracket annotations like [Music], [Applause], etc.
    text = text.replace(BRACKET_ANNOTATIONS, '');

    // Remove subtitle service watermarks and URLs in brackets
    text = text.replace(/\[.*?(?:\.com|\.org|\.net|https?:\/\/|subtitles?\s+by|powered\s+by|corrections?\s+at).*?\]/gi, '');

    // Remove music note characters
    text = text.replace(MUSIC_NOTES, '');

    // Remove empty brackets left after stripping content (e.g., [♪] → [])
    text = text.replace(/\[\s*\]/g, '');

    // Remove speaker labels like ">> JOHN SMITH: "
    text = text.replace(SPEAKER_LABEL, '');

    // Remove leading dashes (speaker turn markers)
    text = text.replace(LEADING_DASH, '');

    // Normalize whitespace
    text = text.replace(MULTI_SPACE, ' ').trim();

    // Only keep segments that still have meaningful text
    if (text.length > 0) {
      result.push({ ...seg, text, words: seg.text !== text ? undefined : seg.words });
    }
  }

  return result;
}

/**
 * Deduplicate overlapping auto-generated caption segments.
 */
export function deduplicateSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  if (segments.length === 0) return [];

  const result: TranscriptSegment[] = [segments[0]];
  for (let i = 1; i < segments.length; i++) {
    const prev = result[result.length - 1];
    const curr = segments[i];
    if (curr.text.trim() === prev.text.trim()) continue;
    if (curr.offset < prev.offset + prev.duration && prev.text.includes(curr.text.trim())) continue;
    result.push(curr);
  }
  return result;
}

/**
 * Merge tiny caption fragments into sentence-level segments.
 *
 * YouTube auto-captions arrive as 2-3 word fragments every ~2s.
 * This merges them into natural sentence chunks by accumulating text
 * until we hit a sentence-ending punctuation, a time gap > 3s,
 * or a reasonable length (~120 chars).
 */
export function mergeIntoSentences(segments: TranscriptSegment[]): TranscriptSegment[] {
  if (segments.length === 0) return [];

  const TIME_GAP_THRESHOLD = 3; // seconds — gap between segments that forces a break
  const MAX_CHARS = 150;        // soft limit before forcing a break
  const MIN_CHARS = 30;         // don't break on punctuation if under this

  const merged: TranscriptSegment[] = [];
  let accText = '';
  let accStart = 0;
  let accEnd = 0;
  let accWords: Array<{ text: string; startMs: number }> = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const text = seg.text.trim();
    if (!text) continue;

    const segEnd = seg.offset + (seg.duration || 0);

    if (accText === '') {
      // Start a new accumulation
      accText = text;
      accStart = seg.offset;
      accEnd = segEnd;
      if (seg.words) accWords.push(...seg.words);
      continue;
    }

    // Check if we should flush the accumulator before adding this segment
    const gap = seg.offset - accEnd;
    const endsWithSentence = /[.!?][\s"')\]]?$/.test(accText);
    const tooLong = accText.length >= MAX_CHARS;
    const sentenceBreak = endsWithSentence && accText.length >= MIN_CHARS;

    if (gap > TIME_GAP_THRESHOLD || tooLong || sentenceBreak) {
      // Flush accumulated text
      merged.push({
        text: accText,
        offset: accStart,
        duration: accEnd - accStart,
        words: accWords.length > 0 ? accWords : undefined,
      });
      accText = text;
      accStart = seg.offset;
      accEnd = segEnd;
      accWords = seg.words ? [...seg.words] : [];
    } else {
      // Append to accumulator
      accText += ' ' + text;
      accEnd = segEnd;
      if (seg.words) accWords.push(...seg.words);
    }
  }

  // Flush remaining
  if (accText) {
    merged.push({
      text: accText,
      offset: accStart,
      duration: accEnd - accStart,
      words: accWords.length > 0 ? accWords : undefined,
    });
  }

  return merged;
}
