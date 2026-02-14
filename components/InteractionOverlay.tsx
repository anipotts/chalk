"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  type RefObject,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TextInput } from "./TextInput";
import { ExplorePills } from "./ExplorePills";
import {
  ExchangeMessage,
  renderRichContent,
  type UnifiedExchange,
} from "./ExchangeMessage";
import { ToolResultRenderer, parseStreamToSegments, type ToolCallData } from "./ToolRenderers";
import { LearnModeQuiz } from "./LearnModeQuiz";
import type { VoiceState } from "@/hooks/useVoiceMode";
import type { TranscriptSegment, TranscriptSource } from "@/lib/video-utils";
import type {
  ParsedQuiz,
  ParsedExplanation,
  LearnModePhase,
  LearnAction,
} from "@/hooks/useLearnMode";
import { storageKey } from "@/lib/brand";
import type { LearnOption } from "@/hooks/useLearnOptions";
import {
  CaretDown,
  CaretUp,
  Microphone,
  StopCircle,
  PaperPlaneTilt,
} from "@phosphor-icons/react";
import { classifyThinkingBudget } from "@/lib/thinking-budget";
import { splitReasoningFromText } from "@/lib/stream-parser";
import { createPortal } from "react-dom";

/* --- Learn mode error boundary --- */

class LearnErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="py-6 text-center">
          <p className="mb-3 text-sm text-slate-400">Something went wrong</p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              this.props.onReset();
            }}
            className="text-xs text-chalk-accent hover:underline"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface InteractionOverlayProps {
  expanded: boolean;
  segments: TranscriptSegment[];
  currentTime: number;
  videoId: string;
  videoTitle?: string;
  transcriptSource?: TranscriptSource;
  voiceId: string | null;
  isVoiceCloning: boolean;

  // Voice state
  voiceState: VoiceState;
  voiceTranscript: string;
  voiceResponseText: string;
  voiceError: string | null;
  recordingDuration: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;

  // Text state
  isTextStreaming: boolean;
  currentUserText: string;
  currentAiText: string;
  currentToolCalls?: ToolCallData[];
  currentRawAiText?: string;
  textError: string | null;
  onTextSubmit: (text: string) => Promise<void>;
  onStopTextStream: () => void;

  // Side panel
  onOpenVideo?: (
    videoId: string,
    title: string,
    channelName: string,
    seekTo?: number,
  ) => void;

  // Read aloud
  autoReadAloud: boolean;
  onToggleAutoReadAloud: (enabled: boolean) => void;
  playingMessageId: string | null;
  onPlayMessage: (id: string, text: string) => void;
  isReadAloudLoading: boolean;

  // Unified state
  exchanges: UnifiedExchange[];
  onClearHistory: () => void;

  blurLevel: "none" | "active";
  onSeek: (seconds: number) => void;
  onClose: () => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  inputVisible?: boolean;
  pendingChar?: string | null;
  onPendingCharConsumed?: () => void;
  onInputFocus?: () => void;
  onInputBlur?: () => void;

  // Learn mode
  learnPhase: LearnModePhase;
  learnSelectedAction: LearnAction | null;
  learnQuiz: ParsedQuiz | null;
  learnExplanation: ParsedExplanation | null;
  learnIntroText: string;
  learnResponseContent: string;
  learnExportableContent: string | null;
  learnAnswers: Map<number, string>;
  learnScore: { correct: number; total: number };
  learnThinking: string | null;
  learnThinkingDuration: number | null;
  learnLoading: boolean;
  learnError: string | null;
  learnOptions: LearnOption[];
  learnOptionsLoading: boolean;
  onEnsureLearnOptions?: () => void;
  onOpenLearnMode: () => void;
  onSelectAction: (action: LearnAction) => void;
  onFocusInput?: () => void;
  onSelectAnswer: (questionIndex: number, optionId: string) => void;
  onNextBatch: () => void;
  onStopLearnMode: () => void;

  // Curriculum context (cross-video playlist)
  curriculumContext?: string | null;
  curriculumVideoCount?: number;

  // External streaming control (unified model)
  onAddExchange?: (exchange: UnifiedExchange) => void;
  onSetStreamingState?: (state: {
    userText?: string;
    aiText?: string;
    isStreaming?: boolean;
    toolCalls?: ToolCallData[];
  }) => void;
  currentMode?: 'chat' | 'explore';
  onSetCurrentMode?: (mode: 'chat' | 'explore') => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Parse <options>opt1|opt2|opt3</options> from AI text. Returns [cleanText, options]. */
function parseExploreOptions(text: string): [string, string[]] {
  const match = text.match(/<options>([\s\S]*?)<\/options>/);
  if (!match) return [text, []];
  const cleanText = text.replace(/<options>[\s\S]*?<\/options>/, "").trimEnd();
  const options = match[1]
    .split("|")
    .map((o) => o.trim())
    .filter(Boolean);
  return [cleanText, options];
}

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

/** Live "thinking for x.y s" / "thought for x.y s" timer */
function TalkingTimer({
  isThinking,
  thinkingDuration,
}: {
  isThinking: boolean;
  thinkingDuration: number | null;
}) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isThinking) {
      startRef.current = null;
      return;
    }
    startRef.current = Date.now();
    const interval = setInterval(() => {
      if (startRef.current) setElapsed(Date.now() - startRef.current);
    }, 100);
    return () => clearInterval(interval);
  }, [isThinking]);

  if (!isThinking && thinkingDuration === null) return null;

  const seconds = isThinking ? elapsed / 1000 : (thinkingDuration ?? 0) / 1000;
  const label = isThinking ? "talking" : "talked";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-1.5 py-1"
    >
      {isThinking && (
        <div className="w-1.5 h-1.5 rounded-full bg-chalk-accent animate-pulse" />
      )}
      <span className="text-[11px] text-slate-500 font-mono">
        {label} for {seconds.toFixed(1)}s
      </span>
    </motion.div>
  );
}

