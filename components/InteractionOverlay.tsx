"use client";

import React, {
  useState,
  useEffect,
  useCallback,
} from "react";
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
  phase,
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
  onStopPlayback,

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

  onSeek,
  onClose,
  inputRef,
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

  sideOpen,
  storyboardLevels,
  interval,
  onClearInterval,
  isPaused,
}: InteractionOverlayProps) {
  const [input, setInput] = useState("");
  const [inputStripHeight, setInputStripHeight] = useState(72);

  const visible = phase === 'chatting';
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

  const handleSubmit = useCallback(async () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput("");

    if (isLearnModeActive) {
      onStopLearnMode();
    }

    if (exploreMode) {
      await onExploreSubmit(text);
    } else {
      await onTextSubmit(text);
    }
  }, [input, exploreMode, isLearnModeActive, onStopLearnMode, onTextSubmit, onExploreSubmit]);

  const handlePillSelect = useCallback(
    (option: string) => {
      onExploreSubmit(option);
    },
    [onExploreSubmit],
  );

  const handleOptionCardClick = useCallback(
    (action: LearnAction) => {
      onOpenLearnMode();
      setTimeout(() => onSelectAction(action), 0);
    },
    [onOpenLearnMode, onSelectAction],
  );

  const focusInput = useCallback(() => {
    inputRef?.current?.focus();
  }, [inputRef]);

  const showExploreUI = exploreMode;

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
    onStopPlayback,
    duration: recordingDuration,
    error: voiceError,
  };

  return (
    <>
      {/* Message overlay — visible when chatting */}
      {visible && (
        <div
          className="absolute inset-0 md:inset-auto md:top-0 md:left-0 md:right-0 md:aspect-video z-10 flex flex-col md:rounded-xl md:overflow-hidden transition-opacity duration-150"
        >
          <OverlayBackdrop visible={visible} onClick={onClose} />
          <VideoTimeProvider currentTime={currentTime} isPaused={false}>
            <MessagePanel
              hasContent={hasContent}
              expanded={visible}
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
              sideOpen={sideOpen}
              isPaused={isPaused}
            />
          </VideoTimeProvider>
          {/* Dynamic spacer for input strip on mobile */}
          <div className="md:hidden flex-none" style={{ height: inputStripHeight }} />
        </div>
      )}

      {/* Input strip -- below video on desktop, bottom-pinned on mobile */}
      <InputStripContent
        phase={phase}
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
        onInputFocus={onInputFocus}
        onInputBlur={onInputBlur}
        voiceControls={voiceControls}
        recordingDuration={recordingDuration}
        exchanges={exchanges}
        onClearHistory={onClearHistory}
        onClose={onClose}
        curriculumContext={curriculumContext}
        curriculumVideoCount={curriculumVideoCount}
        onHeightChange={setInputStripHeight}
        interval={interval}
        onClearInterval={onClearInterval}
      />
    </>
  );
}
