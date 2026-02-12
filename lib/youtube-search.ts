/**
 * YouTube Search Utilities
 * Client-safe utilities for YouTube search via Piped/Invidious APIs
 * No Node.js dependencies - can be imported from client components
 */

export interface SearchResult {
  videoId: string;
  title: string;
  author: string;
  channelId?: string;
  thumbnailUrl: string;
  duration: string; // formatted as "M:SS" or "H:MM:SS"
  viewCount: number;
  publishedText: string;
}

/**
 * Format seconds as M:SS or H:MM:SS
 * @param seconds - Duration in seconds
 * @returns Formatted duration string
 */
export function formatDuration(seconds: number): string {
  if (seconds < 0) return '0:00';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const paddedSecs = secs.toString().padStart(2, '0');

  if (hours > 0) {
    const paddedMins = minutes.toString().padStart(2, '0');
    return `${hours}:${paddedMins}:${paddedSecs}`;
  }

  return `${minutes}:${paddedSecs}`;
}

/**
 * Format view count with K/M/B notation
 * @param count - View count number
 * @returns Formatted view count string
 */
export function formatViewCount(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 1_000_000) {
    const k = count / 1000;
    return k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`;
  }
  if (count < 1_000_000_000) {
    const m = count / 1_000_000;
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
  }
  const b = count / 1_000_000_000;
  return b % 1 === 0 ? `${b}B` : `${b.toFixed(1)}B`;
}

/**
 * Find medium-quality thumbnail URL from thumbnail array
 * Prefers 320x180 (medium quality), falls back to first available or YouTube default
 */
function findMediumThumbnail(thumbnails: any[]): string {
  if (!thumbnails || thumbnails.length === 0) {
    return 'https://i.ytimg.com/vi/default.jpg';
  }

  // Try to find medium quality (320x180)
  const medium = thumbnails.find(t =>
    t.quality === 'medium' || t.quality === 'mqdefault' || t.width === 320
  );

  if (medium?.url) return medium.url;

  // Fallback to first thumbnail
  return thumbnails[0]?.url || 'https://i.ytimg.com/vi/default.jpg';
}

/**
 * Normalize Invidious API response to SearchResult format
 */
export function normalizeInvidiousResults(raw: any[]): SearchResult[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(item => item.type === 'video' || !item.type) // Filter to videos only
    .map(item => ({
      videoId: item.videoId,
      title: item.title,
      author: item.author,
      thumbnailUrl: findMediumThumbnail(item.videoThumbnails),
      duration: formatDuration(item.lengthSeconds || 0),
      viewCount: item.viewCount || 0,
      publishedText: item.publishedText || 'Unknown date'
    }));
}

/**
 * Normalize Piped API response to SearchResult format
 * Piped has slightly different field names
 */
export function normalizePipedResults(raw: any): SearchResult[] {
  const items = raw?.items || [];
  if (!Array.isArray(items)) return [];

  return items
    .filter(item => item.type === 'stream' || !item.type) // Piped calls videos "streams"
    .map(item => ({
      videoId: item.url?.split('?v=')[1] || item.id || '',
      title: item.title,
      author: item.uploaderName || item.uploader || 'Unknown',
      thumbnailUrl: item.thumbnail || `https://i.ytimg.com/vi/${item.url?.split('?v=')[1]}/mqdefault.jpg`,
      duration: formatDuration(item.duration || 0),
      viewCount: item.views || 0,
      publishedText: item.uploadedDate || 'Unknown date'
    }))
    .filter(item => item.videoId); // Filter out items without valid video IDs
}
