/**
 * YouTube Search API Route
 * Uses YouTube's Innertube API directly (most reliable), with Piped/Invidious fallback.
 * Supports pagination via continuation tokens.
 * Supports type filtering: video (default), channel, playlist.
 */

import { normalizeInvidiousResults, normalizePipedResults } from '@/lib/youtube-search';
import { cachedSearch } from '@/lib/youtube-cache';

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

// Innertube search filter params (base64-encoded protobuf)
const SEARCH_FILTERS: Record<string, string | undefined> = {
  video: undefined,     // default — no filter
  channel: 'EgIQAg%3D%3D',
  playlist: 'EgIQAw%3D%3D',
};

type SearchType = 'video' | 'channel' | 'playlist';

interface InnertubeVideo {
  type: 'video';
  videoId: string;
  title: string;
  author: string;
  channelId?: string;
  thumbnailUrl: string;
  duration: string;
  viewCount: number;
  publishedText: string;
}

interface InnertubeChannel {
  type: 'channel';
  channelId: string;
  name: string;
  thumbnailUrl: string;
  subscriberCount?: string;
  videoCount?: string;
  description?: string;
}

interface InnertubePlaylist {
  type: 'playlist';
  playlistId: string;
  title: string;
  thumbnailUrl: string;
  videoCount?: string;
  channelName?: string;
  channelId?: string;
}

type InnertubeResult = InnertubeVideo | InnertubeChannel | InnertubePlaylist;

interface InnertubeSearchResult {
  results: InnertubeResult[];
  continuation?: string;
}

/**
 * Search via YouTube Innertube API (direct, no API key, most reliable)
 */
async function searchInnertube(
  query: string,
  limit: number,
  signal: AbortSignal,
  searchType: SearchType = 'video',
  continuation?: string,
): Promise<InnertubeSearchResult> {
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
    // Apply search type filter
    const sp = SEARCH_FILTERS[searchType];
    if (sp) {
      body.params = decodeURIComponent(sp);
    }
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
  return parseInnertubeResponse(data, limit, !!continuation, searchType);
}

/**
 * Parse Innertube's nested response into flat results.
 * Handles both initial search and continuation responses.
 * Supports video, channel, and playlist result types.
 */
function parseInnertubeResponse(
  data: any,
  limit: number,
  isContinuation: boolean,
  searchType: SearchType,
): InnertubeSearchResult {
  const results: InnertubeResult[] = [];
  let continuationToken: string | undefined;

  try {
    if (isContinuation) {
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
          if (results.length >= limit) break;

          const parsed = extractResultFromItem(item, searchType);
          if (parsed) results.push(parsed);
        }
      }
      console.log(`[search] continuation parsed: ${results.length} results, has next: ${!!continuationToken}`);
    } else {
      const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents;

      if (!Array.isArray(contents)) return { results };

      for (const section of contents) {
        if (section.continuationItemRenderer) {
          continuationToken = section.continuationItemRenderer
            ?.continuationEndpoint?.continuationCommand?.token;
          continue;
        }

        const items = section?.itemSectionRenderer?.contents;
        if (!Array.isArray(items)) continue;

        for (const item of items) {
          if (results.length >= limit) break;

          const parsed = extractResultFromItem(item, searchType);
          if (parsed) results.push(parsed);
        }
      }
    }
  } catch {
    // Parse error — return whatever we got
  }

  return { results, continuation: continuationToken };
}

/**
 * Extract a typed result from a search item based on searchType.
 */
function extractResultFromItem(item: any, searchType: SearchType): InnertubeResult | null {
  switch (searchType) {
    case 'channel': {
      const renderer = item?.channelRenderer;
      if (!renderer?.channelId) return null;
      return extractChannelFromRenderer(renderer);
    }
    case 'playlist': {
      // YouTube now returns lockupViewModel for playlist results (2025+)
      const lockup = item?.lockupViewModel;
      if (lockup?.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST' && lockup.contentId) {
        return extractPlaylistFromLockup(lockup);
      }
      // Legacy path: playlistRenderer (may still appear in some responses)
      const renderer = item?.playlistRenderer;
      if (!renderer?.playlistId) return null;
      return extractPlaylistFromRenderer(renderer);
    }
    default: {
      // Video search — try multiple renderer paths
      const video = item?.videoRenderer
        || item?.itemSectionRenderer?.contents?.[0]?.videoRenderer
        || item?.richItemRenderer?.content?.videoRenderer;
      if (!video?.videoId) return null;
      return extractVideoFromRenderer(video);
    }
  }
}

