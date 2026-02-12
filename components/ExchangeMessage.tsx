'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { TimestampLink } from './TimestampLink';
import { parseTimestampLinks } from '@/lib/video-utils';

export interface UnifiedExchange {
  id: string;
  type: 'text' | 'voice';
  userText: string;
  aiText: string;
  timestamp: number;
  model?: string;
}

interface ExchangeMessageProps {
  exchange: UnifiedExchange;
  onSeek: (seconds: number) => void;
  videoId: string;
}

/**
 * Apply inline formatting: **bold** and `code`
 */
function applyInlineFormatting(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let lastIdx = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={`${keyPrefix}-b-${match.index}`} className="font-semibold text-chalk-text">{match[2]}</strong>);
    } else if (match[3]) {
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
function renderInlineContent(text: string, onSeek: (seconds: number) => void, keyPrefix: string, videoId: string): React.ReactNode[] {
  const timestamps = parseTimestampLinks(text);
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
        onSeek={onSeek}
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
 * Renders content with markdown-like formatting:
 * - **bold** text
 * - `inline code`
 * - Bullet lists (- item or * item)
 * - Numbered lists (1. item)
 * - [M:SS] timestamp citations as clickable pills
 */
function renderRichContent(content: string, onSeek: (seconds: number) => void, videoId: string): React.ReactNode {
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

export function ExchangeMessage({ exchange, onSeek, videoId }: ExchangeMessageProps) {
  return (
    <div className="space-y-3">
      {/* User message - right aligned */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex justify-end"
      >
        <div className="max-w-[80%] px-3.5 py-2 rounded-2xl rounded-br-sm bg-chalk-accent/90 text-white text-sm leading-relaxed break-words">
          {exchange.userText}
        </div>
      </motion.div>

      {/* AI message - left aligned */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.1 }}
        className="flex justify-start group"
      >
        <div className="min-w-0 w-full">
          <div className="text-[15px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
            {renderRichContent(exchange.aiText, onSeek, videoId)}
          </div>

          {/* Copy button */}
          <div className="mt-1 flex items-center">
            <CopyButton text={exchange.aiText} />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
