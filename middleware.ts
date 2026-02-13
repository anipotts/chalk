import { NextResponse, type NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Rate limiting middleware.
 * Uses Upstash Redis when available, falls back to in-memory for local dev.
 */

// Rate limits per minute by route prefix
const LIMITS: Record<string, number> = {
  '/api/generate': 15,
  '/api/video-chat': 20,
  '/api/transcript': 30,
  '/api/share': 10,
  '/api/voice-stt': 30,
  '/api/voice-tts': 30,
  '/api/voice-clone': 5,
  '/api/learn-mode': 10,
  '/api/youtube': 40,
};

function getLimit(pathname: string): number {
  for (const [prefix, limit] of Object.entries(LIMITS)) {
    if (pathname.startsWith(prefix)) return limit;
  }
  return 60;
}

// --- Upstash Redis rate limiters (one per limit value) ---
const redisLimiters = new Map<number, Ratelimit>();
let redisAvailable: boolean | null = null;

function getRedisLimiter(limit: number): Ratelimit | null {
  if (redisAvailable === false) return null;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    redisAvailable = false;
    return null;
  }
  redisAvailable = true;

  if (!redisLimiters.has(limit)) {
    redisLimiters.set(limit, new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(limit, '60 s'),
      prefix: `rl:${limit}`,
    }));
  }
  return redisLimiters.get(limit)!;
}

// --- In-memory fallback (for local dev without Redis) ---
interface RateEntry { count: number; resetAt: number; }
const memoryLimits = new Map<string, RateEntry>();
const WINDOW_MS = 60_000;
const CLEANUP_INTERVAL = 5 * 60_000;
let lastCleanup = Date.now();

function memoryCleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of memoryLimits) {
    if (entry.resetAt < now) memoryLimits.delete(key);
  }
}

function memoryRateLimit(key: string, limit: number): { success: boolean; remaining: number; reset: number } {
  memoryCleanup();
  const now = Date.now();
  const entry = memoryLimits.get(key);

  if (!entry || entry.resetAt < now) {
    memoryLimits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { success: true, remaining: limit - 1, reset: now + WINDOW_MS };
  }

  entry.count++;
  const remaining = Math.max(0, limit - entry.count);
  return { success: entry.count <= limit, remaining, reset: entry.resetAt };
}

// --- Shared ---

function getClientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Security headers
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  const ip = getClientIp(req);
  const limit = getLimit(pathname);
  const routeGroup = pathname.split('/').slice(0, 3).join('/');
  const key = `${ip}:${routeGroup}`;

  // Try Redis first, fall back to in-memory
  const redisLimiter = getRedisLimiter(limit);

  if (redisLimiter) {
    try {
      const { success, remaining, reset } = await redisLimiter.limit(key);
      if (!success) {
        const retryAfter = Math.ceil((reset - Date.now()) / 1000);
        return NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          {
            status: 429,
            headers: {
              'Retry-After': String(Math.max(1, retryAfter)),
              'X-RateLimit-Limit': String(limit),
              'X-RateLimit-Remaining': '0',
            },
          },
        );
      }
      response.headers.set('X-RateLimit-Limit', String(limit));
      response.headers.set('X-RateLimit-Remaining', String(remaining));
      return response;
    } catch {
      // Redis error — fall through to in-memory
    }
  }

  // In-memory fallback
  const result = memoryRateLimit(key, limit);
  if (!result.success) {
    const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.max(1, retryAfter)),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  response.headers.set('X-RateLimit-Limit', String(limit));
  response.headers.set('X-RateLimit-Remaining', String(result.remaining));
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
