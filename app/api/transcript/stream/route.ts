/**
 * SSE streaming transcript endpoint.
 * GET /api/transcript/stream?videoId=<id>
 *
 * Calls caption race and STT cascade directly (not via fetchTranscript)
 * so it can send granular status events between phases.
 *
 * Events:
 *   status   → { phase, message }
 *   meta     → { source, cached }
 *   segments → TranscriptSegment[]
 *   done     → { total, source, durationSeconds }
 *   error    → { message }
 */

import { captionRace, sttCascade, deduplicateSegments, mergeIntoSentences, type TranscriptSegment, type TranscriptSource } from '@/lib/transcript';
import { getCachedTranscript, setCachedTranscript } from '@/lib/transcript-cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const videoId = url.searchParams.get('videoId');

  if (!videoId || !VIDEO_ID_RE.test(videoId)) {
    return new Response(
      sseEvent('error', { message: 'Invalid or missing videoId' }),
      { status: 400, headers: { 'Content-Type': 'text/event-stream' } },
    );
  }

  const encoder = new TextEncoder();
  const abortSignal = req.signal;

  const stream = new ReadableStream({
    async start(controller) {
      // Heartbeat keeps connection alive during long operations (caption race, STT)
      const heartbeat = setInterval(() => {
        if (abortSignal.aborted) { clearInterval(heartbeat); return; }
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 10_000);

      function send(event: string, data: unknown) {
        if (abortSignal.aborted) return;
        try {
          controller.enqueue(encoder.encode(sseEvent(event, data)));
        } catch {
          // Stream already closed
        }
      }

      try {
        // ── Check caches ──────────────────────────────────────────────────
        send('status', { phase: 'cache', message: 'Checking cache...' });

        const cached = await getCachedTranscript(videoId);
        if (cached && cached.segments.length > 0) {
          send('meta', { source: cached.source, cached: true });
          send('segments', cached.segments);

          const lastSeg = cached.segments[cached.segments.length - 1];
          const duration = lastSeg.offset + (lastSeg.duration || 0);
          send('done', {
            total: cached.segments.length,
            source: cached.source,
            durationSeconds: duration,
          });
          clearInterval(heartbeat);
          controller.close();
          return;
        }

        // ── Phase 1: Caption race ────────────────────────────────────────
        send('status', { phase: 'captions', message: 'Fetching captions...' });

        let segments: TranscriptSegment[] | null = null;
        let source: TranscriptSource | null = null;

        try {
          const result = await captionRace(videoId);
          segments = mergeIntoSentences(deduplicateSegments(result.segments));
          source = result.source;
          console.log(`[transcript] ${videoId}: fetched via ${source} (${segments.length} segments)`);
        } catch (e) {
          console.log(`[transcript] ${videoId}: caption race failed:`, e instanceof Error ? e.message : e);
        }

        // ── Phase 2: STT cascade (only if captions failed) ───────────────
        if (!segments || segments.length === 0) {
          send('status', { phase: 'downloading', message: 'Downloading audio for transcription...' });

          try {
            const result = await sttCascade(videoId);
            segments = mergeIntoSentences(deduplicateSegments(result.segments));
            source = result.source;
          } catch (e) {
            console.error(`[transcript] ${videoId}: STT cascade failed:`, e instanceof Error ? e.message : e);
            send('error', { message: `Could not fetch transcript for ${videoId}` });
            clearInterval(heartbeat);
            controller.close();
            return;
          }
        }

        if (!segments || segments.length === 0 || !source) {
          send('error', { message: 'Transcript returned 0 segments' });
          clearInterval(heartbeat);
          controller.close();
          return;
        }

        send('meta', { source, cached: false });
        send('segments', segments);

        const lastSeg = segments[segments.length - 1];
        const duration = lastSeg.offset + (lastSeg.duration || 0);
        send('done', {
          total: segments.length,
          source,
          durationSeconds: duration,
        });

        // ── Cache result (fire-and-forget) ───────────────────────────────
        setCachedTranscript(videoId, segments, source);

        clearInterval(heartbeat);
        controller.close();
      } catch (err) {
        clearInterval(heartbeat);
        const message = err instanceof Error ? err.message : 'Unexpected error';
        try {
          send('error', { message });
          controller.close();
        } catch {
          // Stream already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
