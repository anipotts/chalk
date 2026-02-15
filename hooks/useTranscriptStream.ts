'use client';

import { useState, useEffect } from 'react';
import type { TranscriptSegment, TranscriptSource } from '@/lib/video-utils';

export type TranscriptStatus =
  | 'idle'
  | 'connecting'
  | 'extracting'
  | 'complete'
  | 'error';

export interface TranscriptMetadata {
  title?: string;
  author?: string;
  lengthSeconds?: number;
}

interface TranscriptStreamState {
  segments: TranscriptSegment[];
  status: TranscriptStatus;
  statusMessage: string;
  error: string | null;
  source: TranscriptSource | null;
  progress: number;
  durationSeconds: number | null;
  metadata: TranscriptMetadata | null;
  storyboardSpec: string | null;
}

/**
 * Parse SSE events from a ReadableStream.
 * Yields { event, data } pairs as they arrive.
 */
async function* parseSSE(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<{ event: string; data: string }> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by double newlines
    const parts = buffer.split('\n\n');
    // Keep the last incomplete part in the buffer
    buffer = parts.pop() || '';

    for (const part of parts) {
      if (!part.trim()) continue;

      let event = 'message';
      let data = '';

      for (const line of part.split('\n')) {
        if (line.startsWith('event: ')) {
          event = line.slice(7);
        } else if (line.startsWith('data: ')) {
          data = line.slice(6);
        }
      }

      if (data) {
        yield { event, data };
      }
    }
  }
}

export function useTranscriptStream(videoId: string | null): TranscriptStreamState {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [status, setStatus] = useState<TranscriptStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<TranscriptSource | null>(null);
  const [progress, setProgress] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [metadata, setMetadata] = useState<TranscriptMetadata | null>(null);
  const [storyboardSpec, setStoryboardSpec] = useState<string | null>(null);

  useEffect(() => {
    if (!videoId) return;

    let cancelled = false;

    setSegments([]);
    setStatus('connecting');
    setStatusMessage('Connecting...');
    setError(null);
    setSource(null);
    setProgress(0);
    setDurationSeconds(null);
    setMetadata(null);
    setStoryboardSpec(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/transcript/stream?videoId=${encodeURIComponent(videoId)}`,
        );

        if (cancelled) return;
        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();

        for await (const { event, data } of parseSSE(reader)) {
          if (cancelled) break;

          switch (event) {
            case 'status': {
              const payload = JSON.parse(data) as { phase: string; message: string };
              setStatus('extracting');
              setStatusMessage(payload.message);
              break;
            }
            case 'meta': {
              const payload = JSON.parse(data) as { source: TranscriptSource; cached: boolean; metadata?: TranscriptMetadata; storyboardSpec?: string };
              setSource(payload.source);
              if (payload.metadata) {
                setMetadata(payload.metadata);
              }
              if (payload.storyboardSpec) {
                setStoryboardSpec(payload.storyboardSpec);
              }
              if (payload.cached) {
                setStatusMessage('Loaded from cache');
              }
              break;
            }
            case 'segments': {
              const newSegments = JSON.parse(data) as TranscriptSegment[];
              setSegments((prev) => [...prev, ...newSegments]);
              setProgress(95);
              break;
            }
            case 'done': {
              const payload = JSON.parse(data) as { total: number; source: TranscriptSource; durationSeconds: number };
              setStatus('complete');
              setStatusMessage(`${payload.total} segments loaded`);
              setSource(payload.source);
              setDurationSeconds(payload.durationSeconds);
              setProgress(100);
              break;
            }
            case 'error': {
              const payload = JSON.parse(data) as { message: string };
              setStatus('error');
              setError(payload.message);
              setStatusMessage('');
              break;
            }
          }
        }
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Failed to fetch transcript');
        setStatusMessage('');
      }
    })();

    return () => { cancelled = true; };
  }, [videoId]);

  return { segments, status, statusMessage, error, source, progress, durationSeconds, metadata, storyboardSpec };
}
