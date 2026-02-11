/**
 * Server-side transcript fetching.
 * This file imports Node.js-only packages — do NOT import from client components.
 * For client-safe utils, import from '@/lib/video-utils' instead.
 *
 * Architecture:
 *   Phase 1 — Caption race (Promise.any): Innertube ANDROID + yt-dlp in parallel
 *   Phase 2 — STT cascade (sequential): Groq Whisper → local Whisper
 */

import { execFile } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { readFile, unlink } from 'fs/promises';
import { withRetry, withTimeout } from './retry';
import { isGroqAvailable, transcribeWithGroq } from './stt/groq-whisper';

// Re-export client-safe types and functions so API routes can use them
export type { TranscriptSegment, TranscriptSource, TranscriptResult } from './video-utils';
export { formatTimestamp, buildVideoContext, parseTimestampLinks, extractVideoId } from './video-utils';

import type { TranscriptSegment, TranscriptResult } from './video-utils';

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
    segs?: Array<{ utf8: string }>;
  }>;
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
    // Decode HTML entities
    const text = match[3]
      .replace(/<[^>]+>/g, '') // strip inner tags
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
    if (text) {
      segments.push({ text, offset, duration });
    }
  }
  return segments;
}

// ─── Tier 1: Innertube API (ANDROID client) ─────────────────────────────────────
//
// YouTube's WEB client no longer returns caption tracks as of early 2025.
// The ANDROID client still returns them, but caption URLs serve XML timedtext
// instead of JSON3 (the fmt param is ignored). We parse the XML directly.

async function fetchTranscriptInnertube(videoId: string): Promise<TranscriptSegment[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  let resp;
  try {
    resp = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w&prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/19.44.38 (Linux; U; Android 14)',
        'X-YouTube-Client-Name': '3',
        'X-YouTube-Client-Version': '19.44.38',
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '19.44.38',
            androidSdkVersion: 34,
            hl: 'en',
            gl: 'US',
          },
        },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!resp.ok) throw new Error(`Innertube request failed: ${resp.status}`);

  const data = (await resp.json()) as InnertubePlayerResponse;
  const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || tracks.length === 0) throw new Error('No caption tracks found');

  // Prefer English manual captions over ASR
  const enTracks = tracks.filter((t) => t.languageCode.startsWith('en'));
  const manual = enTracks.find((t) => t.kind !== 'asr');
  const track = manual || enTracks[0] || tracks[0];

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
    ]);

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

function execFilePromise(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 300_000 }, (err, stdout, stderr) => {
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
    ]);

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
 * Download audio from YouTube via Innertube streaming URLs (HTTP-only, no yt-dlp needed).
 * Fetches the player response to get adaptive audio stream URLs, then downloads directly.
 * Returns a Buffer of audio data for Groq Whisper. Works on Vercel serverless.
 */
async function downloadAudioHTTP(videoId: string): Promise<Buffer> {
  // Get player response with streaming data
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let resp;
  try {
    resp = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w&prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/19.44.38 (Linux; U; Android 14)',
        'X-YouTube-Client-Name': '3',
        'X-YouTube-Client-Version': '19.44.38',
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '19.44.38',
            androidSdkVersion: 34,
            hl: 'en',
            gl: 'US',
          },
        },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!resp.ok) throw new Error(`Innertube player request failed: ${resp.status}`);

  const data = (await resp.json()) as InnertubePlayerResponse;
  const formats = data.streamingData?.adaptiveFormats;
  if (!formats || formats.length === 0) throw new Error('No streaming formats available');

  // Find an audio-only stream (prefer mp4a/opus, smallest file)
  const audioFormats = formats
    .filter((f) => f.mimeType.startsWith('audio/') && f.url)
    .sort((a, b) => parseInt(a.contentLength || '999999999') - parseInt(b.contentLength || '999999999'));

  if (audioFormats.length === 0) throw new Error('No audio streams with direct URLs');

  const audioUrl = audioFormats[0].url!;
  console.log(`[transcript] downloading audio via HTTP (itag ${audioFormats[0].itag}, ~${Math.round(parseInt(audioFormats[0].contentLength || '0') / 1024)}KB)`);

  // Download the audio stream
  const audioController = new AbortController();
  const audioTimeout = setTimeout(() => audioController.abort(), 120000); // 2 min for audio download
  try {
    const audioResp = await fetch(audioUrl, { signal: audioController.signal });
    if (!audioResp.ok) throw new Error(`Audio download failed: ${audioResp.status}`);
    const arrayBuffer = await audioResp.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(audioTimeout);
  }
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

