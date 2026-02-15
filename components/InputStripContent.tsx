"use client";

import React, {
  useRef,
  useEffect,
  type RefObject,
} from "react";
import { motion } from "framer-motion";
import { TextInput } from "./TextInput";
import type { UnifiedExchange } from "./ExchangeMessage";
import {
  Microphone,
  StopCircle,
  ArrowUp,
  X,
} from "@phosphor-icons/react";
import type { VoiceControls } from "./overlay-types";
import type { OverlayPhase } from "@/hooks/useOverlayPhase";
import { formatInterval, type IntervalSelection } from "@/lib/video-utils";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* --- InputStripContent --- */

export interface InputStripContentProps {
  phase: OverlayPhase;
  input: string;
  setInput: (value: string) => void;
  handleSubmit: () => void;
  isTextStreaming: boolean;
  exploreMode: boolean;
  toggleExploreMode: () => void;
  onStopStream: () => void;
  inputRef?: RefObject<HTMLElement | null>;
  onInputFocus?: () => void;
  onInputBlur?: () => void;

  // Voice controls
  voiceControls: VoiceControls;
  recordingDuration: number;

  // Exchanges for clear button
  exchanges: UnifiedExchange[];
  onClearHistory: () => void;
  onClose?: () => void;

  // Curriculum
  curriculumContext?: string | null;
  curriculumVideoCount?: number;

  // Height reporting for dynamic spacer
  onHeightChange?: (height: number) => void;

  // Interval selection
  interval?: IntervalSelection | null;
  onClearInterval?: () => void;
}

