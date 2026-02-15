/**
 * JSON transcript endpoint (backward-compatible).
 * POST /api/transcript  body: { videoId }
 *
 * Returns: { segments, source }
 * Uses 3-tier cache hierarchy before fetching.
 */

import { fetchTranscript, deduplicateSegments, cleanSegments, mergeIntoSentences } from '@/lib/transcript';
import { getCachedTranscript, setCachedTranscript } from '@/lib/transcript-cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { videoId } = body;
  if (!videoId || typeof videoId !== 'string' || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return Response.json({ error: 'Invalid videoId' }, { status: 400 });
  }

  // Check cache hierarchy (L1 memory → L2 Supabase)
  const cached = await getCachedTranscript(videoId);
  if (cached && cached.segments.length > 0) {
    return Response.json(
      { segments: cached.segments, source: cached.source },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // Fetch from source (Phase 1 caption race → Phase 2 STT cascade)
  try {
    const result = await fetchTranscript(videoId);
    const segments = mergeIntoSentences(cleanSegments(deduplicateSegments(result.segments)));

    if (segments.length > 0) {
      setCachedTranscript(videoId, segments, result.source);
    }

    return Response.json(
      { segments, source: result.source, metadata: result.metadata, storyboardSpec: result.storyboardSpec },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch transcript';
    return Response.json({ error: message }, { status: 500 });
  }
}
