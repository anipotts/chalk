'use client';

import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { formatTimestamp, type TranscriptSegment } from '@/lib/video-utils';
import { listBookmarks, type VideoBookmark } from '@/lib/video-sessions';

interface TimelineAnnotation {
  timestamp: number;
  type: 'topic_change' | 'key_point' | 'example' | 'question';
  label: string;
}

interface VideoTimelineProps {
  videoId: string;
  segments: TranscriptSegment[];
  currentTime: number;
  onSeek: (seconds: number) => void;
  videoTitle?: string;
  loopA?: number | null;
  loopB?: number | null;
  searchOffsets?: number[];
  hotSpots?: number[];
}

const BOOKMARK_COLORS: Record<string, string> = {
  blue: '#3b82f6',
  yellow: '#eab308',
  green: '#10b981',
  red: '#ef4444',
  purple: '#a855f7',
};

const ANNOTATION_STYLES: Record<string, { color: string; icon: string }> = {
  topic_change: { color: '#f59e0b', icon: '\u25CF' },
  key_point: { color: '#3b82f6', icon: '\u25B2' },
  example: { color: '#10b981', icon: '\u25A0' },
  question: { color: '#a855f7', icon: '?' },
};

export function VideoTimeline({ videoId, segments, currentTime, onSeek, videoTitle, loopA, loopB, searchOffsets, hotSpots }: VideoTimelineProps) {
  const [bookmarks, setBookmarks] = useState<VideoBookmark[]>([]);
  const [annotations, setAnnotations] = useState<TimelineAnnotation[]>([]);
  const [annotationsLoading, setAnnotationsLoading] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [hoverX, setHoverX] = useState(0);
  const [hoverTime, setHoverTime] = useState(0);
  const [hoveredAnnotation, setHoveredAnnotation] = useState<TimelineAnnotation | null>(null);
  const [hoveredText, setHoveredText] = useState<string>('');
  const barRef = useRef<HTMLDivElement>(null);

  const duration = useMemo(() => {
    if (segments.length === 0) return 0;
    const last = segments[segments.length - 1];
    return last.offset + (last.duration || 0);
  }, [segments]);

  // Refresh bookmarks periodically
  useEffect(() => {
    const refresh = () => listBookmarks(videoId).then(setBookmarks);
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [videoId]);

  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  const fetchAnnotations = useCallback(async () => {
    if (annotationsLoading || segments.length === 0) return;
    setAnnotationsLoading(true);
    try {
      const resp = await fetch('/api/annotate-timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments, videoTitle }),
      });
      if (!resp.ok) throw new Error('Failed');
      const { annotations: anns } = await resp.json();
      if (anns && Array.isArray(anns)) {
        setAnnotations(anns);
        setShowAnnotations(true);
      }
    } catch {
      // silently fail
    } finally {
      setAnnotationsLoading(false);
    }
  }, [segments, videoTitle, annotationsLoading]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!barRef.current || duration === 0) return;
    const rect = barRef.current.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(duration, pct * duration)));
  }, [duration, onSeek]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!barRef.current || duration === 0) return;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverX(e.clientX - rect.left);
    setHoverTime(pct * duration);

    // Find nearest segment text for preview
    const timeAtHover = pct * duration;
    const nearestSeg = segments.reduce((best, seg) => {
      const dist = Math.abs(seg.offset - timeAtHover);
      const bestDist = best ? Math.abs(best.offset - timeAtHover) : Infinity;
      return dist < bestDist ? seg : best;
    }, null as typeof segments[0] | null);
    if (nearestSeg) {
      const text = nearestSeg.text.trim();
      setHoveredText(text.length > 40 ? text.slice(0, 40) + '...' : text);
    } else {
      setHoveredText('');
    }

    // Check if hovering near an annotation
    if (showAnnotations) {
      const nearby = annotations.find((a) => Math.abs(a.timestamp - timeAtHover) < duration * 0.02);
      setHoveredAnnotation(nearby || null);
    }
  }, [duration, annotations, showAnnotations, segments]);

  // Compute sentiment per bucket
  const sentimentBars = useMemo(() => {
    if (segments.length === 0 || duration === 0) return [];
    const positive = /\b(great|amazing|love|excellent|awesome|fantastic|wonderful|best|good|happy|exciting|beautiful|perfect|brilliant|success|win|enjoy|helpful|impressive|powerful)\b/i;
    const negative = /\b(bad|wrong|problem|difficult|hard|terrible|worst|fail|error|issue|broken|ugly|hate|stupid|boring|confusing|frustrating|annoying|mistake|poor)\b/i;
    const bucketCount = 50;
    const bucketSize = duration / bucketCount;
    const buckets = new Array(bucketCount).fill(0); // -1 negative, 0 neutral, 1 positive
    const counts = new Array(bucketCount).fill(0);
    for (const seg of segments) {
      const bucket = Math.min(Math.floor(seg.offset / bucketSize), bucketCount - 1);
      const text = seg.text;
      const posMatch = (text.match(positive) || []).length;
      const negMatch = (text.match(negative) || []).length;
      buckets[bucket] += posMatch - negMatch;
      counts[bucket]++;
    }
    return buckets.map((score, i) => {
      if (counts[i] === 0) return 0;
      return score > 0 ? 1 : score < 0 ? -1 : 0;
    });
  }, [segments, duration]);

  // Compute word density per bucket for heatmap
  const densityBars = useMemo(() => {
    if (segments.length === 0 || duration === 0) return [];
    const bucketCount = 50;
    const bucketSize = duration / bucketCount;
    const buckets = new Array(bucketCount).fill(0);
    for (const seg of segments) {
      const bucket = Math.min(Math.floor(seg.offset / bucketSize), bucketCount - 1);
      buckets[bucket] += seg.text.split(/\s+/).filter(Boolean).length;
    }
    const maxWords = Math.max(...buckets, 1);
    return buckets.map((w) => w / maxWords);
  }, [segments, duration]);

  // Detect pace changes (fast/slow speaking segments)
  const paceMarkers = useMemo(() => {
    if (segments.length < 10 || duration === 0) return [];
    const markers: { offset: number; type: 'fast' | 'slow' }[] = [];
    const wps = segments.map((s) => {
      const words = s.text.split(/\s+/).filter(Boolean).length;
      const dur = s.duration || 3;
      return words / dur;
    });
    const avg = wps.reduce((a, b) => a + b, 0) / wps.length;
    const fastThreshold = avg * 1.8;
    const slowThreshold = avg * 0.4;
    for (let i = 0; i < segments.length; i++) {
      if (wps[i] > fastThreshold) markers.push({ offset: segments[i].offset, type: 'fast' });
      else if (wps[i] < slowThreshold && wps[i] > 0) markers.push({ offset: segments[i].offset, type: 'slow' });
    }
    return markers;
  }, [segments, duration]);

  // Detect silence gaps (>3s between segments)
  const silenceGaps = useMemo(() => {
    if (segments.length < 2 || duration === 0) return [];
    const gaps: { start: number; end: number }[] = [];
    for (let i = 1; i < segments.length; i++) {
      const prevEnd = segments[i - 1].offset + (segments[i - 1].duration || 0);
      const currStart = segments[i].offset;
      if (currStart - prevEnd > 3) {
        gaps.push({ start: prevEnd, end: currStart });
      }
    }
    return gaps;
  }, [segments, duration]);

  if (segments.length === 0 || duration === 0) return null;

  return (
    <div className="w-full px-2 sm:px-4 -mt-1 mb-1">
      <div className="flex items-center gap-1.5">
        <div
          ref={barRef}
          className="relative flex-1 h-6 group cursor-pointer flex items-center"
          onClick={handleClick}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => { setHovering(false); setHoveredAnnotation(null); }}
          onMouseMove={handleMouseMove}
        >
          {/* Sentiment strip */}
          <div className="absolute inset-x-0 top-0 h-0.5 flex opacity-0 group-hover:opacity-60 transition-opacity pointer-events-none">
            {sentimentBars.map((s, i) => (
              <div
                key={`s-${i}`}
                className="flex-1"
                style={{
                  backgroundColor: s > 0 ? 'rgba(16,185,129,0.7)' : s < 0 ? 'rgba(239,68,68,0.5)' : 'transparent',
                }}
              />
            ))}
          </div>

          {/* Density heatmap */}
          <div className="absolute inset-x-0 bottom-0 h-1 flex opacity-30 group-hover:opacity-50 transition-opacity pointer-events-none">
            {densityBars.map((d, i) => (
              <div
                key={i}
                className="flex-1"
                style={{ backgroundColor: `rgba(59,130,246,${d * 0.6})` }}
              />
            ))}
          </div>

          {/* Silence gap markers */}
          {silenceGaps.map((gap, i) => {
            const left = (gap.start / duration) * 100;
            const width = ((gap.end - gap.start) / duration) * 100;
            return (
              <div
                key={`gap-${i}`}
                className="absolute top-1/2 -translate-y-1/2 h-0.5 bg-slate-500/30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[1]"
                style={{ left: `${left}%`, width: `${Math.max(width, 0.3)}%` }}
                title={`Silence: ${formatTimestamp(gap.start)} → ${formatTimestamp(gap.end)}`}
              />
            );
          })}

          {/* Track */}
          <div className="absolute inset-x-0 h-1 rounded-full bg-white/[0.06] group-hover:h-1.5 transition-all">
            {/* Progress */}
            <div
              className="h-full rounded-full bg-chalk-accent/60 transition-[width] duration-300 ease-linear"
              style={{ width: `${progress * 100}%` }}
            />
          </div>

          {/* Loop region highlight */}
          {loopA != null && duration > 0 && (
            <div
              className="absolute h-full bg-amber-500/15 border-x border-amber-500/40 z-5 pointer-events-none"
              style={{
                left: `${(loopA / duration) * 100}%`,
                width: loopB != null ? `${((loopB - loopA) / duration) * 100}%` : '2px',
              }}
            />
          )}

          {/* Annotation markers */}
          {showAnnotations && annotations.map((ann, i) => {
            const pct = (ann.timestamp / duration) * 100;
            const style = ANNOTATION_STYLES[ann.type] || ANNOTATION_STYLES.key_point;
            return (
              <div
                key={`ann-${i}`}
                className="absolute top-0 w-0.5 h-full z-10 opacity-60 hover:opacity-100 transition-opacity pointer-events-none"
                style={{ left: `${pct}%`, backgroundColor: style.color }}
              />
            );
          })}

          {/* Bookmark markers */}
          {bookmarks.map((bm) => {
            const pct = (bm.timestamp_seconds / duration) * 100;
            const color = BOOKMARK_COLORS[bm.color] || BOOKMARK_COLORS.blue;
            return (
              <div
                key={bm.id}
                className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-black/30 z-10 transition-transform hover:scale-150"
                style={{ left: `${pct}%`, backgroundColor: color, marginLeft: '-4px' }}
                title={bm.note ? `${formatTimestamp(bm.timestamp_seconds)} — ${bm.note}` : formatTimestamp(bm.timestamp_seconds)}
              />
            );
          })}

          {/* Search match markers */}
          {searchOffsets && searchOffsets.length > 0 && searchOffsets.map((offset, i) => {
            const pct = (offset / duration) * 100;
            return (
              <div
                key={`search-${i}`}
                className="absolute top-0 w-0.5 h-full bg-yellow-400/70 z-8 pointer-events-none"
                style={{ left: `${pct}%` }}
              />
            );
          })}

          {/* Hot spots (frequently sought positions) */}
          {hotSpots && hotSpots.length > 0 && hotSpots.map((t, i) => {
            const pct = (t / duration) * 100;
            return (
              <div
                key={`hot-${i}`}
                className="absolute top-0 w-1.5 h-1.5 rounded-full bg-rose-500/60 z-9 pointer-events-none"
                style={{ left: `${pct}%`, marginLeft: '-3px', marginTop: '-1px' }}
                title={`Activity hot spot at ${formatTimestamp(t)}`}
              />
            );
          })}

          {/* Pace markers (fast=red, slow=blue) */}
          {paceMarkers.map((pm, i) => {
            const pct = (pm.offset / duration) * 100;
            return (
              <div
                key={`pace-${i}`}
                className={`absolute bottom-0 w-0.5 h-1 opacity-0 group-hover:opacity-60 transition-opacity pointer-events-none z-[2] ${pm.type === 'fast' ? 'bg-rose-400' : 'bg-sky-400'}`}
                style={{ left: `${pct}%` }}
                title={`${pm.type === 'fast' ? 'Fast' : 'Slow'} speaking at ${formatTimestamp(pm.offset)}`}
              />
            );
          })}

          {/* Current position indicator */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-chalk-accent border-2 border-chalk-bg shadow-lg z-20 transition-[left] duration-300 ease-linear"
            style={{ left: `${progress * 100}%`, marginLeft: '-6px' }}
          />

          {/* Hover tooltip */}
          {hovering && !hoveredAnnotation && (
            <div
              className="absolute -translate-x-1/2 px-2 py-1 rounded-lg bg-chalk-surface/95 border border-chalk-border/40 pointer-events-none z-30 max-w-[200px]"
              style={{ left: hoverX, bottom: '100%', marginBottom: 4 }}
            >
              <span className="text-[10px] font-mono text-chalk-accent">{formatTimestamp(hoverTime)}</span>
              {hoveredText && (
                <p className="text-[9px] text-slate-400 truncate mt-0.5 leading-tight">{hoveredText}</p>
              )}
            </div>
          )}

          {/* Annotation tooltip */}
          {hovering && hoveredAnnotation && (
            <div
              className="absolute -top-10 -translate-x-1/2 px-2 py-1 rounded-lg bg-chalk-surface/95 border border-chalk-border/40 pointer-events-none z-30 max-w-[200px]"
              style={{ left: `${(hoveredAnnotation.timestamp / duration) * 100}%` }}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: (ANNOTATION_STYLES[hoveredAnnotation.type] || ANNOTATION_STYLES.key_point).color }}
                />
                <span className="text-[10px] text-chalk-text truncate">{hoveredAnnotation.label}</span>
              </div>
              <span className="text-[9px] text-slate-500 font-mono">{formatTimestamp(hoveredAnnotation.timestamp)}</span>
            </div>
          )}
        </div>

        {/* Annotate button */}
        <button
          onClick={() => {
            if (annotations.length > 0) {
              setShowAnnotations((v) => !v);
            } else {
              fetchAnnotations();
            }
          }}
          disabled={annotationsLoading}
          className={`shrink-0 p-1 rounded-md transition-colors ${
            showAnnotations
              ? 'text-chalk-accent bg-chalk-accent/10'
              : 'text-slate-600 hover:text-slate-400 hover:bg-white/[0.04]'
          }`}
          title={showAnnotations ? 'Hide annotations' : annotations.length > 0 ? 'Show annotations' : 'AI-annotate timeline'}
          aria-label="Toggle timeline annotations"
        >
          {annotationsLoading ? (
            <div className="w-3 h-3 border border-slate-500/40 border-t-slate-400 rounded-full animate-spin" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path d="M8 .75a.75.75 0 0 1 .697.473l1.524 3.84 3.84 1.524a.75.75 0 0 1 0 1.396l-3.84 1.524-1.524 3.84a.75.75 0 0 1-1.394 0L5.78 9.507l-3.84-1.524a.75.75 0 0 1 0-1.396l3.84-1.524L7.303 1.223A.75.75 0 0 1 8 .75Z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
