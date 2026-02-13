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
  const wordTimings = segment.words;
  const fallbackWords = segment.text.trim().split(/\s+/);

  if (fallbackWords.length === 0 || (fallbackWords.length === 1 && fallbackWords[0] === '')) return null;

  // Use word-level timings from json3 if available, otherwise character-count interpolation
  let currentWordIndex: number;
  if (wordTimings && wordTimings.length > 0) {
    const currentMs = currentTime * 1000;
    currentWordIndex = 0;
    for (let i = wordTimings.length - 1; i >= 0; i--) {
      if (currentMs >= wordTimings[i].startMs) { currentWordIndex = i; break; }
    }
  } else {
    // Character-count interpolation fallback
    const elapsed = currentTime - segment.offset;
    const progress = Math.min(1, Math.max(0, elapsed / duration));
    const totalChars = fallbackWords.reduce((sum, w) => sum + w.length, 0);
    const targetChar = Math.floor(progress * totalChars);
    let charCount = 0;
    currentWordIndex = 0;
    for (let i = 0; i < fallbackWords.length; i++) {
      charCount += fallbackWords[i].length;
      if (charCount > targetChar) { currentWordIndex = i; break; }
      if (i === fallbackWords.length - 1) currentWordIndex = i;
    }
  }

  const displayWords = wordTimings && wordTimings.length > 0
    ? wordTimings.map((w) => w.text)
    : fallbackWords;

  return (
    <div className="w-full text-center py-1 select-none">
      <p className="text-base md:text-lg leading-relaxed font-light tracking-wide">
        {displayWords.map((word, i) => (
          <span
            key={`${segment.offset}-${i}`}
            className={`karaoke-word inline-block mr-[0.3em] ${
              i < currentWordIndex
                ? 'text-white/70'
                : i === currentWordIndex
                  ? 'text-blue-400'
                  : 'text-white/20'
            }`}
            style={
              i === currentWordIndex
                ? { textShadow: '0 0 14px rgba(96, 165, 250, 0.6)' }
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
