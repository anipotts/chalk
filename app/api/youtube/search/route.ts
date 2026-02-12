/**
 * YouTube Search API Route
 * Uses YouTube's Innertube API directly (most reliable), with Piped/Invidious fallback.
 * Supports pagination via continuation tokens.
 */

import { normalizeInvidiousResults, normalizePipedResults } from '@/lib/youtube-search';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

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
  channelId?: string;
  thumbnailUrl: string;
  duration: string;
  viewCount: number;
  publishedText: string;
}

interface InnertubeSearchResult {
  results: InnertubeVideo[];
  continuation?: string;
}

/**
 * Search via YouTube Innertube API (direct, no API key, most reliable)
 */
async function searchInnertube(query: string, limit: number, signal: AbortSignal, continuation?: string): Promise<InnertubeSearchResult> {
  const body: Record<string, any> = {
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20250101.00.00',
        hl: 'en',
        gl: 'US',
      },
    },
  };

  if (continuation) {
    body.continuation = continuation;
  } else {
    body.query = query;
  }

  const response = await fetch('https://www.youtube.com/youtubei/v1/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Innertube HTTP ${response.status}`);
  }

  const data = await response.json();
  return parseInnertubeResponse(data, limit, !!continuation);
}

/**
 * Parse Innertube's nested response into flat video results.
 * Handles both initial search and continuation responses.
 */
function parseInnertubeResponse(data: any, limit: number, isContinuation: boolean): InnertubeSearchResult {
  const results: InnertubeVideo[] = [];
  let continuationToken: string | undefined;

  try {
    let contents: any[];

    if (isContinuation) {
      // Continuation response has a different structure
      const actions = data?.onResponseReceivedCommands;
      if (!Array.isArray(actions)) {
        console.warn('[search] continuation: no onResponseReceivedCommands, keys:', Object.keys(data || {}));
        return { results };
      }

      for (const action of actions) {
        const items = action?.appendContinuationItemsAction?.continuationItems;
        if (!Array.isArray(items)) continue;

        for (const item of items) {
          if (item.continuationItemRenderer) {
            continuationToken = item.continuationItemRenderer
              ?.continuationEndpoint?.continuationCommand?.token;
            continue;
          }

          // Try multiple extraction paths for continuation items
          const video = item?.itemSectionRenderer?.contents?.[0]?.videoRenderer
            || item?.videoRenderer
            || item?.richItemRenderer?.content?.videoRenderer;
          if (!video?.videoId) continue;
          if (results.length >= limit) break;

          const parsed = extractVideoFromRenderer(video);
          if (parsed) results.push(parsed);
        }
      }
      console.log(`[search] continuation parsed: ${results.length} videos, has next: ${!!continuationToken}`);
    } else {
      // Initial search response
      contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents;

      if (!Array.isArray(contents)) return { results };

      for (const section of contents) {
        // Check for continuation token in section list
        if (section.continuationItemRenderer) {
          continuationToken = section.continuationItemRenderer
            ?.continuationEndpoint?.continuationCommand?.token;
          continue;
        }

        const items = section?.itemSectionRenderer?.contents;
        if (!Array.isArray(items)) continue;

        for (const item of items) {
          if (results.length >= limit) break;

          const video = item?.videoRenderer;
          if (!video?.videoId) continue;

          const parsed = extractVideoFromRenderer(video);
          if (parsed) results.push(parsed);
        }
      }
    }
  } catch {
    // Parse error — return whatever we got
  }

  return { results, continuation: continuationToken };
}

/** Check if a video renderer represents a Short or non-standard video. */
function isShortOrNonVideo(video: any): boolean {
  // Shorts use /shorts/ navigation
  const navUrl = video.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || '';
  if (navUrl.includes('/shorts/')) return true;

  // Shorts have an overlay badge saying "SHORTS"
  const badges = video.badges || video.ownerBadges || [];
  for (const badge of badges) {
    const label = badge?.metadataBadgeRenderer?.label || '';
    if (label.toUpperCase().includes('SHORT')) return true;
  }

  // Shorts have no lengthText at all
  if (!video.lengthText) return true;

  // Filter videos under 61 seconds (Shorts are ≤60s)
  const durationText = video.lengthText?.simpleText || '';
  if (durationText && parseDurationSeconds(durationText) <= 60) return true;

  // Thumbnail overlay may have "SHORTS" style
  const overlayStyle = video.thumbnailOverlays?.find(
    (o: any) => o.thumbnailOverlayTimeStatusRenderer?.style === 'SHORTS'
  );
  if (overlayStyle) return true;

  return false;
}

/** Parse "M:SS" or "H:MM:SS" duration string to seconds. */
function parseDurationSeconds(duration: string): number {
  const parts = duration.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function extractVideoFromRenderer(video: any): InnertubeVideo | null {
  if (isShortOrNonVideo(video)) return null;

  const title = video.title?.runs?.map((r: any) => r.text).join('') || 'Untitled';

  const author = video.ownerText?.runs?.[0]?.text
    || video.longBylineText?.runs?.[0]?.text
    || 'Unknown';

  const channelId = video.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId
    || video.longBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId
    || undefined;

  const thumbnails = video.thumbnail?.thumbnails || [];
  const thumb = thumbnails.find((t: any) => t.width >= 300)
    || thumbnails[thumbnails.length - 1]
    || {};
  const thumbnailUrl = thumb.url || `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`;

  const duration = video.lengthText?.simpleText || '0:00';

  let viewCount = 0;
  const viewText = video.viewCountText?.simpleText || '';
  const viewMatch = viewText.replace(/,/g, '').match(/(\d+)/);
  if (viewMatch) viewCount = parseInt(viewMatch[1], 10);

  const publishedText = video.publishedTimeText?.simpleText || '';

  return {
    videoId: video.videoId,
    title,
    author,
    channelId,
    thumbnailUrl,
    duration,
    viewCount,
    publishedText,
  };
}

async function searchPiped(instance: string, query: string, limit: number, signal: AbortSignal) {
  const url = `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return normalizePipedResults(data).slice(0, limit);
}

async function searchInvidious(instance: string, query: string, limit: number, signal: AbortSignal) {
  const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return normalizeInvidiousResults(data).slice(0, limit);
}

/**
 * Search with cascading fallback: Innertube → Piped → Invidious.
 * Returns results and optional continuation token.
 */
async function searchWithFallback(query: string, limit: number, continuation?: string): Promise<{ results: any[]; continuation?: string }> {
  const timeout = 8000;

  // 1. Try Innertube (most reliable, supports continuation)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const result = await searchInnertube(query, limit, controller.signal, continuation);
    clearTimeout(timeoutId);
    if (result.results.length > 0) return result;
    // If Innertube returned 0 results for a continuation, end pagination
    if (continuation) return { results: [] };
  } catch (err) {
    console.error('Innertube search failed:', err);
    // For continuation requests, return empty rather than falling through to fallbacks
    if (continuation) return { results: [] };
  }

  // 2. Try Piped instances
  for (const instance of PIPED_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const results = await searchPiped(instance, query, limit, controller.signal);
      clearTimeout(timeoutId);
      return { results };
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
      return { results };
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
    const continuation = searchParams.get('continuation') || undefined;

    if (!query || query.length < 1 || query.length > 200) {
      return Response.json({ error: 'Invalid query' }, { status: 400 });
    }

    const limit = Math.min(Math.max(parseInt(limitParam || '20', 10) || 20, 1), 50);
    const result = await searchWithFallback(query, limit, continuation);

    return Response.json(result);
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
