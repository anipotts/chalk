'use client';

import { motion } from 'framer-motion';
import { ToolResultRenderer, type ToolCallData } from './ToolRenderers';
import { CircleNotch, X } from '@phosphor-icons/react';

interface KnowledgeDrawerProps {
  toolCalls: ToolCallData[];
  isStreaming: boolean;
  isExtracting?: boolean;
  onSeek: (seconds: number) => void;
  onOpenVideo?: (videoId: string, title: string, channelName: string, seekTo?: number) => void;
  onClose?: () => void;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
          <div className="flex gap-3">
            <div className="w-24 h-14 rounded-md bg-white/[0.06]" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-3/4 rounded bg-white/[0.06]" />
              <div className="h-2 w-1/2 rounded bg-white/[0.04]" />
              <div className="h-2 w-2/3 rounded bg-white/[0.03]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function KnowledgeDrawer({
  toolCalls,
  isStreaming,
  isExtracting,
  onSeek,
  onOpenVideo,
  onClose,
}: KnowledgeDrawerProps) {
  const isEmpty = toolCalls.length === 0 && !isStreaming;

  return (
    <div className="w-full h-full flex flex-col pointer-events-auto">
      {/* Header */}
      <div className="flex-none flex items-center gap-2 px-3 pt-3 pb-2">
        <span className="text-[11px] uppercase tracking-wider font-mono text-slate-500">Related</span>
        {toolCalls.length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-slate-400 font-mono">
            {toolCalls.length}
          </span>
        )}
        <div className="flex-1" />
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
            title="Close panel"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {isStreaming && toolCalls.length === 0 && <LoadingSkeleton />}

        {isEmpty && isExtracting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-8 text-center"
          >
            <CircleNotch size={20} className="text-chalk-accent animate-spin mb-2" />
            <span className="text-xs text-slate-400">Building knowledge graph...</span>
            <span className="text-[10px] text-slate-500 mt-1">This runs in the background</span>
          </motion.div>
        )}

        {isEmpty && !isExtracting && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <span className="text-xs text-slate-500">Ask a question to see related content</span>
          </div>
        )}

        {toolCalls.map((tc, i) => (
          <motion.div
            key={`drawer-${i}-${tc.result.type}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: 0.25,
              delay: isStreaming ? i * 0.08 : Math.min(i * 0.05, 0.3),
              ease: [0.23, 1, 0.32, 1],
            }}
          >
            <ToolResultRenderer
              toolCall={tc}
              onSeek={onSeek}
              onOpenVideo={onOpenVideo}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
