'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { formatTimestamp, type TranscriptSegment } from '@/lib/video-utils';

interface TranscriptPanelProps {
  segments: TranscriptSegment[];
  currentTime: number;
  onSeek: (seconds: number) => void;
  loading?: boolean;
  error?: string;
}

export function TranscriptPanel({ segments, currentTime, onSeek, loading, error }: TranscriptPanelProps) {
  const [search, setSearch] = useState('');
  const [userScrolled, setUserScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

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

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-chalk-surface/30 border-l border-chalk-border/30">
        <div className="p-4 border-b border-chalk-border/30">
          <h3 className="text-sm font-medium text-chalk-text">Transcript</h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <div className="w-4 h-4 border-2 border-chalk-accent/40 border-t-chalk-accent rounded-full animate-spin" />
            Loading transcript...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full bg-chalk-surface/30 border-l border-chalk-border/30">
        <div className="p-4 border-b border-chalk-border/30">
          <h3 className="text-sm font-medium text-chalk-text">Transcript</h3>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-slate-400 text-center">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-chalk-surface/30 border-l border-chalk-border/30">
      {/* Header + search */}
      <div className="p-3 border-b border-chalk-border/30 space-y-2">
        <h3 className="text-sm font-medium text-chalk-text">Transcript</h3>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search transcript..."
          className="w-full px-3 py-1.5 rounded-lg bg-chalk-bg/60 border border-chalk-border/30 text-xs text-chalk-text placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-chalk-accent/50"
        />
      </div>

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
              key={i}
              ref={isActive ? activeRef : undefined}
              onClick={() => onSeek(seg.offset)}
              className={`w-full text-left px-3 py-2 flex gap-2 transition-colors hover:bg-chalk-surface/60 ${
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