/** Timestamp hover tooltip showing transcript context */
function TimestampTooltip({
  seconds,
  segments,
  position,
}: {
  seconds: number;
  segments: TranscriptSegment[];
  position: { x: number; y: number };
}) {
  const sorted = [...segments].sort(
    (a, b) => Math.abs(a.offset - seconds) - Math.abs(b.offset - seconds),
  );
  const nearby = sorted.slice(0, 3).sort((a, b) => a.offset - b.offset);

  if (nearby.length === 0) return null;

  const formatTs = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.1 }}
      className="fixed z-[9999] bg-chalk-surface border border-chalk-border rounded-lg p-2.5 max-w-[300px] shadow-xl shadow-black/30 pointer-events-none"
      style={{
        left: position.x,
        top: position.y - 8,
        transform: "translate(-50%, -100%)",
      }}
    >
      <div className="space-y-1">
        {nearby.map((seg, i) => {
          const isExact = Math.abs(seg.offset - seconds) < 3;
          return (
            <div
              key={i}
              className={`text-xs leading-relaxed ${isExact ? "text-chalk-text" : "text-slate-500"}`}
            >
              <span className="font-mono text-[10px] text-slate-600 mr-1">
                [{formatTs(seg.offset)}]
              </span>
              {seg.text}
            </div>
          );
        })}
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 -bottom-[5px] w-2.5 h-2.5 rotate-45 bg-chalk-surface border-r border-b border-chalk-border" />
    </motion.div>,
    document.body,
  );
}

