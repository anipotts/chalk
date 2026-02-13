'use client';

import { useState, useEffect, useRef } from 'react';
import type { TranscriptSegment } from '@/lib/video-utils';

export interface LearnOption {
  id: string;
  label: string;
  description: string;
  intent: 'patient' | 'impatient';
}

const FALLBACK_OPTIONS: LearnOption[] = [
  { id: 'summarize', label: 'Summarize this video', description: 'Get a concise overview with key timestamps', intent: 'impatient' },
  { id: 'quiz', label: 'Quiz me on what I watched', description: 'Test your understanding with adaptive questions', intent: 'patient' },
  { id: 'takeaways', label: 'Key takeaways so far', description: 'Bullet points of the most important ideas', intent: 'impatient' },
];

const CUSTOM_OPTION: LearnOption = {
  id: 'custom',
  label: 'Type your own question',
  description: 'Ask anything about the video content',
  intent: 'patient',
};

interface UseLearnOptionsParams {
  segments: TranscriptSegment[];
  videoTitle?: string;
  channelName?: string | null;
}

export function useLearnOptions({ segments, videoTitle, channelName }: UseLearnOptionsParams) {
  const [options, setOptions] = useState<LearnOption[]>([...FALLBACK_OPTIONS, CUSTOM_OPTION]);
  const [isLoading, setIsLoading] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current || segments.length === 0 || !videoTitle) return;
    fetchedRef.current = true;

    const controller = new AbortController();
    setIsLoading(true);

    (async () => {
      try {
        // Build transcript snippet for context
        const transcriptStart = segments.slice(0, 10).map(s => s.text).join(' ').slice(0, 500);
        const transcriptEnd = segments.slice(-10).map(s => s.text).join(' ').slice(0, 500);
        const lastSeg = segments[segments.length - 1];
        const durationSeconds = lastSeg ? lastSeg.offset + (lastSeg.duration || 0) : 0;

        const resp = await fetch('/api/learn-options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoTitle,
            channelName: channelName || undefined,
            transcriptStart,
            transcriptEnd,
            durationSeconds,
          }),
          signal: controller.signal,
        });

        if (!resp.ok) throw new Error('Failed to fetch options');

        const data = await resp.json();
        if (Array.isArray(data.options) && data.options.length > 0) {
          setOptions([...data.options, CUSTOM_OPTION]);
        }
      } catch {
        // Keep fallback options — they're still good
      } finally {
        setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [segments, videoTitle, channelName]);

  return { options, isLoading };
}
