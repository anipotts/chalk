'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Atom, CaretUp } from '@phosphor-icons/react';

interface ReasoningPanelProps {
  thinking: string;
  thinkingDuration?: number;
  isStreaming?: boolean;
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ReasoningPanel({
  thinking,
  thinkingDuration,
  isStreaming = false,
}: ReasoningPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!thinking && !isStreaming) {
    return null;
  }

  return (
    <div className="mt-3">
      {/* Toggle button */}
      <button
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        aria-controls="reasoning-content"
        className={`
          group flex items-center gap-2 px-3 py-1.5 rounded-full text-xs
          transition-all duration-200 cursor-pointer
          ${
            isExpanded
              ? 'bg-chalk-accent/10 border border-chalk-accent/30 text-chalk-accent'
              : 'bg-chalk-surface/30 border border-chalk-border/20 text-slate-400 hover:border-chalk-border/40 hover:text-slate-300'
          }
        `}
      >
        <span className="flex items-center gap-1.5">
          {isExpanded ? <CaretUp size={14} weight="bold" /> : <Atom size={14} weight="duotone" />}
          <span>{isExpanded ? 'Hide reasoning' : 'View Opus 4.6 reasoning'}</span>
        </span>

        {thinkingDuration != null && (
          <span
            className={`
              inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium
              ${
                isExpanded
                  ? 'bg-chalk-accent/15 text-chalk-accent/80'
                  : 'bg-chalk-surface/50 text-slate-500 group-hover:text-slate-400'
              }
            `}
          >
            Thought for {formatDuration(thinkingDuration)}
          </span>
        )}

        {isStreaming && (
          <span className="flex items-center gap-1 text-[10px] text-chalk-accent/70 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-chalk-accent/70 animate-pulse" />
            thinking
          </span>
        )}
      </button>

      {/* Expandable reasoning content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="reasoning-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div
              id="reasoning-content"
              className="
                mt-2 p-4 rounded-xl
                bg-chalk-surface/30 border border-chalk-border/20
                border-l-2 border-l-chalk-accent/40
                max-h-64 overflow-y-auto
              "
            >
              <pre className="font-mono text-xs text-slate-400 whitespace-pre-wrap break-words leading-relaxed">
                {thinking}
                {isStreaming && (
                  <span className="inline-block w-0.5 h-3.5 bg-chalk-accent/60 animate-pulse ml-0.5 align-middle" />
                )}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
