/**
 * Server-side transcript fetching.
 * This file imports Node.js-only packages — do NOT import from client components.
 * For client-safe utils, import from '@/lib/video-utils' instead.
 */

import { YoutubeTranscript } from 'youtube-transcript';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';

// Re-export client-safe types and functions so API routes can use them
export type { TranscriptSegment } from './video-utils';
export { formatTimestamp, buildVideoContext, parseTimestampLinks, extractVideoId } from './video-utils';

import type { TranscriptSegment } from './video-utils';

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
}

interface Json3Response {
  events?: Array<{
    tStartMs: number;
    dDurationMs?: number;
    segs?: Array<{ utf8: string }>;
  }>;
}

// ─── Tier 1: Innertube API ─────────────────────────────────────────────────────

async function fetchTranscriptInnertube(videoId: string): Promise<TranscriptSegment[]> {
  const resp = await fetch('https://www.youtube.com/youtubei/v1/player', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoId,
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20241201.00.00',
        },
      },
    }),
  });

  if (!resp.ok) throw new Error(`Innertube request failed: ${resp.status}`);

  const data = (await resp.json()) as InnertubePlayerResponse;
  const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || tracks.length === 0) throw new Error('No caption tracks found');

  // Prefer English manual captions over ASR
  const enTracks = tracks.filter((t) => t.languageCode.startsWith('en'));
  const manual = enTracks.find((t) => t.kind !== 'asr');
  const track = manual || enTracks[0] || tracks[0];

  // Fetch JSON3 format
  const url = new URL(track.baseUrl);
  url.searchParams.set('fmt', 'json3');
  const captionResp = await fetch(url.toString());
  if (!captionResp.ok) throw new Error(`Caption fetch failed: ${captionResp.status}`);

  const json3 = (await captionResp.json()) as Json3Response;
  if (!json3.events) throw new Error('No events in JSON3 response');

  return json3.events
    .filter((e) => e.segs && e.segs.length > 0)
    .map((e) => ({
      text: e.segs!.map((s) => s.utf8).join(''),
      offset: e.tStartMs / 1000,
      duration: (e.dDurationMs || 0) / 1000,
    }));
}

// ─── Tier 2: youtube-transcript package ────────────────────────────────────────

async function fetchTranscriptPackage(videoId: string): Promise<TranscriptSegment[]> {
  const raw = await YoutubeTranscript.fetchTranscript(videoId);
  return raw.map((item) => ({
    text: item.text,
    offset: item.offset / 1000,
    duration: item.duration / 1000,
  }));
}

// ─── Tier 3: youtube-dl-exec ───────────────────────────────────────────────────

async function fetchTranscriptYtDlp(videoId: string): Promise<TranscriptSegment[]> {
  const { default: youtubedl } = await import('youtube-dl-exec');
  const result = (await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
    writeAutoSub: true,
    subFormat: 'json3',
    skipDownload: true,
    output: '-',
    dumpJson: true,
  })) as Record<string, unknown>;

  const subs = result.subtitles as Record<string, Array<{ ext: string; url: string }>> | undefined;
  const autoSubs = result.automatic_captions as Record<string, Array<{ ext: string; url: string }>> | undefined;
  const captionList = subs?.en || autoSubs?.en;

  if (captionList) {
    const json3 = captionList.find((s) => s.ext === 'json3');
    if (json3?.url) {
      const resp = await fetch(json3.url);
      const data = (await resp.json()) as Json3Response;
      if (data.events) {
        return data.events
          .filter((e) => e.segs && e.segs.length > 0)
          .map((e) => ({
            text: e.segs!.map((s) => s.utf8).join(''),
            offset: e.tStartMs / 1000,
            duration: (e.dDurationMs || 0) / 1000,
          }));
      }
    }
  }

  throw new Error('No captions found via yt-dlp');
}

// ─── Main caption fetcher (tiers 1-3) ──────────────────────────────────────────

/**
 * Fetch transcript for a YouTube video.
 * Tier order: Innertube API → youtube-transcript → youtube-dl-exec
 */
export async function fetchTranscript(videoId: string): Promise<TranscriptSegment[]> {
  // Tier 1: Innertube API (most reliable for caption videos)
  try {
    return await fetchTranscriptInnertube(videoId);
  } catch {
    // Fall through
  }

  // Tier 2: youtube-transcript package
  try {
    return await fetchTranscriptPackage(videoId);
  } catch {
    // Fall through
  }

  // Tier 3: youtube-dl-exec
  try {
    return await fetchTranscriptYtDlp(videoId);
  } catch {
    throw new Error(`Could not fetch transcript for video ${videoId}`);
  }
}

// ─── Audio download helper for STT tiers ───────────────────────────────────────

/**
 * Download audio from a YouTube video as WAV (16kHz mono) to a temp file.
 * Returns the path to the temp WAV file. Caller is responsible for cleanup.
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
