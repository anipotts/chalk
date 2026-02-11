'use client';

import { useState, useEffect } from 'react';
import type { TranscriptSegment, TranscriptSource } from '@/lib/video-utils';

export type TranscriptStatus =
  | 'idle'
  | 'connecting'
  | 'extracting'
  | 'complete'
  | 'error';

interface TranscriptStreamState {
  segments: TranscriptSegment[];
  status: TranscriptStatus;
  statusMessage: string;
  error: string | null;
  source: TranscriptSource | null;
  progress: number;
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

  useEffect(() => {
    if (!videoId) return;

    const controller = new AbortController();

    setSegments([]);
    setStatus('connecting');
    setStatusMessage('Connecting...');
    setError(null);
    setSource(null);
    setProgress(0);

    (async () => {
      try {
        const res = await fetch(
          `/api/transcript/stream?videoId=${encodeURIComponent(videoId)}`,
          { signal: controller.signal },
        );

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();

        for await (const { event, data } of parseSSE(reader)) {
          if (controller.signal.aborted) break;

          switch (event) {
            case 'status': {
              const payload = JSON.parse(data) as { phase: string; message: string };
              setStatus('extracting');
              setStatusMessage(payload.message);
              // Rough progress mapping based on phase
              if (payload.phase === 'cache') setProgress(10);
              else if (payload.phase === 'captions') setProgress(20);
              else if (payload.phase === 'downloading') setProgress(40);
              else if (payload.phase === 'transcribing') setProgress(60);
              break;
            }
            case 'meta': {
              const payload = JSON.parse(data) as { source: TranscriptSource; cached: boolean };
              setSource(payload.source);
              if (payload.cached) {
                setStatusMessage('Loaded from cache');
                setProgress(90);
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
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Failed to fetch transcript');
        setStatusMessage('');
      }
    })();

    return () => {
      controller.abort();
    };
  }, [videoId]);

  return { segments, status, statusMessage, error, source, progress };
}
