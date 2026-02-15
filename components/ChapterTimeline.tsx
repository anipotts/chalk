'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { generateChapters } from '@/lib/chapters';
import type { TranscriptSegment } from '@/lib/video-utils';
import { snapToSegmentBoundaries, type IntervalSelection } from '@/lib/video-utils';

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
  interval?: IntervalSelection | null;
  onIntervalSelect?: (interval: IntervalSelection) => void;
  onIntervalClear?: () => void;
}

function formatTs(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Minimum drag distance (as fraction of duration) to register as interval vs click */
const MIN_DRAG_FRACTION = 0.01;
/** Absolute cap — never require more than 2s of drag to register */
const MIN_DRAG_SECONDS = 2;

/**
 * Thin chapter/progress bar that replaces the bottom border of the top header.
 * Hover shows live timestamp / total duration, click seeks.
 * Shift+drag (mouse) or drag (touch/pen) to select an interval range.
 */
export function ChapterTimeline({
  segments,
  currentTime,
  duration,
  onSeek,
  keyMoments,
  interval,
  onIntervalSelect,
  onIntervalClear,
}: ChapterTimelineProps) {
  const chapters = useMemo(
    () => generateChapters(segments, duration),
    [segments, duration],
  );

  // Sort key moments chronologically — DB stores them in extraction order (by importance)
  const sortedMoments = useMemo(
    () => keyMoments?.slice().sort((a, b) => a.timestamp_seconds - b.timestamp_seconds),
    [keyMoments],
  );
  const [hoverInfo, setHoverInfo] = useState<{ time: number; xPercent: number } | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Drag state for interval selection
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const dragStartRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const cachedRectRef = useRef<DOMRect | null>(null);

  const fractionToTime = useCallback(
    (clientX: number, rect?: DOMRect): number => {
      const r = rect ?? barRef.current?.getBoundingClientRect();
      if (!r || duration <= 0) return 0;
      const fraction = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      return fraction * duration;
    },
    [duration],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!onIntervalSelect) return;
      // Mouse requires shift; touch/pen starts selection directly (no shift key on mobile)
      if (e.pointerType === 'mouse' && !e.shiftKey) return;

      e.preventDefault();
      // Cache rect for the duration of this drag
      if (barRef.current) {
        cachedRectRef.current = barRef.current.getBoundingClientRect();
      }
      const time = fractionToTime(e.clientX, cachedRectRef.current ?? undefined);
      setIsDragging(true);
      setDragStart(time);
      setDragEnd(time);
      dragStartRef.current = time;
      pointerIdRef.current = e.pointerId;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [fractionToTime, onIntervalSelect],
  );

  // Global pointer move/up/cancel for drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerIdRef.current) return;
      const time = fractionToTime(e.clientX, cachedRectRef.current ?? undefined);
      setDragEnd(time);
    };

    const handleUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerIdRef.current) return;
      setIsDragging(false);
      const endTime = fractionToTime(e.clientX, cachedRectRef.current ?? undefined);
      const startTime = dragStartRef.current ?? 0;

      // Hybrid threshold: fraction-based capped at absolute seconds
      const threshold = Math.min(MIN_DRAG_FRACTION * duration, MIN_DRAG_SECONDS);
      if (Math.abs(endTime - startTime) >= threshold && onIntervalSelect) {
        const lo = Math.min(startTime, endTime);
        const hi = Math.max(startTime, endTime);
        const snapped = snapToSegmentBoundaries(lo, hi, segments);
        onIntervalSelect(snapped);
      }

      setDragStart(null);
      setDragEnd(null);
      dragStartRef.current = null;
      pointerIdRef.current = null;
      cachedRectRef.current = null;
    };

    const handleCancel = (e: PointerEvent) => {
      if (e.pointerId !== pointerIdRef.current) return;
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      dragStartRef.current = null;
      pointerIdRef.current = null;
      cachedRectRef.current = null;
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    document.addEventListener('pointercancel', handleCancel);
    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
      document.removeEventListener('pointercancel', handleCancel);
    };
  }, [isDragging, duration, fractionToTime, onIntervalSelect, segments]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // If shift is held, drag handles it
      if (e.shiftKey) return;
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
      setShiftHeld(e.shiftKey);
    },
    [duration],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverInfo(null);
    setShiftHeld(false);
  }, []);

  // Double-click clears interval
  const handleDoubleClick = useCallback(() => {
    if (interval && onIntervalClear) {
      onIntervalClear();
    }
  }, [interval, onIntervalClear]);

  if (duration <= 0) return null;

  const progressFraction = Math.min(1, Math.max(0, currentTime / duration));
  const hasChapters = chapters.length > 0;

  // Active interval (committed or in-progress drag)
  const displayInterval = isDragging && dragStart !== null && dragEnd !== null
    ? { startTime: Math.min(dragStart, dragEnd), endTime: Math.max(dragStart, dragEnd) }
    : interval;

  const intervalLeft = displayInterval
    ? Math.min(1, Math.max(0, displayInterval.startTime / duration)) * 100
    : 0;
  const intervalWidth = displayInterval
    ? (Math.min(1, Math.max(0, displayInterval.endTime / duration)) - Math.min(1, Math.max(0, displayInterval.startTime / duration))) * 100
    : 0;

  // Cursor: crosshair when shift held (discoverability hint), default pointer otherwise
  const cursorClass = shiftHeld && !isDragging ? 'cursor-crosshair' : 'cursor-pointer';

  return (
    <div className="relative w-full group/timeline">
      <div
        ref={barRef}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDoubleClick}
        className={`relative w-full h-[3px] bg-white/[0.06] ${cursorClass} transition-[height] duration-150 group-hover/timeline:h-[5px] ${
          isDragging ? 'h-[5px]' : ''
        }`}
        style={isDragging ? { touchAction: 'none' } : undefined}
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

        {/* Interval selection highlight */}
        {displayInterval && intervalWidth > 0 && (
          <div
            className="absolute top-0 h-full bg-amber-400/30 border-x border-amber-400/60 z-[2] pointer-events-none"
            style={{ left: `${intervalLeft}%`, width: `${intervalWidth}%` }}
          />
        )}

        {/* Hover position indicator — thin vertical line at mouse position */}
        {hoverInfo && !isDragging && (
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
        {sortedMoments && sortedMoments.length > 0 && sortedMoments.map((m, i) => {
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
      {hoverInfo && !isDragging && (
        <div
          className="absolute top-full mt-1 transform -translate-x-1/2 px-2 py-0.5 rounded bg-chalk-surface/95 border border-chalk-border/40 shadow-lg pointer-events-none z-10"
          style={{ left: `${hoverInfo.xPercent}%` }}
        >
          <span className="text-[10px] font-mono text-slate-300 whitespace-nowrap">
            {formatTs(Math.floor(hoverInfo.time))}{' '}
            <span className="text-slate-500">/</span>{' '}
            <span className="text-slate-500">{formatTs(Math.floor(duration))}</span>
            {shiftHeld && (
              <span className="text-amber-400 ml-1.5">drag to select</span>
            )}
          </span>
        </div>
      )}

      {/* Interval range tooltip — shown for committed interval or live drag */}
      {displayInterval && intervalWidth > 0 && (
        <div
          className="absolute top-full mt-1 transform -translate-x-1/2 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 shadow-lg pointer-events-none z-10"
          style={{ left: `${intervalLeft + intervalWidth / 2}%` }}
        >
          <span className="text-[10px] font-mono text-amber-300 whitespace-nowrap">
            {formatTs(Math.floor(displayInterval.startTime))} – {formatTs(Math.floor(displayInterval.endTime))}
          </span>
        </div>
      )}
    </div>
  );
}
