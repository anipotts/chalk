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
  PaperPlaneTilt,
} from "@phosphor-icons/react";
import type { VoiceControls } from "./overlay-types";

/* --- Voice mode visual elements --- */

function SoundWaveBars() {
  const bars = [0.4, 0.7, 1, 0.6, 0.9, 0.5, 0.8];
  return (
    <div className="flex items-end gap-[3px] h-8">
      {bars.map((maxScale, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-emerald-400"
          animate={{
            height: ["8px", `${maxScale * 32}px`, "8px"],
          }}
          transition={{
            duration: 0.6 + i * 0.1,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.08,
          }}
        />
      ))}
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 rounded-full bg-chalk-accent"
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* --- InputStripContent --- */

export interface InputStripContentProps {
  expanded: boolean;
  input: string;
  setInput: (value: string) => void;
  handleSubmit: () => void;
  isTextStreaming: boolean;
  exploreMode: boolean;
  toggleExploreMode: () => void;
  exploreAbortRef: React.RefObject<AbortController | null>;
  onStopTextStream: () => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  inputVisible?: boolean;
  onInputFocus?: () => void;
  onInputBlur?: () => void;

  // Voice controls
  voiceControls: VoiceControls;
  recordingDuration: number;

  // Exchanges for clear button
  exchanges: UnifiedExchange[];
  onClearHistory: () => void;
  setExploreGoal: (goal: string | null) => void;
  setExplorePills: (pills: string[]) => void;
  setExploreError: (error: string | null) => void;

  // Curriculum
  curriculumContext?: string | null;
  curriculumVideoCount?: number;

  // Height reporting for dynamic spacer
  onHeightChange?: (height: number) => void;
}

export function InputStripContent({
  expanded,
  input,
  setInput,
  handleSubmit,
  isTextStreaming,
  exploreMode,
  toggleExploreMode,
  exploreAbortRef,
  onStopTextStream,
  inputRef,
  inputVisible,
  onInputFocus,
  onInputBlur,
  voiceControls,
  recordingDuration,
  exchanges,
  onClearHistory,
  setExploreGoal,
  setExplorePills,
  setExploreError,
  curriculumContext,
  curriculumVideoCount,
  onHeightChange,
}: InputStripContentProps) {
  const stripRef = useRef<HTMLDivElement>(null);

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
    <div ref={stripRef} className={`absolute bottom-0 left-0 right-0 z-[32] pointer-events-none md:relative md:inset-auto md:w-full md:z-auto transition-opacity duration-200 ease-out ${
      inputVisible === false ? 'md:opacity-0 md:pointer-events-none' : 'md:opacity-100'
    }`}>
      <div className={`pointer-events-auto px-3 pb-3 md:px-0 md:pb-0 md:pt-3 ${expanded ? 'bg-chalk-surface/95 backdrop-blur-md md:bg-transparent md:backdrop-blur-none' : 'pt-8 bg-gradient-to-t from-black/80 via-black/40 to-transparent md:from-transparent md:via-transparent md:pt-3 md:bg-none'}`}>
        {/* Unified input row */}
        <div className="flex gap-2 items-center">
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
            onStop={() => {
              if (exploreMode && exploreAbortRef.current) {
                exploreAbortRef.current.abort("stopped");
                // Note: we don't null out the ref here since it's a RefObject
              } else {
                onStopTextStream();
              }
            }}
            placeholder="Ask about this video..."
            inputRef={inputRef}
            autoFocus={false}
            exploreMode={exploreMode}
            onToggleExplore={toggleExploreMode}
            onFocus={onInputFocus}
            onBlur={onInputBlur}
          />

          {/* Mic button */}
          <motion.button
            className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
              voiceControls.state === "recording"
                ? "bg-rose-500 shadow-lg shadow-rose-500/30"
                : voiceControls.state === "speaking"
                  ? "bg-emerald-500/20"
                  : voiceControls.state === "transcribing" ||
                      voiceControls.state === "thinking"
                    ? "bg-chalk-accent/20"
                    : "bg-white/[0.06] hover:bg-white/[0.10]"
            }`}
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
            aria-label={
              voiceControls.state === "recording"
                ? "Recording -- release to stop"
                : voiceControls.state === "speaking"
                  ? "Speaker is responding"
                  : "Hold to record voice"
            }
          >
            {voiceControls.state === "speaking" ? (
              <div className="scale-75">
                <SoundWaveBars />
              </div>
            ) : voiceControls.state === "transcribing" ||
              voiceControls.state === "thinking" ? (
              <ThinkingDots />
            ) : (
              <Microphone
                size={20}
                weight="fill"
                className={
                  voiceControls.state === "recording"
                    ? "text-white"
                    : "text-white/70"
                }
              />
            )}
          </motion.button>

          {/* Send/Stop button */}
          {isTextStreaming ? (
            <button
              type="button"
              onClick={() => {
                if (exploreMode && exploreAbortRef.current) {
                  exploreAbortRef.current.abort("stopped");
                  // Note: we don't null out the ref here since it's a RefObject
                } else {
                  onStopTextStream();
                }
              }}
              className="flex flex-shrink-0 justify-center items-center w-11 h-11 text-red-400 rounded-xl transition-colors bg-red-500/15 hover:bg-red-500/25"
              title="Stop"
              aria-label="Stop response"
            >
              <StopCircle size={16} weight="fill" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="flex flex-shrink-0 justify-center items-center w-11 h-11 rounded-xl transition-colors bg-chalk-accent/15 text-chalk-accent hover:bg-chalk-accent/25 disabled:opacity-30 disabled:hover:bg-chalk-accent/15"
              title="Send"
              aria-label="Send message"
            >
              <PaperPlaneTilt size={16} weight="fill" />
            </button>
          )}
        </div>

        {/* Voice state indicator when recording/processing */}
        {voiceControls.state !== "idle" && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="mt-3 text-center"
          >
            <p
              className={`text-sm font-medium ${
                voiceControls.state === "recording"
                  ? "text-rose-400"
                  : voiceControls.state === "speaking"
                    ? "text-emerald-400"
                    : "text-chalk-accent"
              }`}
            >
              {voiceControls.state === "recording" &&
                `Recording... ${formatDuration(recordingDuration)}`}
              {voiceControls.state === "transcribing" && "Transcribing..."}
              {voiceControls.state === "thinking" && "Thinking..."}
              {voiceControls.state === "speaking" && "Speaking..."}
            </p>
          </motion.div>
        )}

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
              onClick={() => {
                onClearHistory();
                setExploreGoal(null);
                setExplorePills([]);
                setExploreError(null);
              }}
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
