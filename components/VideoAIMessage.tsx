'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TimestampLink } from './TimestampLink';
import { ReasoningPanel } from './ReasoningPanel';
import { parseTimestampLinks } from '@/lib/video-utils';

interface VideoAIMessageProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  thinking?: string;
  thinkingDuration?: number;
  responseDuration?: number;
  messageId?: string;
  onSeek?: (seconds: number) => void;
  videoId?: string;
  pinned?: boolean;
  onTogglePin?: () => void;
  maxContentLength?: number;
}

function SparkleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
      <path d="M8 .75a.75.75 0 0 1 .697.473l1.524 3.84 3.84 1.524a.75.75 0 0 1 0 1.396l-3.84 1.524-1.524 3.84a.75.75 0 0 1-1.394 0L5.78 9.507l-3.84-1.524a.75.75 0 0 1 0-1.396l3.84-1.524L7.303 1.223A.75.75 0 0 1 8 .75Z" />
    </svg>
  );
}

/**
 * Apply inline formatting: **bold** and `code`
 */
function applyInlineFormatting(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match **bold** or `code`
  const regex = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let lastIdx = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    if (match[2]) {
      // Bold
      parts.push(<strong key={`${keyPrefix}-b-${match.index}`} className="font-semibold text-chalk-text">{match[2]}</strong>);
    } else if (match[3]) {
      // Inline code
      parts.push(<code key={`${keyPrefix}-c-${match.index}`} className="px-1 py-0.5 rounded bg-white/[0.06] text-[13px] font-mono text-slate-200">{match[3]}</code>);
    }
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  return parts;
}

/**
 * Renders a text segment with both timestamp links and inline formatting.
 */
function renderInlineContent(text: string, onSeek: ((seconds: number) => void) | undefined, keyPrefix: string, videoId?: string): React.ReactNode[] {
  // First pass: extract timestamps
  const timestamps = onSeek ? parseTimestampLinks(text) : [];
  if (timestamps.length === 0) {
    return applyInlineFormatting(text, keyPrefix);
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const ts of timestamps) {
    if (ts.index > lastIndex) {
      parts.push(...applyInlineFormatting(text.slice(lastIndex, ts.index), `${keyPrefix}-${ts.index}`));
    }
    const display = ts.match.slice(1, -1);
    parts.push(
      <TimestampLink
        key={`ts-${keyPrefix}-${ts.index}`}
        timestamp={display}
        seconds={ts.seconds}
        onSeek={onSeek!}
        videoId={videoId}
      />
    );
    lastIndex = ts.index + ts.match.length;
  }

  if (lastIndex < text.length) {
    parts.push(...applyInlineFormatting(text.slice(lastIndex), `${keyPrefix}-end`));
  }

  return parts;
}

/**
 * Renders AI message content with markdown-like formatting:
 * - **bold** text
 * - `inline code`
 * - Bullet lists (- item or * item)
 * - Numbered lists (1. item)
 * - [M:SS] timestamp citations as clickable pills
 */
function renderRichContent(content: string, onSeek?: (seconds: number) => void, videoId?: string): React.ReactNode {
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let blockIdx = 0;

  function flushList() {
    if (!currentList) return;
    const items = currentList.items.map((item, i) => (
      <li key={i} className="ml-4">{renderInlineContent(item, onSeek, `li-${blockIdx}-${i}`, videoId)}</li>
    ));
    if (currentList.type === 'ul') {
      blocks.push(<ul key={`bl-${blockIdx++}`} className="list-disc space-y-0.5 my-1">{items}</ul>);
    } else {
      blocks.push(<ol key={`bl-${blockIdx++}`} className="list-decimal space-y-0.5 my-1">{items}</ol>);
    }
    currentList = null;
  }

  for (const line of lines) {
    const bulletMatch = line.match(/^[\s]*[-*]\s+(.+)/);
    const numberMatch = line.match(/^[\s]*\d+[.)]\s+(.+)/);

    if (bulletMatch) {
      if (currentList?.type !== 'ul') {
        flushList();
        currentList = { type: 'ul', items: [] };
      }
      currentList!.items.push(bulletMatch[1]);
    } else if (numberMatch) {
      if (currentList?.type !== 'ol') {
        flushList();
        currentList = { type: 'ol', items: [] };
      }
      currentList!.items.push(numberMatch[1]);
    } else {
      flushList();
      if (line.trim()) {
        blocks.push(
          <span key={`bl-${blockIdx++}`}>
            {renderInlineContent(line, onSeek, `p-${blockIdx}`, videoId)}
            {'\n'}
          </span>
        );
      } else {
        blocks.push(<span key={`bl-${blockIdx++}`}>{'\n'}</span>);
      }
    }
  }

  flushList();
  return blocks;
}

