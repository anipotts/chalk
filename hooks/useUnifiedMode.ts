'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useVoiceMode, type VoiceState } from './useVoiceMode';
import { useReadAloud, type UseReadAloudReturn } from './useReadAloud';
import type { TranscriptSegment, TranscriptSource } from '@/lib/video-utils';
import { storageKey } from '@/lib/brand';
import { parseStreamWithToolCalls, type ToolCallData } from '@/components/ToolRenderers';
import type { KnowledgeContext } from '@/hooks/useKnowledgeContext';

export interface UnifiedExchange {
  id: string;
  type: 'text' | 'voice';
  userText: string;
  aiText: string;
  timestamp: number;
  model?: string;
  toolCalls?: ToolCallData[];
}

interface UseUnifiedModeOptions {
  segments: TranscriptSegment[];
  currentTime: number;
  videoId: string;
  videoTitle?: string;
  voiceId: string | null;
  transcriptSource?: TranscriptSource;
  knowledgeContext?: KnowledgeContext | null;
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
}: UseUnifiedModeOptions): UseUnifiedModeReturn {
  // Unified exchanges (persisted) — single source of truth
  const [exchanges, setExchanges] = useState<UnifiedExchange[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Text-specific state
  const [isTextStreaming, setIsTextStreaming] = useState(false);
  const [currentUserText, setCurrentUserText] = useState('');
  const [currentAiText, setCurrentAiText] = useState('');
  const [currentToolCalls, setCurrentToolCalls] = useState<ToolCallData[]>([]);
  const [textError, setTextError] = useState<string | null>(null);
  const textAbortRef = useRef<AbortController | null>(null);
  const knowledgeContextRef = useRef(knowledgeContext);
  knowledgeContextRef.current = knowledgeContext;

  const currentTimeRef = useRef(currentTime);
  const segmentsRef = useRef(segments);
  const exchangesRef = useRef(exchanges);
  currentTimeRef.current = currentTime;
  segmentsRef.current = segments;
  exchangesRef.current = exchanges;

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
    };
  }, []);

  const handleTextSubmit = useCallback(async (text: string) => {
    if (!text.trim() || isTextStreaming) return;

    // Abort any previous stream
    textAbortRef.current?.abort('new submission');
    const abortController = new AbortController();
    textAbortRef.current = abortController;

    setCurrentUserText(text);
    setCurrentAiText('');
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
        userText: text,
        aiText: finalText,
        timestamp: currentTimeRef.current,
        model: 'sonnet',
        toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
      };

      setExchanges((prev) => [...prev, exchange]);
      setCurrentUserText('');
      setCurrentAiText('');
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

  const stopTextStream = useCallback(() => {
    textAbortRef.current?.abort('user stopped');
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
  };
}
