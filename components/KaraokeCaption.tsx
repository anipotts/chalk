'use client';

import { useMemo } from 'react';
import type { TranscriptSegment } from '@/lib/video-utils';
import { getSegmentDuration } from '@/lib/video-utils';

interface KaraokeCaptionProps {
  segments: TranscriptSegment[];
  currentTime: number;
}

/**
 * Binary search for the segment containing the given time.
 */
function findActiveSegment(
  segments: TranscriptSegment[],
  time: number,
): { segment: TranscriptSegment; index: number } | null {
  if (segments.length === 0) return null;

  let lo = 0;
  let hi = segments.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const seg = segments[mid];
    const next = mid + 1 < segments.length ? segments[mid + 1] : undefined;
    const dur = getSegmentDuration(seg, next);
    const end = seg.offset + dur;

    if (time < seg.offset) {
      hi = mid - 1;
    } else if (time >= end) {
      lo = mid + 1;
    } else {
      return { segment: seg, index: mid };
    }
  }

  return null;
}

export function KaraokeCaption({ segments, currentTime }: KaraokeCaptionProps) {
  const result = useMemo(
    () => findActiveSegment(segments, currentTime),
    [segments, currentTime],
  );

  if (!result) return null;

  const { segment, index } = result;
  const next = index + 1 < segments.length ? segments[index + 1] : undefined;
  const duration = getSegmentDuration(segment, next);
  const words = segment.text.trim().split(/\s+/);

  if (words.length === 0 || (words.length === 1 && words[0] === '')) return null;

  const elapsed = currentTime - segment.offset;
  const progress = Math.min(1, Math.max(0, elapsed / duration));
  const currentWordIndex = Math.min(
    Math.floor(progress * words.length),
    words.length - 1,
  );

  return (
    <div className="w-full text-center py-3 px-6 select-none">
      <p className="text-base md:text-lg leading-relaxed font-medium tracking-wide">
        {words.map((word, i) => (
          <span
            key={`${segment.offset}-${i}`}
            className={`karaoke-word inline-block mr-[0.3em] ${
              i < currentWordIndex
                ? 'text-white/45'
                : i === currentWordIndex
                  ? 'text-white'
                  : 'text-white/20'
            }`}
            style={
              i === currentWordIndex
                ? { textShadow: '0 0 14px rgba(99, 140, 255, 0.55)' }
                : undefined
            }
          >
            {word}
          </span>
        ))}
      </p>
    </div>
  );
}
