'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseTimestampLinks } from '@/lib/video-utils';
import { TimestampLink } from '@/components/TimestampLink';
import type { TranscriptSegment } from '@/lib/video-utils';

interface StudySummaryProps {
  videoId: string;
  videoTitle?: string;
  segments: TranscriptSegment[];
  onSeek: (seconds: number) => void;
}

export function StudySummaryButton({ videoId, videoTitle, segments, onSeek }: StudySummaryProps) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(async () => {
    if (loading || segments.length === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSummary('');
    setError('');
    setLoading(true);
    setOpen(true);

    try {
      const response = await fetch('/api/video-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments, videoTitle }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setSummary(fullText);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      setLoading(false);
    }
  }, [loading, segments, videoTitle]);

  // Cleanup on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        abortRef.current?.abort();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <>
      <button
        onClick={summary ? () => setOpen(true) : generate}
        disabled={segments.length === 0}
        className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
          segments.length === 0
            ? 'text-slate-600 bg-chalk-surface/30 border border-chalk-border/20 cursor-not-allowed'
            : summary
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25'
              : 'text-slate-400 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30'
        }`}
        title={segments.length === 0 ? 'Transcript needed' : summary ? 'View study summary' : 'Generate AI study summary'}
      >
        {summary ? 'Summary' : 'Summarize'}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-2xl max-h-[80vh] rounded-2xl bg-chalk-surface border border-chalk-border/40 shadow-2xl shadow-black/40 overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-chalk-border/30">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-chalk-accent">
                    <path d="M8 .75a.75.75 0 0 1 .697.473l1.524 3.84 3.84 1.524a.75.75 0 0 1 0 1.396l-3.84 1.524-1.524 3.84a.75.75 0 0 1-1.394 0L5.78 9.507l-3.84-1.524a.75.75 0 0 1 0-1.396l3.84-1.524L7.303 1.223A.75.75 0 0 1 8 .75Z" />
                  </svg>
                  <span className="text-sm font-medium text-chalk-text">Study Summary</span>
                  {videoTitle && (
                    <span className="text-xs text-slate-500 truncate max-w-[200px]">— {videoTitle}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {summary && !loading && (
                    <button
                      onClick={() => {
                        const blob = new Blob([summary], { type: 'text/markdown' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `chalk-summary-${videoId}.md`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="px-2 py-1 rounded-md text-[10px] text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                      title="Download as markdown"
                    >
                      Export
                    </button>
                  )}
                  <button
                    onClick={() => setOpen(false)}
                    className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {loading && !summary && (
                  <div className="flex items-center justify-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-6 h-6 border-2 border-chalk-accent/40 border-t-chalk-accent rounded-full animate-spin" />
                      <span className="text-xs text-slate-400 animate-pulse">Analyzing transcript...</span>
                    </div>
                  </div>
                )}
                {error && (
                  <div className="text-center py-8">
                    <p className="text-sm text-red-400 mb-3">{error}</p>
                    <button
                      onClick={generate}
                      className="px-3 py-1.5 rounded-lg text-xs bg-chalk-surface/60 border border-chalk-border/30 text-slate-300 hover:bg-chalk-surface hover:text-chalk-text transition-colors"
                    >
                      Try again
                    </button>
                  </div>
                )}
                {summary && (
                  <div className="prose-summary">
                    <SummaryRenderer content={summary} onSeek={onSeek} />
                    {loading && (
                      <span className="inline-block w-2 h-4 bg-chalk-accent/60 animate-pulse ml-0.5" />
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              {summary && !loading && (
                <div className="px-5 py-3 border-t border-chalk-border/30 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">
                    AI-generated study notes — click timestamps to jump to that moment
                  </span>
                  <button
                    onClick={generate}
                    className="px-3 py-1 rounded-lg text-[10px] text-slate-400 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30 transition-colors"
                  >
                    Regenerate
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Renders summary markdown with clickable timestamp links */
function SummaryRenderer({ content, onSeek }: { content: string; onSeek: (seconds: number) => void }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const Tag = listType;
      elements.push(
        <Tag key={`list-${elements.length}`} className={listType === 'ol' ? 'list-decimal ml-4 space-y-1' : 'list-disc ml-4 space-y-1'}>
          {listItems}
        </Tag>
      );
      listItems = [];
      listType = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headers
    if (line.startsWith('## ')) {
      flushList();
      elements.push(
        <h3 key={`h-${i}`} className="text-sm font-semibold text-chalk-text mt-5 mb-2 first:mt-0">
          {line.replace('## ', '')}
        </h3>
      );
      continue;
    }

    // Bullet list
    if (/^[-*]\s/.test(line)) {
      if (listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(
        <li key={`li-${i}`} className="text-xs text-slate-300 leading-relaxed">
          <InlineContent text={line.replace(/^[-*]\s+/, '')} onSeek={onSeek} />
        </li>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      if (listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(
        <li key={`li-${i}`} className="text-xs text-slate-300 leading-relaxed">
          <InlineContent text={line.replace(/^\d+\.\s+/, '')} onSeek={onSeek} />
        </li>
      );
      continue;
    }

    // Empty line
    if (!line.trim()) {
      flushList();
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={`p-${i}`} className="text-xs text-slate-300 leading-relaxed mb-2">
        <InlineContent text={line} onSeek={onSeek} />
      </p>
    );
  }

  flushList();
  return <>{elements}</>;
}

/** Renders inline content with **bold**, `code`, and [M:SS] timestamp links */
function InlineContent({ text, onSeek }: { text: string; onSeek: (seconds: number) => void }) {
  const tsResult = parseTimestampLinks(text);

  return (
    <>
      {tsResult.map((part, idx) => {
        if (typeof part === 'string') {
          return <InlineFormatted key={idx} text={part} />;
        }
        return (
          <TimestampLink
            key={idx}
            seconds={part.seconds}
            display={part.display}
            onSeek={onSeek}
          />
        );
      })}
    </>
  );
}

/** Handles **bold** and `code` formatting */
function InlineFormatted({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={match.index} className="text-chalk-text font-medium">{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<code key={match.index} className="px-1 py-0.5 rounded bg-chalk-bg/60 text-[11px] font-mono text-slate-300">{match[3]}</code>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}
