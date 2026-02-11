'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { TranscriptSegment } from '@/lib/video-utils';

export type TranscriptStatus =
  | 'idle'
  | 'connecting'
  | 'extracting'
  | 'downloading'
  | 'transcribing'
  | 'streaming'
  | 'complete'
  | 'error';

export type TranscriptMethod = 'captions' | 'deepgram' | 'whisper' | null;

interface TranscriptStreamState {
  segments: TranscriptSegment[];
  status: TranscriptStatus;
  statusMessage: string;
  error: string | null;
  method: TranscriptMethod;
  progress: number;
}

export function useTranscriptStream(videoId: string | null): TranscriptStreamState {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [status, setStatus] = useState<TranscriptStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<TranscriptMethod>(null);
  const [progress, setProgress] = useState(0);

  // Batch buffer for reducing re-renders
  const batchRef = useRef<TranscriptSegment[]>([]);
  const rafRef = useRef<number>(0);

  const flushBatch = useCallback(() => {
    if (batchRef.current.length > 0) {
      const batch = batchRef.current;
      batchRef.current = [];
      setSegments((prev) => [...prev, ...batch]);
    }
    rafRef.current = 0;
  }, []);

  useEffect(() => {
    if (!videoId) return;

    // Reset state
    setSegments([]);
    setStatus('connecting');
    setStatusMessage('Connecting...');
    setError(null);
    setMethod(null);
    setProgress(0);
    batchRef.current = [];

    const eventSource = new EventSource(`/api/transcript/stream?videoId=${encodeURIComponent(videoId)}`);

    eventSource.addEventListener('status', (e) => {
      const data = JSON.parse(e.data) as { phase: string; message: string };
      setStatus(data.phase as TranscriptStatus);
      setStatusMessage(data.message);
    });

    eventSource.addEventListener('method', (e) => {
      const data = JSON.parse(e.data) as { method: string };
      setMethod(data.method as TranscriptMethod);
    });

    eventSource.addEventListener('segment', (e) => {
      const seg = JSON.parse(e.data) as TranscriptSegment;
      batchRef.current.push(seg);

      // Batch updates within a single animation frame (~16ms)
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(flushBatch);
      }

      // Update status to streaming if not already
      setStatus((prev) => (prev !== 'complete' && prev !== 'error' ? 'streaming' : prev));
    });

    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data) as { percent: number };
      setProgress(data.percent);
    });

    eventSource.addEventListener('done', (e) => {
      const data = JSON.parse(e.data) as { total: number };
      // Flush any remaining batched segments
      if (batchRef.current.length > 0) {
        const remaining = batchRef.current;
        batchRef.current = [];
        setSegments((prev) => [...prev, ...remaining]);
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      setStatus('complete');
      setStatusMessage(`${data.total} segments loaded`);
      eventSource.close();
    });

    eventSource.addEventListener('transcript-error', (e) => {
      const data = JSON.parse(e.data) as { message: string };
      setStatus('error');
      setError(data.message);
      setStatusMessage('');
      eventSource.close();
    });

    eventSource.onerror = () => {
      // Only set error if we haven't completed successfully
      setStatus((prev) => {
        if (prev === 'complete') return prev;
        setError('Connection lost');
        return 'error';
      });
      eventSource.close();
    };

    return () => {
      eventSource.close();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      batchRef.current = [];
    };
  }, [videoId, flushBatch]);

  return { segments, status, statusMessage, error, method, progress };
}
