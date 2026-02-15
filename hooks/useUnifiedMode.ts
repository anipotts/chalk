'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useVoiceMode, type VoiceState } from './useVoiceMode';
import { useReadAloud } from './useReadAloud';
import type { TranscriptSegment, TranscriptSource, IntervalSelection } from '@/lib/video-utils';
import { storageKey } from '@/lib/brand';
import { parseStreamWithToolCalls, type ToolCallData } from '@/components/ToolRenderers';
import type { KnowledgeContext } from '@/hooks/useKnowledgeContext';
import { classifyThinkingBudget } from '@/lib/thinking-budget';
import { splitReasoningFromText } from '@/lib/stream-parser';

export interface UnifiedExchange {
  id: string;
  type: 'text' | 'voice';
  mode: 'chat' | 'explore';
  userText: string;
  aiText: string;
  timestamp: number;
  model?: string;
  toolCalls?: ToolCallData[];
  rawAiText?: string;
  thinking?: string;
  thinkingDuration?: number;
  explorePills?: string[];
}

interface UseUnifiedModeOptions {
  segments: TranscriptSegment[];
  currentTime: number;
  videoId: string;
  videoTitle?: string;
  voiceId: string | null;
  transcriptSource?: TranscriptSource;
  knowledgeContext?: KnowledgeContext | null;
  curriculumContext?: string | null;
  interval?: IntervalSelection | null;
}

interface UseUnifiedModeReturn {
  // Voice state
  voiceState: VoiceState;
  startRecording: () => void;
  stopRecording: () => void;
  cancelRecording: () => void;
  recordingDuration: number;
  voiceTranscript: string;
  voiceResponseText: string;
  voiceError: string | null;

  // Text state
  handleTextSubmit: (text: string) => Promise<void>;
  isTextStreaming: boolean;
  stopTextStream: () => void;
  currentUserText: string;
  currentAiText: string;
  currentToolCalls: ToolCallData[];
  currentRawAiText: string;
  textError: string | null;

  // Read aloud
  autoReadAloud: boolean;
  setAutoReadAloud: (enabled: boolean) => void;
  playingMessageId: string | null;
  isReadAloudLoading: boolean;
  playMessage: (id: string, text: string) => void;
  stopReadAloud: () => void;

  // Unified history
  exchanges: UnifiedExchange[];
  clearHistory: () => void;

  // Mode tracking
  currentMode: 'chat' | 'explore';
  setCurrentMode: (mode: 'chat' | 'explore') => void;

  // Explore mode
  handleExploreSubmit: (text: string) => Promise<void>;
  stopExploreStream: () => void;
  exploreMode: boolean;
  setExploreMode: (mode: boolean) => void;
  exploreGoal: string | null;
  setExploreGoal: (goal: string | null) => void;
  exploreError: string | null;
  setExploreError: (error: string | null) => void;
  explorePills: string[];
  setExplorePills: (pills: string[]) => void;
  isThinking: boolean;
  thinkingDuration: number | null;
  thinkingContent: string | null;
}

/** Parse <options>opt1|opt2|opt3</options> from AI text. Returns [cleanText, options]. */
function parseExploreOptions(text: string): [string, string[]] {
  const match = text.match(/<options>([\s\S]*?)<\/options>/);
  if (!match) return [text, []];
  const cleanText = text.replace(/<options>[\s\S]*?<\/options>/, '').trimEnd();
  const options = match[1]
    .split('|')
    .map((o) => o.trim())
    .filter(Boolean);
  return [cleanText, options];
}

const STORAGE_PREFIX = storageKey('interaction-history-');

