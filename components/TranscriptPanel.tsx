'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { formatTimestamp, type TranscriptSegment } from '@/lib/video-utils';
import type { TranscriptStatus, TranscriptMethod } from '@/hooks/useTranscriptStream';

interface Chapter {
  offset: number;
  label: string;
}

/**
 * Auto-generate chapter markers from transcript segments.
 * Groups segments into ~2-minute chunks and uses the first meaningful words as the label.
 */
function generateChapters(segments: TranscriptSegment[]): Chapter[] {
  if (segments.length < 10) return [];

  const totalDuration = segments[segments.length - 1].offset + (segments[segments.length - 1].duration || 0);
  if (totalDuration < 120) return []; // Skip for very short videos

  const chapterInterval = Math.max(120, Math.min(300, totalDuration / 8)); // 2-5 min, ~8 chapters
  const chapters: Chapter[] = [];
  let nextChapterTime = 0;

  for (const seg of segments) {
    if (seg.offset >= nextChapterTime) {
      const text = seg.text.trim();
      if (text.length > 3) {
        // Take first ~40 chars, break at word boundary
        let label = text.length > 40 ? text.slice(0, 40).replace(/\s\S*$/, '') + '...' : text;
        // Capitalize first letter
        label = label.charAt(0).toUpperCase() + label.slice(1);
        chapters.push({ offset: seg.offset, label });
        nextChapterTime = seg.offset + chapterInterval;
      }
    }
  }

  return chapters;
}

interface TranscriptPanelProps {
  segments: TranscriptSegment[];
  currentTime: number;
  onSeek: (seconds: number) => void;
  status: TranscriptStatus;
  statusMessage?: string;
  method?: TranscriptMethod;
  progress?: number;
  error?: string;
  /** 'sidebar' = desktop sidebar (h-full, border-l), 'inline' = mobile below video */
  variant?: 'sidebar' | 'inline';
  onClose?: () => void;
  onRetry?: () => void;
  onAskAbout?: (timestamp: number, text: string) => void;
}

