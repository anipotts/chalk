"use client";

import React, {
  useState,
  useEffect,
  useCallback,
} from "react";
import { AnimatePresence } from "framer-motion";
import type { UnifiedExchange } from "./ExchangeMessage";
import type { LearnAction } from "@/hooks/useLearnMode";
import { storageKey } from "@/lib/brand";
import type {
  InteractionOverlayProps,
  LearnState,
  LearnHandlers,
  VoiceControls,
} from "./overlay-types";
import { OverlayBackdrop } from "./OverlayBackdrop";
import { MessagePanel } from "./MessagePanel";
import { InputStripContent } from "./InputStripContent";
import { VideoTimeProvider } from "./VideoTimeContext";

/* --- Main component: InteractionOverlay (thin shell) --- */

export function InteractionOverlay({
  expanded,
  phase,
  lingerProgress,
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

  videoDimLevel,
  onSeek,
  onClose,
  onExpandOverlay,
  onInteract,
  inputRef,
  inputVisible,
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
  onOpenLearnMode,
  onSelectAction,
  onFocusInput,
  onSelectAnswer,
  onNextBatch,
  onStopLearnMode,
  curriculumContext,
  curriculumVideoCount,

  // Explore (from unified mode)
  exploreMode,
  onToggleExploreMode,
  onExploreSubmit,
  onStopExploreStream,
  exploreError,
  explorePills,
  isThinking,
  thinkingDuration,

  storyboardLevels,
}: InteractionOverlayProps) {
  const [input, setInput] = useState("");
  const [inputStripHeight, setInputStripHeight] = useState(72);

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

  const handleSubmit = useCallback(async () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput("");

    // If learn mode was active, exit it first (typing freely enters explore chat)
    if (isLearnModeActive) {
      onStopLearnMode();
    }

    if (exploreMode) {
      await onExploreSubmit(text);
    } else {
      await onTextSubmit(text);
    }
  }, [input, exploreMode, isLearnModeActive, onStopLearnMode, onTextSubmit, onExploreSubmit]);

  // Handle pill selection (explore chat follow-up pills)
  const handlePillSelect = useCallback(
    (option: string) => {
      onExploreSubmit(option);
    },
    [onExploreSubmit],
  );

  // Handle unified option card click (triggers learn mode flow)
  const handleOptionCardClick = useCallback(
    (action: LearnAction) => {
      onOpenLearnMode();
      // Execute action after state reset
      setTimeout(() => onSelectAction(action), 0);
    },
    [onOpenLearnMode, onSelectAction],
  );

  // Focus text input (for "Something else..." pill)
  const focusInput = useCallback(() => {
    inputRef?.current?.focus();
  }, [inputRef]);

  // Streaming state is now unified -- no mode switching needed
  const showExploreUI = exploreMode;

  // Construct grouped objects for sub-components
  const learnState: LearnState = {
    phase: learnPhase,
    selectedAction: learnSelectedAction,
    quiz: learnQuiz,
    explanation: learnExplanation,
    introText: learnIntroText,
    responseContent: learnResponseContent,
    exportableContent: learnExportableContent,
    answers: learnAnswers,
    score: learnScore,
    thinking: learnThinking,
    thinkingDuration: learnThinkingDuration,
    isLoading: learnLoading,
    error: learnError,
    options: learnOptions,
    optionsLoading: learnOptionsLoading,
  };

  const learnHandlers: LearnHandlers = {
    onSelectAction,
    onFocusInput,
    onSelectAnswer,
    onNextBatch,
    onStop: onStopLearnMode,
  };

  const voiceControls: VoiceControls = {
    state: voiceState,
    onStart: onStartRecording,
    onStop: onStopRecording,
    onCancel: onCancelRecording,
    duration: recordingDuration,
    error: voiceError,
  };

  return (
    <>
      {/* Expandable message overlay -- visible when expanded OR when typing with history */}
      <AnimatePresence>
        {(expanded || (inputVisible && exchanges.length > 0)) && (
          <div
            className={`absolute inset-0 md:inset-auto md:top-0 md:left-0 md:right-0 md:aspect-video z-10 flex flex-col md:rounded-xl md:overflow-hidden ${
              hasContent ? 'md:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.5)]' : ''
            }`}
            style={phase === 'lingering' && lingerProgress !== undefined
              ? { opacity: Math.max(0, 1 - lingerProgress * 1.2) }
              : undefined
            }
            onPointerDown={phase === 'lingering' ? onInteract : undefined}
            onScroll={phase === 'lingering' ? onInteract : undefined}
          >
            <OverlayBackdrop videoDimLevel={videoDimLevel} onClose={onClose} />
            <VideoTimeProvider currentTime={currentTime} isPaused={phase === 'dormant'}>
            <MessagePanel
              hasContent={hasContent}
              expanded={expanded}
              exchanges={exchanges}
              segments={segments}
              videoId={videoId}
              onSeek={onSeek}
              onClose={onClose}
              onOpenVideo={onOpenVideo}
              isTextStreaming={isTextStreaming}
              currentUserText={currentUserText}
              currentAiText={currentAiText}
              currentToolCalls={currentToolCalls}
              currentRawAiText={currentRawAiText}
              textError={textError}
              voiceState={voiceState}
              voiceTranscript={voiceTranscript}
              voiceResponseText={voiceResponseText}
              voiceError={voiceError}
              showExploreUI={showExploreUI}
              exploreMode={exploreMode}
              exploreError={exploreError}
              isThinking={isThinking}
              thinkingDuration={thinkingDuration}
              submitExploreMessage={onExploreSubmit}
              playingMessageId={playingMessageId}
              onPlayMessage={onPlayMessage}
              isReadAloudLoading={isReadAloudLoading}
              handlePillSelect={handlePillSelect}
              focusInput={focusInput}
              learnState={learnState}
              learnHandlers={learnHandlers}
              videoTitle={videoTitle}
              tooltipSegments={segments}
              storyboardLevels={storyboardLevels}
            />
            </VideoTimeProvider>
            {/* Dynamic spacer for input strip on mobile -- matches measured height */}
            <div className="md:hidden flex-none" style={{ height: inputStripHeight }} />
          </div>
        )}
      </AnimatePresence>

      {/* Input strip -- below video on desktop, bottom-pinned on mobile */}
      <InputStripContent
        expanded={expanded}
        input={input}
        setInput={setInput}
        handleSubmit={handleSubmit}
        isTextStreaming={isTextStreaming}
        exploreMode={exploreMode}
        toggleExploreMode={onToggleExploreMode}
        onStopStream={() => {
          if (exploreMode) {
            onStopExploreStream();
          } else {
            onStopTextStream();
          }
        }}
        inputRef={inputRef}
        inputVisible={inputVisible}
        onInputFocus={onInputFocus}
        onInputBlur={onInputBlur}
        voiceControls={voiceControls}
        recordingDuration={recordingDuration}
        exchanges={exchanges}
        onClearHistory={onClearHistory}
        curriculumContext={curriculumContext}
        curriculumVideoCount={curriculumVideoCount}
        onHeightChange={setInputStripHeight}
      />
    </>
  );
}
