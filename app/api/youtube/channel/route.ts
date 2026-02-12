/**
 * YouTube Channel API Route
 * Fetches channel info and videos using Innertube browse endpoint.
 * Supports sort (latest/popular), tab (videos/playlists), and Redis caching.
 *
 * Sort mechanism: YouTube's new UI uses chipBarViewModel with continuation tokens.
 * - Latest: Initial browse with Videos tab params (default)
 * - Popular: Two-step — fetch Videos tab, extract Popular chip token, then fetch sorted
 */

import { cachedChannelMeta, cachedChannelVideos, cachedChannelPlaylists } from '@/lib/youtube-cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface ChannelInfo {
  name: string;
  subscriberCount?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  description?: string;
  videoCount?: string;
  isVerified?: boolean;
  channelUrl?: string;
}

interface ChannelVideo {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  duration: string;
  viewCount: number;
  publishedText: string;
}

interface ChannelPlaylist {
  playlistId: string;
  title: string;
  thumbnailUrl: string;
  videoCount?: string;
}

interface ChannelResponse {
  channel: ChannelInfo;
  videos: ChannelVideo[];
  playlists?: ChannelPlaylist[];
  continuation?: string;
}

// Videos tab param (latest sort is default)
const VIDEOS_TAB_PARAM = 'EgZ2aWRlb3PyBgQKAjoA';
// Playlists tab param (extracted from real tab endpoint)
const PLAYLISTS_TAB_PARAM = 'EglwbGF5bGlzdHPyBgQKAkIA';

const INNERTUBE_CONTEXT = {
  client: {
    clientName: 'WEB',
    clientVersion: '2.20250101.00.00',
    hl: 'en',
    gl: 'US',
  },
};

async function innertubeRequest(body: Record<string, any>): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://www.youtube.com/youtubei/v1/browse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: INNERTUBE_CONTEXT, ...body }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`Innertube HTTP ${response.status}`);
    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// --- Channel metadata extraction (handles both c4TabbedHeaderRenderer and pageHeaderRenderer) ---

function extractChannelMeta(data: any): ChannelInfo {
  const channel: ChannelInfo = { name: 'Unknown Channel' };

  const c4Header = data?.header?.c4TabbedHeaderRenderer;
  const pageHeader = data?.header?.pageHeaderRenderer;

  if (c4Header) {
    channel.name = c4Header.title || 'Unknown Channel';
    const subscriberText = c4Header.subscriberCountText?.simpleText;
    if (subscriberText) channel.subscriberCount = subscriberText;

    const avatarThumbs = c4Header.avatar?.thumbnails;
    if (avatarThumbs?.length) channel.avatarUrl = avatarThumbs[avatarThumbs.length - 1]?.url;

    const bannerThumbs = c4Header.banner?.thumbnails;
    if (bannerThumbs?.length) {
      const widest = bannerThumbs.reduce((a: any, b: any) => (b.width > a.width ? b : a), bannerThumbs[0]);
      channel.bannerUrl = widest.url;
    }

    const videosCountText = c4Header.videosCountText?.runs?.map((r: any) => r.text).join('')
      || c4Header.videosCountText?.simpleText;
    if (videosCountText) channel.videoCount = videosCountText;

    channel.isVerified = (c4Header.badges || []).some((b: any) =>
      b.metadataBadgeRenderer?.style === 'BADGE_STYLE_TYPE_VERIFIED'
      || b.metadataBadgeRenderer?.style === 'BADGE_STYLE_TYPE_VERIFIED_ARTIST'
    );

    const handleText = c4Header.channelHandleText?.runs?.[0]?.text;
    if (handleText) channel.channelUrl = handleText;
  } else if (pageHeader) {
    // New pageHeaderRenderer format (2025+)
    channel.name = pageHeader.pageTitle || 'Unknown Channel';

    // Avatar from decoratedAvatarViewModel
    const avatarSources = pageHeader.image?.decoratedAvatarViewModel?.avatar?.avatarViewModel?.image?.sources;
    if (avatarSources?.length) channel.avatarUrl = avatarSources[avatarSources.length - 1]?.url;

    // Banner from pageHeaderViewModel
    const phvm = pageHeader.content?.pageHeaderViewModel;
    const bannerSources = phvm?.banner?.imageBannerViewModel?.image?.sources;
    if (bannerSources?.length) {
      const widest = bannerSources.reduce((a: any, b: any) => ((b.width || 0) > (a.width || 0) ? b : a), bannerSources[0]);
      channel.bannerUrl = widest.url;
    }

    // Metadata rows: row 0 = handle, row 1 = subscriber count + video count
    const rows = phvm?.metadata?.contentMetadataViewModel?.metadataRows || [];
    for (let i = 0; i < rows.length; i++) {
      const parts = rows[i].metadataParts || [];
      for (let j = 0; j < parts.length; j++) {
        const text = parts[j]?.text?.content || '';
        if (!text) continue;

        if (text.startsWith('@')) {
          channel.channelUrl = text;
        } else if (text.includes('subscriber')) {
          channel.subscriberCount = text;
        } else if (text.includes('video')) {
          channel.videoCount = text;
        }
      }
    }

    // Description from descriptionPreviewViewModel
    const descText = phvm?.description?.descriptionPreviewViewModel?.description?.content;
    if (descText) channel.description = descText;

    // Verified badge from avatar badges
    const badges = pageHeader.image?.decoratedAvatarViewModel?.badges || [];
    channel.isVerified = badges.some((b: any) => {
      const style = b.avatarBadgeRenderer?.style;
      return style === 'AVATAR_BADGE_STYLE_VERIFIED' || style === 'AVATAR_BADGE_STYLE_VERIFIED_ARTIST';
    });
    // Also check metadata badges
    if (!channel.isVerified) {
      const titleBadges = phvm?.title?.dynamicTextViewModel?.text?.attachmentRuns || [];
      channel.isVerified = titleBadges.some((r: any) =>
        r.element?.type?.imageType?.image?.sources?.some((s: any) =>
          s.clientResource?.imageName?.includes('VERIFIED') ||
          s.clientResource?.imageName?.includes('CHECK_CIRCLE')
        )
      );
    }
  }

  // Fallback: metadata renderer (always present)
  const metadata = data?.metadata?.channelMetadataRenderer;
  if (metadata) {
    if (!channel.name || channel.name === 'Unknown Channel') {
      channel.name = metadata.title || 'Unknown Channel';
    }
    if (!channel.avatarUrl && metadata.avatar?.thumbnails?.length) {
      channel.avatarUrl = metadata.avatar.thumbnails[0].url;
    }
    if (!channel.description) {
      channel.description = metadata.description;
    }
    if (!channel.channelUrl) {
      channel.channelUrl = metadata.vanityChannelUrl || metadata.channelUrl;
    }
  }

  return channel;
}

