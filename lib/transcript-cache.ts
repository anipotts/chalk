/**
 * Multi-tier transcript cache: in-memory hot layer + file-based persistent layer.
 * STT results (Deepgram/Whisper) get aggressively long TTLs to save API credits.
 * Server-only — do NOT import from client components.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { TranscriptSegment } from './video-utils';

// ── TTL configuration ──────────────────────────────────────────────────────────
// Caption results are cheap to re-fetch, STT results cost real money.

const TTL = {
  /** In-memory hot cache for all methods (fast, cleared on restart) */
  memory: 30 * 60 * 1000,               // 30 minutes
  /** Disk cache for caption-based transcripts */
  captionsDisk: 24 * 60 * 60 * 1000,    // 24 hours
  /** Disk cache for STT transcripts (Deepgram/Whisper) — protect credits */
  sttDisk: 30 * 24 * 60 * 60 * 1000,    // 30 days
} as const;

// ── Cache directory ────────────────────────────────────────────────────────────

const CACHE_DIR = join(tmpdir(), 'chalk-transcript-cache');

function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type TranscriptMethod = 'captions' | 'deepgram' | 'whisper' | 'cache';

interface CacheEntry {
  videoId: string;
  segments: TranscriptSegment[];
  method: TranscriptMethod;
  cachedAt: number;
  /** Original method before being served from cache */
  originalMethod: TranscriptMethod;
}

// ── In-memory hot cache ────────────────────────────────────────────────────────

const memoryCache = new Map<string, CacheEntry>();

// ── Disk operations ────────────────────────────────────────────────────────────

function diskPath(videoId: string): string {
  // Sanitize videoId to prevent path traversal
  const safe = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
  return join(CACHE_DIR, `${safe}.json`);
}

function readDisk(videoId: string): CacheEntry | null {
  try {
    const path = diskPath(videoId);
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

function writeDisk(entry: CacheEntry): void {
  try {
    ensureCacheDir();
    writeFileSync(diskPath(entry.videoId), JSON.stringify(entry));
  } catch {
    // Disk write failure is non-fatal — memory cache still works
  }
}

function ttlForMethod(method: TranscriptMethod): number {
  if (method === 'deepgram' || method === 'whisper') return TTL.sttDisk;
  return TTL.captionsDisk;
}

function isExpired(entry: CacheEntry, ttl: number): boolean {
  return Date.now() - entry.cachedAt > ttl;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Look up a transcript in the cache. Checks memory first, then disk.
 * Returns null if not cached or expired.
 */
export function getCached(videoId: string): CacheEntry | null {
  // Tier 1: Memory
  const mem = memoryCache.get(videoId);
  if (mem && !isExpired(mem, TTL.memory)) {
    return mem;
  }

  // Tier 2: Disk (survives server restarts)
  const disk = readDisk(videoId);
  if (disk) {
    const diskTtl = ttlForMethod(disk.originalMethod);
    if (!isExpired(disk, diskTtl)) {
      // Promote back to memory
      memoryCache.set(videoId, disk);
      return disk;
    }
  }

  // Expired — clean up
  if (mem) memoryCache.delete(videoId);
  return null;
}

/**
 * Store a transcript in both memory and disk cache.
 */
export function setCache(
  videoId: string,
  segments: TranscriptSegment[],
  method: TranscriptMethod,
): void {
  const entry: CacheEntry = {
    videoId,
    segments,
    method,
    cachedAt: Date.now(),
    originalMethod: method,
  };

  memoryCache.set(videoId, entry);
  writeDisk(entry);
}

/**
 * Check if a video has a cached STT result (Deepgram/Whisper).
 * Useful to skip the expensive audio download + transcription entirely.
 */
export function hasSTTCache(videoId: string): boolean {
  const entry = getCached(videoId);
  return entry !== null && (entry.originalMethod === 'deepgram' || entry.originalMethod === 'whisper');
}

/**
 * Get cache stats for debugging/monitoring.
 */
export function getCacheStats(): {
  memoryEntries: number;
  diskEntries: number;
  diskSizeMB: number;
} {
  let diskEntries = 0;
  let diskSize = 0;

  try {
    ensureCacheDir();
    const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
    diskEntries = files.length;
    for (const f of files) {
      try {
        diskSize += statSync(join(CACHE_DIR, f)).size;
      } catch {
        // skip
      }
    }
  } catch {
    // Cache dir doesn't exist yet
  }

  return {
    memoryEntries: memoryCache.size,
    diskEntries,
    diskSizeMB: Math.round((diskSize / (1024 * 1024)) * 100) / 100,
  };
}

/**
 * Evict expired entries from disk cache.
 * Call periodically or on startup to prevent unbounded growth.
 */
export function evictExpired(): number {
  let evicted = 0;
  try {
    ensureCacheDir();
    const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      try {
        const path = join(CACHE_DIR, f);
        const raw = readFileSync(path, 'utf-8');
        const entry = JSON.parse(raw) as CacheEntry;
        const ttl = ttlForMethod(entry.originalMethod);
        if (isExpired(entry, ttl)) {
          unlinkSync(path);
          evicted++;
        }
      } catch {
        // Corrupt file — remove it
        try { unlinkSync(join(CACHE_DIR, f)); evicted++; } catch { /* skip */ }
      }
    }
  } catch {
    // Cache dir doesn't exist
  }

  // Also clean memory
  for (const [key, entry] of memoryCache) {
    if (isExpired(entry, TTL.memory)) {
      memoryCache.delete(key);
    }
  }

  return evicted;
}

// Evict on module load (startup)
evictExpired();