// ─── Phase 1: Caption race ─────────────────────────────────────────────────────

type CaptionTier = 'innertube' | 'yt-dlp';

interface CaptionRaceResult {
  segments: TranscriptSegment[];
  source: CaptionTier;
}

const INNERTUBE_TIMEOUT = 15_000; // 15s — Innertube is fast when it works
const WEBSCRAPE_TIMEOUT = 20_000; // 20s — page fetch + caption fetch
const YTDLP_TIMEOUT = 30_000;    // 30s — yt-dlp needs time for JS challenge solving
const RACE_TIMEOUT = 35_000;     // 35s overall caption race

export async function captionRace(videoId: string): Promise<CaptionRaceResult> {
  // Three caption tiers run concurrently — first non-empty result wins.
  // Innertube ANDROID is fast (~1-2s) but YouTube may block from datacenter IPs.
  // Web scrape fetches the watch page HTML — looks like a browser visit, most reliable on Vercel.
  // yt-dlp CLI is slower (~10-15s) but handles most edge cases (not available on Vercel).
  const tiers: Array<{ fn: () => Promise<TranscriptSegment[]>; source: CaptionTier; timeout: number }> = [
    { fn: () => fetchTranscriptInnertube(videoId), source: 'innertube', timeout: INNERTUBE_TIMEOUT },
    { fn: () => fetchTranscriptWebScrape(videoId), source: 'innertube', timeout: WEBSCRAPE_TIMEOUT },
    { fn: () => fetchTranscriptYtDlp(videoId), source: 'yt-dlp', timeout: YTDLP_TIMEOUT },
  ];

  const raceEntries = tiers.map(({ fn, source, timeout }) =>
    withTimeout(
      withRetry(fn, { retries: 1, delayMs: 1000 }),
      timeout,
      source,
    ).then((segments) => ({ segments, source }))
  );

  return withTimeout(
    Promise.any(raceEntries),
    RACE_TIMEOUT,
    'Caption race',
  );
}

// ─── Phase 2: STT cascade ──────────────────────────────────────────────────────

export async function sttCascade(videoId: string): Promise<TranscriptResult> {
  console.log(`[transcript] ${videoId}: all captions failed, starting STT cascade`);

  // Strategy 1: HTTP audio download → Groq Whisper (works on Vercel, no yt-dlp needed)
  if (isGroqAvailable()) {
    try {
      console.log(`[transcript] ${videoId}: trying HTTP audio download + Groq Whisper...`);
      const audioBuffer = await downloadAudioHTTP(videoId);
      const segments = await transcribeWithGroq(audioBuffer, `${videoId}.webm`);
      if (segments.length > 0) {
        console.log(`[transcript] ${videoId}: transcribed via Groq Whisper (HTTP download, ${segments.length} segments)`);
        return { segments, source: 'groq-whisper' };
      }
    } catch (e) {
      console.warn(`[transcript] ${videoId}: HTTP + Groq Whisper failed:`, e instanceof Error ? e.message : e);
    }
  }

  // Strategy 2: yt-dlp audio download → Groq or local Whisper (works locally, not on Vercel)
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
 * Phase 1: Caption race (Innertube ANDROID + yt-dlp in parallel)
 * Phase 2: STT cascade (Groq Whisper → local Whisper) — only if all captions fail
 *
 * Returns TranscriptResult with segments + source metadata.
 */
export async function fetchTranscript(videoId: string): Promise<TranscriptResult> {
  // Phase 1: Caption race
  try {
    const result = await captionRace(videoId);
    console.log(`[transcript] ${videoId}: fetched via ${result.source} (${result.segments.length} segments)`);
    return result;
  } catch {
    // All caption tiers failed — fall through to STT
  }

  // Phase 2: STT cascade
  try {
    return await sttCascade(videoId);
  } catch {
    throw new Error(`Could not fetch transcript for video ${videoId}`);
  }
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
      });
      accText = text;
      accStart = seg.offset;
      accEnd = segEnd;
    } else {
      // Append to accumulator
      accText += ' ' + text;
      accEnd = segEnd;
    }
  }

  // Flush remaining
  if (accText) {
    merged.push({
      text: accText,
      offset: accStart,
      duration: accEnd - accStart,
    });
  }

  return merged;
}
