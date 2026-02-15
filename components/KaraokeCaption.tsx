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

interface SubPhrase {
  startIdx: number;
  endIdx: number; // exclusive
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

const BOUNDARY_WORDS = new Set([
  'and', 'but', 'or', 'so', 'because', 'when', 'where', 'which',
  'that', 'if', 'then', 'while', 'although', 'since', 'after',
  'before', 'until', 'unless', 'however', 'also', 'like',
]);

const PUNCTUATION_RE = /[,;:.!?]$/;

/**
 * Split a word array into sub-phrases of 3-8 words for bite-sized captions.
 * Priority: punctuation break > conjunction/preposition break > 8-word cap.
 * Floor: never break below 3 words.
 */
function splitIntoSubPhrases(words: WordTiming[]): SubPhrase[] {
  if (words.length <= 8) {
    return [{ startIdx: 0, endIdx: words.length }];
  }

  const phrases: SubPhrase[] = [];
  let start = 0;

  while (start < words.length) {
    const remaining = words.length - start;

    // If remaining fits in one phrase, take it all
    if (remaining <= 8) {
      phrases.push({ startIdx: start, endIdx: words.length });
      break;
    }

    // Try to find a break point between word 3 and 8
    let breakAt = -1;

    // Pass 1: punctuation break (ends phrase if >= 3 words)
    for (let i = start + 2; i < start + 8 && i < words.length; i++) {
      if (PUNCTUATION_RE.test(words[i].text)) {
        breakAt = i + 1; // include the punctuated word
      }
    }

    // Pass 2: conjunction/preposition break (break BEFORE boundary word if >= 4 words)
    if (breakAt === -1) {
      for (let i = start + 3; i < start + 8 && i < words.length; i++) {
        const lower = words[i].text.toLowerCase().replace(/[,;:.!?]/g, '');
        if (BOUNDARY_WORDS.has(lower)) {
          breakAt = i; // break before the boundary word
        }
      }
    }

    // Pass 3: force break at 8 words
    if (breakAt === -1) {
      breakAt = start + 8;
    }

    // Ensure minimum 3 words remain after this phrase
    if (words.length - breakAt > 0 && words.length - breakAt < 3) {
      breakAt = words.length; // absorb the remainder
    }

    phrases.push({ startIdx: start, endIdx: breakAt });
    start = breakAt;
  }

  return phrases;
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

    // Split into sub-phrases
    const phrases = splitIntoSubPhrases(words);

    // Find active sub-phrase
    let activePhraseIdx = 0;
    if (fading) {
      // When fading (gap bridge), show the last sub-phrase
      activePhraseIdx = phrases.length - 1;
    } else if (activeWordIndex < 0) {
      // Before first word, show the first sub-phrase
      activePhraseIdx = 0;
    } else {
      for (let i = 0; i < phrases.length; i++) {
        if (activeWordIndex >= phrases[i].startIdx && activeWordIndex < phrases[i].endIdx) {
          activePhraseIdx = i;
          break;
        }
      }
    }

    const activePhrase = phrases[activePhraseIdx];
    const phraseWords = words.slice(activePhrase.startIdx, activePhrase.endIdx);

    return { segment, phraseWords, activeWordIndex, fading, phraseStartIdx: activePhrase.startIdx };
  }, [segments, currentTime]);

  if (!renderData) return null;

  const { segment, phraseWords, activeWordIndex, fading, phraseStartIdx } = renderData;

  return (
    <div className="w-full text-center select-none">
      <p
        key={`${segment.offset}-${phraseStartIdx}`}
        className="text-[15px] md:text-sm leading-snug font-medium tracking-wide animate-in fade-in duration-150"
      >
        {phraseWords.map((wt, localIdx) => {
          const globalIdx = phraseStartIdx + localIdx;
          const isActive = globalIdx === activeWordIndex && !fading;
          const isSpoken = globalIdx < activeWordIndex && !fading;

          let className = 'karaoke-word mr-[0.3em] ';

          if (fading) {
            className += 'text-slate-500/50';
          } else if (isActive) {
            className += 'karaoke-active bg-chalk-accent/90 text-white px-1 rounded';
          } else if (isSpoken) {
            className += 'text-slate-400';
          } else {
            className += 'text-slate-500';
          }

          return (
            <span key={`${segment.offset}-${globalIdx}`} className={className}>
              {wt.text}
            </span>
          );
        })}
      </p>
    </div>
  );
}
