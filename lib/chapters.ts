/**
 * Shared chapter generation logic (client-safe).
 *
 * Used by TranscriptPanel (sidebar chapters) and ChapterTimeline (mini bar).
 */

import type { TranscriptSegment } from './video-utils';

export interface Chapter {
  offset: number;
  endOffset: number;
  label: string;
}

/**
 * Generate chapter markers from transcript segments.
 *
 * Each chapter ends where the next one begins; the last chapter ends at `duration`.
 * Returns empty array for short videos (< 2 min) or few segments (< 10).
 */
export function generateChapters(
  segments: TranscriptSegment[],
  duration?: number,
): Chapter[] {
  if (segments.length < 10) return [];

  const totalDuration =
    duration ??
    segments[segments.length - 1].offset +
      (segments[segments.length - 1].duration || 0);
  if (totalDuration < 120) return [];

  const chapterInterval = Math.max(120, Math.min(300, totalDuration / 8));
  const raw: Array<{ offset: number; label: string }> = [];
  let nextChapterTime = 0;

  for (const seg of segments) {
    if (seg.offset >= nextChapterTime) {
      const text = seg.text.trim();
      if (text.length > 3) {
        let label =
          text.length > 40
            ? text.slice(0, 40).replace(/\s\S*$/, '') + '...'
            : text;
        label = label.charAt(0).toUpperCase() + label.slice(1);
        raw.push({ offset: seg.offset, label });
        nextChapterTime = seg.offset + chapterInterval;
      }
    }
  }

  // Compute endOffset for each chapter
  return raw.map((ch, i) => ({
    offset: ch.offset,
    endOffset: i < raw.length - 1 ? raw[i + 1].offset : totalDuration,
    label: ch.label,
  }));
}
