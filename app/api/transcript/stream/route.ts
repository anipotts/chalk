import { fetchTranscript, deduplicateSegments, downloadAudio, type TranscriptSegment } from '@/lib/transcript';
import { transcribeWithDeepgram } from '@/lib/stt/deepgram';
import { transcribeWithWhisper } from '@/lib/stt/whisper';
import { getCached, setCache, type TranscriptMethod } from '@/lib/transcript-cache';
import { unlink } from 'fs/promises';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min for STT

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const videoId = url.searchParams.get('videoId');

  if (!videoId || videoId.length > 20) {
    return new Response(
      sseEvent('transcript-error', { message: 'Invalid videoId' }),
      { status: 400, headers: { 'Content-Type': 'text/event-stream' } },
    );
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseEvent(event, data)));
        } catch {
          closed = true;
        }
      };

      // Listen for client disconnect
      req.signal.addEventListener('abort', () => {
        closed = true;
      });

      try {
        // ── Check persistent cache (memory → disk, STT results survive 30 days) ──
        const cached = getCached(videoId);
        if (cached) {
          send('status', { phase: 'streaming', message: 'Loading from cache...' });
          send('method', { method: cached.originalMethod });

          // Stream cached segments in batches
          for (let i = 0; i < cached.segments.length; i += 10) {
            if (closed) break;
            const batch = cached.segments.slice(i, i + 10);
            for (const seg of batch) {
              send('segment', seg);
            }
          }

          send('done', { total: cached.segments.length });
          controller.close();
          return;
        }

        // ── Try caption extraction (tiers 1-3) ──────────────────────────
        send('status', { phase: 'extracting', message: 'Fetching captions...' });

        let segments: TranscriptSegment[] | null = null;
        let method = 'captions';

        try {
          const raw = await fetchTranscript(videoId);
          segments = deduplicateSegments(raw);
        } catch {
          // All caption tiers failed — proceed to STT
        }

        if (segments && segments.length > 0) {
          send('method', { method: 'captions' });

          // Stream segments in batches of 10
          for (let i = 0; i < segments.length; i += 10) {
            if (closed) break;
            const batch = segments.slice(i, i + 10);
            for (const seg of batch) {
              send('segment', seg);
            }
          }

          setCache(videoId, segments, 'captions');
          send('done', { total: segments.length });
          controller.close();
          return;
        }

        // ── STT fallback ─────────────────────────────────────────────────
        send('status', { phase: 'downloading', message: 'Downloading audio...' });

        let audioPath: string;
        try {
          audioPath = await downloadAudio(videoId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Audio download failed';
          send('transcript-error', { message: `Could not download audio: ${msg}` });
          controller.close();
          return;
        }

        try {
          // Try Deepgram first (if key is set)
          if (process.env.DEEPGRAM_API_KEY) {
            send('status', { phase: 'transcribing', message: 'Transcribing with Deepgram...' });
            method = 'deepgram';

            try {
              const sttSegments: TranscriptSegment[] = [];
              segments = await transcribeWithDeepgram(audioPath, (seg) => {
                sttSegments.push(seg);
                send('segment', seg);
              });

              send('method', { method: 'deepgram' });
              setCache(videoId, segments, 'deepgram');
              send('done', { total: segments.length });
              controller.close();
              return;
            } catch {
              // Fall through to Whisper
            }
          }

          // Try Whisper
          send('status', { phase: 'transcribing', message: 'Transcribing with Whisper...' });
          method = 'whisper';

          segments = await transcribeWithWhisper(audioPath, (percent) => {
            send('progress', { percent });
          });

          send('method', { method: 'whisper' });

          // Stream Whisper segments
          for (let i = 0; i < segments.length; i += 10) {
            if (closed) break;
            const batch = segments.slice(i, i + 10);
            for (const seg of batch) {
              send('segment', seg);
            }
          }

          setCache(videoId, segments, method as TranscriptMethod);
          send('done', { total: segments.length });
        } finally {
          // Clean up temp audio file
          try {
            await unlink(audioPath);
          } catch {
            // Ignore cleanup errors
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Transcript extraction failed';
        send('transcript-error', { message });
      }

      if (!closed) {
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