function ThinkingTimer() {
  const startRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startRef.current), 100);
    return () => clearInterval(id);
  }, []);
  return <span className="text-[9px] text-slate-600 tabular-nums ml-1">{(elapsed / 1000).toFixed(1)}s</span>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06]"
      aria-label={copied ? 'Copied!' : 'Copy response'}
      title={copied ? 'Copied!' : 'Copy'}
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-emerald-400">
          <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
          <path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h2.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 1 .439 1.061V9.5A1.5 1.5 0 0 1 12 11V3.5A1.5 1.5 0 0 0 10.5 2H7a1.5 1.5 0 0 0-1.5 1.5Z" />
          <path d="M3.5 6A1.5 1.5 0 0 1 5 4.5h4.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 1 .439 1.061V12.5A1.5 1.5 0 0 1 12 14H5a1.5 1.5 0 0 1-1.5-1.5V6Z" />
        </svg>
      )}
    </button>
  );
}

function ReactionButtons({ messageId }: { messageId?: string }) {
  const storageKey = messageId ? `chalk-reaction-${messageId}` : '';
  const [reaction, setReaction] = useState<'up' | 'down' | null>(() => {
    if (!storageKey || typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(storageKey) as 'up' | 'down' | null;
    } catch { return null; }
  });

  const handleReaction = useCallback((type: 'up' | 'down') => {
    const newReaction = reaction === type ? null : type;
    setReaction(newReaction);
    if (storageKey) {
      try {
        if (newReaction) localStorage.setItem(storageKey, newReaction);
        else localStorage.removeItem(storageKey);
      } catch { /* ignore */ }
    }
  }, [reaction, storageKey]);

  return (
    <div className="inline-flex items-center gap-0.5 ml-1">
      <button
        onClick={() => handleReaction('up')}
        className={`p-0.5 rounded transition-all ${
          reaction === 'up' ? 'text-emerald-400' : 'opacity-0 group-hover:opacity-100 text-slate-600 hover:text-emerald-400'
        }`}
        aria-label="Helpful"
        title="Helpful"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5">
          <path d="M2.09 15a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h1.382a1 1 0 0 0 .894-.553l2.236-4.472A.5.5 0 0 1 7.059 1.5h.382a1.5 1.5 0 0 1 1.5 1.5v2.5h3.559a1.5 1.5 0 0 1 1.487 1.704l-.971 6.5A1.5 1.5 0 0 1 11.53 15H2.09Z" />
        </svg>
      </button>
      <button
        onClick={() => handleReaction('down')}
        className={`p-0.5 rounded transition-all ${
          reaction === 'down' ? 'text-rose-400' : 'opacity-0 group-hover:opacity-100 text-slate-600 hover:text-rose-400'
        }`}
        aria-label="Not helpful"
        title="Not helpful"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5">
          <path d="M13.91 1a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-1.382a1 1 0 0 0-.894.553l-2.236 4.472a.5.5 0 0 1-.447.275h-.382a1.5 1.5 0 0 1-1.5-1.5v-2.5H3.51a1.5 1.5 0 0 1-1.487-1.704l.971-6.5A1.5 1.5 0 0 1 4.47 1h9.44Z" />
        </svg>
      </button>
    </div>
  );
}

