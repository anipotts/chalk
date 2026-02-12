'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseVoiceCloneOptions {
  videoId: string | null;
  enabled: boolean; // only clone when voice mode is activated
}

interface UseVoiceCloneReturn {
  voiceId: string | null;
  isCloning: boolean;
  cloneError: string | null;
  triggerClone: () => void;
}

export function useVoiceClone({ videoId, enabled }: UseVoiceCloneOptions): UseVoiceCloneReturn {
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [isCloning, setIsCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const cloneAttempted = useRef(false);

  // Check localStorage cache on mount
  useEffect(() => {
    if (!videoId) return;
    try {
      const cached = localStorage.getItem(`chalk-voice-clone-${videoId}`);
      if (cached) {
        setVoiceId(cached);
      }
    } catch { /* ignore */ }
  }, [videoId]);

  const triggerClone = useCallback(async () => {
    if (!videoId || voiceId || isCloning || cloneAttempted.current) return;
    cloneAttempted.current = true;

    // Check localStorage again in case it was set between renders
    try {
      const cached = localStorage.getItem(`chalk-voice-clone-${videoId}`);
      if (cached) {
        setVoiceId(cached);
        return;
      }
    } catch { /* ignore */ }

    setIsCloning(true);
    setCloneError(null);

    try {
      const resp = await fetch('/api/voice-clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: 'Clone failed' }));
        throw new Error(data.error || `Clone failed: ${resp.status}`);
      }

      const data = await resp.json();
      setVoiceId(data.voiceId);

      // Cache in localStorage
      try {
        localStorage.setItem(`chalk-voice-clone-${videoId}`, data.voiceId);
      } catch { /* ignore */ }
    } catch {
      // Voice cloning is optional — silently fall back to default voice
    } finally {
      setIsCloning(false);
    }
  }, [videoId, voiceId, isCloning]);

  // Auto-trigger clone when enabled
  useEffect(() => {
    if (enabled && videoId && !voiceId && !isCloning) {
      triggerClone();
    }
  }, [enabled, videoId, voiceId, isCloning, triggerClone]);

  return { voiceId, isCloning, cloneError, triggerClone };
}