export function TranscriptPanel({
  segments,
  currentTime,
  onSeek,
  status,
  statusMessage,
  method,
  progress,
  error,
  variant = 'sidebar',
  onClose,
  onRetry,
  onAskAbout,
}: TranscriptPanelProps) {
  const [search, setSearch] = useState('');
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [userScrolled, setUserScrolled] = useState(false);
  const [viewMode, setViewMode] = useState<'transcript' | 'chapters'>('transcript');
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const matchRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Auto-generate chapters from segments
  const chapters = useMemo(() => generateChapters(segments), [segments]);

  // Transcript stats
  const stats = useMemo(() => {
    if (segments.length === 0) return null;
    const totalWords = segments.reduce((acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length, 0);
    const readMinutes = Math.max(1, Math.round(totalWords / 200));
    return { totalWords, readMinutes };
  }, [segments]);

  const isInline = variant === 'inline';
  const isLoading = status === 'connecting' || status === 'extracting' || status === 'downloading';
  const isTranscribing = status === 'transcribing';
  const isStreaming = status === 'streaming';
  const isComplete = status === 'complete';
  const isSTT = method === 'deepgram' || method === 'whisper';

  // Wrapper class differs between sidebar and inline
  const wrapperClass = isInline
    ? 'flex flex-col h-full bg-chalk-surface/20 border-t border-chalk-border/30'
    : 'flex flex-col h-full bg-chalk-surface/30 border-l border-chalk-border/30';

  // Find the active segment index
  const activeIndex = segments.findIndex((seg, i) => {
    const next = segments[i + 1];
    return currentTime >= seg.offset && (!next || currentTime < next.offset);
  });

  // Auto-scroll to active segment (unless user has manually scrolled)
  useEffect(() => {
    if (!userScrolled && activeRef.current && scrollRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex, userScrolled]);

  // Detect manual scroll → pause auto-scroll for 5 seconds
  const handleScroll = useCallback(() => {
    setUserScrolled(true);
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => setUserScrolled(false), 5000);
  }, []);

  // Filter segments by search (memoized to avoid re-filtering on every render)
  const filtered = useMemo(
    () => search.trim()
      ? segments.filter((s) => s.text.toLowerCase().includes(search.toLowerCase()))
      : segments,
    [search, segments]
  );

  const matchCount = search.trim() ? filtered.length : 0;

  // Reset match index when search changes
  useEffect(() => {
    setSearchMatchIndex(0);
    matchRefs.current.clear();
  }, [search]);

  // Scroll to current match
  useEffect(() => {
    if (matchCount > 0 && matchRefs.current.has(searchMatchIndex)) {
      matchRefs.current.get(searchMatchIndex)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [searchMatchIndex, matchCount]);

  const goToNextMatch = useCallback(() => {
    setSearchMatchIndex((prev) => (prev + 1) % matchCount);
  }, [matchCount]);

  const goToPrevMatch = useCallback(() => {
    setSearchMatchIndex((prev) => (prev - 1 + matchCount) % matchCount);
  }, [matchCount]);

  // Loading state (before any segments arrive)
  if ((isLoading || isTranscribing) && segments.length === 0) {
    const label = isTranscribing
      ? (statusMessage || 'Transcribing')
      : status === 'connecting' ? 'Connecting' : (statusMessage || 'Fetching captions');
    return (
      <div className={wrapperClass}>
        <div className="p-4 border-b border-chalk-border/30">
          <h3 className="text-sm font-medium text-chalk-text">Transcript</h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 px-6 w-full max-w-[200px]">
            <span className="text-slate-400 text-sm text-center animate-pulse">
              {label}<span className="inline-flex w-[1.5ch]"><PulsingEllipsis /></span>
            </span>
            {isTranscribing && typeof progress === 'number' && progress > 0 && (
              <div className="w-full bg-chalk-border/30 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-chalk-accent/60 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'error' && segments.length === 0) {
    return (
      <div className={wrapperClass}>
        <div className="p-4 border-b border-chalk-border/30">
          <h3 className="text-sm font-medium text-chalk-text">Transcript</h3>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center space-y-3">
            <p className="text-sm text-slate-400">{error || 'Failed to load transcript'}</p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-3 py-1.5 rounded-lg text-xs bg-chalk-surface/60 border border-chalk-border/30 text-slate-300 hover:bg-chalk-surface hover:text-chalk-text transition-colors"
              >
                Try again
              </button>
            )}
            <p className="text-[10px] text-slate-500">You can still use the chat — it will work without transcript context</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      {/* Header + search */}
      <div className="p-3 border-b border-chalk-border/30 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode('transcript')}
              className={`text-sm font-medium px-1.5 py-0.5 rounded transition-colors ${
                viewMode === 'transcript' ? 'text-chalk-text' : 'text-slate-500 hover:text-slate-400'
              }`}
            >
              Transcript
            </button>
            {chapters.length > 0 && (
              <button
                onClick={() => setViewMode('chapters')}
                className={`text-sm font-medium px-1.5 py-0.5 rounded transition-colors ${
                  viewMode === 'chapters' ? 'text-chalk-text' : 'text-slate-500 hover:text-slate-400'
                }`}
              >
                Chapters
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isSTT && isComplete && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20">
                AI Transcribed
              </span>
            )}
            {method === 'captions' && isComplete && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                Captions
              </span>
            )}
            {(isStreaming || isTranscribing) && (
              <span className="text-[10px] text-chalk-accent animate-pulse">loading</span>
            )}
            {isInline && onClose && (
              <button
                onClick={onClose}
                className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                aria-label="Hide transcript"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M14.77 12.79a.75.75 0 0 1-1.06-.02L10 8.832 6.29 12.77a.75.75 0 1 1-1.08-1.04l4.25-4.5a.75.75 0 0 1 1.08 0l4.25 4.5a.75.75 0 0 1-.02 1.06Z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (matchCount > 0) {
                if (e.key === 'Enter' && e.shiftKey) goToPrevMatch();
                else if (e.key === 'Enter') goToNextMatch();
              }
            }}
            placeholder="Search transcript..."
            className="flex-1 px-3 py-1.5 rounded-lg bg-chalk-bg/60 border border-chalk-border/30 text-xs text-chalk-text placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-chalk-accent/50"
          />
          {matchCount > 0 && (
            <>
              <span className="text-[10px] text-slate-500 shrink-0 tabular-nums">
                {searchMatchIndex + 1}/{matchCount}
              </span>
              <button
                onClick={goToPrevMatch}
                className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                aria-label="Previous match"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path fillRule="evenodd" d="M11.78 9.78a.75.75 0 0 1-1.06 0L8 7.06 5.28 9.78a.75.75 0 0 1-1.06-1.06l3.25-3.25a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06Z" clipRule="evenodd" />
                </svg>
              </button>
              <button
                onClick={goToNextMatch}
                className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                aria-label="Next match"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </button>
            </>
          )}
          {search && !matchCount && (
            <span className="text-[10px] text-slate-500 shrink-0">0 results</span>
          )}
        </div>
        {stats && isComplete && (
          <p className="text-[10px] text-slate-500">
            ~{stats.totalWords.toLocaleString()} words · ~{stats.readMinutes} min read
          </p>
        )}
      </div>

      {/* AI transcript disclaimer */}
      {isSTT && isComplete && (
        <div className="px-3 py-1.5 bg-amber-500/5 border-b border-amber-500/10">
          <p className="text-[10px] text-amber-400/70">AI-generated transcript — may contain errors</p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 relative min-h-0">
      {/* Top fade gradient */}
      <div className="absolute top-0 inset-x-0 h-4 bg-gradient-to-b from-chalk-surface/30 to-transparent z-10 pointer-events-none" />
      {/* Bottom fade gradient */}
      <div className="absolute bottom-0 inset-x-0 h-6 bg-gradient-to-t from-chalk-surface/30 to-transparent z-10 pointer-events-none" />
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto"
      >
        {viewMode === 'chapters' && chapters.length > 0 ? (
          /* Chapters view */
          <div className="py-1">
            {chapters.map((ch, i) => {
              const nextOffset = chapters[i + 1]?.offset ?? Infinity;
              const isActive = currentTime >= ch.offset && currentTime < nextOffset;
              return (
                <button
                  key={ch.offset}
                  onClick={() => onSeek(ch.offset)}
                  className={`w-full text-left px-3 py-2.5 flex gap-3 items-center transition-all hover:bg-chalk-surface/60 ${
                    isActive ? 'bg-chalk-accent/10 border-l-2 border-l-chalk-accent' : 'border-l-2 border-l-transparent'
                  }`}
                >
                  <span className={`text-[10px] font-mono shrink-0 ${isActive ? 'text-chalk-accent' : 'text-slate-500'}`}>
                    {formatTimestamp(ch.offset)}
                  </span>
                  <span className={`text-xs leading-relaxed ${isActive ? 'text-chalk-text' : 'text-slate-400'}`}>
                    {ch.label}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          /* Transcript view */
          <>
            {filtered.length === 0 && (
              <p className="p-4 text-xs text-slate-500 text-center">
                {search ? 'No matches found' : 'No transcript available'}
              </p>
            )}
            {filtered.map((seg, i) => {
              const isActive = segments.indexOf(seg) === activeIndex;
              const isCurrentMatch = search.trim() && i === searchMatchIndex;
              const highlightedText = search.trim() ? highlightMatch(seg.text, search) : seg.text;

              return (
                <div
                  key={`${seg.offset}-${i}`}
                  ref={(el) => {
                    if (isActive) (activeRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                    if (search.trim() && el) matchRefs.current.set(i, el);
                  }}
                  className={`group/seg w-full flex items-start gap-2 px-3 py-2 transition-all hover:bg-chalk-surface/60 animate-in fade-in duration-300 ${
                    isCurrentMatch
                      ? 'bg-chalk-accent/20 border-l-2 border-l-chalk-accent ring-1 ring-chalk-accent/30'
                      : isActive
                        ? 'bg-chalk-accent/10 border-l-2 border-l-chalk-accent'
                        : 'border-l-2 border-l-transparent'
                  }`}
                >
                  <button
                    onClick={() => onSeek(seg.offset)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      const ts = formatTimestamp(seg.offset);
                      navigator.clipboard.writeText(ts).then(() => {
                        const btn = e.currentTarget;
                        btn.dataset.copied = 'true';
                        setTimeout(() => { btn.dataset.copied = ''; }, 1200);
                      });
                    }}
                    className={`text-[10px] font-mono shrink-0 pt-0.5 hover:underline data-[copied=true]:text-emerald-400 ${isActive ? 'text-chalk-accent' : 'text-slate-500'}`}
                    title="Click to seek · Double-click to copy"
                  >
                    {formatTimestamp(seg.offset)}
                  </button>
                  <button
                    onClick={() => onSeek(seg.offset)}
                    className={`text-xs leading-relaxed text-left flex-1 ${isActive ? 'text-chalk-text' : 'text-slate-400'}`}
                  >
                    {typeof highlightedText === 'string' ? highlightedText : highlightedText}
                  </button>
                  {onAskAbout && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAskAbout(seg.offset, seg.text);
                      }}
                      className="opacity-0 group-hover/seg:opacity-100 shrink-0 p-1 rounded-md text-slate-500 hover:text-chalk-accent hover:bg-chalk-accent/10 transition-all"
                      title="Ask about this moment"
                      aria-label={`Ask about moment at ${formatTimestamp(seg.offset)}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                        <path d="M1 8.74c0 1.36.49 2.6 1.3 3.56-.13.77-.45 1.48-.91 2.08a.38.38 0 0 0 .3.62c1.07 0 2-.37 2.74-.93A6.47 6.47 0 0 0 7.5 15.5c3.59 0 6.5-2.98 6.5-6.76S11.09 2 7.5 2 1 4.96 1 8.74Z" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* "Jump to current" pill when user scrolls away */}
      {userScrolled && activeIndex >= 0 && viewMode === 'transcript' && (
        <div className="absolute bottom-2 inset-x-0 flex justify-center pointer-events-none">
          <button
            onClick={() => {
              setUserScrolled(false);
              activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
            className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium bg-chalk-surface/95 text-slate-300 border border-chalk-border/40 shadow-lg backdrop-blur-sm hover:bg-chalk-surface hover:text-chalk-text transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path d="M8 1a.75.75 0 0 1 .75.75v6.999l2.47-2.47a.75.75 0 1 1 1.06 1.061l-3.75 3.75a.75.75 0 0 1-1.06 0L3.72 7.34a.75.75 0 0 1 1.06-1.06l2.47 2.47V1.75A.75.75 0 0 1 8 1Z" />
              <path d="M2.75 13a.75.75 0 0 0 0 1.5h10.5a.75.75 0 0 0 0-1.5H2.75Z" />
            </svg>
            Jump to current
          </button>
        </div>
      )}
      </div>
    </div>
  );
}

function PulsingEllipsis() {
  return (
    <span className="inline-flex gap-[1px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block animate-pulse"
          style={{ animationDelay: `${i * 300}ms`, animationDuration: '1.2s' }}
        >
          .
        </span>
      ))}
    </span>
  );
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  if (parts.length === 1) return text;

  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-chalk-accent/30 text-chalk-text rounded-sm px-0.5">{part}</mark>
    ) : (
      part
    )
  );
}
