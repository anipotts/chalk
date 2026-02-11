'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { formatTimestamp, type TranscriptSegment } from '@/lib/video-utils';
import type { TranscriptStatus, TranscriptMethod } from '@/hooks/useTranscriptStream';

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
}: TranscriptPanelProps) {
  const [search, setSearch] = useState('');
  const [userScrolled, setUserScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

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

  // Filter segments by search
  const filtered = search.trim()
    ? segments.filter((s) => s.text.toLowerCase().includes(search.toLowerCase()))
    : segments;

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
          <p className="text-sm text-slate-400 text-center">{error || 'Failed to load transcript'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      {/* Header + search */}
      <div className="p-3 border-b border-chalk-border/30 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-chalk-text">Transcript</h3>
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
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search transcript..."
          className="w-full px-3 py-1.5 rounded-lg bg-chalk-bg/60 border border-chalk-border/30 text-xs text-chalk-text placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-chalk-accent/50"
        />
      </div>

      {/* AI transcript disclaimer */}
      {isSTT && isComplete && (
        <div className="px-3 py-1.5 bg-amber-500/5 border-b border-amber-500/10">
          <p className="text-[10px] text-amber-400/70">AI-generated transcript — may contain errors</p>
        </div>
      )}

      {/* Segments */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {filtered.length === 0 && (
          <p className="p-4 text-xs text-slate-500 text-center">
            {search ? 'No matches found' : 'No transcript available'}
          </p>
        )}
        {filtered.map((seg, i) => {
          const isActive = segments.indexOf(seg) === activeIndex;
          const highlightedText = search.trim() ? highlightMatch(seg.text, search) : seg.text;

          return (
            <button
              key={`${seg.offset}-${i}`}
              ref={isActive ? activeRef : undefined}
              onClick={() => onSeek(seg.offset)}
              className={`w-full text-left px-3 py-2 flex gap-2 transition-all hover:bg-chalk-surface/60 animate-in fade-in duration-300 ${
                isActive ? 'bg-chalk-accent/10 border-l-2 border-l-chalk-accent' : 'border-l-2 border-l-transparent'
              }`}
            >
              <span className={`text-[10px] font-mono shrink-0 pt-0.5 ${isActive ? 'text-chalk-accent' : 'text-slate-500'}`}>
                {formatTimestamp(seg.offset)}
              </span>
              <span className={`text-xs leading-relaxed ${isActive ? 'text-chalk-text' : 'text-slate-400'}`}>
                {typeof highlightedText === 'string' ? highlightedText : highlightedText}
              </span>
            </button>
          );
        })}
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
