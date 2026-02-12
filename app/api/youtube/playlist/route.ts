/**
 * YouTube Playlist API Route
 * Fetches playlist info and videos using Innertube browse endpoint.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface PlaylistInfo {
  title: string;
  description?: string;
  videoCount?: string;
  channelName?: string;
  channelId?: string;
  thumbnailUrl?: string;
}

interface PlaylistVideo {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  duration: string;
  author: string;
  channelId?: string;
  index: number;
}

interface PlaylistResponse {
  playlist: PlaylistInfo;
  videos: PlaylistVideo[];
  continuation?: string;
}

async function fetchPlaylistInnertube(playlistId: string, continuation?: string): Promise<PlaylistResponse> {
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
    // Innertube uses "VL" prefix for playlist browse IDs
    body.browseId = playlistId.startsWith('VL') ? playlistId : `VL${playlistId}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch('https://www.youtube.com/youtubei/v1/browse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`Innertube HTTP ${response.status}`);

    const data = await response.json();
    return parsePlaylistResponse(data, continuation);
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

function parsePlaylistResponse(data: any, isContinuation?: string): PlaylistResponse {
  const playlist: PlaylistInfo = { title: 'Unknown Playlist' };
  const videos: PlaylistVideo[] = [];
  let continuationToken: string | undefined;

  if (!isContinuation) {
    // Extract playlist metadata from header
    const header = data?.header?.playlistHeaderRenderer;

    if (header) {
      playlist.title = header.title?.simpleText || 'Unknown Playlist';
      playlist.description = header.descriptionText?.simpleText || undefined;

      const statsTexts = header.stats || [];
      if (statsTexts.length > 0) {
        playlist.videoCount = statsTexts[0]?.runs?.map((r: any) => r.text).join('') || undefined;
      }

      const ownerText = header.ownerText?.runs?.[0];
      if (ownerText) {
        playlist.channelName = ownerText.text;
        playlist.channelId = ownerText.navigationEndpoint?.browseEndpoint?.browseId;
      }

      const thumbs = header.playlistHeaderBanner?.heroPlaylistThumbnailRenderer?.thumbnail?.thumbnails;
      if (thumbs?.length) {
        playlist.thumbnailUrl = thumbs[thumbs.length - 1]?.url;
      }
    }

    // Fallback to microformat metadata
    const microformat = data?.microformat?.microformatDataRenderer;
    if (microformat) {
      if (!playlist.title || playlist.title === 'Unknown Playlist') {
        playlist.title = microformat.title || 'Unknown Playlist';
      }
      if (!playlist.description) {
        playlist.description = microformat.description;
      }
      if (!playlist.thumbnailUrl && microformat.thumbnail?.thumbnails?.length) {
        playlist.thumbnailUrl = microformat.thumbnail.thumbnails[0]?.url;
      }
    }

    // Parse videos from content
    const contents = data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]
      ?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]
      ?.itemSectionRenderer?.contents?.[0]
      ?.playlistVideoListRenderer?.contents;

    if (Array.isArray(contents)) {
      for (const item of contents) {
        if (item.continuationItemRenderer) {
          continuationToken = item.continuationItemRenderer
            ?.continuationEndpoint?.continuationCommand?.token;
          continue;
        }

        const video = item?.playlistVideoRenderer;
        if (!video?.videoId) continue;

        const parsed = extractPlaylistVideo(video);
        if (parsed) videos.push(parsed);
      }
    }
  } else {
    // Continuation response
    const actions = data?.onResponseReceivedActions;
    if (Array.isArray(actions)) {
      for (const action of actions) {
        const items = action?.appendContinuationItemsAction?.continuationItems;
        if (!Array.isArray(items)) continue;

        for (const item of items) {
          if (item.continuationItemRenderer) {
            continuationToken = item.continuationItemRenderer
              ?.continuationEndpoint?.continuationCommand?.token;
            continue;
          }

          const video = item?.playlistVideoRenderer;
          if (!video?.videoId) continue;

          const parsed = extractPlaylistVideo(video);
          if (parsed) videos.push(parsed);
        }
      }
    }
  }

  return { playlist, videos, continuation: continuationToken };
}

function extractPlaylistVideo(video: any): PlaylistVideo | null {
  const title = video.title?.runs?.map((r: any) => r.text).join('')
    || video.title?.simpleText
    || 'Untitled';

  const thumbnails = video.thumbnail?.thumbnails || [];
  const thumb = thumbnails.find((t: any) => t.width >= 300)
    || thumbnails[thumbnails.length - 1]
    || {};
  const thumbnailUrl = thumb.url || `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`;

  const duration = video.lengthText?.simpleText || '0:00';

  const author = video.shortBylineText?.runs?.[0]?.text || 'Unknown';
  const channelId = video.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId;

  const index = parseInt(video.index?.simpleText || '0', 10);

  // Skip unavailable videos
  if (video.isPlayable === false) return null;

  return { videoId: video.videoId, title, thumbnailUrl, duration, author, channelId, index };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const continuation = searchParams.get('continuation') || undefined;

    if (!id) {
      return Response.json({ error: 'Playlist ID required' }, { status: 400 });
    }

    const result = await fetchPlaylistInnertube(id, continuation);
    return Response.json(result);
  } catch (error) {
    console.error('Playlist API error:', error);
    return Response.json(
      { error: 'Failed to fetch playlist data' },
      { status: 500 }
    );
  }
}
