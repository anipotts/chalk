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
import { ToolResultRenderer, type ToolCallData } from "./ToolRenderers";
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
  visible: boolean;
  autoDismiss?: boolean;
  viewSize?: "compact" | "default" | "expanded";
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
  pendingKey?: string | null;
  onConsumePendingKey?: () => void;

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
  visible,
  autoDismiss,
  viewSize = "default",
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
  pendingKey,
  onConsumePendingKey,

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
}: InteractionOverlayProps) {
  const [input, setInput] = useState("");
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const viewMaxWidth =
    viewSize === "compact"
      ? "max-w-2xl"
      : viewSize === "expanded"
        ? "max-w-6xl"
        : "max-w-4xl";

  // Explore Mode state
  const [exploreMode, setExploreMode] = useState(false);
  const [explorePills, setExplorePills] = useState<string[]>([]);
  const [exploreGoal, setExploreGoal] = useState<string | null>(null);
  const [exploreExchanges, setExploreExchanges] = useState<
    Array<{
      role: "user" | "assistant";
      text: string;
      thinking?: string;
      thinkingDuration?: number;
    }>
  >([]);
  const [exploreStreaming, setExploreStreaming] = useState(false);
  const [exploreCurrentAiText, setExploreCurrentAiText] = useState("");
  const [exploreCurrentUserText, setExploreCurrentUserText] = useState("");
  const [exploreError, setExploreError] = useState<string | null>(null);
  const exploreAbortRef = useRef<AbortController | null>(null);

  // Adaptive thinking state
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

  // Consume pending key from keyboard shortcut that opened the overlay
  useEffect(() => {
    if (pendingKey) {
      setInput((prev) => prev + pendingKey);
      onConsumePendingKey?.();
      // Focus after the character is set
      requestAnimationFrame(() => inputRef?.current?.focus());
    }
  }, [pendingKey, onConsumePendingKey, inputRef]);

  const isLearnModeActive = learnPhase !== "idle";
  const hasExploreContent =
    exploreExchanges.length > 0 ||
    exploreCurrentAiText ||
    exploreCurrentUserText;
  const hasContent =
    exchanges.length > 0 ||
    isTextStreaming ||
    !!currentUserText ||
    !!currentAiText ||
    !!voiceTranscript ||
    !!voiceResponseText ||
    isLearnModeActive ||
    hasExploreContent ||
    exploreMode;

  // Auto-dismiss: when video is playing (autoDismiss), no content, and no input, close after 5s
  useEffect(() => {
    if (!autoDismiss || !visible) return;
    if (hasContent || input.trim()) return;
    const timer = setTimeout(() => {
      onClose();
    }, 5000);
    return () => clearTimeout(timer);
  }, [autoDismiss, visible, hasContent, input, onClose]);

  // Show idle hint when: text mode + no exchanges + no input + no current text exchange + not in learn mode + no explore content
  const showIdleHint =
    isTextMode &&
    exchanges.length === 0 &&
    !input &&
    !currentUserText &&
    !currentAiText &&
    !isTextStreaming &&
    !isLearnModeActive &&
    !hasExploreContent &&
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
    exploreExchanges,
    exploreCurrentAiText,
    scrollToBottom,
    canScrollDown,
  ]);

  // Always scroll to bottom when overlay becomes visible
  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => scrollToBottom());
    }
  }, [visible, scrollToBottom]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setCanScrollUp(scrollTop > 60);
    setCanScrollDown(scrollHeight - scrollTop - clientHeight > 60);
  }, []);

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
  }, [input, exploreMode, isLearnModeActive, onStopLearnMode, onTextSubmit]);

  // Toggle explore mode (unified: subsumes both explore chat and learn mode)
  const toggleExploreMode = useCallback(() => {
    setExploreMode((prev) => {
      const next = !prev;
      if (next) {
        // Entering explore mode — trigger lazy loading of learn options
        onEnsureLearnOptions?.();
        setExplorePills([]);
      } else {
        // Exiting explore mode — clean up everything
        setExplorePills([]);
        if (exploreAbortRef.current) {
          exploreAbortRef.current.abort("explore toggled");
          exploreAbortRef.current = null;
        }
        setExploreStreaming(false);
        setExploreCurrentAiText("");
        setExploreCurrentUserText("");
        setExploreExchanges([]);
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

  // Submit explore message (calls API directly with adaptive thinking budget)
  const submitExploreMessage = useCallback(
    async (text: string) => {
      if (exploreStreaming) return;

      if (!exploreGoal) {
        setExploreGoal(text);
      }

      // Classify thinking budget based on message complexity
      const budget = classifyThinkingBudget(
        text,
        exploreExchanges.length,
        undefined,
        "explore",
      );
      setExploreIsThinking(true);
      setExploreThinkingDuration(null);
      setExploreThinking(null);
      exploreThinkingStartRef.current = Date.now();

      setExploreCurrentUserText(text);
      setExploreCurrentAiText("");
      setExplorePills([]);
      setExploreError(null);
      setExploreStreaming(true);

      const history = [
        ...exploreExchanges.map((ex) => ({
          role: ex.role,
          content: ex.text,
        })),
        { role: "user" as const, content: text },
      ];

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
            // Strip complete <options>...</options> AND partial <options> at end of stream
            let cleaned = textContent;
            const [stripped] = parseExploreOptions(cleaned);
            cleaned = stripped;
            cleaned = cleaned.replace(/<options>[^<]*$/, "").trimEnd();
            setExploreCurrentAiText(cleaned);
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

        setExploreExchanges((prev) => [
          ...prev,
          { role: "user", text },
          {
            role: "assistant",
            text: cleanText,
            thinking: finalReasoning || undefined,
            thinkingDuration: thinkDuration ?? undefined,
          },
        ]);
        setExploreCurrentUserText("");
        setExploreCurrentAiText("");
        setExplorePills(options);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setExploreError(
          err instanceof Error ? err.message : "Something went wrong",
        );
      } finally {
        setExploreStreaming(false);
        setExploreIsThinking(false);
        exploreAbortRef.current = null;
        exploreThinkingStartRef.current = null;
      }
    },
    [
      exploreStreaming,
      exploreGoal,
      exploreExchanges,
      currentTime,
      segments,
      videoTitle,
      transcriptSource,
      curriculumContext,
      exploreIsThinking,
    ],
  );

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

  // Determine which exchanges and streaming text to show
  const showExploreUI = exploreMode;
  const activeStreaming = showExploreUI ? exploreStreaming : isTextStreaming;
  const activeUserText = showExploreUI
    ? exploreCurrentUserText
    : currentUserText;
  const activeAiText = showExploreUI ? exploreCurrentAiText : currentAiText;

  return (
    <AnimatePresence>
      {visible && (
        <div className="flex absolute inset-0 z-30 flex-col items-center md:justify-center md:p-4">
          {/* Backdrop - clickable when content exists, otherwise transparent pass-through */}
          <motion.div
            className={`absolute inset-0 ${
              hasContent
                ? `cursor-pointer ${blurLevel === "active" ? "bg-black/40 backdrop-blur-md" : ""}`
                : "pointer-events-none"
            }`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                onClose();
              }
            }}
          />

          {/* Wrapper — groups border frame + input strip for centering */}
          <div
            className={`flex relative z-10 flex-col flex-1 mx-auto w-full min-h-0 ease-out pointer-events-none ${viewMaxWidth} md:flex-none transition-[max-width] duration-[250ms]`}
          >
            {/* Content frame */}
            <div
              className={`relative flex flex-col flex-1 min-h-0 md:flex-none md:aspect-video md:overflow-hidden md:rounded-xl md:border-[3px] md:border-transparent ${
                hasContent
                  ? "md:bg-black/70 md:backdrop-blur-2xl md:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.5)] items-center"
                  : "items-center justify-end"
              }`}
            >
              {/* UNIFIED INPUT MODE — swipe down to dismiss; content fades in/out */}
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
                transition={{ duration: 0.2 }}
                className={`flex flex-col w-full flex-1 min-h-0 ${
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
                      !hasExploreContent &&
                      !exploreStreaming &&
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

                    {/* Explore mode conversation history */}
                    {showExploreUI &&
                      exploreExchanges.map((ex, i) => {
                        if (ex.role === "user") {
                          return (
                            <motion.div
                              key={`explore-${i}`}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="flex justify-end w-full"
                            >
                              <div className="max-w-[85%] px-3.5 py-2 rounded-2xl bg-chalk-accent/90 text-white text-sm leading-relaxed break-words">
                                {ex.text}
                              </div>
                            </motion.div>
                          );
                        }
                        const isLastAssistant =
                          i === exploreExchanges.length - 1;
                        return (
                          <motion.div
                            key={`explore-${i}`}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex justify-start w-full"
                          >
                            <div className="max-w-[85%]">
                              <div className="text-[15px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                                {renderRichContent(
                                  ex.text,
                                  handleTimestampSeek,
                                  videoId,
                                )}
                              </div>
                              {ex.thinkingDuration && (
                                <span className="text-[11px] text-slate-500 font-mono mt-1 block">
                                  thought for{" "}
                                  {(ex.thinkingDuration / 1000).toFixed(1)}s
                                </span>
                              )}
                              {isLastAssistant &&
                                explorePills.length > 0 &&
                                !exploreStreaming && (
                                  <ExplorePills
                                    options={explorePills}
                                    onSelect={handlePillSelect}
                                    onFocusInput={focusInput}
                                  />
                                )}
                            </div>
                          </motion.div>
                        );
                      })}

                    {/* Normal mode: past exchanges */}
                    {!showExploreUI &&
                      exchanges.map((exchange) => (
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
                        />
                      ))}

                    {/* Thinking timer for explore mode */}
                    {showExploreUI &&
                      exploreStreaming &&
                      (exploreIsThinking || exploreThinkingDuration) && (
                        <TalkingTimer
                          isThinking={exploreIsThinking}
                          thinkingDuration={exploreThinkingDuration}
                        />
                      )}

                    {/* Current streaming exchange */}
                    {(activeUserText ||
                      activeAiText ||
                      (!showExploreUI &&
                        (voiceTranscript || voiceResponseText))) && (
                      <div className="space-y-3">
                        {/* User message (text or voice transcript) */}
                        {(activeUserText ||
                          (!showExploreUI && voiceTranscript)) && (
                          <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex justify-end w-full"
                          >
                            <div className="max-w-[85%] px-3.5 py-2 rounded-2xl bg-chalk-accent/90 text-white text-sm leading-relaxed break-words">
                              {activeUserText || voiceTranscript}
                            </div>
                          </motion.div>
                        )}
                        {/* AI response */}
                        {(activeAiText ||
                          (!showExploreUI && voiceResponseText)) && (
                          <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex justify-start w-full"
                          >
                            <div className="max-w-[85%]">
                              <div className="text-[15px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                                {renderRichContent(
                                  activeAiText || voiceResponseText,
                                  handleTimestampSeek,
                                  videoId,
                                )}
                                {(activeStreaming ||
                                  voiceState === "thinking") && (
                                  <span className="inline-block w-0.5 h-4 bg-chalk-accent animate-pulse ml-0.5 align-middle" />
                                )}
                              </div>
                              {/* Tool results during streaming */}
                              {!showExploreUI &&
                                currentToolCalls &&
                                currentToolCalls.length > 0 && (
                                  <div className="mt-2 space-y-1">
                                    {currentToolCalls.map((tc, i) => (
                                      <ToolResultRenderer
                                        key={`stream-tool-${i}`}
                                        toolCall={tc}
                                        onSeek={handleTimestampSeek}
                                        onOpenVideo={onOpenVideo}
                                      />
                                    ))}
                                  </div>
                                )}
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

                    {/* Learn mode content — shown below chat, not replacing it */}
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

                {/* Scroll badges — desktop only, flush with blue border corners */}
                <AnimatePresence>
                  {canScrollDown &&
                    (exchanges.length > 0 || exploreExchanges.length > 0) && (
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
                        className="hidden md:flex absolute top-0 left-0 z-20 items-center gap-1 px-2.5 py-1.5 rounded-none rounded-br-lg bg-chalk-accent text-white text-[11px] font-medium shadow-lg shadow-blue-500/20 pointer-events-auto hover:bg-blue-400 transition-colors"
                        aria-label="Scroll to latest"
                      >
                        <CaretDown size={11} weight="bold" />
                        Latest
                      </motion.button>
                    )}
                </AnimatePresence>
                <AnimatePresence>
                  {canScrollUp &&
                    (exchanges.length > 0 || exploreExchanges.length > 0) && (
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
                        className="hidden md:flex absolute top-0 right-0 z-20 items-center gap-1 px-2.5 py-1.5 rounded-none rounded-bl-lg bg-chalk-accent text-white text-[11px] font-medium shadow-lg shadow-blue-500/20 pointer-events-auto hover:bg-blue-400 transition-colors"
                        aria-label="Scroll to top"
                      >
                        Top
                        <CaretUp size={11} weight="bold" />
                      </motion.button>
                    )}
                </AnimatePresence>
              </motion.div>
            </div>

            {/* Input strip — below border on desktop, bottom of overlay on mobile */}
            <div className="flex-none px-3 pb-3 w-full pointer-events-auto md:px-0 md:pb-0 md:mt-3">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="w-full"
              >
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
                    isStreaming={activeStreaming}
                    onStop={
                      showExploreUI
                        ? () => {
                            if (exploreAbortRef.current) {
                              exploreAbortRef.current.abort("stopped");
                              exploreAbortRef.current = null;
                            }
                            setExploreStreaming(false);
                          }
                        : onStopTextStream
                    }
                    placeholder="Ask about this video..."
                    inputRef={inputRef}
                    autoFocus={true}
                    exploreMode={exploreMode}
                    onToggleExplore={toggleExploreMode}
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
                  {activeStreaming ? (
                    <button
                      type="button"
                      onClick={
                        showExploreUI
                          ? () => {
                              if (exploreAbortRef.current) {
                                exploreAbortRef.current.abort("stopped");
                                exploreAbortRef.current = null;
                              }
                              setExploreStreaming(false);
                            }
                          : onStopTextStream
                      }
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

                {/* Clear button - at bottom (mobile only; desktop uses header) */}
                {(exchanges.length > 0 || exploreExchanges.length > 0) && (
                  <div className="flex justify-center mt-4 md:hidden">
                    <button
                      onClick={() => {
                        onClearHistory();
                        if (exploreMode) {
                          setExploreExchanges([]);
                          setExploreGoal(null);
                          setExplorePills([]);
                          setExploreCurrentAiText("");
                          setExploreCurrentUserText("");
                          setExploreError(null);
                        }
                      }}
                      className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors"
                      title="Clear conversation history"
                    >
                      Clear history
                    </button>
                  </div>
                )}
              </motion.div>
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
        </div>
      )}
    </AnimatePresence>
  );
}
