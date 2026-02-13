'use client';

import { useMemo } from 'react';
import type { TranscriptSegment } from '@/lib/video-utils';
import { getSegmentDuration } from '@/lib/video-utils';

interface KaraokeCaptionProps {
  segments: TranscriptSegment[];
  currentTime: number;
}

interface WordTiming {
  text: string;
  startMs: number;
  endMs: number;
}

interface ActiveResult {
  segment: TranscriptSegment;
  index: number;
  fading: boolean;
}

/**
 * Binary search for the active segment at a given time.
 * Bridges gaps < 1.5 s between segments to prevent flashing.
 */
function findActiveSegment(
  segments: TranscriptSegment[],
  time: number,
): ActiveResult | null {
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
      return { segment: seg, index: mid, fading: false };
    }
  }

  // Gap bridging: keep previous segment visible for up to 1.5 s after it ends
  if (hi >= 0 && hi < segments.length) {
    const prev = segments[hi];
    const nextSeg = hi + 1 < segments.length ? segments[hi + 1] : undefined;
    const prevDur = getSegmentDuration(prev, nextSeg);
    const prevEnd = prev.offset + prevDur;
    if (time >= prevEnd && time - prevEnd < 1.5) {
      return { segment: prev, index: hi, fading: true };
    }
  }

  return null;
}

/**
 * Build word timings with computed end times.
 * Uses json3 word-level data when available, falls back to
 * character-count interpolation across the segment duration.
 */
function computeWordTimings(
  segment: TranscriptSegment,
  duration: number,
): WordTiming[] {
  const segEndMs = (segment.offset + duration) * 1000;

  if (segment.words && segment.words.length > 0) {
    return segment.words.map((w, i, arr) => ({
      text: w.text,
      startMs: w.startMs,
      endMs: i + 1 < arr.length ? arr[i + 1].startMs : segEndMs,
    }));
  }

  // Fallback: character-count proportional interpolation
  const words = segment.text.trim().split(/\s+/);
  if (words.length === 0 || (words.length === 1 && words[0] === '')) return [];

  const totalChars = words.reduce((sum, w) => sum + w.length, 0);
  if (totalChars === 0) return [];

  const segStartMs = segment.offset * 1000;
  const segDurMs = duration * 1000;
  let charsSoFar = 0;

  return words.map((w) => {
    const startMs = segStartMs + (charsSoFar / totalChars) * segDurMs;
    charsSoFar += w.length;
    const endMs = segStartMs + (charsSoFar / totalChars) * segDurMs;
    return { text: w, startMs, endMs };
  });
}

export function KaraokeCaption({ segments, currentTime }: KaraokeCaptionProps) {
  const renderData = useMemo(() => {
    const active = findActiveSegment(segments, currentTime);
    if (!active) return null;

    const { segment, index, fading } = active;
    const next = index + 1 < segments.length ? segments[index + 1] : undefined;
    const duration = getSegmentDuration(segment, next);
    const words = computeWordTimings(segment, duration);
    if (words.length === 0) return null;

    const currentMs = currentTime * 1000;
    let activeWordIndex = -1;

    if (!fading) {
      for (let i = words.length - 1; i >= 0; i--) {
        if (currentMs >= words[i].startMs) {
          activeWordIndex = i;
          break;
        }
      }
    }

    return { segment, words, activeWordIndex, fading };
  }, [segments, currentTime]);

  if (!renderData) return null;

  const { segment, words, activeWordIndex, fading } = renderData;

  return (
    <div className="w-full text-center py-1 select-none">
      <p className="text-base md:text-lg leading-relaxed font-light tracking-wide md:line-clamp-2">
        {words.map((wt, i) => {
          const isActive = i === activeWordIndex && !fading;
          const isSpoken = i < activeWordIndex && !fading;

          let className = 'karaoke-word mr-[0.3em] ';

          if (fading) {
            className += 'text-white/25';
          } else if (isActive) {
            className += 'karaoke-active text-blue-400';
          } else {
            className += 'text-white/30';
          }

          return (
            <span key={`${segment.offset}-${i}`} className={className}>
              {wt.text}
            </span>
          );
        })}
      </p>
    </div>
  );
}
