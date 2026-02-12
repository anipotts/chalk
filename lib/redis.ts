import { Redis } from '@upstash/redis';

// Singleton — lazy init, safe for serverless
let redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  if (!redis) redis = Redis.fromEnv();
  return redis;
}

// Generic cache helpers with JSON serialization
export async function cacheGet<T>(key: string): Promise<T | null> {
  const r = getRedis();
  if (!r) return null;
  try { return await r.get<T>(key); } catch { return null; }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try { await r.set(key, value, { ex: ttlSeconds }); } catch { /* graceful degradation */ }
}