export function VideoAIMessage({ role, content, isStreaming, thinking, thinkingDuration, responseDuration, messageId, onSeek, videoId, pinned, onTogglePin, maxContentLength }: VideoAIMessageProps) {
  if (role === 'user') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex justify-end"
      >
        <div className="max-w-[80%] px-3.5 py-2 rounded-2xl rounded-br-sm bg-chalk-accent/90 text-white text-sm leading-relaxed break-words">
          {content}
        </div>
      </motion.div>
    );
  }

  const hasContent = content && content.trim().length > 0;
  const showTypingDots = isStreaming && !hasContent && !thinking;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex justify-start gap-2.5 group ${pinned ? 'bg-amber-500/[0.03] -mx-2 px-2 py-1 rounded-lg border-l-2 border-amber-500/30' : ''}`}
    >
      {/* Assistant avatar */}
      <div className="w-6 h-6 rounded-full bg-chalk-accent/15 text-chalk-accent flex items-center justify-center shrink-0 mt-0.5">
        <SparkleIcon />
      </div>

      <div className="max-w-[80%] min-w-0 relative">
        <AnimatePresence mode="wait">
          {showTypingDots && (
            <motion.div
              key="typing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 py-1.5"
            >
              <span className="typing-dot w-1.5 h-1.5 bg-slate-400 rounded-full" />
              <span className="typing-dot w-1.5 h-1.5 bg-slate-400 rounded-full" />
              <span className="typing-dot w-1.5 h-1.5 bg-slate-400 rounded-full" />
              <ThinkingTimer />
            </motion.div>
          )}
        </AnimatePresence>

        {thinking && (
          <ReasoningPanel
            thinking={thinking}
            thinkingDuration={thinkingDuration}
            isStreaming={isStreaming && !hasContent}
          />
        )}

        {hasContent && (
          <div className="text-[15px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
            {renderRichContent(content, onSeek, videoId)}
            {isStreaming && (
              <span className="inline-block w-0.5 h-4 bg-chalk-accent/70 animate-pulse ml-0.5 align-middle" />
            )}
          </div>
        )}

        {!isStreaming && !hasContent && !thinking && (
          <p className="text-sm text-slate-500 italic">No response generated.</p>
        )}

        {/* Message length bar */}
        {hasContent && !isStreaming && maxContentLength && maxContentLength > 0 && (
          <div className="h-[2px] rounded-full bg-white/[0.03] mt-1 overflow-hidden">
            <div className="h-full rounded-full bg-chalk-accent/20" style={{ width: `${Math.min(100, (content.length / maxContentLength) * 100)}%` }} />
          </div>
        )}

        {/* Copy button + reactions + confidence — appears on hover */}
        {hasContent && !isStreaming && (
          <div className="mt-1 flex items-center">
            <CopyButton text={content} />
            {onTogglePin && (
              <button
                onClick={onTogglePin}
                className={`opacity-0 group-hover:opacity-100 transition-all p-1 rounded-md ${pinned ? 'text-amber-400 opacity-100' : 'text-slate-600 hover:text-amber-400'}`}
                title={pinned ? 'Unpin message' : 'Pin message'}
                aria-label={pinned ? 'Unpin' : 'Pin'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path d="M10.97 2.22a.75.75 0 0 1 1.06 0l1.75 1.75a.75.75 0 0 1-.177 1.2l-2.032.904-.71.71 1.428 1.428a.75.75 0 0 1-1.06 1.06L9.8 7.844l-3.09 3.091a.75.75 0 0 1-1.06-1.06l3.09-3.091-1.428-1.428a.75.75 0 0 1 1.06-1.06l1.427 1.427.711-.71.904-2.032a.75.75 0 0 1 .177-.511l.398-.45Z" />
                  <path d="M3.28 12.72a.75.75 0 0 1 0-1.06l2-2a.75.75 0 1 1 1.06 1.06l-2 2a.75.75 0 0 1-1.06 0Z" />
                </svg>
              </button>
            )}
            <ReactionButtons messageId={videoId ? `${videoId}-${content.slice(0, 20).replace(/\s/g, '')}` : undefined} />
            {/* Response time */}
            {responseDuration && responseDuration > 0 && (
              <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-slate-600 tabular-nums ml-1" title={`Response took ${(responseDuration / 1000).toFixed(1)}s`}>
                {responseDuration < 1000 ? `${responseDuration}ms` : `${(responseDuration / 1000).toFixed(1)}s`}
              </span>
            )}
            {/* Word count */}
            {hasContent && !isStreaming && (
              <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-slate-700 ml-1">
                {content.split(/\s+/).filter(Boolean).length}w
              </span>
            )}
            {/* Message relative time */}
            {messageId && (() => {
              const ts = parseInt(messageId, 10);
              if (!ts || isNaN(ts)) return null;
              const ago = Date.now() - ts;
              const mins = Math.floor(ago / 60000);
              if (mins < 1) return null;
              const label = mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
              return <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-slate-700 ml-1">{label}</span>;
            })()}
            {/* AI Confidence indicator */}
            {(() => {
              const tsMatches = content.match(/\[(\d{1,2}:\d{2})\]/g);
              const tsCount = tsMatches ? tsMatches.length : 0;
              const len = content.length;
              // High confidence: multiple timestamps cited; Medium: some content; Low: very short/no timestamps
              const confidence = tsCount >= 3 ? 'high' : tsCount >= 1 ? 'medium' : len > 100 ? 'medium' : 'low';
              const labels = { high: 'Grounded', medium: 'Contextual', low: 'General' };
              const colors = { high: 'text-emerald-500', medium: 'text-amber-500', low: 'text-slate-600' };
              const dots = { high: 'bg-emerald-500', medium: 'bg-amber-500', low: 'bg-slate-600' };
              return (
                <span className={`opacity-0 group-hover:opacity-100 transition-opacity ml-auto flex items-center gap-1 text-[9px] ${colors[confidence]}`} title={`${labels[confidence]}: ${tsCount} timestamp${tsCount !== 1 ? 's' : ''} cited`}>
                  <span className={`w-1 h-1 rounded-full ${dots[confidence]}`} />
                  {labels[confidence]}
                </span>
              );
            })()}
          </div>
        )}
      </div>
    </motion.div>
  );
}
