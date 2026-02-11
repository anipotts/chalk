/**
 * Server-side transcript fetching.
 * This file imports Node.js-only packages — do NOT import from client components.
 * For client-safe utils, import from '@/lib/video-utils' instead.
 */

import { YoutubeTranscript } from 'youtube-transcript';

// Re-export client-safe types and functions so API routes can use them
export type { TranscriptSegment } from './video-utils';
export { formatTimestamp, buildVideoContext, parseTimestampLinks, extractVideoId } from './video-utils';

import type { TranscriptSegment } from './video-utils';

/**
 * Fetch transcript for a YouTube video.
 * Tries youtube-transcript package first (free, no auth).
 * Falls back to youtube-dl-exec if that fails.
 */
export async function fetchTranscript(videoId: string): Promise<TranscriptSegment[]> {
  // Try youtube-transcript (free, fast, no binary deps)
  try {
    const raw = await YoutubeTranscript.fetchTranscript(videoId);
    return raw.map((item) => ({
      text: item.text,
      offset: item.offset / 1000, // ms to seconds
      duration: item.duration / 1000,
    }));
  } catch {
    // Fall through to yt-dlp fallback
  }

  // Fallback: youtube-dl-exec
  try {
    const { default: youtubedl } = await import('youtube-dl-exec');
    const result = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
      writeAutoSub: true,
      subFormat: 'json3',
      skipDownload: true,
      output: '-',
      dumpJson: true,
    }) as Record<string, unknown>;

    const subs = result.subtitles as Record<string, Array<{ ext: string; url: string }>> | undefined;
    const autoSubs = result.automatic_captions as Record<string, Array<{ ext: string; url: string }>> | undefined;
    const captionList = subs?.en || autoSubs?.en;

    if (captionList) {
      const json3 = captionList.find((s) => s.ext === 'json3');
      if (json3?.url) {
        const resp = await fetch(json3.url);
        const data = await resp.json() as { events?: Array<{ tStartMs: number; dDurationMs: number; segs?: Array<{ utf8: string }> }> };
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

    throw new Error('No captions found');
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
