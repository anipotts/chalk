/**
 * POST /api/extract — Knowledge extraction for a single video.
 *
 * Called by the transcript stream route (via after()) after a successful fetch.
 * Uses an atomic INSERT ... WHERE to prevent duplicate concurrent extractions.
 *
 * Body: { videoId: string }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export async function POST(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 });
  }

  let videoId: string;
  try {
    const body = await req.json() as { videoId?: string };
    videoId = body.videoId || '';
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!VIDEO_ID_RE.test(videoId)) {
    return NextResponse.json({ error: 'Invalid videoId' }, { status: 400 });
  }

  const client = createClient(supabaseUrl, serviceKey);

  // Atomic lock: INSERT only if no row exists or status is retryable.
  // This prevents the TOCTOU race where two concurrent requests both
  // see "no row" and both proceed with extraction.
  const { data: lockResult, error: lockError } = await client.rpc('claim_extraction_lock', {
    p_video_id: videoId,
  });

  // If RPC doesn't exist yet, fall back to check-then-act (less safe but functional)
  if (lockError?.message?.includes('function') || lockError?.message?.includes('does not exist')) {
    const { data: existing } = await client
      .from('batch_progress')
      .select('status')
      .eq('video_id', videoId)
      .single();

    const status = (existing as { status: string } | null)?.status;
    if (status === 'completed' || (status && status !== 'pending' && status !== 'failed')) {
      return NextResponse.json({ status: 'already_processing', current: status });
    }
  } else if (lockError) {
    console.error(`[extract] lock error for ${videoId}:`, lockError.message);
    return NextResponse.json({ error: 'Lock failed' }, { status: 500 });
  } else if (!lockResult) {
    return NextResponse.json({ status: 'already_processing' });
  }

  // Import extraction pipeline (lazy to avoid cold start overhead on other routes)
  const { extractSingleVideo } = await import('@/scripts/extract-knowledge');

  console.log(`[extract] Starting extraction for ${videoId}`);
  const result = await extractSingleVideo(videoId, { model: 'sonnet' });

  return NextResponse.json({
    status: result.success ? 'completed' : 'failed',
    concepts: result.concepts,
    moments: result.moments,
    quizzes: result.quizzes,
    costCents: result.costCents,
    durationMs: result.durationMs,
  });
}