/** Check if a video renderer represents a Short or non-standard video. */
function isShortOrNonVideo(video: any): boolean {
  const navUrl = video.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || '';
  if (navUrl.includes('/shorts/')) return true;

  const badges = video.badges || video.ownerBadges || [];
  for (const badge of badges) {
    const label = badge?.metadataBadgeRenderer?.label || '';
    if (label.toUpperCase().includes('SHORT')) return true;
  }

  if (!video.lengthText) return true;

  const durationText = video.lengthText?.simpleText || '';
  if (durationText && parseDurationSeconds(durationText) <= 60) return true;

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
    type: 'video',
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

function extractChannelFromRenderer(renderer: any): InnertubeChannel | null {
  const channelId = renderer.channelId;
  if (!channelId) return null;

  const name = renderer.title?.simpleText || 'Unknown Channel';

  const thumbnails = renderer.thumbnail?.thumbnails || [];
  let thumbnailUrl = thumbnails[thumbnails.length - 1]?.url || '';
  // Innertube sometimes returns protocol-relative URLs for channel avatars
  if (thumbnailUrl.startsWith('//')) thumbnailUrl = `https:${thumbnailUrl}`;

  const subscriberCount = renderer.subscriberCountText?.simpleText || undefined;
  const videoCount = renderer.videoCountText?.simpleText
    || renderer.videoCountText?.runs?.map((r: any) => r.text).join('')
    || undefined;

  const description = renderer.descriptionSnippet?.runs?.map((r: any) => r.text).join('') || undefined;

  return {
    type: 'channel',
    channelId,
    name,
    thumbnailUrl,
    subscriberCount,
    videoCount,
    description,
  };
}

function extractPlaylistFromRenderer(renderer: any): InnertubePlaylist | null {
  const playlistId = renderer.playlistId;
  if (!playlistId) return null;

  const title = renderer.title?.simpleText || 'Unknown Playlist';

  const thumbnails = renderer.thumbnails?.[0]?.thumbnails
    || renderer.thumbnail?.thumbnails
    || [];
  const thumb = thumbnails[thumbnails.length - 1] || {};
  const thumbnailUrl = thumb.url || '';

  const videoCount = renderer.videoCount || renderer.videoCountShortText?.simpleText || undefined;

  const channelName = renderer.longBylineText?.runs?.[0]?.text
    || renderer.shortBylineText?.runs?.[0]?.text
    || undefined;
  const channelId = renderer.longBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId
    || renderer.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId
    || undefined;

  return {
    type: 'playlist',
    playlistId,
    title,
    thumbnailUrl,
    videoCount,
    channelName,
    channelId,
  };
}

/**
 * Extract playlist info from YouTube's lockupViewModel (new renderer since 2025).
 */
function extractPlaylistFromLockup(lockup: any): InnertubePlaylist | null {
  const playlistId = lockup.contentId;
  if (!playlistId) return null;

  const meta = lockup.metadata?.lockupMetadataViewModel;
  const title = meta?.title?.content || 'Unknown Playlist';

  // Thumbnail from collectionThumbnailViewModel
  const thumbSources = lockup.contentImage?.collectionThumbnailViewModel
    ?.primaryThumbnail?.thumbnailViewModel?.image?.sources || [];
  const thumbnailUrl = thumbSources[thumbSources.length - 1]?.url || '';

  // Video count from overlay badge (e.g., "54 videos", "125 lessons")
  const overlays = lockup.contentImage?.collectionThumbnailViewModel
    ?.primaryThumbnail?.thumbnailViewModel?.overlays || [];
  let videoCount: string | undefined;
  for (const ov of overlays) {
    const badges = ov.thumbnailOverlayBadgeViewModel?.thumbnailBadges || [];
    for (const b of badges) {
      const text = b.thumbnailBadgeViewModel?.text;
      if (text) videoCount = text;
    }
  }

  // Channel info from metadata rows
  const rows = meta?.metadata?.contentMetadataViewModel?.metadataRows || [];
  let channelName: string | undefined;
  let channelId: string | undefined;
  for (const row of rows) {
    for (const part of row.metadataParts || []) {
      const runs = part.text?.commandRuns || [];
      for (const run of runs) {
        const browseId = run.onTap?.innertubeCommand?.browseEndpoint?.browseId;
        if (browseId && !browseId.startsWith('VL') && !channelId) {
          channelName = part.text?.content;
          channelId = browseId;
        }
      }
    }
  }

  return {
    type: 'playlist',
    playlistId,
    title,
    thumbnailUrl,
    videoCount,
    channelName,
    channelId,
  };
}

async function searchPiped(instance: string, query: string, limit: number, signal: AbortSignal, searchType: SearchType) {
  const filter = searchType === 'channel' ? 'channels'
    : searchType === 'playlist' ? 'playlists'
    : 'videos';
  const url = `${instance}/search?q=${encodeURIComponent(query)}&filter=${filter}`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();

  if (searchType === 'video') {
    return normalizePipedResults(data).slice(0, limit);
  }

  // Piped channel/playlist results — normalize minimally
  const items = data?.items || [];
  if (!Array.isArray(items)) return [];

  if (searchType === 'channel') {
    return items.slice(0, limit).map((item: any) => ({
      type: 'channel' as const,
      channelId: item.url?.replace('/channel/', '') || '',
      name: item.name || 'Unknown Channel',
      thumbnailUrl: item.thumbnail || '',
      subscriberCount: item.subscribers ? `${item.subscribers} subscribers` : undefined,
      videoCount: item.videos ? `${item.videos} videos` : undefined,
      description: item.description || undefined,
    })).filter((c: any) => c.channelId);
  }

  // playlist
  return items.slice(0, limit).map((item: any) => ({
    type: 'playlist' as const,
    playlistId: item.url?.split('list=')[1]?.split('&')[0] || '',
    title: item.name || 'Unknown Playlist',
    thumbnailUrl: item.thumbnail || '',
    videoCount: item.videos?.toString() || undefined,
    channelName: item.uploaderName || undefined,
    channelId: item.uploaderUrl?.replace('/channel/', '') || undefined,
  })).filter((p: any) => p.playlistId);
}

async function searchInvidious(instance: string, query: string, limit: number, signal: AbortSignal, searchType: SearchType) {
  const type = searchType === 'channel' ? 'channel'
    : searchType === 'playlist' ? 'playlist'
    : 'video';
  const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=${type}`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();

  if (searchType === 'video') {
    return normalizeInvidiousResults(data).slice(0, limit);
  }

  if (!Array.isArray(data)) return [];

  if (searchType === 'channel') {
    return data.slice(0, limit)
      .filter((item: any) => item.type === 'channel')
      .map((item: any) => ({
        type: 'channel' as const,
        channelId: item.authorId || '',
        name: item.author || 'Unknown Channel',
        thumbnailUrl: item.authorThumbnails?.[item.authorThumbnails.length - 1]?.url || '',
        subscriberCount: item.subCount ? `${item.subCount} subscribers` : undefined,
        videoCount: item.videoCount ? `${item.videoCount} videos` : undefined,
        description: item.description || undefined,
      })).filter((c: any) => c.channelId);
  }

  // playlist
  return data.slice(0, limit)
    .filter((item: any) => item.type === 'playlist')
    .map((item: any) => ({
      type: 'playlist' as const,
      playlistId: item.playlistId || '',
      title: item.title || 'Unknown Playlist',
      thumbnailUrl: item.playlistThumbnail || item.videos?.[0]?.videoThumbnails?.[0]?.url || '',
      videoCount: item.videoCount?.toString() || undefined,
      channelName: item.author || undefined,
      channelId: item.authorId || undefined,
    })).filter((p: any) => p.playlistId);
}

/**
 * Search with cascading fallback: Innertube → Piped → Invidious.
 * Returns results and optional continuation token.
 */
async function searchWithFallback(
  query: string,
  limit: number,
  searchType: SearchType = 'video',
  continuation?: string,
): Promise<{ results: any[]; continuation?: string }> {
  const timeout = 8000;

  // 1. Try Innertube (most reliable, supports continuation)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const result = await searchInnertube(query, limit, controller.signal, searchType, continuation);
    clearTimeout(timeoutId);
    if (result.results.length > 0) return result;
    if (continuation) return { results: [] };
  } catch (err) {
    console.error('Innertube search failed:', err);
    if (continuation) return { results: [] };
  }

  // 2. Try Piped instances
  for (const instance of PIPED_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const results = await searchPiped(instance, query, limit, controller.signal, searchType);
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
      const results = await searchInvidious(instance, query, limit, controller.signal, searchType);
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
    const typeParam = (searchParams.get('type') || 'video') as SearchType;

    if (!query || query.length < 1 || query.length > 200) {
      return Response.json({ error: 'Invalid query' }, { status: 400 });
    }

    // Validate search type
    const searchType: SearchType = ['video', 'channel', 'playlist'].includes(typeParam)
      ? typeParam
      : 'video';

    const limit = Math.min(Math.max(parseInt(limitParam || '20', 10) || 20, 1), 50);

    // Cache initial search requests (not continuations — tokens are unique)
    let result: { results: any[]; continuation?: string };
    if (continuation) {
      result = await searchWithFallback(query, limit, searchType, continuation);
    } else {
      result = await cachedSearch(searchType, query, '0', () =>
        searchWithFallback(query, limit, searchType)
      );
    }

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