function loadHistory(videoId: string): UnifiedExchange[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}${videoId}`);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveHistory(videoId: string, exchanges: UnifiedExchange[]) {
  if (typeof window === 'undefined') return;
  try {
    if (exchanges.length === 0) {
      localStorage.removeItem(`${STORAGE_PREFIX}${videoId}`);
    } else {
      localStorage.setItem(`${STORAGE_PREFIX}${videoId}`, JSON.stringify(exchanges));
    }
  } catch { /* quota exceeded */ }
}

export function useUnifiedMode({
  segments,
  currentTime,
  videoId,
  videoTitle,
  voiceId,
  transcriptSource,
  knowledgeContext,
  curriculumContext,
  interval,
}: UseUnifiedModeOptions): UseUnifiedModeReturn {
  // Unified exchanges (persisted) — single source of truth
  const [exchanges, setExchanges] = useState<UnifiedExchange[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Current mode tracking
  const [currentMode, setCurrentMode] = useState<'chat' | 'explore'>('chat');

  // Text-specific state
  const [isTextStreaming, setIsTextStreaming] = useState(false);
  const [currentUserText, setCurrentUserText] = useState('');
  const [currentAiText, setCurrentAiText] = useState('');
  const [currentToolCalls, setCurrentToolCalls] = useState<ToolCallData[]>([]);
  const [currentRawAiText, setCurrentRawAiText] = useState('');
  const [textError, setTextError] = useState<string | null>(null);
  const textAbortRef = useRef<AbortController | null>(null);
  const knowledgeContextRef = useRef(knowledgeContext);
  knowledgeContextRef.current = knowledgeContext;
  const curriculumContextRef = useRef(curriculumContext);
  curriculumContextRef.current = curriculumContext;

  // Explore mode state (consolidated from InteractionOverlay)
  const [exploreMode, setExploreMode] = useState(false);
  const [explorePills, setExplorePills] = useState<string[]>([]);
  const [exploreGoal, setExploreGoal] = useState<string | null>(null);
  const [exploreError, setExploreError] = useState<string | null>(null);
  const exploreAbortRef = useRef<AbortController | null>(null);

  // Adaptive thinking state (consolidated from InteractionOverlay)
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingDuration, setThinkingDuration] = useState<number | null>(null);
  const [thinkingContent, setThinkingContent] = useState<string | null>(null);
  const thinkingStartRef = useRef<number | null>(null);

  const currentTimeRef = useRef(currentTime);
  const segmentsRef = useRef(segments);
  const exchangesRef = useRef(exchanges);
  const intervalRef = useRef(interval);
  currentTimeRef.current = currentTime;
  segmentsRef.current = segments;
  exchangesRef.current = exchanges;
  intervalRef.current = interval;

  // Build conversation history for voice mode (last 10 exchanges)
  const conversationHistory = useMemo(() => {
    return exchanges.slice(-10).flatMap((ex) => [
      { role: 'user' as const, content: ex.userText },
      { role: 'assistant' as const, content: ex.aiText },
    ]);
  }, [exchanges]);

  // Callback when voice exchange completes — adds directly to unified history
  const handleVoiceExchangeComplete = useCallback((data: { userText: string; aiText: string; timestamp: number }) => {
    const exchange: UnifiedExchange = {
      id: String(Date.now()),
      type: 'voice',
      mode: 'chat',
      userText: data.userText,
      aiText: data.aiText,
      timestamp: data.timestamp,
      model: 'sonnet',
    };
    setExchanges((prev) => [...prev, exchange]);
  }, []);

  // Voice mode — pure pipeline, no internal exchange tracking
  const voice = useVoiceMode({
    segments,
    currentTime,
    videoId,
    videoTitle,
    voiceId,
    transcriptSource,
    conversationHistory,
    onExchangeComplete: handleVoiceExchangeComplete,
  });

  // Read aloud — TTS playback for text mode responses
  const readAloud = useReadAloud({
    voiceId,
    voiceSpeaking: voice.voiceState === 'speaking',
  });

  // Load history on mount
  useEffect(() => {
    setExchanges(loadHistory(videoId));
    setHydrated(true);
  }, [videoId]);

  // Save history when exchanges change (after hydration)
  useEffect(() => {
    if (hydrated && !isTextStreaming) {
      saveHistory(videoId, exchanges);
    }
  }, [exchanges, videoId, hydrated, isTextStreaming]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      textAbortRef.current?.abort('cleanup');
      exploreAbortRef.current?.abort('cleanup');
    };
  }, []);

  // --- Chat mode submit ---
  const handleTextSubmit = useCallback(async (text: string) => {
    if (!text.trim() || isTextStreaming) return;

    // Abort any previous stream
    textAbortRef.current?.abort('new submission');
    const abortController = new AbortController();
    textAbortRef.current = abortController;

    setCurrentUserText(text);
    setCurrentAiText('');
    setCurrentRawAiText('');
    setCurrentToolCalls([]);
    setTextError(null);
    setIsTextStreaming(true);

    try {
      // Build history from unified exchanges (last 10)
      const history = exchangesRef.current.slice(-10).flatMap((ex) => [
        { role: 'user' as const, content: ex.userText },
        { role: 'assistant' as const, content: ex.aiText },
      ]);
      history.push({ role: 'user' as const, content: text });

      const response = await fetch('/api/video-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          currentTimestamp: currentTimeRef.current,
          segments: segmentsRef.current,
          history,
          modelChoice: 'sonnet',
          videoTitle,
          transcriptSource,
          voiceMode: false,
          videoId,
          knowledgeContext: knowledgeContextRef.current,
          intervalSelection: intervalRef.current || undefined,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let rawStream = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        rawStream += decoder.decode(value, { stream: true });
        setCurrentRawAiText(rawStream);
        const { text: cleanText, toolCalls } = parseStreamWithToolCalls(rawStream);
        setCurrentAiText(cleanText);
        if (toolCalls.length > 0) setCurrentToolCalls(toolCalls);
      }

      // Final parse
      const { text: finalText, toolCalls: finalToolCalls } = parseStreamWithToolCalls(rawStream);

      // Add to exchanges
      const exchangeId = String(Date.now());
      const exchange: UnifiedExchange = {
        id: exchangeId,
        type: 'text',
        mode: 'chat',
        userText: text,
        aiText: finalText,
        timestamp: currentTimeRef.current,
        model: 'sonnet',
        toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
        rawAiText: finalToolCalls.length > 0 ? rawStream : undefined,
      };

      setExchanges((prev) => [...prev, exchange]);
      setCurrentUserText('');
      setCurrentAiText('');
      setCurrentRawAiText('');
      setCurrentToolCalls([]);

      // Auto-play read aloud if enabled
      if (readAloud.autoReadAloud && finalText) {
        readAloud.playMessage(exchangeId, finalText);
      }
    } catch (error) {
      if (abortController.signal.aborted) return;
      const errMsg = error instanceof Error ? error.message : 'Something went wrong';
      setTextError(errMsg);
    } finally {
      setIsTextStreaming(false);
    }
  }, [isTextStreaming, videoTitle, transcriptSource, videoId]);

  // --- Explore mode submit ---
  const handleExploreSubmit = useCallback(async (text: string) => {
    if (isTextStreaming) return;

    if (!exploreGoal) {
      setExploreGoal(text);
    }

    setCurrentMode('explore');

    // Classify thinking budget based on message complexity
    const exploreExchangeCount = exchangesRef.current.filter(
      (e) => e.mode === 'explore',
    ).length;
    const budget = classifyThinkingBudget(
      text,
      exploreExchangeCount,
      undefined,
      'explore',
    );
    setIsThinking(true);
    setThinkingDuration(null);
    setThinkingContent(null);
    thinkingStartRef.current = Date.now();

    // Use unified streaming state
    setCurrentUserText(text);
    setCurrentAiText('');
    setCurrentToolCalls([]);
    setIsTextStreaming(true);
    setExplorePills([]);
    setExploreError(null);

    // Build history from unified explore exchanges
    const history = exchangesRef.current
      .filter((e) => e.mode === 'explore')
      .slice(-10)
      .flatMap((ex) => [
        { role: 'user' as const, content: ex.userText },
        { role: 'assistant' as const, content: ex.aiText },
      ]);
    history.push({ role: 'user' as const, content: text });

    const controller = new AbortController();
    exploreAbortRef.current = controller;

    try {
      const response = await fetch('/api/video-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          currentTimestamp: currentTimeRef.current,
          segments: segmentsRef.current,
          history,
          videoTitle,
          transcriptSource,
          exploreMode: true,
          exploreGoal: exploreGoal || text,
          thinkingBudget: budget.budgetTokens,
          curriculumContext: curriculumContextRef.current || undefined,
          intervalSelection: intervalRef.current || undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response
          .json()
          .catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || 'Request failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullRaw = '';

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
          if (thinkingStartRef.current && isThinking) {
            setThinkingDuration(
              Date.now() - thinkingStartRef.current,
            );
            setIsThinking(false);
          }
          setThinkingContent(reasoning || null);

          // Show the text content (after separator), parse options progressively
          let cleaned = textContent;
          const [stripped] = parseExploreOptions(cleaned);
          cleaned = stripped;
          cleaned = cleaned.replace(/<options>[^<]*$/, '').trimEnd();
          setCurrentAiText(cleaned);
        } else {
          // Still in reasoning phase -- update thinking text
          setThinkingContent(reasoning || null);
        }
      }

      // Final parse
      const { reasoning: finalReasoning, text: finalText } =
        splitReasoningFromText(fullRaw);
      const [cleanText, options] = parseExploreOptions(finalText);
      const thinkDuration = thinkingStartRef.current
        ? Date.now() - thinkingStartRef.current
        : null;

      // Add to unified exchanges
      const exchange: UnifiedExchange = {
        id: String(Date.now()),
        type: 'text',
        mode: 'explore',
        userText: text,
        aiText: cleanText,
        timestamp: currentTimeRef.current,
        model: 'opus',
        thinking: finalReasoning || undefined,
        thinkingDuration: thinkDuration ?? undefined,
        explorePills: options.length > 0 ? options : undefined,
      };
      setExchanges((prev) => [...prev, exchange]);
      setCurrentUserText('');
      setCurrentAiText('');
      setCurrentToolCalls([]);
      setIsTextStreaming(false);
      setExplorePills(options);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setExploreError(
        err instanceof Error ? err.message : 'Something went wrong',
      );
      setCurrentUserText('');
      setCurrentAiText('');
      setCurrentToolCalls([]);
      setIsTextStreaming(false);
    } finally {
      setIsThinking(false);
      exploreAbortRef.current = null;
      thinkingStartRef.current = null;
    }
  }, [isTextStreaming, exploreGoal, videoTitle, transcriptSource, isThinking]);

  const stopTextStream = useCallback(() => {
    textAbortRef.current?.abort('user stopped');
  }, []);

  const stopExploreStream = useCallback(() => {
    exploreAbortRef.current?.abort('user stopped');
  }, []);

  const clearHistory = useCallback(() => {
    setExchanges([]);
    saveHistory(videoId, []);
  }, [videoId]);

  return {
    // Voice
    voiceState: voice.voiceState,
    startRecording: voice.startRecording,
    stopRecording: voice.stopRecording,
    cancelRecording: voice.cancelRecording,
    recordingDuration: voice.recordingDuration,
    voiceTranscript: voice.transcript,
    voiceResponseText: voice.responseText,
    voiceError: voice.error,

    // Text
    handleTextSubmit,
    isTextStreaming,
    stopTextStream,
    currentUserText,
    currentAiText,
    currentToolCalls,
    currentRawAiText,
    textError,

    // Read aloud
    autoReadAloud: readAloud.autoReadAloud,
    setAutoReadAloud: readAloud.setAutoReadAloud,
    playingMessageId: readAloud.playingMessageId,
    isReadAloudLoading: readAloud.isReadAloudLoading,
    playMessage: readAloud.playMessage,
    stopReadAloud: readAloud.stopReadAloud,

    // Unified
    exchanges,
    clearHistory,

    // Mode
    currentMode,
    setCurrentMode,

    // Explore
    handleExploreSubmit,
    stopExploreStream,
    exploreMode,
    setExploreMode,
    exploreGoal,
    setExploreGoal,
    exploreError,
    setExploreError,
    explorePills,
    setExplorePills,
    isThinking,
    thinkingDuration,
    thinkingContent,
  };
}
