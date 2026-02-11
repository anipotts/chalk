'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { formatTimestamp, type TranscriptSegment, type TranscriptSource } from '@/lib/video-utils';
import type { TranscriptStatus } from '@/hooks/useTranscriptStream';

interface Chapter {
  offset: number;
  label: string;
}

function generateChapters(segments: TranscriptSegment[]): Chapter[] {
  if (segments.length < 10) return [];

  const totalDuration = segments[segments.length - 1].offset + (segments[segments.length - 1].duration || 0);
  if (totalDuration < 120) return [];

  const chapterInterval = Math.max(120, Math.min(300, totalDuration / 8));
  const chapters: Chapter[] = [];
  let nextChapterTime = 0;

  for (const seg of segments) {
    if (seg.offset >= nextChapterTime) {
      const text = seg.text.trim();
      if (text.length > 3) {
        let label = text.length > 40 ? text.slice(0, 40).replace(/\s\S*$/, '') + '...' : text;
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
  source?: TranscriptSource | null;
  progress?: number;
  error?: string;
  variant?: 'sidebar' | 'inline' | 'mobile';
  onClose?: () => void;
  onRetry?: () => void;
  onAskAbout?: (timestamp: number, text: string) => void;
  videoId?: string;
  videoTitle?: string;
}

export function TranscriptPanel({
  segments,
  currentTime,
  onSeek,
  status,
  statusMessage,
  source,
  progress,
  error,
  variant = 'sidebar',
  onClose,
  onAskAbout,
}: TranscriptPanelProps) {
  const [search, setSearch] = useState('');
  const [userScrolled, setUserScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const chapters = useMemo(() => generateChapters(segments), [segments]);

  // Find active segment index
  const activeIndex = useMemo(() => {
    if (segments.length === 0) return -1;
    for (let i = segments.length - 1; i >= 0; i--) {
      if (currentTime >= segments[i].offset) return i;
    }
    return 0;
  }, [segments, currentTime]);

  // Filter by search
  const filteredSegments = useMemo(() => {
    if (!search.trim()) return segments;
    const q = search.toLowerCase();
    return segments.filter((s) => s.text.toLowerCase().includes(q));
  }, [segments, search]);

  // Get chapter offset set for dividers
  const chapterOffsets = useMemo(() => new Set(chapters.map((c) => c.offset)), [chapters]);

  // Find chapter label for offset
  const getChapterLabel = useCallback((offset: number) => {
    return chapters.find((c) => c.offset === offset)?.label;
  }, [chapters]);

  // Auto-scroll to active segment
  useEffect(() => {
    if (userScrolled || !activeRef.current || !scrollRef.current) return;
    activeRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIndex, userScrolled]);

  // Reset user-scrolled flag after 5s of inactivity
  useEffect(() => {
    if (!userScrolled) return;
    const timeout = setTimeout(() => setUserScrolled(false), 5000);
    return () => clearTimeout(timeout);
  }, [userScrolled]);

  const handleScroll = useCallback(() => {
    setUserScrolled(true);
  }, []);

  // Keyboard: / to focus search
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === '/' && !(e.target as HTMLElement)?.closest('input, textarea')) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const isLoading = status === 'connecting' || status === 'extracting';
  const isSidebar = variant === 'sidebar';
  const isMobile = variant === 'mobile';

  return (
    <div className={`flex flex-col ${isSidebar || isMobile ? 'h-full' : 'max-h-[400px]'} bg-chalk-bg`}>
      {/* Header — hidden on mobile */}
      {!isMobile && (
        <div className="flex-none flex items-center justify-between px-4 py-2.5 border-b border-chalk-border/30">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-chalk-text">Transcript</span>
            {source && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border uppercase tracking-wider ${
                source === 'groq-whisper' || source === 'local-whisper'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-chalk-surface/60 border-chalk-border/30 text-slate-500'
              }`}>
                {source}
              </span>
            )}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="w-6 h-6 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
              title="Close transcript"
              aria-label="Close transcript"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Search — hidden on mobile */}
      {!isMobile && (
        <div className="flex-none px-3 py-2 border-b border-chalk-border/20">
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transcript... (/)"
            className="w-full px-3 py-1.5 rounded-lg bg-chalk-surface/40 border border-chalk-border/20 text-xs text-chalk-text placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-chalk-accent/40 transition-colors"
          />
        </div>
      )}

      {/* Status / Loading */}
      {(isLoading || status === 'error') && (
        <div className={`flex-none ${isMobile ? 'px-3 py-2' : 'px-4 py-3'}`}>
          {status === 'error' ? (
            <div className="text-xs text-red-400">
              {error || 'Failed to load transcript'}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 border border-chalk-accent/40 border-t-chalk-accent rounded-full animate-spin" />
              <span className="text-xs text-slate-500">{statusMessage || 'Loading...'}</span>
              {progress !== undefined && progress > 0 && progress < 100 && (
                <span className="text-[10px] text-slate-600">{Math.round(progress)}%</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* STT quality warning — hidden on mobile */}
      {!isMobile && (source === 'groq-whisper' || source === 'local-whisper') && status === 'complete' && (
        <div className="flex-none px-4 py-2 bg-amber-500/[0.06] border-b border-amber-500/20">
          <p className="text-[10px] text-amber-400/80">
            Auto-transcribed — timestamps may be approximate
          </p>
        </div>
      )}

      {/* Segments */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={`flex-1 overflow-y-auto ${isMobile ? 'overscroll-contain' : ''}`}
      >
        {filteredSegments.length === 0 && !isLoading && segments.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-slate-500">No transcript available yet</p>
          </div>
        )}

        {filteredSegments.length === 0 && search && segments.length > 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-slate-500">No matches for &ldquo;{search}&rdquo;</p>
          </div>
        )}

        {filteredSegments.map((seg, i) => {
          const isActive = !search && segments[activeIndex] === seg;
          const segChapter = chapterOffsets.has(seg.offset) ? getChapterLabel(seg.offset) : null;

          return (
            <div key={`${seg.offset}-${i}`}>
              {/* Chapter divider */}
              {segChapter && (
                <div className={isMobile ? 'px-3 pt-2 pb-0.5' : 'px-4 pt-4 pb-1'}>
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-chalk-border/30" />
                    <span className="text-[10px] text-slate-500 font-medium shrink-0">{segChapter}</span>
                    <div className="h-px flex-1 bg-chalk-border/30" />
                  </div>
                </div>
              )}

              <div
                ref={isActive ? activeRef : undefined}
                onClick={() => onSeek(seg.offset)}
                className={`group flex gap-3 cursor-pointer transition-colors ${
                  isMobile ? 'px-3 py-1 active:scale-[0.99]' : 'px-4 py-1.5'
                } ${
                  isActive
                    ? 'bg-chalk-accent/[0.08] border-l-2 border-l-chalk-accent'
                    : 'border-l-2 border-l-transparent hover:bg-white/[0.03]'
                }`}
              >
                <span className={`shrink-0 text-[10px] font-mono pt-0.5 ${
                  isActive ? 'text-chalk-accent' : 'text-slate-600'
                }`}>
                  {formatTimestamp(seg.offset)}
                </span>
                <span className={`${
                  isMobile ? 'text-[11px] leading-snug' : 'text-[12px] leading-relaxed'
                } ${
                  isActive ? 'text-chalk-text' : 'text-slate-400'
                }`}>
                  {search ? highlightMatch(seg.text, search) : seg.text}
                </span>
                {onAskAbout && !isMobile && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAskAbout(seg.offset, seg.text);
                    }}
                    className="shrink-0 self-start mt-0.5 opacity-0 group-hover:opacity-100 text-slate-600 hover:text-chalk-accent transition-all"
                    title="Ask about this"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                      <path d="M1 8.74c0 1.36.49 2.6 1.3 3.56-.13.77-.45 1.48-.91 2.08a.38.38 0 0 0 .3.62c1.07 0 2-.37 2.74-.93A6.47 6.47 0 0 0 7.5 15.5c3.59 0 6.5-2.98 6.5-6.76S11.09 2 7.5 2 1 4.96 1 8.74Z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-500/20 text-yellow-200 rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}