export function InputStripContent({
  phase,
  input,
  setInput,
  handleSubmit,
  isTextStreaming,
  exploreMode,
  toggleExploreMode,
  onStopStream,
  inputRef,
  onInputFocus,
  onInputBlur,
  voiceControls,
  recordingDuration,
  exchanges,
  onClearHistory,
  onClose,
  curriculumContext,
  curriculumVideoCount,
  onHeightChange,
  interval,
  onClearInterval,
}: InputStripContentProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const expanded = phase === 'chatting';

  // Report height changes via ResizeObserver for dynamic spacer
  useEffect(() => {
    const el = stripRef.current;
    if (!el || !onHeightChange) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        onHeightChange(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onHeightChange]);

  return (
    <div ref={stripRef} data-input-strip className={`absolute bottom-0 left-0 right-0 z-[32] pointer-events-none md:relative md:inset-auto md:w-full md:z-auto transition-opacity duration-150 ${
      phase === 'watching' ? 'md:opacity-60' : 'md:opacity-100'
    }`}>
      <div className={`pointer-events-auto px-3 pb-3 md:px-0 md:pb-0 md:pt-3 ${expanded ? 'bg-chalk-surface/95 backdrop-blur-md md:bg-transparent md:backdrop-blur-none' : 'pt-8 bg-gradient-to-t from-black/80 via-black/40 to-transparent md:from-transparent md:via-transparent md:pt-3 md:bg-none'}`}>
        {/* Unified input row — constrained width on desktop, centered */}
        <div className="flex gap-2 items-end md:max-w-3xl md:mx-auto">
          {/* Curriculum context badge */}
          {curriculumContext &&
            curriculumVideoCount &&
            curriculumVideoCount > 0 && (
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] font-medium text-slate-500 bg-white/[0.06] rounded-full px-2 py-0.5">
                  Curriculum: {curriculumVideoCount} videos loaded
                </span>
              </div>
            )}

          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            isStreaming={isTextStreaming}
            onStop={onStopStream}
            placeholder="Ask about this video..."
            inputRef={inputRef}
            autoFocus={false}
            exploreMode={exploreMode}
            onToggleExplore={toggleExploreMode}
            onFocus={onInputFocus}
            onBlur={onInputBlur}
            topBar={interval ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-white/[0.06]">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-300 bg-amber-500/15 border border-amber-400/30 rounded-full px-2.5 py-1 font-mono" title="Selected interval — double-click timeline or click X to clear">
                  {formatInterval(interval.startTime, interval.endTime)}
                  {onClearInterval && (
                    <button
                      type="button"
                      onClick={onClearInterval}
                      className="ml-0.5 text-amber-400/60 hover:text-amber-300 transition-colors"
                      aria-label="Clear interval selection"
                    >
                      <X size={10} weight="bold" />
                    </button>
                  )}
                </span>
              </div>
            ) : undefined}
            actions={<>
              {/* Close affordance — subtle esc hint, only when conversation exists */}
              {onClose && exchanges.length > 0 && (
                <button
                  type="button"
                  onClick={onClose}
                  className="hidden md:flex items-center h-8 px-2 rounded-lg text-[11px] font-medium text-slate-600 hover:text-slate-400 transition-colors"
                  title="Close overlay (Esc)"
                  aria-label="Close overlay"
                >
                  esc
                </button>
              )}
              {isTextStreaming ? (
                <button
                  type="button"
                  onClick={onStopStream}
                  className="flex flex-shrink-0 justify-center items-center w-8 h-8 text-red-400 rounded-lg transition-colors bg-red-500/15 hover:bg-red-500/25"
                  title="Stop"
                  aria-label="Stop response"
                >
                  <StopCircle size={14} weight="fill" />
                </button>
              ) : voiceControls.state !== "idle" ? (
                <motion.button
                  className={`flex-shrink-0 h-8 rounded-lg flex items-center justify-center transition-all px-2.5 ${
                    voiceControls.state === "recording"
                      ? "bg-rose-500 shadow-lg shadow-rose-500/30"
                      : voiceControls.state === "speaking"
                        ? "bg-emerald-500/20 hover:bg-emerald-500/30 cursor-pointer"
                        : "bg-chalk-accent/20"
                  }`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                  }}
                  onPointerUp={(e) => {
                    e.preventDefault();
                    if (voiceControls.state === "recording") voiceControls.onStop();
                    else if (voiceControls.state === "speaking") voiceControls.onStopPlayback();
                  }}
                  onPointerLeave={(e) => {
                    e.preventDefault();
                    if (voiceControls.state === "recording") voiceControls.onStop();
                  }}
                  whileTap={{ scale: 0.95 }}
                  aria-label={
                    voiceControls.state === "recording"
                      ? "Recording -- release to stop"
                      : voiceControls.state === "speaking"
                        ? "Stop speaking"
                        : "Processing voice"
                  }
                >
                  <span className={`text-[11px] font-medium whitespace-nowrap flex items-center gap-1 ${
                    voiceControls.state === "recording"
                      ? "text-white"
                      : voiceControls.state === "speaking"
                        ? "text-emerald-400"
                        : "text-chalk-accent"
                  }`}>
                    {voiceControls.state === "recording" && `Listening ${formatDuration(recordingDuration)}`}
                    {voiceControls.state === "transcribing" && "Transcribing..."}
                    {voiceControls.state === "thinking" && "Thinking..."}
                    {voiceControls.state === "speaking" && <><StopCircle size={10} weight="fill" /> Stop</>}
                  </span>
                </motion.button>
              ) : input.trim() ? (
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="flex flex-shrink-0 justify-center items-center w-8 h-8 rounded-lg transition-colors bg-chalk-accent/15 text-chalk-accent hover:bg-chalk-accent/25"
                  title="Send"
                  aria-label="Send message"
                >
                  <ArrowUp size={14} weight="bold" />
                </button>
              ) : (
                <motion.button
                  className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.06] hover:bg-white/[0.10] transition-all"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    if (voiceControls.state === "idle") voiceControls.onStart();
                  }}
                  onPointerUp={(e) => {
                    e.preventDefault();
                    if (voiceControls.state === "recording") voiceControls.onStop();
                  }}
                  onPointerLeave={(e) => {
                    e.preventDefault();
                    if (voiceControls.state === "recording") voiceControls.onStop();
                  }}
                  whileTap={{ scale: 0.95 }}
                  title="Hold to record voice"
                  aria-label="Hold to record voice"
                >
                  <Microphone size={16} weight="fill" className="text-white/70" />
                </motion.button>
              )}
            </>}
          />
        </div>

        {/* Voice error */}
        {voiceControls.error && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-3 py-2 mt-3 text-xs text-rose-400 rounded-lg bg-rose-500/10"
          >
            {voiceControls.error}
          </motion.div>
        )}

        {/* Clear button - mobile only when expanded */}
        {expanded && exchanges.length > 0 && (
          <div className="flex justify-center mt-4 md:hidden">
            <button
              onClick={onClearHistory}
              className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors"
              title="Clear conversation history"
            >
              Clear history
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
