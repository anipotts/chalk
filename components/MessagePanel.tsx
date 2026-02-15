"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ExchangeMessage,
  renderRichContent,
  type UnifiedExchange,
} from "./ExchangeMessage";
import { ToolResultRenderer, parseStreamToSegments, type ToolCallData } from "./ToolRenderers";
import { ExplorePills } from "./ExplorePills";
import { LearnModeQuiz } from "./LearnModeQuiz";
import type { VoiceState } from "@/hooks/useVoiceMode";
import type { TranscriptSegment } from "@/lib/video-utils";
import { getStoryboardFrame, type StoryboardLevel } from "@/lib/storyboard";
import {
  CaretDown,
  CaretUp,
  X,
} from "@phosphor-icons/react";
import { createPortal } from "react-dom";
import type { LearnState, LearnHandlers } from "./overlay-types";

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

/* --- Thinking timer --- */

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

/* --- Timestamp hover tooltip --- */

/** Enhanced timestamp hover card with storyboard thumbnail and transcript context. Click to seek. */
function TimestampTooltip({
  seconds,
  segments,
  position,
  storyboardLevels,
  onSeek,
  onClose,
}: {
  seconds: number;
  segments: TranscriptSegment[];
  position: { x: number; y: number };
  storyboardLevels?: StoryboardLevel[];
  onSeek: (seconds: number) => void;
  onClose: () => void;
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

  // Pick a larger storyboard level if available (L2 for 320px-wide card)
  const preferLevel = storyboardLevels && storyboardLevels.length > 2 ? 2 : 1;
  const frame = storyboardLevels && storyboardLevels.length > 0
    ? getStoryboardFrame(storyboardLevels, seconds, preferLevel)
    : null;

  // Clamp position to viewport edges
  const clampedX = Math.max(170, Math.min(position.x, window.innerWidth - 170));

  return createPortal(
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.97 }}
      transition={{ type: "spring", damping: 25, stiffness: 400 }}
      className="fixed z-[9999] bg-chalk-surface/95 backdrop-blur-md border border-chalk-border/60 rounded-xl overflow-hidden max-w-[280px] w-[280px] shadow-2xl shadow-black/40 pointer-events-auto cursor-pointer hover:border-chalk-accent/40 transition-colors"
      style={{
        left: clampedX,
        top: position.y - 8,
        transform: "translate(-50%, -100%)",
      }}
      onClick={() => { onSeek(seconds); onClose(); }}
      onMouseEnter={(e) => e.stopPropagation()}
      onMouseLeave={() => onClose()}
    >
      {/* Storyboard thumbnail */}
      {frame && (() => {
        // Scale sprite sheet so one frame fills the 280px container width
        const containerW = 280;
        const scale = containerW / frame.width;
        const level = storyboardLevels?.[Math.min(preferLevel, (storyboardLevels?.length ?? 1) - 1)];
        const cols = level?.cols ?? 5;
        const rows = level?.rows ?? 5;
        // Parse original position and scale it
        const posMatch = frame.backgroundPosition.match(/-?(\d+)(?:px)?\s+-?(\d+)/);
        const origX = posMatch ? parseInt(posMatch[1]) : 0;
        const origY = posMatch ? parseInt(posMatch[2]) : 0;
        return (
        <div className="relative w-full overflow-hidden" style={{ height: Math.round(frame.height * scale) }}>
          <div
            className="w-full h-full"
            style={{
              backgroundImage: `url(${frame.url})`,
              backgroundPosition: `-${Math.round(origX * scale)}px -${Math.round(origY * scale)}px`,
              backgroundSize: `${Math.round(frame.width * cols * scale)}px ${Math.round(frame.height * rows * scale)}px`,
              backgroundRepeat: 'no-repeat',
            }}
          />
          {/* Gradient overlay from image to content */}
          <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-chalk-surface/95 to-transparent" />
          {/* Timestamp badge */}
          <span className="absolute top-2 left-2 bg-black/70 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
            {formatTs(seconds)}
          </span>
        </div>
        );
      })()}

      {/* Transcript context */}
      <div className={`px-3 ${frame ? 'py-1.5' : 'py-2'} space-y-0.5`}>
        {!frame && (
          <span className="text-[10px] font-mono text-chalk-accent mb-1 block">
            {formatTs(seconds)}
          </span>
        )}
        {nearby.map((seg, i) => {
          const isExact = Math.abs(seg.offset - seconds) < 3;
          return (
            <div
              key={i}
              className={`text-[11px] leading-snug ${isExact ? "text-chalk-text" : "text-slate-500"}`}
            >
              {seg.text}
            </div>
          );
        })}
      </div>
    </motion.div>,
    document.body,
  );
}

