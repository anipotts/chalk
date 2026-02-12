/**
 * YouTube Channel API Route
 * Fetches channel info and videos using Innertube browse endpoint.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface ChannelInfo {
  name: string;
  subscriberCount?: string;
  avatarUrl?: string;
  description?: string;
}

interface ChannelVideo {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  duration: string;
  viewCount: number;
  publishedText: string;
}

interface ChannelResponse {
  channel: ChannelInfo;
  videos: ChannelVideo[];
  continuation?: string;
}

async function fetchChannelInnertube(channelId: string, continuation?: string): Promise<ChannelResponse> {
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
    body.browseId = channelId;
    // "Videos" tab param
    body.params = 'EgZ2aWRlb3PyBgQKAjoA';
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
    return parseChannelResponse(data, continuation);
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

function parseChannelResponse(data: any, isContinuation?: string): ChannelResponse {
  const channel: ChannelInfo = { name: 'Unknown Channel' };
  const videos: ChannelVideo[] = [];
  let continuationToken: string | undefined;

  if (!isContinuation) {
    // Extract channel metadata from header
    const header = data?.header?.c4TabbedHeaderRenderer
      || data?.header?.pageHeaderRenderer;

    if (header) {
      channel.name = header.title
        || header.pageTitle
        || data?.metadata?.channelMetadataRenderer?.title
        || 'Unknown Channel';

      const subscriberText = header.subscriberCountText?.simpleText;
      if (subscriberText) channel.subscriberCount = subscriberText;

      const avatarThumbs = header.avatar?.thumbnails
        || header.image?.decoratedAvatarViewModel?.avatar?.avatarViewModel?.image?.sources;
      if (avatarThumbs?.length) {
        channel.avatarUrl = avatarThumbs[avatarThumbs.length - 1]?.url;
      }
    }

    // Fallback to metadata renderer
    const metadata = data?.metadata?.channelMetadataRenderer;
    if (metadata) {
      if (!channel.name || channel.name === 'Unknown Channel') {
        channel.name = metadata.title || 'Unknown Channel';
      }
      if (!channel.avatarUrl && metadata.avatar?.thumbnails?.length) {
        channel.avatarUrl = metadata.avatar.thumbnails[0].url;
      }
      channel.description = metadata.description;
    }

    // Parse videos from tabs
    const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs;
    if (Array.isArray(tabs)) {
      for (const tab of tabs) {
        const tabContent = tab?.tabRenderer?.content;
        if (!tabContent) continue;

        const richGrid = tabContent?.richGridRenderer;
        if (!richGrid?.contents) continue;

        for (const item of richGrid.contents) {
          if (item.continuationItemRenderer) {
            continuationToken = item.continuationItemRenderer
              ?.continuationEndpoint?.continuationCommand?.token;
            continue;
          }

          const videoRenderer = item?.richItemRenderer?.content?.videoRenderer;
          if (!videoRenderer?.videoId) continue;

          const parsed = extractVideo(videoRenderer);
          if (parsed) videos.push(parsed);
        }
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

          const videoRenderer = item?.richItemRenderer?.content?.videoRenderer;
          if (!videoRenderer?.videoId) continue;

          const parsed = extractVideo(videoRenderer);
          if (parsed) videos.push(parsed);
        }
      }
    }
  }

  return { channel, videos, continuation: continuationToken };
}

function isShortOrNonVideo(video: any): boolean {
  const navUrl = video.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || '';
  if (navUrl.includes('/shorts/')) return true;
  if (!video.lengthText) return true;
  const durationText = video.lengthText?.simpleText || '';
  if (durationText) {
    const parts = durationText.split(':').map(Number);
    const secs = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2]
      : parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
    if (secs <= 60) return true;
  }
  const overlayStyle = video.thumbnailOverlays?.find(
    (o: any) => o.thumbnailOverlayTimeStatusRenderer?.style === 'SHORTS'
  );
  if (overlayStyle) return true;
  return false;
}

function extractVideo(video: any): ChannelVideo | null {
  if (isShortOrNonVideo(video)) return null;

  const title = video.title?.runs?.map((r: any) => r.text).join('') || 'Untitled';

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

  return { videoId: video.videoId, title, thumbnailUrl, duration, viewCount, publishedText };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const continuation = searchParams.get('continuation') || undefined;

    if (!id) {
      return Response.json({ error: 'Channel ID required' }, { status: 400 });
    }

    const result = await fetchChannelInnertube(id, continuation);
    return Response.json(result);
  } catch (error) {
    console.error('Channel API error:', error);
    return Response.json(
      { error: 'Failed to fetch channel data' },
      { status: 500 }
    );
  }
}
