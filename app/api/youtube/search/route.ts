/**
 * YouTube Search API Route
 * Uses YouTube's Innertube API directly (most reliable), with Piped/Invidious fallback
 */

import { normalizeInvidiousResults, normalizePipedResults } from '@/lib/youtube-search';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Fallback instances (used only if Innertube fails)
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.r4fo.com',
];

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://iv.ggtyler.dev',
];

interface InnertubeVideo {
  videoId: string;
  title: string;
  author: string;
  thumbnailUrl: string;
  duration: string;
  viewCount: number;
  publishedText: string;
}

/**
 * Search via YouTube Innertube API (direct, no API key, most reliable)
 */
async function searchInnertube(query: string, limit: number, signal: AbortSignal): Promise<InnertubeVideo[]> {
  const response = await fetch('https://www.youtube.com/youtubei/v1/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20250101.00.00',
          hl: 'en',
          gl: 'US',
        },
      },
      query,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Innertube HTTP ${response.status}`);
  }

  const data = await response.json();
  return parseInnertubeResponse(data, limit);
}

/**
 * Parse Innertube's nested response into flat video results
 */
function parseInnertubeResponse(data: any, limit: number): InnertubeVideo[] {
  const results: InnertubeVideo[] = [];

  try {
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
      ?.sectionListRenderer?.contents;

    if (!Array.isArray(contents)) return [];

    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents;
      if (!Array.isArray(items)) continue;

      for (const item of items) {
        if (results.length >= limit) break;

        const video = item?.videoRenderer;
        if (!video?.videoId) continue;

        // Extract title
        const title = video.title?.runs?.map((r: any) => r.text).join('') || 'Untitled';

        // Extract author
        const author = video.ownerText?.runs?.[0]?.text
          || video.longBylineText?.runs?.[0]?.text
          || 'Unknown';

        // Extract thumbnail
        const thumbnails = video.thumbnail?.thumbnails || [];
        const thumb = thumbnails.find((t: any) => t.width >= 300)
          || thumbnails[thumbnails.length - 1]
          || {};
        const thumbnailUrl = thumb.url || `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`;

        // Extract duration
        const duration = video.lengthText?.simpleText || '0:00';

        // Extract view count
        let viewCount = 0;
        const viewText = video.viewCountText?.simpleText || '';
        const viewMatch = viewText.replace(/,/g, '').match(/(\d+)/);
        if (viewMatch) viewCount = parseInt(viewMatch[1], 10);

        // Extract published text
        const publishedText = video.publishedTimeText?.simpleText || '';

        results.push({
          videoId: video.videoId,
          title,
          author,
          thumbnailUrl,
          duration,
          viewCount,
          publishedText,
        });
      }
    }
  } catch {
    // Parse error — return whatever we got
  }

  return results;
}

/**
 * Fallback: search via Piped instance
 */
async function searchPiped(instance: string, query: string, limit: number, signal: AbortSignal) {
  const url = `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return normalizePipedResults(data).slice(0, limit);
}

/**
 * Fallback: search via Invidious instance
 */
async function searchInvidious(instance: string, query: string, limit: number, signal: AbortSignal) {
  const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return normalizeInvidiousResults(data).slice(0, limit);
}

/**
 * Search with cascading fallback: Innertube → Piped → Invidious
 */
async function searchWithFallback(query: string, limit: number) {
  const timeout = 8000;

  // 1. Try Innertube (most reliable)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const results = await searchInnertube(query, limit, controller.signal);
    clearTimeout(timeoutId);
    if (results.length > 0) return results;
  } catch (err) {
    console.error('Innertube search failed:', err);
  }

  // 2. Try Piped instances
  for (const instance of PIPED_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const results = await searchPiped(instance, query, limit, controller.signal);
      clearTimeout(timeoutId);
      return results;
    } catch (err) {
      console.error(`Piped ${instance} failed:`, err);
    }
  }

  // 3. Try Invidious instances
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const results = await searchInvidious(instance, query, limit, controller.signal);
      clearTimeout(timeoutId);
      return results;
    } catch (err) {
      console.error(`Invidious ${instance} failed:`, err);
    }
  }

  throw new Error('All search methods unavailable');
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');
    const limitParam = searchParams.get('limit');

    if (!query || query.length < 1 || query.length > 200) {
      return Response.json({ error: 'Invalid query' }, { status: 400 });
    }

    const limit = Math.min(Math.max(parseInt(limitParam || '9', 10) || 9, 1), 50);
    const results = await searchWithFallback(query, limit);

    return Response.json({ results });
  } catch (error) {
    console.error('Search API error:', error);

    if (error instanceof Error && error.message === 'All search methods unavailable') {
      return Response.json(
        { error: 'YouTube search is temporarily unavailable. Please try pasting a URL instead.' },
        { status: 503 }
      );
    }

    return Response.json(
      { error: 'An unexpected error occurred while searching' },
      { status: 500 }
    );
  }
}