/* --- MessagePanel --- */

export interface MessagePanelProps {
  hasContent: boolean;
  expanded: boolean;
  exchanges: UnifiedExchange[];
  segments: TranscriptSegment[];
  videoId: string;
  onSeek: (seconds: number) => void;
  onClose: () => void;
  onOpenVideo?: (
    videoId: string,
    title: string,
    channelName: string,
    seekTo?: number,
  ) => void;

  // Streaming state
  isTextStreaming: boolean;
  currentUserText: string;
  currentAiText: string;
  currentToolCalls?: ToolCallData[];
  currentRawAiText?: string;
  textError: string | null;

  // Voice state (for non-explore fallback rendering)
  voiceState: VoiceState;
  voiceTranscript: string;
  voiceResponseText: string;
  voiceError: string | null;

  // Explore state
  showExploreUI: boolean;
  exploreMode: boolean;
  exploreError: string | null;
  isThinking: boolean;
  thinkingDuration: number | null;
  submitExploreMessage: (text: string) => void;

  // Read aloud
  playingMessageId: string | null;
  onPlayMessage: (id: string, text: string) => void;
  isReadAloudLoading: boolean;

  // Explore pill selection
  handlePillSelect: (option: string) => void;
  focusInput: () => void;

  // Learn mode
  learnState: LearnState;
  learnHandlers: LearnHandlers;
  videoTitle?: string;

  // Tooltip segments
  tooltipSegments: TranscriptSegment[];
  storyboardLevels?: StoryboardLevel[];

  // Mobile flow mode (disable drag-to-close)
  disableDrag?: boolean;
}

