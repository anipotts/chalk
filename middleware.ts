import { NextResponse, type NextRequest } from 'next/server';

/**
 * Simple IP-based rate limiting middleware.
 * Uses in-memory counters (resets on cold start, per-instance on Vercel).
 * For production: replace with @upstash/ratelimit + Redis.
 */

interface RateEntry {
  count: number;
  resetAt: number;
}

const rateLimits = new Map<string, RateEntry>();
const WINDOW_MS = 60_000; // 1 minute window
const CLEANUP_INTERVAL = 5 * 60_000; // Clean old entries every 5 min

// Rate limits per minute by route prefix
const LIMITS: Record<string, number> = {
  '/api/generate': 15,
  '/api/video-chat': 20,
  '/api/transcript': 30,
  '/api/share': 10,
  '/api/voice-stt': 30,
  '/api/voice-tts': 30,
  '/api/voice-clone': 5,
  '/api/youtube': 40,
};

function getLimit(pathname: string): number {
  for (const [prefix, limit] of Object.entries(LIMITS)) {
    if (pathname.startsWith(prefix)) return limit;
  }
  return 60; // default
}

// Periodic cleanup of expired entries
let lastCleanup = Date.now();
function cleanupIfNeeded() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimits) {
    if (entry.resetAt < now) rateLimits.delete(key);
  }
}

function getClientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only rate-limit API routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Add security headers to all API responses
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Rate limiting
  cleanupIfNeeded();
  const ip = getClientIp(req);
  const key = `${ip}:${pathname.split('/').slice(0, 3).join('/')}`; // group by route prefix
  const limit = getLimit(pathname);
  const now = Date.now();

  const entry = rateLimits.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    response.headers.set('X-RateLimit-Limit', String(limit));
    response.headers.set('X-RateLimit-Remaining', String(limit - 1));
    return response;
  }

  entry.count++;
  if (entry.count > limit) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((entry.resetAt - now) / 1000)),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  response.headers.set('X-RateLimit-Limit', String(limit));
  response.headers.set('X-RateLimit-Remaining', String(limit - entry.count));
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
