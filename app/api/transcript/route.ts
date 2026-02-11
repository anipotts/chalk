import { fetchTranscript, deduplicateSegments, type TranscriptSegment } from '@/lib/transcript';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Simple in-memory cache (persists for lambda lifetime)
const cache = new Map<string, { segments: TranscriptSegment[]; fetchedAt: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

export async function POST(req: Request) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { videoId } = body;
  if (!videoId || typeof videoId !== 'string' || videoId.length > 20) {
    return Response.json({ error: 'Invalid videoId' }, { status: 400 });
  }

  // Check cache
  const cached = cache.get(videoId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return Response.json({ segments: cached.segments });
  }

  try {
    const rawSegments = await fetchTranscript(videoId);
    const segments = deduplicateSegments(rawSegments);

    // Cache result
    cache.set(videoId, { segments, fetchedAt: Date.now() });

    return Response.json({ segments });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch transcript';
    return Response.json({ error: message }, { status: 500 });
  }
}