export function MessagePanel({
  hasContent,
  expanded,
  exchanges,
  segments,
  videoId,
  onSeek,
  onClose,
  onOpenVideo,
  isTextStreaming,
  currentUserText,
  currentAiText,
  currentToolCalls,
  currentRawAiText,
  textError,
  voiceState,
  voiceTranscript,
  voiceResponseText,
  voiceError,
  showExploreUI,
  exploreMode,
  exploreError,
  isThinking,
  thinkingDuration,
  submitExploreMessage,
  playingMessageId,
  onPlayMessage,
  isReadAloudLoading,
  handlePillSelect,
  focusInput,
  learnState,
  learnHandlers,
  videoTitle,
  tooltipSegments,
  storyboardLevels,
  disableDrag,
}: MessagePanelProps) {
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Timestamp tooltip state with debounced close
  const [tooltipInfo, setTooltipInfo] = useState<{
    seconds: number;
    position: { x: number; y: number };
  } | null>(null);
  const tooltipCloseTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleTimestampSeek = useCallback(
    (seconds: number) => {
      onSeek(seconds);
      onClose();
    },
    [onSeek, onClose],
  );

  const isLearnModeActive = learnState.phase !== "idle";

  // Auto-scroll
  const scrollToBottom = useCallback((smooth = false) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "instant",
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
      requestAnimationFrame(() => scrollToBottom(true));
    }
  }, [expanded, scrollToBottom]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setCanScrollUp(scrollTop > 60);
    setCanScrollDown(scrollHeight - scrollTop - clientHeight > 60);
  }, []);

  // Timestamp tooltip via event delegation with debounced close
  const handleMouseOver = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const button = target.closest('button[aria-label^="Seek to"]');
    if (button) {
      // Cancel any pending close
      if (tooltipCloseTimer.current) {
        clearTimeout(tooltipCloseTimer.current);
        tooltipCloseTimer.current = undefined;
      }
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
      // 200ms debounce so users can hover into the tooltip card
      tooltipCloseTimer.current = setTimeout(() => {
        setTooltipInfo(null);
      }, 200);
    }
  }, []);

  const handleTooltipClose = useCallback(() => {
    setTooltipInfo(null);
  }, []);

  return (
    <>
      <motion.div
        key="text-mode"
        drag={disableDrag ? false : "y"}
        dragConstraints={disableDrag ? undefined : { top: 0, bottom: 0 }}
        dragElastic={disableDrag ? undefined : { top: 0, bottom: 0.5 }}
        onDragEnd={disableDrag ? undefined : (_, info) => {
          if (info.offset.y > 100 || info.velocity.y > 500) onClose();
        }}
        initial={disableDrag ? undefined : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={disableDrag ? undefined : { opacity: 0 }}
        transition={disableDrag ? undefined : { duration: 0.4, ease: "easeInOut" }}
        className={`relative z-[1] flex flex-col w-full flex-1 min-h-0 ${
          disableDrag ? '' : 'pointer-events-none'
        } ${
          hasContent ? "items-center" : "justify-end items-center"
        }`}
      >
        {/* Mobile grip indicator for swipe-to-close (overlay mode only) */}
        {!disableDrag && (
          <div className="flex-shrink-0 mx-auto mb-3 w-8 h-1 rounded-full pointer-events-auto md:hidden bg-white/20" />
        )}

        {/* Messages - unified container for all messages */}
        {hasContent && (
          <div
            ref={scrollRef}
            data-message-panel
            onScroll={handleScroll}
            onMouseOver={handleMouseOver}
            onMouseOut={handleMouseOut}
            className="flex-1 w-full overflow-y-auto scroll-smooth flex flex-col gap-3 md:gap-4 px-3 md:px-4 py-3 md:py-4 pointer-events-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          >
            {/* Unified conversation history -- all exchanges in chronological order */}
            {exchanges.map((exchange, i) => {
              const justCommitted = i === exchanges.length - 1 && Date.now() - Number(exchange.id) < 500;
              const prev = i > 0 ? exchanges[i - 1] : null;

              // Separator: time gap > 5 min or mode change
              let separator: React.ReactNode = null;
              if (prev) {
                const timeGap = exchange.timestamp - prev.timestamp;
                const modeChange = exchange.mode !== prev.mode;
                if (timeGap > 300 || modeChange) {
                  const formatTs = (s: number) => {
                    const m = Math.floor(s / 60);
                    const sec = Math.floor(s % 60);
                    return `${m}:${sec.toString().padStart(2, "0")}`;
                  };
                  const label = modeChange
                    ? exchange.mode === "explore" ? "explore mode" : "chat mode"
                    : formatTs(exchange.timestamp);
                  separator = (
                    <div key={`sep-${exchange.id}`} className="flex items-center gap-3 py-1">
                      <div className="flex-1 h-px bg-chalk-border/20" />
                      <span className="text-[10px] text-slate-600 font-mono">{label}</span>
                      <div className="flex-1 h-px bg-chalk-border/20" />
                    </div>
                  );
                }
              }

              return (
                <React.Fragment key={exchange.id}>
                  {separator}
                  <ExchangeMessage
                    exchange={exchange}
                    skipEntrance={justCommitted}
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
                </React.Fragment>
              );
            })}

            {/* Current streaming exchange */}
            {(currentUserText ||
              currentAiText ||
              (!showExploreUI &&
                (voiceTranscript || voiceResponseText))) && (
              <div className="space-y-3">
                {(currentUserText ||
                  (!showExploreUI && voiceTranscript)) && (
                  <div className="flex justify-end w-full">
                    <div className="max-w-[85%] px-3.5 py-2 rounded-2xl bg-chalk-accent/90 text-white text-sm leading-relaxed break-words">
                      {currentUserText || voiceTranscript}
                    </div>
                  </div>
                )}
                {/* Thinking timer — between user msg and AI response */}
                {showExploreUI && isTextStreaming && (isThinking || thinkingDuration !== null) && (
                  <TalkingTimer isThinking={isThinking} thinkingDuration={thinkingDuration} />
                )}
                {(currentAiText ||
                  (!showExploreUI && voiceResponseText)) && (
                  <div className="flex justify-start w-full">
                    <div className="w-full">
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
                  </div>
                )}
              </div>
            )}

            {/* Explore mode: initial options -- shown at bottom after all exchanges */}
            {showExploreUI &&
              !exchanges.some((e) => e.mode === "explore") &&
              !isTextStreaming &&
              !isLearnModeActive && (
                <div className="flex flex-col justify-end w-full mt-auto">
                  <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                    className="mb-3 text-sm text-slate-400"
                  >
                    Pick a starting point, or just ask.
                  </motion.p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "Summarize with timestamps",
                      "Quiz me on this",
                      "Key takeaways so far",
                    ].map((label, i) => (
                      <motion.button
                        key={label}
                        initial={{ opacity: 0, scale: 0.8, y: 12, filter: 'blur(4px)' }}
                        animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                        transition={{
                          delay: 0.1 + i * 0.07,
                          type: 'spring',
                          stiffness: 500,
                          damping: 30,
                          mass: 0.8,
                        }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => submitExploreMessage(label)}
                        className="px-3 py-1.5 rounded-lg text-xs text-slate-300 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.15] hover:text-white transition-colors"
                      >
                        {label}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

            {/* Explore pills — always at bottom, pulled from last explore exchange */}
            {exploreMode && !isTextStreaming && (() => {
              const lastExplore = [...exchanges].reverse().find((e) => e.mode === "explore");
              if (lastExplore?.explorePills && lastExplore.explorePills.length > 0) {
                return (
                  <ExplorePills
                    options={lastExplore.explorePills}
                    onSelect={handlePillSelect}
                    onFocusInput={focusInput}
                  />
                );
              }
              return null;
            })()}

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
              <LearnErrorBoundary onReset={learnHandlers.onStop}>
                <LearnModeQuiz
                  phase={learnState.phase}
                  quiz={learnState.quiz}
                  explanation={learnState.explanation}
                  introText={learnState.introText}
                  responseContent={learnState.responseContent}
                  exportableContent={learnState.exportableContent}
                  answers={learnState.answers}
                  score={learnState.score}
                  selectedAction={learnState.selectedAction}
                  thinking={learnState.thinking}
                  thinkingDuration={learnState.thinkingDuration}
                  isLoading={learnState.isLoading}
                  error={learnState.error}
                  learnOptions={learnState.options}
                  learnOptionsLoading={learnState.optionsLoading}
                  videoTitle={videoTitle}
                  videoId={videoId}
                  onSelectAnswer={learnHandlers.onSelectAnswer}
                  onSelectAction={learnHandlers.onSelectAction}
                  onFocusInput={learnHandlers.onFocusInput}
                  onNextBatch={learnHandlers.onNextBatch}
                  onStop={learnHandlers.onStop}
                  onSeek={handleTimestampSeek}
                />
              </LearnErrorBoundary>
            )}
          </div>
        )}

        {/* Left badge -- desktop only, dynamic scroll direction indicator */}
        <AnimatePresence mode="wait">
          {exchanges.length > 0 && (canScrollUp || canScrollDown) && (
            <motion.button
              key={canScrollUp ? "scroll-up" : "scroll-down"}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{
                duration: 0.15,
                ease: [0.23, 1, 0.32, 1],
              }}
              onClick={canScrollUp ? scrollToTop : () => scrollToBottom(true)}
              data-scroll-badge
              className="hidden md:flex absolute top-0 left-0 z-[40] items-center justify-center w-7 h-7 rounded-none rounded-br-lg text-white pointer-events-auto"
              aria-label={canScrollUp ? "Scroll to top" : "Scroll to latest"}
            >
              {canScrollUp ? (
                <CaretUp size={12} weight="bold" />
              ) : (
                <CaretDown size={12} weight="bold" />
              )}
            </motion.button>
          )}
        </AnimatePresence>

        {/* Close badge -- desktop only, always visible when content exists */}
        <AnimatePresence>
          {exchanges.length > 0 && (
            <motion.button
              key="close-badge"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{
                duration: 0.15,
                ease: [0.23, 1, 0.32, 1],
              }}
              onClick={onClose}
              data-scroll-badge
              className="hidden md:flex absolute top-0 right-0 z-[40] items-center justify-center w-7 h-7 rounded-none rounded-bl-lg text-white pointer-events-auto"
              aria-label="Close chat"
            >
              <X size={12} weight="bold" />
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Timestamp tooltip */}
      <AnimatePresence>
        {tooltipInfo && (
          <TimestampTooltip
            seconds={tooltipInfo.seconds}
            segments={tooltipSegments}
            position={tooltipInfo.position}
            storyboardLevels={storyboardLevels}
            onSeek={handleTimestampSeek}
            onClose={handleTooltipClose}
          />
        )}
      </AnimatePresence>
    </>
  );
}
