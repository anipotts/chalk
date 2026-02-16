'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { TranscriptSegment, TranscriptSource } from '@/lib/video-utils';

export type TranscriptStatus =
  | 'idle'
  | 'connecting'
  | 'extracting'
  | 'queued'
  | 'transcribing'
  | 'complete'
  | 'error';

export interface TranscriptMetadata {
  title?: string;
  author?: string;
  lengthSeconds?: number;
}

export interface QueueProgress {
  segmentsWritten: number;
  progressPct: number;
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
  queueProgress: QueueProgress | null;
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

/** Module-level singleton Supabase client for client-side polling (anon key). */
let _anonClient: SupabaseClient | null | undefined;
function getAnonClient(): SupabaseClient | null {
  if (_anonClient !== undefined) return _anonClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  _anonClient = url && key ? createClient(url, key) : null;
  return _anonClient;
}

export function useTranscriptStream(videoId: string | null, forceStt = false): TranscriptStreamState {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [status, setStatus] = useState<TranscriptStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<TranscriptSource | null>(null);
  const [progress, setProgress] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [metadata, setMetadata] = useState<TranscriptMetadata | null>(null);
  const [storyboardSpec, setStoryboardSpec] = useState<string | null>(null);
  const [queueProgress, setQueueProgress] = useState<QueueProgress | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

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
    setQueueProgress(null);

    // Clear any existing realtime subscription
    if (channelRef.current) {
      const supabase = getAnonClient();
      if (supabase) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    (async () => {
      try {
        const sseUrl = `/api/transcript/stream?videoId=${encodeURIComponent(videoId)}${forceStt ? '&force-stt=true' : ''}`;
        const res = await fetch(sseUrl);

        if (cancelled) return;
        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        readerRef.current = reader;

        for await (const { event, data } of parseSSE(reader)) {
          if (cancelled) break;

          switch (event) {
            case 'status': {
              const payload = JSON.parse(data) as { phase: string; message: string };
              if (payload.phase === 'queued') {
                setStatus('queued');
                setStatusMessage(payload.message);
              } else {
                setStatus('extracting');
                setStatusMessage(payload.message);
              }
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
            case 'queued': {
              // SSE stream is closing — switch to Supabase polling
              const payload = JSON.parse(data) as { videoId: string; action: string };
              if (cancelled) break;
              setStatus('queued');
              setStatusMessage('Queued for GPU transcription...');
              startRealtimeSubscription(payload.videoId);
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

    function startRealtimeSubscription(vid: string) {
      const supabase = getAnonClient();
      if (!supabase) {
        setStatus('error');
        setError('Supabase not configured');
        return;
      }

      // 3-minute safety timeout
      const timeout = setTimeout(() => {
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
        setStatus('error');
        setError('GPU transcription timed out. Try again later.');
      }, 180_000);
      timeoutRef.current = timeout;

      let lastSegmentCount = 0;

      const channel = supabase
        .channel(`queue:${vid}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'transcript_queue',
          filter: `video_id=eq.${vid}`,
        }, async (payload) => {
          if (cancelled) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const row = (payload as any).new as Record<string, any> | undefined;
          if (!row) return;

          // Update progress
          if (row.status === 'downloading' || row.status === 'transcribing') {
            setStatus('transcribing');
            setStatusMessage(
              row.status === 'downloading'
                ? 'Downloading audio...'
                : `Transcribing... ${row.segments_written} segments (${row.progress_pct}%)`
            );
            setProgress(Math.max(5, row.progress_pct));
            setQueueProgress({ segmentsWritten: row.segments_written, progressPct: row.progress_pct });
          }

          // Fetch progressive segments if count increased
          if (row.segments_written > lastSegmentCount && row.segments_written > 0) {
            const { data: cached } = await supabase
              .from('transcripts')
              .select('segments, source')
              .eq('video_id', vid)
              .single();

            if (cached?.segments && Array.isArray(cached.segments)) {
              setSegments(cached.segments as TranscriptSegment[]);
              lastSegmentCount = row.segments_written;
            }
          }

          // Job completed
          if (row.status === 'completed') {
            clearTimeout(timeout);
            timeoutRef.current = null;
            supabase.removeChannel(channel);
            channelRef.current = null;

            // Final fetch of cleaned segments
            const { data: final } = await supabase
              .from('transcripts')
              .select('segments, source, duration_seconds')
              .eq('video_id', vid)
              .single();

            if (final?.segments && Array.isArray(final.segments)) {
              setSegments(final.segments as TranscriptSegment[]);
              setSource((final.source || 'whisperx') as TranscriptSource);
              if (final.duration_seconds) {
                setDurationSeconds(final.duration_seconds);
              }
            }

            setStatus('complete');
            setStatusMessage(`${final?.segments?.length || 0} segments loaded`);
            setProgress(100);
            setQueueProgress(null);

            // Trigger knowledge extraction (fire-and-forget)
            fetch('/api/extract', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ videoId: vid }),
            }).catch(() => {});
          }

          // Job failed permanently
          if (row.status === 'failed' && row.attempt_count >= row.max_attempts) {
            clearTimeout(timeout);
            timeoutRef.current = null;
            supabase.removeChannel(channel);
            channelRef.current = null;
            setStatus('error');
            setError(row.error_message || 'Transcription failed after multiple attempts');
            setQueueProgress(null);
          }
        })
        .subscribe();

      channelRef.current = channel;

      // Initial poll to catch state transitions that happened before subscription was established
      (async () => {
        try {
          const { data: job } = await supabase
            .from('transcript_queue')
            .select('status, segments_written, progress_pct, error_message, attempt_count, max_attempts')
            .eq('video_id', vid)
            .single();

          if (!job || cancelled) return;

          // Job already completed before we subscribed
          if (job.status === 'completed') {
            clearTimeout(timeout);
            timeoutRef.current = null;
            supabase.removeChannel(channel);
            channelRef.current = null;

            const { data: final } = await supabase
              .from('transcripts')
              .select('segments, source, duration_seconds')
              .eq('video_id', vid)
              .single();

            if (final?.segments && Array.isArray(final.segments)) {
              setSegments(final.segments as TranscriptSegment[]);
              setSource((final.source || 'whisperx') as TranscriptSource);
              if (final.duration_seconds) setDurationSeconds(final.duration_seconds);
            }

            setStatus('complete');
            setStatusMessage(`${final?.segments?.length || 0} segments loaded`);
            setProgress(100);
            setQueueProgress(null);

            fetch('/api/extract', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ videoId: vid }),
            }).catch(() => {});
            return;
          }

          // Job already failed
          if (job.status === 'failed' && job.attempt_count >= job.max_attempts) {
            clearTimeout(timeout);
            timeoutRef.current = null;
            supabase.removeChannel(channel);
            channelRef.current = null;
            setStatus('error');
            setError(job.error_message || 'Transcription failed after multiple attempts');
            return;
          }

          // Job in progress — update UI with current state
          if (job.status === 'downloading' || job.status === 'transcribing') {
            setStatus('transcribing');
            setStatusMessage(
              job.status === 'downloading'
                ? 'Downloading audio...'
                : `Transcribing... ${job.segments_written} segments (${job.progress_pct}%)`
            );
            setProgress(Math.max(5, job.progress_pct));
            setQueueProgress({ segmentsWritten: job.segments_written, progressPct: job.progress_pct });
          }

          // No job found — it wasn't enqueued
          if (!job.status) {
            clearTimeout(timeout);
            timeoutRef.current = null;
            supabase.removeChannel(channel);
            channelRef.current = null;
            setStatus('error');
            setError('Transcription job not found. Please try again.');
          }
        } catch {
          // Non-fatal — Realtime will handle updates
        }
      })();
    }

    return () => {
      cancelled = true;
      if (readerRef.current) {
        readerRef.current.cancel().catch(() => {});
        readerRef.current = null;
      }
      if (channelRef.current) {
        const supabase = getAnonClient();
        if (supabase) supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [videoId, forceStt]);

  return { segments, status, statusMessage, error, source, progress, durationSeconds, metadata, storyboardSpec, queueProgress };
}
