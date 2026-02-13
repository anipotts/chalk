'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { storageKey } from '@/lib/brand';

interface UseReadAloudOptions {
  voiceId: string | null;
  voiceSpeaking?: boolean; // true when voice mode is actively speaking
}

export interface UseReadAloudReturn {
  autoReadAloud: boolean;
  setAutoReadAloud: (enabled: boolean) => void;
  playingMessageId: string | null;
  isReadAloudLoading: boolean;
  playMessage: (id: string, text: string) => void;
  stopReadAloud: () => void;
}

const STORAGE_KEY = storageKey('auto-read-aloud');

export function useReadAloud({ voiceId, voiceSpeaking }: UseReadAloudOptions): UseReadAloudReturn {
  const [autoReadAloud, setAutoReadAloudState] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [isReadAloudLoading, setIsReadAloudLoading] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const playingIdRef = useRef<string | null>(null);

  // Load preference from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'true') setAutoReadAloudState(true);
    } catch { /* ignore */ }
  }, []);

  const setAutoReadAloud = useCallback((enabled: boolean) => {
    setAutoReadAloudState(enabled);
    try { localStorage.setItem(STORAGE_KEY, String(enabled)); } catch { /* ignore */ }
  }, []);

  const stopReadAloud = useCallback(() => {
    abortRef.current?.abort('stopped');
    abortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      const src = audioRef.current.src;
      audioRef.current = null;
      if (src.startsWith('blob:')) URL.revokeObjectURL(src);
    }
    setPlayingMessageId(null);
    playingIdRef.current = null;
    setIsReadAloudLoading(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort('cleanup');
      if (audioRef.current) {
        audioRef.current.pause();
        const src = audioRef.current.src;
        if (src.startsWith('blob:')) URL.revokeObjectURL(src);
      }
    };
  }, []);

  const playMessage = useCallback((id: string, text: string) => {
    // Don't play while voice mode is speaking
    if (voiceSpeaking) return;

    // Toggle: if same message is playing/loading, just stop
    if (playingIdRef.current === id) {
      stopReadAloud();
      return;
    }

    // Stop any current playback
    stopReadAloud();

    const controller = new AbortController();
    abortRef.current = controller;
    setPlayingMessageId(id);
    playingIdRef.current = id;
    setIsReadAloudLoading(true);

    (async () => {
      try {
        const resp = await fetch('/api/voice-tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            voiceId: voiceId || undefined,
            isClonedVoice: !!voiceId,
          }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          stopReadAloud();
          return;
        }

        const arrayBuffer = await resp.arrayBuffer();
        if (controller.signal.aborted) return;

        const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        setIsReadAloudLoading(false);

        audio.onended = () => {
          setPlayingMessageId(null);
          playingIdRef.current = null;
          URL.revokeObjectURL(url);
          audioRef.current = null;
        };

        audio.onerror = () => {
          setPlayingMessageId(null);
          playingIdRef.current = null;
          URL.revokeObjectURL(url);
          audioRef.current = null;
        };

        await audio.play();
      } catch {
        if (!controller.signal.aborted) {
          stopReadAloud();
        }
      }
    })();
  }, [voiceId, voiceSpeaking, stopReadAloud]);

  return {
    autoReadAloud,
    setAutoReadAloud,
    playingMessageId,
    isReadAloudLoading,
    playMessage,
    stopReadAloud,
  };
}