// --- Videos tab ---

async function fetchChannelVideosLatest(channelId: string): Promise<ChannelResponse> {
  const data = await innertubeRequest({ browseId: channelId, params: VIDEOS_TAB_PARAM });
  const channel = extractChannelMeta(data);
  const { videos, continuation } = extractVideosFromTabs(data);
  return { channel, videos, continuation };
}

async function fetchChannelVideosPopular(channelId: string): Promise<ChannelResponse> {
  // Step 1: Fetch Videos tab to get chip tokens
  const data = await innertubeRequest({ browseId: channelId, params: VIDEOS_TAB_PARAM });
  const channel = extractChannelMeta(data);

  // Step 2: Find "Popular" chip continuation token
  const popularToken = extractSortChipToken(data, 'Popular');
  if (!popularToken) {
    // Fallback: return latest if Popular chip not found
    const { videos, continuation } = extractVideosFromTabs(data);
    return { channel, videos, continuation };
  }

  // Step 3: Fetch with Popular token
  const sortedData = await innertubeRequest({ continuation: popularToken });
  const { videos, continuation } = extractVideosFromReload(sortedData);
  return { channel, videos, continuation };
}

function extractSortChipToken(data: any, chipLabel: string): string | undefined {
  const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs;
  if (!Array.isArray(tabs)) return undefined;

  for (const t of tabs) {
    const rgr = t?.tabRenderer?.content?.richGridRenderer;
    if (!rgr) continue;

    const chips = rgr.header?.chipBarViewModel?.chips || [];
    for (const chip of chips) {
      const cvm = chip.chipViewModel;
      if (cvm?.text === chipLabel) {
        return cvm.tapCommand?.innertubeCommand?.continuationCommand?.token;
      }
    }
  }
  return undefined;
}

function extractVideosFromTabs(data: any): { videos: ChannelVideo[]; continuation?: string } {
  const videos: ChannelVideo[] = [];
  let continuation: string | undefined;

  const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs;
  if (!Array.isArray(tabs)) return { videos };

  for (const t of tabs) {
    const rgr = t?.tabRenderer?.content?.richGridRenderer;
    if (!rgr?.contents) continue;

    for (const item of rgr.contents) {
      if (item.continuationItemRenderer) {
        continuation = item.continuationItemRenderer
          ?.continuationEndpoint?.continuationCommand?.token;
        continue;
      }
      const vr = item?.richItemRenderer?.content?.videoRenderer;
      if (!vr?.videoId) continue;
      const parsed = extractVideo(vr);
      if (parsed) videos.push(parsed);
    }
  }

  return { videos, continuation };
}

