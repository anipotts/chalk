'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { TimestampLink } from './TimestampLink';
import { parseTimestampLinks } from '@/lib/video-utils';
import { ClipboardText, CheckCircle, SpeakerSimpleHigh, SpeakerSimpleLow } from '@phosphor-icons/react';

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
  onPlayMessage?: (id: string, text: string) => void;
  isPlaying?: boolean;
  isReadAloudLoading?: boolean;
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
  // Strip bold markers wrapping timestamps (e.g. **[5:32]** → [5:32])
  text = text.replace(/\*\*(\[\d{1,2}:\d{2}(?::\d{2})?\])\*\*/g, '$1');
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
export function renderRichContent(content: string, onSeek: (seconds: number) => void, videoId: string): React.ReactNode {
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
        <CheckCircle size={12} weight="fill" className="text-emerald-400" />
      ) : (
        <ClipboardText size={12} weight="bold" />
      )}
    </button>
  );
}

function SpeakerButton({ exchange, onPlay, isPlaying, isLoading }: { exchange: UnifiedExchange; onPlay: (id: string, text: string) => void; isPlaying: boolean; isLoading: boolean }) {
  return (
    <button
      onClick={() => onPlay(exchange.id, exchange.aiText)}
      className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-white/[0.06] ${
        isPlaying ? 'opacity-100 text-emerald-400' : isLoading ? 'opacity-100 text-chalk-accent' : 'text-slate-500 hover:text-slate-300'
      }`}
      aria-label={isPlaying ? 'Playing...' : 'Read aloud'}
      title={isPlaying ? 'Playing...' : 'Read aloud'}
    >
      {isLoading ? (
        <div className="w-3 h-3 border border-chalk-accent/50 border-t-chalk-accent rounded-full animate-spin" />
      ) : isPlaying ? (
        <SpeakerSimpleHigh size={12} weight="fill" />
      ) : (
        <SpeakerSimpleLow size={12} weight="bold" />
      )}
    </button>
  );
}

export function ExchangeMessage({ exchange, onSeek, videoId, onPlayMessage, isPlaying, isReadAloudLoading }: ExchangeMessageProps) {
  return (
    <div className="space-y-3">
      {/* User message - right aligned with max width */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex justify-end w-full"
      >
        <div className="max-w-[85%] px-3.5 py-2 rounded-2xl bg-chalk-accent/90 text-white text-sm leading-relaxed break-words">
          {exchange.userText}
        </div>
      </motion.div>

      {/* AI message - left aligned with max width */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.1 }}
        className="flex justify-start group w-full"
      >
        <div className="max-w-[85%]">
          <div className="text-[15px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
            {renderRichContent(exchange.aiText, onSeek, videoId)}
          </div>

          {/* Action buttons */}
          <div className="mt-1 flex items-center gap-0.5">
            <CopyButton text={exchange.aiText} />
            {onPlayMessage && (
              <SpeakerButton
                exchange={exchange}
                onPlay={onPlayMessage}
                isPlaying={!!isPlaying}
                isLoading={!!isReadAloudLoading}
              />
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
