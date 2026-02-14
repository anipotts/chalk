'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipboardText, CheckCircle } from '@phosphor-icons/react';
import { renderRichContent } from './ExchangeMessage';

interface VideoAIMessageProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  thinking?: string;
  thinkingDuration?: number;
  onSeek?: (seconds: number) => void;
  videoId?: string;
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
        <CheckCircle size={12} weight="fill" className="text-emerald-400" />
      ) : (
        <ClipboardText size={12} weight="bold" />
      )}
    </button>
  );
}

export function VideoAIMessage({ role, content, isStreaming, thinking, thinkingDuration, onSeek, videoId }: VideoAIMessageProps) {
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
  const showTypingDots = isStreaming && !hasContent;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex justify-start group"
    >
      <div className="min-w-0 w-full relative">
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

        {/* Copy button — appears on hover */}
        {hasContent && !isStreaming && (
          <div className="mt-1 flex items-center">
            <CopyButton text={content} />
          </div>
        )}
      </div>
    </motion.div>
  );
}
