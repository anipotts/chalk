/**
 * Three-tier transcript cache:
 *   L1 — In-memory Map (30-min TTL, zero latency)
 *   L2 — Supabase `transcripts` table (30–90 day TTL, ~100ms)
 *   L3 — Fetch from source (seconds to minutes)
 *
 * Follows the dual-write pattern from lib/conversations.ts:
 * memory instant + Supabase durable, fire-and-forget.
 */

import { supabase } from './supabase';
import type { TranscriptSegment, TranscriptSource } from './video-utils';

export interface CachedTranscript {
  segments: TranscriptSegment[];
  source: TranscriptSource;
  videoTitle?: string;
  fetchedAt: number; // epoch ms
}

// ─── L1: In-memory cache (bounded LRU) ───────────────────────────────────────

const L1_TTL = 30 * 60 * 1000; // 30 minutes
const MAX_L1_ENTRIES = 50;

const memoryCache = new Map<string, CachedTranscript>();

function getL1(videoId: string): CachedTranscript | null {
  const entry = memoryCache.get(videoId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > L1_TTL) {
    memoryCache.delete(videoId);
    return null;
  }
  // Move to end for LRU ordering (Map preserves insertion order)
  memoryCache.delete(videoId);
  memoryCache.set(videoId, entry);
  return entry;
}

function setL1(videoId: string, entry: CachedTranscript): void {
  // Evict oldest entries if at capacity
  if (memoryCache.size >= MAX_L1_ENTRIES && !memoryCache.has(videoId)) {
    const oldest = memoryCache.keys().next().value;
    if (oldest !== undefined) memoryCache.delete(oldest);
  }
  memoryCache.set(videoId, entry);
}

// ─── L2: Supabase cache ──────────────────────────────────────────────────────

async function getL2(videoId: string): Promise<CachedTranscript | null> {
  try {
    const { data, error } = await supabase
      .from('transcripts')
      .select('segments, source, video_title, fetched_at, expires_at')
      .eq('video_id', videoId)
      .single();

    if (error || !data) return null;

    // Check expiry
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
      // Expired — delete async and return null
      supabase.from('transcripts').delete().eq('video_id', videoId).then(() => {});
      return null;
    }

    return {
      segments: data.segments as TranscriptSegment[],
      source: data.source as TranscriptSource,
      videoTitle: data.video_title ?? undefined,
      fetchedAt: new Date(data.fetched_at).getTime(),
    };
  } catch {
    return null;
  }
}

function setL2(
  videoId: string,
  segments: TranscriptSegment[],
  source: TranscriptSource,
  videoTitle?: string,
): void {
  const isSTT = source === 'groq-whisper' || source === 'local-whisper';
  const ttlDays = isSTT ? 90 : 30;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

  const lastSeg = segments[segments.length - 1];
  const durationSeconds = lastSeg ? lastSeg.offset + (lastSeg.duration || 0) : 0;

  // Fire-and-forget upsert (same pattern as lib/conversations.ts)
  supabase
    .from('transcripts')
    .upsert({
      video_id: videoId,
      segments,
      source,
      segment_count: segments.length,
      duration_seconds: durationSeconds,
      video_title: videoTitle ?? null,
      fetched_at: new Date().toISOString(),
      expires_at: expiresAt,
    })
    .then(({ error }) => {
      if (error) console.warn('[transcript-cache] Supabase upsert error:', error.message);
    });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check L1 (memory) then L2 (Supabase) for a cached transcript.
 * Promotes L2 hits into L1 for subsequent zero-latency reads.
 */
export async function getCachedTranscript(videoId: string): Promise<CachedTranscript | null> {
  // L1 check
  const l1 = getL1(videoId);
  if (l1) return l1;

  // L2 check
  const l2 = await getL2(videoId);
  if (l2) {
    // Promote to L1
    setL1(videoId, l2);
    return l2;
  }

  return null;
}

/**
 * Write transcript to both L1 (instant) and L2 (durable, fire-and-forget).
 */
export function setCachedTranscript(
  videoId: string,
  segments: TranscriptSegment[],
  source: TranscriptSource,
  videoTitle?: string,
): void {
  const entry: CachedTranscript = {
    segments,
    source,
    videoTitle,
    fetchedAt: Date.now(),
  };

  // L1 — instant
  setL1(videoId, entry);

  // L2 — fire-and-forget
  setL2(videoId, segments, source, videoTitle);
}
