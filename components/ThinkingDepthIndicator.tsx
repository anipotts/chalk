'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { DepthLevel } from '@/lib/thinking-budget';

interface ThinkingDepthIndicatorProps {
  depthLevel: DepthLevel;
  depthLabel: string;
  isThinking: boolean;
  thinkingDuration: number | null;
}

const DEPTH_CONFIG: Record<DepthLevel, { segments: number; color: string; glowColor: string }> = {
  quick: { segments: 1, color: 'bg-blue-400/50', glowColor: 'shadow-blue-400/20' },
  moderate: { segments: 2, color: 'bg-blue-400', glowColor: 'shadow-blue-400/30' },
  deep: { segments: 3, color: 'bg-amber-400', glowColor: 'shadow-amber-400/30' },
  intensive: { segments: 4, color: 'bg-purple-400', glowColor: 'shadow-purple-400/40' },
};

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ThinkingDepthIndicator({
  depthLevel,
  depthLabel,
  isThinking,
  thinkingDuration,
}: ThinkingDepthIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (isThinking) {
      startRef.current = Date.now();
      const id = setInterval(() => {
        if (startRef.current) {
          setElapsed(Date.now() - startRef.current);
        }
      }, 100);
      return () => clearInterval(id);
    } else {
      startRef.current = null;
    }
  }, [isThinking]);

  const config = DEPTH_CONFIG[depthLevel];
  const displayDuration = thinkingDuration ?? (isThinking ? elapsed : 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-2.5 px-3 py-1.5 mb-2"
    >
      {/* Depth bar */}
      <div className="flex gap-0.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`
              h-1.5 w-4 rounded-full transition-all duration-300
              ${i < config.segments ? config.color : 'bg-white/[0.06]'}
              ${i === config.segments - 1 && isThinking ? `animate-pulse shadow-sm ${config.glowColor}` : ''}
            `}
          />
        ))}
      </div>

      {/* Label */}
      <span className="text-[11px] text-slate-400 font-medium">
        {depthLabel}
      </span>

      {/* Timer */}
      {displayDuration > 0 && (
        <span className="text-[10px] text-slate-500 tabular-nums">
          {formatElapsed(displayDuration)}
        </span>
      )}

      {/* Pulsing dot when actively thinking */}
      {isThinking && (
        <motion.span
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.2, repeat: Infinity }}
          className="w-1.5 h-1.5 rounded-full bg-chalk-accent/70"
        />
      )}
    </motion.div>
  );
}