export function InteractionOverlay({
  expanded,
  segments,
  currentTime,
  videoId,
  videoTitle,
  transcriptSource,
  voiceId,
  isVoiceCloning,

  // Voice
  voiceState,
  voiceTranscript,
  voiceResponseText,
  voiceError,
  recordingDuration,
  onStartRecording,
  onStopRecording,
  onCancelRecording,

  // Text
  isTextStreaming,
  currentUserText,
  currentAiText,
  currentToolCalls,
  currentRawAiText,
  textError,
  onTextSubmit,
  onStopTextStream,
  onOpenVideo,

  // Read aloud
  autoReadAloud,
  onToggleAutoReadAloud,
  playingMessageId,
  onPlayMessage,
  isReadAloudLoading,

  // Unified
  exchanges,
  onClearHistory,

  blurLevel,
  onSeek,
  onClose,
  inputRef,
  inputVisible,
  pendingChar,
  onPendingCharConsumed,
  onInputFocus,
  onInputBlur,

  // Learn mode
  learnPhase,
  learnSelectedAction,
  learnQuiz,
  learnExplanation,
  learnIntroText,
  learnResponseContent,
  learnExportableContent,
  learnAnswers,
  learnScore,
  learnThinking,
  learnThinkingDuration,
  learnLoading,
  learnError,
  learnOptions,
  learnOptionsLoading,
  onEnsureLearnOptions,
  onOpenLearnMode,
  onSelectAction,
  onFocusInput,
  onSelectAnswer,
  onNextBatch,
  onStopLearnMode,
  curriculumContext,
  curriculumVideoCount,
  onAddExchange,
  onSetStreamingState,
  onSetCurrentMode,
}: InteractionOverlayProps) {
  const [input, setInput] = useState("");
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Inject pending character from type-to-activate
  useEffect(() => {
    if (pendingChar) {
      setInput(prev => prev + pendingChar);
      onPendingCharConsumed?.();
    }
  }, [pendingChar, onPendingCharConsumed]);

  // Explore Mode state (UI-only; exchange data flows through unified model)
  const [exploreMode, setExploreMode] = useState(false);
  const [explorePills, setExplorePills] = useState<string[]>([]);
  const [exploreGoal, setExploreGoal] = useState<string | null>(null);
  const [exploreError, setExploreError] = useState<string | null>(null);
  const exploreAbortRef = useRef<AbortController | null>(null);

  // Adaptive thinking state (UI-only during streaming)
  const [exploreIsThinking, setExploreIsThinking] = useState(false);
  const [exploreThinkingDuration, setExploreThinkingDuration] = useState<
    number | null
  >(null);
  const [exploreThinking, setExploreThinking] = useState<string | null>(null);
  const exploreThinkingStartRef = useRef<number | null>(null);

  // Timestamp tooltip state
  const [tooltipInfo, setTooltipInfo] = useState<{
    seconds: number;
    position: { x: number; y: number };
  } | null>(null);

  const handleTimestampSeek = useCallback(
    (seconds: number) => {
      onSeek(seconds);
      onClose();
    },
    [onSeek, onClose],
  );

  const isTextMode = voiceState === "idle";

  // One-time cleanup of old localStorage keys
  useEffect(() => {
    try {
      localStorage.removeItem(storageKey("chat-model"));
      localStorage.removeItem("chalk-auto-pause-chat");
    } catch {
      /* ignore */
    }
  }, []);

  const isLearnModeActive = learnPhase !== "idle";
  const hasContent =
    exchanges.length > 0 ||
    isTextStreaming ||
    !!currentUserText ||
    !!currentAiText ||
    !!voiceTranscript ||
    !!voiceResponseText ||
    isLearnModeActive ||
    exploreMode;

  // Show idle hint when: text mode + no exchanges + no input + no current text exchange + not in learn mode
  const showIdleHint =
    isTextMode &&
    exchanges.length === 0 &&
    !input &&
    !currentUserText &&
    !currentAiText &&
    !isTextStreaming &&
    !isLearnModeActive &&
    !exploreMode;

  // Auto-scroll
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, []);

  const scrollToTop = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  // Scroll to bottom on new content
  useEffect(() => {
    if (!canScrollDown) scrollToBottom();
  }, [
    exchanges,
    currentAiText,
    scrollToBottom,
    canScrollDown,
  ]);

  // Always scroll to bottom when messages area expands
  useEffect(() => {
    if (expanded) {
      requestAnimationFrame(() => scrollToBottom());
    }
  }, [expanded, scrollToBottom]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setCanScrollUp(scrollTop > 60);
    setCanScrollDown(scrollHeight - scrollTop - clientHeight > 60);
  }, []);

  // Submit explore message (calls API directly with adaptive thinking budget)
  const submitExploreMessage = useCallback(
    async (text: string) => {
      if (isTextStreaming) return;

      if (!exploreGoal) {
        setExploreGoal(text);
      }

      // Set mode to explore
      onSetCurrentMode?.("explore");

      // Classify thinking budget based on message complexity
      const exploreExchangeCount = exchanges.filter(
        (e) => e.mode === "explore",
      ).length;
      const budget = classifyThinkingBudget(
        text,
        exploreExchangeCount,
        undefined,
        "explore",
      );
      setExploreIsThinking(true);
      setExploreThinkingDuration(null);
      setExploreThinking(null);
      exploreThinkingStartRef.current = Date.now();

      // Use unified streaming state
      onSetStreamingState?.({
        userText: text,
        aiText: "",
        isStreaming: true,
        toolCalls: [],
      });
      setExplorePills([]);
      setExploreError(null);

      // Build history from unified explore exchanges
      const history = exchanges
        .filter((e) => e.mode === "explore")
        .slice(-10)
        .flatMap((ex) => [
          { role: "user" as const, content: ex.userText },
          { role: "assistant" as const, content: ex.aiText },
        ]);
      history.push({ role: "user" as const, content: text });

      const controller = new AbortController();
      exploreAbortRef.current = controller;

      try {
        const response = await fetch("/api/video-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            currentTimestamp: currentTime,
            segments,
            history,
            videoTitle,
            transcriptSource,
            exploreMode: true,
            exploreGoal: exploreGoal || text,
            thinkingBudget: budget.budgetTokens,
            curriculumContext: curriculumContext || undefined,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const err = await response
            .json()
            .catch(() => ({ error: "Request failed" }));
          throw new Error(err.error || "Request failed");
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let fullRaw = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          fullRaw += chunk;

          // Parse reasoning vs text using \x1E separator
          const {
            reasoning,
            text: textContent,
            hasSeparator,
          } = splitReasoningFromText(fullRaw);

          if (hasSeparator) {
            // Separator received — thinking is complete
            if (exploreThinkingStartRef.current && exploreIsThinking) {
              setExploreThinkingDuration(
                Date.now() - exploreThinkingStartRef.current,
              );
              setExploreIsThinking(false);
            }
            setExploreThinking(reasoning || null);

            // Show the text content (after separator), parse options progressively
            let cleaned = textContent;
            const [stripped] = parseExploreOptions(cleaned);
            cleaned = stripped;
            cleaned = cleaned.replace(/<options>[^<]*$/, "").trimEnd();
            onSetStreamingState?.({ aiText: cleaned });
          } else {
            // Still in reasoning phase — update thinking text
            setExploreThinking(reasoning || null);
          }
        }

        // Final parse
        const { reasoning: finalReasoning, text: finalText } =
          splitReasoningFromText(fullRaw);
        const [cleanText, options] = parseExploreOptions(finalText);
        const thinkDuration = exploreThinkingStartRef.current
          ? Date.now() - exploreThinkingStartRef.current
          : null;

        // Add to unified exchanges
        const exchange: UnifiedExchange = {
          id: String(Date.now()),
          type: "text",
          mode: "explore",
          userText: text,
          aiText: cleanText,
          timestamp: currentTime,
          model: "opus",
          thinking: finalReasoning || undefined,
          thinkingDuration: thinkDuration ?? undefined,
          explorePills: options.length > 0 ? options : undefined,
        };
        onAddExchange?.(exchange);
        onSetStreamingState?.({
          userText: "",
          aiText: "",
          isStreaming: false,
          toolCalls: [],
        });
        setExplorePills(options);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setExploreError(
          err instanceof Error ? err.message : "Something went wrong",
        );
        onSetStreamingState?.({
          userText: "",
          aiText: "",
          isStreaming: false,
          toolCalls: [],
        });
      } finally {
        setExploreIsThinking(false);
        exploreAbortRef.current = null;
        exploreThinkingStartRef.current = null;
      }
    },
    [
      isTextStreaming,
      exploreGoal,
      exchanges,
      currentTime,
      segments,
      videoTitle,
      transcriptSource,
      curriculumContext,
      exploreIsThinking,
      onSetCurrentMode,
      onSetStreamingState,
      onAddExchange,
    ],
  );

  const handleSubmit = useCallback(async () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput("");

    // If learn mode was active, exit it first (typing freely enters explore chat)
    if (isLearnModeActive) {
      onStopLearnMode();
    }

    if (exploreMode) {
      await submitExploreMessage(text);
    } else {
      await onTextSubmit(text);
    }
  }, [input, exploreMode, isLearnModeActive, onStopLearnMode, onTextSubmit, submitExploreMessage]);

  // Toggle explore mode (unified: subsumes both explore chat and learn mode)
  const toggleExploreMode = useCallback(() => {
    setExploreMode((prev) => {
      const next = !prev;
      if (next) {
        // Entering explore mode — trigger lazy loading of learn options
        onEnsureLearnOptions?.();
        setExplorePills([]);
      } else {
        // Exiting explore mode — clean up UI state only (exchanges persist in unified model)
        setExplorePills([]);
        if (exploreAbortRef.current) {
          exploreAbortRef.current.abort("explore toggled");
          exploreAbortRef.current = null;
        }
        setExploreGoal(null);
        setExploreError(null);
        // Also stop learn mode if active
        if (learnPhase !== "idle") {
          onStopLearnMode();
        }
      }
      return next;
    });
  }, [onEnsureLearnOptions, learnPhase, onStopLearnMode]);

  // Handle pill selection (explore chat follow-up pills)
  const handlePillSelect = useCallback(
    (option: string) => {
      submitExploreMessage(option);
    },
    [submitExploreMessage],
  );

  // Handle unified option card click (triggers learn mode flow)
  const handleOptionCardClick = useCallback(
    (action: LearnAction) => {
      onOpenLearnMode(); // resets learn state + sets learnEverOpened
      // Execute action after state reset
      setTimeout(() => onSelectAction(action), 0);
    },
    [onOpenLearnMode, onSelectAction],
  );

  // Focus text input (for "Something else..." pill)
  const focusInput = useCallback(() => {
    inputRef?.current?.focus();
  }, [inputRef]);

  // Timestamp tooltip via event delegation
  const handleMouseOver = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const button = target.closest('button[aria-label^="Seek to"]');
    if (button) {
      const label = button.getAttribute("aria-label") || "";
      const match = label.match(/Seek to (\d+):(\d{2})(?::(\d{2}))? in video/);
      if (match) {
        let seconds: number;
        if (match[3]) {
          seconds =
            parseInt(match[1]) * 3600 +
            parseInt(match[2]) * 60 +
            parseInt(match[3]);
        } else {
          seconds = parseInt(match[1]) * 60 + parseInt(match[2]);
        }
        const rect = button.getBoundingClientRect();
        setTooltipInfo({
          seconds,
          position: { x: rect.left + rect.width / 2, y: rect.top },
        });
      }
    }
  }, []);

  const handleMouseOut = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const button = target.closest('button[aria-label^="Seek to"]');
    if (button) {
      setTooltipInfo(null);
    }
  }, []);

  // Streaming state is now unified — no mode switching needed
  const showExploreUI = exploreMode;

  return (
    <>
      {/* Expandable message overlay — gated by expanded */}
      <AnimatePresence>
        {expanded && (
          <div className={`absolute inset-0 md:inset-auto md:top-0 md:left-0 md:right-0 md:aspect-video z-10 flex flex-col md:rounded-xl md:overflow-hidden ${
            hasContent ? 'md:bg-black/80 md:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.5)]' : ''
          }`}>
            {/* Backdrop - clickable to close — dark overlay with film grain */}
            <motion.div
              key="overlay-backdrop"
              className={`absolute inset-0 ${
                hasContent
                  ? `cursor-pointer ${blurLevel === "active" ? "bg-black/50" : ""}`
                  : "pointer-events-none"
              }`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  onClose();
                }
              }}
            >
              {/* Film grain overlay */}
              {hasContent && blurLevel === "active" && (
                <div className="absolute inset-0 opacity-[0.07] pointer-events-none mix-blend-overlay">
                  <svg width="100%" height="100%">
                    <filter id="chalk-grain">
                      <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="4" stitchTiles="stitch" />
                      <feColorMatrix type="saturate" values="0" />
                    </filter>
                    <rect width="100%" height="100%" filter="url(#chalk-grain)" />
                  </svg>
                </div>
              )}
            </motion.div>

                <motion.div
                  key="text-mode"
                  drag="y"
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.5 }}
                  onDragEnd={(_, info) => {
                    if (info.offset.y > 100 || info.velocity.y > 500) onClose();
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                  className={`relative z-[1] flex flex-col w-full flex-1 min-h-0 pointer-events-none ${
                    hasContent ? "items-center" : "justify-end items-center"
                  }`}
                >
                  {/* Mobile grip indicator for swipe-to-close */}
                  <div className="flex-shrink-0 mx-auto mb-3 w-8 h-1 rounded-full pointer-events-auto md:hidden bg-white/20" />

                  {/* Messages - unified container for all messages */}
                  {hasContent && (
                    <div
                      ref={scrollRef}
                      onScroll={handleScroll}
                      onMouseOver={handleMouseOver}
                      onMouseOut={handleMouseOut}
                      className="flex-1 w-full overflow-y-auto scroll-smooth space-y-3 md:space-y-4 px-3 md:px-4 py-3 md:py-4 pointer-events-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                    >
                      {/* Explore mode: initial options */}
                      {showExploreUI &&
                        !exchanges.some((e) => e.mode === "explore") &&
                        !isTextStreaming &&
                        !isLearnModeActive && (
                          <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex flex-col justify-end w-full h-full"
                          >
                            <p className="mb-3 text-sm text-slate-400">
                              Pick a starting point, or just ask.
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {[
                                "Summarize with timestamps",
                                "Quiz me on this",
                                "Key takeaways so far",
                              ].map((label) => (
                                <button
                                  key={label}
                                  onClick={() => submitExploreMessage(label)}
                                  className="px-3 py-1.5 rounded-lg text-xs text-slate-300 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.15] hover:text-white transition-all active:scale-[0.97]"
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}

                      {/* Unified conversation history — all exchanges in chronological order */}
                      {exchanges.map((exchange, i) => {
                        const isLastExplore =
                          exchange.mode === "explore" &&
                          !exchanges
                            .slice(i + 1)
                            .some((e) => e.mode === "explore");
                        return (
                          <ExchangeMessage
                            key={exchange.id}
                            exchange={exchange}
                            onSeek={handleTimestampSeek}
                            videoId={videoId}
                            onPlayMessage={onPlayMessage}
                            isPlaying={playingMessageId === exchange.id}
                            isReadAloudLoading={
                              isReadAloudLoading &&
                              playingMessageId === exchange.id
                            }
                            onOpenVideo={onOpenVideo}
                            isLastExploreExchange={isLastExplore}
                            onPillSelect={handlePillSelect}
                            onFocusInput={focusInput}
                            exploreMode={exploreMode}
                          />
                        );
                      })}

                      {/* Thinking timer for explore mode */}
                      {showExploreUI &&
                        isTextStreaming &&
                        (exploreIsThinking || exploreThinkingDuration) && (
                          <TalkingTimer
                            isThinking={exploreIsThinking}
                            thinkingDuration={exploreThinkingDuration}
                          />
                        )}

                      {/* Current streaming exchange */}
                      {(currentUserText ||
                        currentAiText ||
                        (!showExploreUI &&
                          (voiceTranscript || voiceResponseText))) && (
                        <div className="space-y-3">
                          {(currentUserText ||
                            (!showExploreUI && voiceTranscript)) && (
                            <motion.div
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="flex justify-end w-full"
                            >
                              <div className="max-w-[85%] px-3.5 py-2 rounded-2xl bg-chalk-accent/90 text-white text-sm leading-relaxed break-words">
                                {currentUserText || voiceTranscript}
                              </div>
                            </motion.div>
                          )}
                          {(currentAiText ||
                            (!showExploreUI && voiceResponseText)) && (
                            <motion.div
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="flex justify-start w-full"
                            >
                              <div className="max-w-[85%]">
                                <div className="text-[15px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                                  {!showExploreUI && currentRawAiText && currentToolCalls && currentToolCalls.length > 0 ? (
                                    // Segment-based rendering: tool cards at their natural position
                                    <>
                                      {parseStreamToSegments(currentRawAiText).map((seg, i) => {
                                        if (seg.type === 'text') {
                                          if (!seg.content.trim()) return null;
                                          return <span key={`stream-seg-${i}`}>{renderRichContent(seg.content, handleTimestampSeek, videoId)}</span>;
                                        }
                                        if (seg.toolCall.result.type === 'cite_moment') {
                                          return (
                                            <ToolResultRenderer
                                              key={`stream-tool-${i}`}
                                              toolCall={seg.toolCall}
                                              onSeek={handleTimestampSeek}
                                              onOpenVideo={onOpenVideo}
                                            />
                                          );
                                        }
                                        return (
                                          <div key={`stream-tool-${i}`} className="my-2">
                                            <ToolResultRenderer
                                              toolCall={seg.toolCall}
                                              onSeek={handleTimestampSeek}
                                              onOpenVideo={onOpenVideo}
                                            />
                                          </div>
                                        );
                                      })}
                                    </>
                                  ) : (
                                    // Plain text rendering (no tool calls or voice mode)
                                    renderRichContent(
                                      currentAiText || voiceResponseText,
                                      handleTimestampSeek,
                                      videoId,
                                    )
                                  )}
                                  {(isTextStreaming ||
                                    voiceState === "thinking") && (
                                    <span className="inline-block w-0.5 h-4 bg-chalk-accent animate-pulse ml-0.5 align-middle" />
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </div>
                      )}

                      {/* Error message */}
                      {(textError || voiceError || exploreError) && (
                        <motion.div
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="px-3 py-2 text-xs text-rose-400 rounded-lg border bg-rose-500/10 border-rose-500/20"
                        >
                          {textError || voiceError || exploreError}
                        </motion.div>
                      )}

                      {/* Learn mode content */}
                      {isLearnModeActive && (
                        <LearnErrorBoundary onReset={onStopLearnMode}>
                          <LearnModeQuiz
                            phase={learnPhase}
                            quiz={learnQuiz}
                            explanation={learnExplanation}
                            introText={learnIntroText}
                            responseContent={learnResponseContent}
                            exportableContent={learnExportableContent}
                            answers={learnAnswers}
                            score={learnScore}
                            selectedAction={learnSelectedAction}
                            thinking={learnThinking}
                            thinkingDuration={learnThinkingDuration}
                            isLoading={learnLoading}
                            error={learnError}
                            learnOptions={learnOptions}
                            learnOptionsLoading={learnOptionsLoading}
                            videoTitle={videoTitle}
                            videoId={videoId}
                            onSelectAnswer={onSelectAnswer}
                            onSelectAction={onSelectAction}
                            onFocusInput={onFocusInput}
                            onNextBatch={onNextBatch}
                            onStop={onStopLearnMode}
                            onSeek={handleTimestampSeek}
                          />
                        </LearnErrorBoundary>
                      )}
                    </div>
                  )}

                  {/* Scroll badges — desktop only, tabs growing from blue border */}
                  <AnimatePresence>
                    {canScrollDown && exchanges.length > 0 && (
                      <motion.button
                        key="scroll-down-badge"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{
                          duration: 0.15,
                          ease: [0.23, 1, 0.32, 1],
                        }}
                        onClick={scrollToBottom}
                        className="hidden md:flex absolute top-0 left-0 z-[40] items-center gap-1 px-2.5 py-1.5 rounded-none rounded-br-lg bg-chalk-accent text-white text-[11px] font-medium shadow-lg shadow-blue-500/20 pointer-events-auto hover:bg-blue-400 transition-colors"
                        aria-label="Scroll to latest"
                      >
                        <CaretDown size={11} weight="bold" />
                        Latest
                      </motion.button>
                    )}
                  </AnimatePresence>
                  <AnimatePresence>
                    {canScrollUp && exchanges.length > 0 && (
                      <motion.button
                        key="scroll-up-badge"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{
                          duration: 0.15,
                          ease: [0.23, 1, 0.32, 1],
                        }}
                        onClick={scrollToTop}
                        className="hidden md:flex absolute top-0 right-0 z-[40] items-center gap-1 px-2.5 py-1.5 rounded-none rounded-bl-lg bg-chalk-accent text-white text-[11px] font-medium shadow-lg shadow-blue-500/20 pointer-events-auto hover:bg-blue-400 transition-colors"
                        aria-label="Scroll to top"
                      >
                        Top
                        <CaretUp size={11} weight="bold" />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </motion.div>

              {/* Spacer for input strip on mobile (still absolute-positioned there) */}
              <div className="md:hidden flex-none h-[72px]" />
          </div>
        )}
      </AnimatePresence>

      {/* Input strip — below video on desktop, bottom-pinned on mobile */}
      <div className={`absolute bottom-0 left-0 right-0 z-[32] pointer-events-none md:relative md:inset-auto md:w-full md:z-auto transition-opacity duration-200 ease-out ${
        inputVisible === false ? 'md:opacity-0 md:pointer-events-none' : 'md:opacity-100'
      }`}>
            <div className={`pointer-events-auto px-3 pb-3 md:px-0 md:pb-0 md:pt-2 ${!expanded ? 'pt-8 bg-gradient-to-t from-black/80 via-black/40 to-transparent md:from-transparent md:via-transparent md:pt-2 md:bg-none' : ''}`}>
              {/* Unified input row */}
              <div className="flex gap-2 items-center">
                {/* Curriculum context badge */}
                {curriculumContext &&
                  curriculumVideoCount &&
                  curriculumVideoCount > 0 && (
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-[10px] font-medium text-slate-500 bg-white/[0.04] border border-white/[0.06] rounded-full px-2 py-0.5">
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
                      exploreAbortRef.current = null;
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
                    voiceState === "recording"
                      ? "bg-rose-500 shadow-lg shadow-rose-500/30"
                      : voiceState === "speaking"
                        ? "bg-emerald-500/20 border border-emerald-500/40"
                        : voiceState === "transcribing" ||
                            voiceState === "thinking"
                          ? "bg-chalk-accent/20 border border-chalk-accent/40"
                          : "bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.15]"
                  }`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    if (voiceState === "idle") onStartRecording();
                  }}
                  onPointerUp={(e) => {
                    e.preventDefault();
                    if (voiceState === "recording") onStopRecording();
                  }}
                  onPointerLeave={(e) => {
                    e.preventDefault();
                    if (voiceState === "recording") onStopRecording();
                  }}
                  whileTap={{ scale: 0.95 }}
                  title="Hold to record voice"
                  aria-label={
                    voiceState === "recording"
                      ? "Recording — release to stop"
                      : voiceState === "speaking"
                        ? "Speaker is responding"
                        : "Hold to record voice"
                  }
                >
                  {voiceState === "speaking" ? (
                    <div className="scale-75">
                      <SoundWaveBars />
                    </div>
                  ) : voiceState === "transcribing" ||
                    voiceState === "thinking" ? (
                    <ThinkingDots />
                  ) : (
                    <Microphone
                      size={20}
                      weight="fill"
                      className={
                        voiceState === "recording"
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
                        exploreAbortRef.current = null;
                      } else {
                        onStopTextStream();
                      }
                    }}
                    className="flex flex-shrink-0 justify-center items-center w-11 h-11 text-red-400 rounded-xl border transition-colors bg-red-500/15 border-red-500/30 hover:bg-red-500/25"
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
                    className="flex flex-shrink-0 justify-center items-center w-11 h-11 rounded-xl border transition-colors bg-chalk-accent/15 text-chalk-accent border-chalk-accent/30 hover:bg-chalk-accent/25 disabled:opacity-30 disabled:hover:bg-chalk-accent/15"
                    title="Send"
                    aria-label="Send message"
                  >
                    <PaperPlaneTilt size={16} weight="fill" />
                  </button>
                )}
              </div>

              {/* Voice state indicator when recording/processing */}
              {voiceState !== "idle" && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="mt-3 text-center"
                >
                  <p
                    className={`text-sm font-medium ${
                      voiceState === "recording"
                        ? "text-rose-400"
                        : voiceState === "speaking"
                          ? "text-emerald-400"
                          : "text-chalk-accent"
                    }`}
                  >
                    {voiceState === "recording" &&
                      `Recording... ${formatDuration(recordingDuration)}`}
                    {voiceState === "transcribing" && "Transcribing..."}
                    {voiceState === "thinking" && "Thinking..."}
                    {voiceState === "speaking" && "Speaking..."}
                  </p>
                </motion.div>
              )}

              {/* Voice error */}
              {voiceError && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="px-3 py-2 mt-3 text-xs text-rose-400 rounded-lg border bg-rose-500/10 border-rose-500/20"
                >
                  {voiceError}
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

      {/* Timestamp tooltip */}
      <AnimatePresence>
        {tooltipInfo && (
          <TimestampTooltip
            seconds={tooltipInfo.seconds}
            segments={segments}
            position={tooltipInfo.position}
          />
        )}
      </AnimatePresence>
    </>
  );
}