/**
 * Parse a reloadContinuationItemsCommand response (used by sort chips).
 * The BODY slot contains richItemRenderer items, possibly nested in a richGridRenderer.
 */
function extractVideosFromReload(data: any): { videos: ChannelVideo[]; continuation?: string } {
  const videos: ChannelVideo[] = [];
  let continuation: string | undefined;

  const actions = data?.onResponseReceivedActions || [];
  for (const action of actions) {
    const reload = action.reloadContinuationItemsCommand;
    if (!reload) continue;

    // We want the BODY slot (not HEADER which contains chip bar)
    if (reload.slot === 'RELOAD_CONTINUATION_SLOT_HEADER') continue;

    const items = reload.continuationItems || [];
    for (const item of items) {
      if (item.continuationItemRenderer) {
        continuation = item.continuationItemRenderer
          ?.continuationEndpoint?.continuationCommand?.token;
        continue;
      }

      // Items can be richItemRenderer directly or inside a richGridRenderer
      const vr = item?.richItemRenderer?.content?.videoRenderer;
      if (vr?.videoId) {
        const parsed = extractVideo(vr);
        if (parsed) videos.push(parsed);
        continue;
      }

      // Nested richGridRenderer
      const nestedContents = item?.richGridRenderer?.contents;
      if (Array.isArray(nestedContents)) {
        for (const nested of nestedContents) {
          if (nested.continuationItemRenderer) {
            continuation = nested.continuationItemRenderer
              ?.continuationEndpoint?.continuationCommand?.token;
            continue;
          }
          const nvr = nested?.richItemRenderer?.content?.videoRenderer;
          if (nvr?.videoId) {
            const parsed = extractVideo(nvr);
            if (parsed) videos.push(parsed);
          }
        }
      }
    }
  }

  return { videos, continuation };
}

// --- Continuation (load more) ---

async function fetchContinuation(token: string): Promise<ChannelResponse> {
  const data = await innertubeRequest({ continuation: token });
  const channel: ChannelInfo = { name: 'Unknown Channel' };
  const videos: ChannelVideo[] = [];
  const playlists: ChannelPlaylist[] = [];
  let continuation: string | undefined;

  const actions = data?.onResponseReceivedActions || [];
  for (const action of actions) {
    // appendContinuationItemsAction — standard infinite scroll
    const append = action.appendContinuationItemsAction;
    if (append) {
      for (const item of append.continuationItems || []) {
        if (item.continuationItemRenderer) {
          continuation = item.continuationItemRenderer
            ?.continuationEndpoint?.continuationCommand?.token;
          continue;
        }

        // Video items
        const vr = item?.richItemRenderer?.content?.videoRenderer;
        if (vr?.videoId) {
          const parsed = extractVideo(vr);
          if (parsed) videos.push(parsed);
          continue;
        }

        // Playlist items (gridPlaylistRenderer in continuation)
        const gpr = item?.gridPlaylistRenderer;
        if (gpr) {
          const pl = extractPlaylist(gpr);
          if (pl) playlists.push(pl);
          continue;
        }

        // Lockup playlists in continuation
        const lockup = item?.lockupViewModel || item?.richItemRenderer?.content?.lockupViewModel;
        if (lockup?.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST' && lockup.contentId) {
          const pl = extractPlaylistFromLockup(lockup);
          if (pl) playlists.push(pl);
        }
      }
    }

    // reloadContinuationItemsCommand — sort chip responses
    const reload = action.reloadContinuationItemsCommand;
    if (reload && reload.slot !== 'RELOAD_CONTINUATION_SLOT_HEADER') {
      for (const item of reload.continuationItems || []) {
        if (item.continuationItemRenderer) {
          continuation = item.continuationItemRenderer
            ?.continuationEndpoint?.continuationCommand?.token;
          continue;
        }
        const vr = item?.richItemRenderer?.content?.videoRenderer;
        if (vr?.videoId) {
          const parsed = extractVideo(vr);
          if (parsed) videos.push(parsed);
        }
      }
    }
  }

  return { channel, videos, playlists: playlists.length > 0 ? playlists : undefined, continuation };
}

// --- Playlists tab ---

