/**
 * Cache pre-warming route for demo channels.
 * Fetches and caches ALL data for 3Blue1Brown and Khan Academy:
 * - Channel metadata (both sorts)
 * - First N pages of videos (latest + popular)
 * - All playlists (paginated)
 * - Individual playlist details for first 50 playlists
 *
 * Call POST /api/youtube/warm-cache to trigger.
 * Designed to run on deploy (via Vercel cron or manual trigger).
 */

import {
  forceCache,
  channelVideosKey,
  channelPlaylistsKey,
  playlistMetaKey,
  getDemoTtl,
  DEMO_CHANNELS,
} from '@/lib/youtube-cache';
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — this is a long-running operation

const INNERTUBE_CONTEXT = {
  client: {
    clientName: 'WEB',
    clientVersion: '2.20250101.00.00',
    hl: 'en',
    gl: 'US',
  },
};

const VIDEOS_TAB_PARAM = 'EgZ2aWRlb3PyBgQKAjoA';
const PLAYLISTS_TAB_PARAM = 'EglwbGF5bGlzdHPyBgQKAkIA';

async function innertube(body: Record<string, any>): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/browse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: INNERTUBE_CONTEXT, ...body }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

async function innertubePlaylist(body: Record<string, any>): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/browse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: INNERTUBE_CONTEXT, ...body }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

interface WarmResult {
  channel: string;
  channelId: string;
  latestVideos: number;
  popularVideos: number;
  playlists: number;
  playlistDetails: number;
  errors: string[];
}

async function warmChannel(channelId: string): Promise<WarmResult> {
  const ttl = getDemoTtl();
  const result: WarmResult = {
    channel: '',
    channelId,
    latestVideos: 0,
    popularVideos: 0,
    playlists: 0,
    playlistDetails: 0,
    errors: [],
  };

  // --- 1. Latest videos (first page via channel API) ---
  try {
    const url = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/youtube/channel?id=${channelId}&tab=videos&sort=latest`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      result.channel = data.channel?.name || 'Unknown';
      result.latestVideos = data.videos?.length || 0;
      // Cache is already written by the channel route's cachedChannelVideos
      // But let's also ensure it's stored with the demo TTL
      await forceCache(channelVideosKey(channelId, 'latest', '0'), data, ttl);
    }
  } catch (err) {
    result.errors.push(`latest: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  // Brief delay to avoid hammering YouTube
  await sleep(500);

  // --- 2. Popular videos ---
  try {
    const url = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/youtube/channel?id=${channelId}&tab=videos&sort=popular`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      result.popularVideos = data.videos?.length || 0;
      await forceCache(channelVideosKey(channelId, 'popular', '0'), data, ttl);
    }
  } catch (err) {
    result.errors.push(`popular: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  await sleep(500);

  // --- 3. Playlists (all pages) ---
  try {
    const allPlaylists: any[] = [];
    let continuation: string | undefined;
    let page = 0;
    const maxPages = 20; // Safety limit

    // First page
    const url = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/youtube/channel?id=${channelId}&tab=playlists`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const pls = data.playlists || [];
      allPlaylists.push(...pls);
      continuation = data.continuation;
      result.channel = data.channel?.name || result.channel;

      // Cache first page
      await forceCache(channelPlaylistsKey(channelId), data, ttl);
    }

    // Subsequent pages
    while (continuation && page < maxPages) {
      page++;
      await sleep(300);
      try {
        const contUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/youtube/channel?id=${channelId}&continuation=${encodeURIComponent(continuation)}`;
        const contRes = await fetch(contUrl);
        if (!contRes.ok) break;
        const contData = await contRes.json();
        const pls = contData.playlists || [];
        allPlaylists.push(...pls);
        continuation = contData.continuation;
      } catch {
        break;
      }
    }

    result.playlists = allPlaylists.length;

    // --- 4. Individual playlist details (first 50) ---
    const playlistsToDetail = allPlaylists.slice(0, 50);
    for (const pl of playlistsToDetail) {
      await sleep(200);
      try {
        const plUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/youtube/playlist?id=${encodeURIComponent(pl.playlistId)}`;
        const plRes = await fetch(plUrl);
        if (plRes.ok) {
          const plData = await plRes.json();
          await forceCache(playlistMetaKey(pl.playlistId), plData, ttl);
          result.playlistDetails++;
        }
      } catch {
        // Skip failures silently — individual playlist failures are ok
      }
    }
  } catch (err) {
    result.errors.push(`playlists: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(req: Request) {
  // Verify Redis is available
  const redis = getRedis();
  if (!redis) {
    return Response.json(
      { error: 'Redis not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.' },
      { status: 503 }
    );
  }

  // Optional: restrict to specific channels or warm all demo channels
  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get('id');

  const channelsToWarm = channelId
    ? [channelId]
    : Array.from(DEMO_CHANNELS);

  const results: WarmResult[] = [];

  for (const id of channelsToWarm) {
    console.log(`[warm-cache] Starting: ${id}`);
    const result = await warmChannel(id);
    results.push(result);
    console.log(`[warm-cache] Done: ${result.channel} — ${result.latestVideos} latest, ${result.popularVideos} popular, ${result.playlists} playlists, ${result.playlistDetails} playlist details`);
  }

  return Response.json({
    warmed: results.length,
    results,
    ttl: getDemoTtl(),
    ttlHuman: `${Math.round(getDemoTtl() / 86400)} days`,
  });
}

// Also support GET for easy browser/cron triggering
export async function GET(req: Request) {
  return POST(req);
}
