'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useVoiceMode, type VoiceState } from './useVoiceMode';
import type { TranscriptSegment, TranscriptSource } from '@/lib/video-utils';

export interface UnifiedExchange {
  id: string;
  type: 'text' | 'voice';
  userText: string;
  aiText: string;
  timestamp: number;
  model?: string;
}

interface UseUnifiedModeOptions {
  segments: TranscriptSegment[];
  currentTime: number;
  videoId: string;
  videoTitle?: string;
  voiceId: string | null;
  transcriptSource?: TranscriptSource;
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
  textError: string | null;

  // Unified history
  exchanges: UnifiedExchange[];
  clearHistory: () => void;
}

const STORAGE_PREFIX = 'chalk-interaction-history-';

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
}: UseUnifiedModeOptions): UseUnifiedModeReturn {
  // Unified exchanges (persisted) — single source of truth
  const [exchanges, setExchanges] = useState<UnifiedExchange[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Text-specific state
  const [isTextStreaming, setIsTextStreaming] = useState(false);
  const [currentUserText, setCurrentUserText] = useState('');
  const [currentAiText, setCurrentAiText] = useState('');
  const [textError, setTextError] = useState<string | null>(null);
  const textAbortRef = useRef<AbortController | null>(null);

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
      textAbortRef.current?.abort();
    };
  }, []);

  const handleTextSubmit = useCallback(async (text: string) => {
    if (!text.trim() || isTextStreaming) return;

    // Abort any previous stream
    textAbortRef.current?.abort();
    const abortController = new AbortController();
    textAbortRef.current = abortController;

    setCurrentUserText(text);
    setCurrentAiText('');
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
          model: 'sonnet',
          videoTitle,
          transcriptSource,
          voiceMode: false,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        fullText += decoder.decode(value, { stream: true });
        setCurrentAiText(fullText);
      }

      // Add to exchanges
      const exchange: UnifiedExchange = {
        id: String(Date.now()),
        type: 'text',
        userText: text,
        aiText: fullText,
        timestamp: currentTimeRef.current,
        model: 'sonnet',
      };

      setExchanges((prev) => [...prev, exchange]);
      setCurrentUserText('');
      setCurrentAiText('');
    } catch (error) {
      if (abortController.signal.aborted) return;
      const errMsg = error instanceof Error ? error.message : 'Something went wrong';
      setTextError(errMsg);
    } finally {
      setIsTextStreaming(false);
    }
  }, [isTextStreaming, videoTitle, transcriptSource]);

  const stopTextStream = useCallback(() => {
    textAbortRef.current?.abort();
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
    textError,

    // Unified
    exchanges,
    clearHistory,
  };
}
