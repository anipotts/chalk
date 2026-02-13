'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { storageKey } from '@/lib/brand';

interface UseVoiceCloneOptions {
  videoId: string | null;
  channelName?: string | null;
  enabled: boolean; // only clone when voice mode is activated
}

interface UseVoiceCloneReturn {
  voiceId: string | null;
  isCloning: boolean;
  cloneError: string | null;
  triggerClone: () => void;
}

export function useVoiceClone({ videoId, channelName, enabled }: UseVoiceCloneOptions): UseVoiceCloneReturn {
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [isCloning, setIsCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const cloneAttempted = useRef(false);

  // Reset when channelName changes (it loads async from noembed)
  useEffect(() => {
    cloneAttempted.current = false;
  }, [channelName]);

  // Check localStorage cache on mount — try channel key first, then video key
  useEffect(() => {
    if (!videoId) return;
    try {
      if (channelName) {
        const cached = localStorage.getItem(storageKey(`voice-clone-ch-${channelName}`));
        if (cached) { setVoiceId(cached); return; }
      }
      const cached = localStorage.getItem(storageKey(`voice-clone-${videoId}`));
      if (cached) { setVoiceId(cached); }
    } catch { /* ignore */ }
  }, [videoId, channelName]);

  const triggerClone = useCallback(async () => {
    if (!videoId || voiceId || isCloning || cloneAttempted.current) return;
    cloneAttempted.current = true;

    // Check localStorage again in case it was set between renders
    try {
      if (channelName) {
        const cached = localStorage.getItem(storageKey(`voice-clone-ch-${channelName}`));
        if (cached) { setVoiceId(cached); return; }
      }
      const cached = localStorage.getItem(storageKey(`voice-clone-${videoId}`));
      if (cached) { setVoiceId(cached); return; }
    } catch { /* ignore */ }

    setIsCloning(true);
    setCloneError(null);

    try {
      const resp = await fetch('/api/voice-clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, channelName: channelName || undefined }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: 'Clone failed' }));
        throw new Error(data.error || `Clone failed: ${resp.status}`);
      }

      const data = await resp.json();
      setVoiceId(data.voiceId);

      // Cache in localStorage — both channel and video keys
      try {
        if (channelName) {
          localStorage.setItem(storageKey(`voice-clone-ch-${channelName}`), data.voiceId);
        }
        localStorage.setItem(storageKey(`voice-clone-${videoId}`), data.voiceId);
      } catch { /* ignore */ }
    } catch {
      // Voice cloning is optional — silently fall back to default voice
    } finally {
      setIsCloning(false);
    }
  }, [videoId, channelName, voiceId, isCloning]);

  // Auto-trigger clone when enabled
  useEffect(() => {
    if (enabled && videoId && !voiceId && !isCloning) {
      triggerClone();
    }
  }, [enabled, videoId, voiceId, isCloning, triggerClone]);

  return { voiceId, isCloning, cloneError, triggerClone };
}