async function fetchChannelPlaylists(channelId: string): Promise<ChannelResponse> {
  const data = await innertubeRequest({ browseId: channelId, params: PLAYLISTS_TAB_PARAM });
  const channel = extractChannelMeta(data);
  const playlists: ChannelPlaylist[] = [];
  let continuation: string | undefined;

  const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs;
  if (Array.isArray(tabs)) {
    for (const t of tabs) {
      const tabContent = t?.tabRenderer?.content;
      if (!tabContent) continue;

      // Playlists use sectionListRenderer > itemSectionRenderer > gridRenderer
      const sections = tabContent?.sectionListRenderer?.contents;
      if (Array.isArray(sections)) {
        for (const section of sections) {
          const gridItems = section?.itemSectionRenderer?.contents?.[0]?.gridRenderer?.items;
          if (Array.isArray(gridItems)) {
            for (const item of gridItems) {
              if (item.continuationItemRenderer) {
                continuation = item.continuationItemRenderer
                  ?.continuationEndpoint?.continuationCommand?.token;
                continue;
              }
              // gridPlaylistRenderer (legacy)
              const gpr = item?.gridPlaylistRenderer;
              if (gpr) {
                const pl = extractPlaylist(gpr);
                if (pl) playlists.push(pl);
                continue;
              }
              // lockupViewModel (2025+)
              const lockup = item?.lockupViewModel;
              if (lockup?.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST' && lockup.contentId) {
                const pl = extractPlaylistFromLockup(lockup);
                if (pl) playlists.push(pl);
              }
            }
          }
        }
      }
    }
  }

  return { channel, videos: [], playlists, continuation };
}

// --- Item extractors ---

function extractPlaylist(renderer: any): ChannelPlaylist | null {
  if (!renderer?.playlistId) return null;

  const title = renderer.title?.simpleText
    || renderer.title?.runs?.map((r: any) => r.text).join('')
    || 'Unknown Playlist';

  const thumbnails = renderer.thumbnail?.thumbnails || [];
  const thumb = thumbnails[thumbnails.length - 1];
  const thumbnailUrl = thumb?.url || '';

  const videoCount = renderer.videoCountShortText?.simpleText
    || renderer.videoCountText?.runs?.map((r: any) => r.text).join('')
    || undefined;

  return { playlistId: renderer.playlistId, title, thumbnailUrl, videoCount };
}

function extractPlaylistFromLockup(lockup: any): ChannelPlaylist | null {
  const playlistId = lockup.contentId;
  if (!playlistId) return null;

  const meta = lockup.metadata?.lockupMetadataViewModel;
  const title = meta?.title?.content || 'Unknown Playlist';

  const thumbSources = lockup.contentImage?.collectionThumbnailViewModel
    ?.primaryThumbnail?.thumbnailViewModel?.image?.sources || [];
  const thumbnailUrl = thumbSources[thumbSources.length - 1]?.url || '';

  let videoCount: string | undefined;
  const overlays = lockup.contentImage?.collectionThumbnailViewModel
    ?.primaryThumbnail?.thumbnailViewModel?.overlays || [];
  for (const ov of overlays) {
    const badges = ov.thumbnailOverlayBadgeViewModel?.thumbnailBadges || [];
    for (const b of badges) {
      const text = b.thumbnailBadgeViewModel?.text;
      if (text) videoCount = text;
    }
  }

  return { playlistId, title, thumbnailUrl, videoCount };
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

// --- Route handler ---

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const continuation = searchParams.get('continuation') || undefined;
    const sort = searchParams.get('sort') || 'latest';
    const tab = searchParams.get('tab') || 'videos';

    if (!id) {
      return Response.json({ error: 'Channel ID required' }, { status: 400 });
    }

    // Continuation requests (infinite scroll) — bypass top-level caching
    if (continuation) {
      const result = await fetchContinuation(continuation);
      return Response.json(result);
    }

    // Playlists tab
    if (tab === 'playlists') {
      const result = await cachedChannelPlaylists(id, () => fetchChannelPlaylists(id));
      return Response.json(result);
    }

    // Videos tab
    if (sort === 'popular') {
      const result = await cachedChannelVideos(id, 'popular', '0', () =>
        fetchChannelVideosPopular(id)
      );
      return Response.json(result);
    }

    // Default: latest
    const result = await cachedChannelVideos(id, 'latest', '0', () =>
      fetchChannelVideosLatest(id)
    );

    // Warm the meta cache
    if (result.channel?.name && result.channel.name !== 'Unknown Channel') {
      cachedChannelMeta(id, async () => result.channel);
    }

    return Response.json(result);
  } catch (error) {
    console.error('Channel API error:', error);
    return Response.json(
      { error: 'Failed to fetch channel data' },
      { status: 500 }
    );
  }
}
