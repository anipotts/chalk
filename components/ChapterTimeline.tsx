'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { generateChapters } from '@/lib/chapters';
import type { TranscriptSegment } from '@/lib/video-utils';

export interface KeyMoment {
  timestamp_seconds: number;
  label: string;
  summary: string;
}

interface ChapterTimelineProps {
  segments: TranscriptSegment[];
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  keyMoments?: KeyMoment[];
}

function formatTs(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Thin chapter/progress bar that replaces the bottom border of the top header.
 * Hover shows live timestamp / total duration, click seeks.
 */
export function ChapterTimeline({
  segments,
  currentTime,
  duration,
  onSeek,
  keyMoments,
}: ChapterTimelineProps) {
  const chapters = useMemo(
    () => generateChapters(segments, duration),
    [segments, duration],
  );
  const [hoverInfo, setHoverInfo] = useState<{ time: number; xPercent: number } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!barRef.current || duration <= 0) return;
      const rect = barRef.current.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      onSeek(fraction * duration);
    },
    [duration, onSeek],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!barRef.current || duration <= 0) return;
      const rect = barRef.current.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setHoverInfo({ time: fraction * duration, xPercent: fraction * 100 });
    },
    [duration],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverInfo(null);
  }, []);

  if (duration <= 0) return null;

  const progressFraction = Math.min(1, Math.max(0, currentTime / duration));
  const hasChapters = chapters.length > 0;

  return (
    <div className="relative w-full group/timeline">
      <div
        ref={barRef}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative w-full h-[3px] bg-white/[0.06] cursor-pointer transition-[height] duration-150 group-hover/timeline:h-[5px]"
        role="slider"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        aria-label="Video progress"
      >
        {/* Chapter segment dividers */}
        {hasChapters && chapters.map((ch, i) => {
          if (i === 0) return null;
          const left = (ch.offset / duration) * 100;
          return (
            <div
              key={`div-${i}`}
              className="absolute top-0 h-full w-[2px] bg-chalk-bg/80 z-[2]"
              style={{ left: `${left}%` }}
            />
          );
        })}

        {/* Progress bar */}
        <div
          className="absolute top-0 left-0 h-full bg-chalk-accent/70 z-[1] pointer-events-none"
          style={{ width: `${progressFraction * 100}%` }}
        />

        {/* Hover position indicator — thin vertical line at mouse position */}
        {hoverInfo && (
          <div
            className="absolute top-0 h-full w-[2px] bg-white/40 z-[3] pointer-events-none"
            style={{ left: `${hoverInfo.xPercent}%`, marginLeft: '-1px' }}
          />
        )}

        {/* Playhead dot — visible on hover */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-chalk-accent shadow-[0_0_4px_rgba(59,130,246,0.5)] pointer-events-none z-[4] opacity-0 group-hover/timeline:opacity-100 transition-opacity duration-150"
          style={{ left: `${progressFraction * 100}%`, marginLeft: '-5px' }}
        />

        {/* Key moment markers from knowledge graph */}
        {keyMoments && keyMoments.length > 0 && keyMoments.map((m, i) => {
          const pct = Math.min(m.timestamp_seconds / duration, 1) * 100;
          const isWatched = currentTime >= m.timestamp_seconds;
          return (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); onSeek(m.timestamp_seconds); }}
              className="absolute top-1/2 -translate-y-1/2 group/marker z-[5]"
              style={{ left: `${pct}%` }}
            >
              <div className={`relative -ml-[6px] w-[12px] h-[12px] rounded-full flex items-center justify-center text-[7px] font-bold transition-all duration-200 cursor-pointer shadow-sm shadow-black/20 ${
                isWatched
                  ? 'bg-chalk-accent text-white'
                  : 'bg-chalk-surface text-slate-400 border border-white/20 hover:border-chalk-accent/60 hover:text-slate-200'
              }`}>
                {i + 1}
              </div>
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 opacity-0 group-hover/marker:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
                <div className="bg-chalk-surface/95 backdrop-blur-md border border-chalk-border/50 rounded-lg px-3 py-2 shadow-xl shadow-black/30 w-52">
                  <div className="text-[10px] text-chalk-accent font-medium mb-0.5">
                    {formatTs(m.timestamp_seconds)}
                  </div>
                  <div className="text-xs text-slate-200 font-medium leading-tight">{m.label}</div>
                  <div className="text-[10px] text-slate-400 mt-1 leading-snug line-clamp-2">{m.summary}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Hover timestamp tooltip */}
      {hoverInfo && (
        <div
          className="absolute top-full mt-1 transform -translate-x-1/2 px-2 py-0.5 rounded bg-chalk-surface/95 border border-chalk-border/40 shadow-lg pointer-events-none z-10"
          style={{ left: `${hoverInfo.xPercent}%` }}
        >
          <span className="text-[10px] font-mono text-slate-300 whitespace-nowrap">
            {formatTs(Math.floor(hoverInfo.time))}{' '}
            <span className="text-slate-500">/</span>{' '}
            <span className="text-slate-500">{formatTs(Math.floor(duration))}</span>
          </span>
        </div>
      )}
    </div>
  );
}
