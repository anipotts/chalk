/**
 * Three-tier transcript cache:
 *   L1 — In-memory Map (30-min TTL, zero latency, local dev optimization)
 *   L2 — Supabase `transcripts` table (30-90 day TTL, ~100ms)
 *   L3 — Fetch from source (seconds to minutes)
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
// Note: On Vercel serverless, L1 resets each cold start. This is primarily
// useful for local dev and warm container reuse.

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
  if (memoryCache.size >= MAX_L1_ENTRIES && !memoryCache.has(videoId)) {
    const oldest = memoryCache.keys().next().value;
    if (oldest !== undefined) memoryCache.delete(oldest);
  }
  memoryCache.set(videoId, entry);
}

// ─── L2: Supabase cache ──────────────────────────────────────────────────────

const VALID_SOURCES: Set<string> = new Set(['web-scrape', 'whisperx', 'groq-whisper', 'deepgram']);

/** Validate that cached data has the expected shape. */
function validateCachedSegments(data: unknown): data is { segments: TranscriptSegment[]; source: TranscriptSource } {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.segments)) return false;
  if (typeof d.source !== 'string' || !VALID_SOURCES.has(d.source)) return false;
  // Spot-check first segment
  if (d.segments.length > 0) {
    const first = d.segments[0];
    if (typeof first.text !== 'string' || typeof first.offset !== 'number') return false;
  }
  return true;
}

function getWriteClient() {
  // Prefer service role for writes to bypass RLS
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceKey) {
    // Dynamic import to avoid circular dependency
    const { createClient } = require('@supabase/supabase-js');
    return createClient(url, serviceKey);
  }
  return supabase;
}

async function getL2(videoId: string): Promise<CachedTranscript | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('transcripts')
      .select('segments, source, video_title, fetched_at, expires_at')
      .eq('video_id', videoId)
      .single();

    if (error || !data) return null;

    // Check expiry
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
      const client = getWriteClient();
      if (client) {
        client.from('transcripts').delete().eq('video_id', videoId).then(() => {});
      }
      return null;
    }

    // Validate shape
    if (!validateCachedSegments(data)) {
      console.warn(`[transcript-cache] Invalid cached data shape for ${videoId}`);
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
  const client = getWriteClient();
  if (!client) return;

  const isSTT = source === 'whisperx' || source === 'groq-whisper' || source === 'deepgram';
  const ttlDays = isSTT ? 90 : 30;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

  const lastSeg = segments[segments.length - 1];
  const durationSeconds = lastSeg ? lastSeg.offset + (lastSeg.duration || 0) : 0;

  client
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
    .then(({ error }: { error: { message: string } | null }) => {
      if (error && !error.message?.includes('schema cache')) {
        console.warn('[transcript-cache] Supabase upsert error:', error.message);
      }
    });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getCachedTranscript(videoId: string): Promise<CachedTranscript | null> {
  const l1 = getL1(videoId);
  if (l1) return l1;

  const l2 = await getL2(videoId);
  if (l2) {
    setL1(videoId, l2);
    return l2;
  }

  return null;
}

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

  setL1(videoId, entry);
  setL2(videoId, segments, source, videoTitle);
}
