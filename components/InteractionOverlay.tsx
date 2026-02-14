"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { AnimatePresence } from "framer-motion";
import type { UnifiedExchange } from "./ExchangeMessage";
import type { LearnAction } from "@/hooks/useLearnMode";
import { storageKey } from "@/lib/brand";
import { classifyThinkingBudget } from "@/lib/thinking-budget";
import { splitReasoningFromText } from "@/lib/stream-parser";
import type {
  InteractionOverlayProps,
  LearnState,
  LearnHandlers,
  VoiceControls,
} from "./overlay-types";
import { OverlayBackdrop } from "./OverlayBackdrop";
import { MessagePanel } from "./MessagePanel";
import { InputStripContent } from "./InputStripContent";

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
  const [inputStripHeight, setInputStripHeight] = useState(72);

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
            // Separator received -- thinking is complete
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
            // Still in reasoning phase -- update thinking text
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
  // Note: parent state updates (onExpandOverlay, onStopLearnMode) must NOT be called
  // inside a setState updater — React forbids updating a parent during child reconciliation.
  const toggleExploreMode = useCallback(() => {
    const entering = !exploreMode;
    setExploreMode(entering);

    if (entering) {
      // Entering explore mode -- trigger lazy loading of learn options + expand overlay
      onEnsureLearnOptions?.();
      onExpandOverlay?.();
      setExplorePills([]);
    } else {
      // Exiting explore mode -- clean up UI state only (exchanges persist in unified model)
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
  }, [exploreMode, onEnsureLearnOptions, onExpandOverlay, learnPhase, onStopLearnMode]);

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
      {/* Lingering opacity: progressively fade messages when phase === 'lingering' */}
      {/* Interaction detection: any pointer/scroll in overlay cancels linger */}

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
              exploreIsThinking={exploreIsThinking}
              exploreThinkingDuration={exploreThinkingDuration}
              submitExploreMessage={submitExploreMessage}
              playingMessageId={playingMessageId}
              onPlayMessage={onPlayMessage}
              isReadAloudLoading={isReadAloudLoading}
              handlePillSelect={handlePillSelect}
              focusInput={focusInput}
              learnState={learnState}
              learnHandlers={learnHandlers}
              videoTitle={videoTitle}
              tooltipSegments={segments}
            />
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
        toggleExploreMode={toggleExploreMode}
        exploreAbortRef={exploreAbortRef}
        onStopTextStream={onStopTextStream}
        inputRef={inputRef}
        inputVisible={inputVisible}
        onInputFocus={onInputFocus}
        onInputBlur={onInputBlur}
        voiceControls={voiceControls}
        recordingDuration={recordingDuration}
        exchanges={exchanges}
        onClearHistory={onClearHistory}
        setExploreGoal={setExploreGoal}
        setExplorePills={setExplorePills}
        setExploreError={setExploreError}
        curriculumContext={curriculumContext}
        curriculumVideoCount={curriculumVideoCount}
        onHeightChange={setInputStripHeight}
      />
    </>
  );
}
