'use client';

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
  onSeek?: (seconds: number) => void;
}

/**
 * Renders AI message text, replacing [M:SS] timestamp citations with clickable TimestampLink pills.
 */
function renderContentWithTimestamps(content: string, onSeek?: (seconds: number) => void): React.ReactNode {
  if (!onSeek) return content;

  const timestamps = parseTimestampLinks(content);
  if (timestamps.length === 0) return content;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const ts of timestamps) {
    // Text before this timestamp
    if (ts.index > lastIndex) {
      parts.push(content.slice(lastIndex, ts.index));
    }
    // Timestamp link (strip brackets for display)
    const display = ts.match.slice(1, -1); // "[5:32]" -> "5:32"
    parts.push(
      <TimestampLink
        key={`ts-${ts.index}`}
        timestamp={display}
        seconds={ts.seconds}
        onSeek={onSeek}
      />
    );
    lastIndex = ts.index + ts.match.length;
  }

  // Remaining text after last timestamp
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts;
}

export function VideoAIMessage({ role, content, isStreaming, thinking, thinkingDuration, onSeek }: VideoAIMessageProps) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] px-3 py-2 rounded-lg rounded-br-sm bg-chalk-accent/90 text-white text-sm leading-relaxed break-words">
          {content}
        </div>
      </div>
    );
  }

  const hasContent = content && content.trim().length > 0;
  const showTypingDots = isStreaming && !hasContent && !thinking;

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] min-w-0">
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
            </motion.div>
          )}
        </AnimatePresence>

        {hasContent && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
              {renderContentWithTimestamps(content, onSeek)}
              {isStreaming && (
                <span className="inline-block w-0.5 h-4 bg-chalk-accent/70 animate-pulse ml-0.5 align-middle" />
              )}
            </p>
          </motion.div>
        )}

        {!isStreaming && !hasContent && !thinking && (
          <p className="text-sm text-slate-500 italic">No response generated.</p>
        )}

        {thinking && (
          <ReasoningPanel
            thinking={thinking}
            thinkingDuration={thinkingDuration}
            isStreaming={isStreaming && !hasContent}
          />
        )}
      </div>
    </div>
  );
}
