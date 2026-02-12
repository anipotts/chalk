/**
 * YouTube data caching layer.
 * Cache-through helpers for all YouTube API data.
 * Falls back to direct fetch when Redis is unavailable.
 *
 * Demo channels (3B1B, Khan Academy) get 7-day TTLs to minimize
 * YouTube API calls and ensure instant loads during demos.
 */

import { cacheGet, cacheSet } from './redis';

// TTL constants (seconds)
const TTL = {
  CHANNEL_META: 86400,      // 24h — name/avatar/banner rarely change
  CHANNEL_VIDEOS: 21600,    // 6h — new uploads every few days
  CHANNEL_PLAYLISTS: 43200, // 12h — rarely modified
  SEARCH_RESULTS: 3600,     // 1h — should feel fresh
  PLAYLIST_META: 43200,     // 12h — stable
  PLAYLIST_VIDEOS: 21600,   // 6h — occasional reordering
} as const;

// Demo channels get much longer TTLs (7 days)
const DEMO_TTL = 604800; // 7 days
const DEMO_CHANNELS = new Set([
  'UCYO_jab_esuFRV4b17AJtAw', // 3Blue1Brown
  'UC4a-Gbdw7vOaccHmFo40b9g', // Khan Academy
]);

function ttl(base: number, channelId?: string): number {
  return channelId && DEMO_CHANNELS.has(channelId) ? DEMO_TTL : base;
}

/**
 * Generic cache-through helper.
 * Checks Redis first, falls back to fetcher, writes result to cache.
 */
async function cached<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const fresh = await fetcher();
  await cacheSet(key, fresh, ttl);
  return fresh;
}

// --- Channel ---

export function cachedChannelMeta<T>(channelId: string, fetcher: () => Promise<T>): Promise<T> {
  return cached(`yt:channel:${channelId}:meta`, ttl(TTL.CHANNEL_META, channelId), fetcher);
}

export function cachedChannelVideos<T>(channelId: string, sort: string, page: string, fetcher: () => Promise<T>): Promise<T> {
  return cached(`yt:channel:${channelId}:videos:${sort}:${page}`, ttl(TTL.CHANNEL_VIDEOS, channelId), fetcher);
}

export function cachedChannelPlaylists<T>(channelId: string, fetcher: () => Promise<T>): Promise<T> {
  return cached(`yt:channel:${channelId}:playlists`, ttl(TTL.CHANNEL_PLAYLISTS, channelId), fetcher);
}

// --- Search ---

export function cachedSearch<T>(type: string, query: string, page: string, fetcher: () => Promise<T>): Promise<T> {
  return cached(`yt:search:${type}:${query}:${page}`, TTL.SEARCH_RESULTS, fetcher);
}

// --- Playlist ---

export function cachedPlaylistMeta<T>(playlistId: string, fetcher: () => Promise<T>): Promise<T> {
  return cached(`yt:playlist:${playlistId}:meta`, TTL.PLAYLIST_META, fetcher);
}

export function cachedPlaylistVideos<T>(playlistId: string, page: string, fetcher: () => Promise<T>): Promise<T> {
  return cached(`yt:playlist:${playlistId}:videos:${page}`, TTL.PLAYLIST_VIDEOS, fetcher);
}

// --- Demo helpers ---

export { DEMO_CHANNELS };

/**
 * Force-write a value to cache (for pre-warming). Skips the read check.
 */
export async function forceCache(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await cacheSet(key, value, ttlSeconds);
}

/** Build cache key for a channel's video page */
export function channelVideosKey(channelId: string, sort: string, page: string): string {
  return `yt:channel:${channelId}:videos:${sort}:${page}`;
}

/** Build cache key for a channel's playlists */
export function channelPlaylistsKey(channelId: string): string {
  return `yt:channel:${channelId}:playlists`;
}

/** Build cache key for a playlist's metadata */
export function playlistMetaKey(playlistId: string): string {
  return `yt:playlist:${playlistId}:meta`;
}

/** Get the demo TTL */
export function getDemoTtl(): number {
  return DEMO_TTL;
}
