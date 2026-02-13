'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ChalkboardSimple,
  ArrowBendUpLeft,
  Binoculars,
  ShieldCheck,
  XCircle,
  CaretDown,
} from '@phosphor-icons/react';
import { formatViewCount } from '@/lib/youtube-search';

// --- Types ---

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

type Tab = 'videos' | 'playlists';
type SortOrder = 'latest' | 'popular';

// --- Skeleton components ---

function SkeletonCard() {
  return (
    <div className="bg-chalk-surface/20 border border-chalk-border/20 rounded-xl overflow-hidden animate-pulse">
      <div className="aspect-video bg-chalk-surface/40" />
      <div className="p-3 space-y-2">
        <div className="h-4 bg-chalk-surface/40 rounded w-full" />
        <div className="h-4 bg-chalk-surface/40 rounded w-3/4" />
        <div className="h-3 bg-chalk-surface/40 rounded w-1/2" />
      </div>
    </div>
  );
}

function BannerSkeleton() {
  return <div className="w-full h-[120px] sm:h-[160px] bg-chalk-surface/30 rounded-xl animate-pulse" />;
}

function HeaderSkeleton() {
  return (
    <div className="flex items-center gap-4 animate-pulse">
      <div className="w-14 h-14 sm:w-[72px] sm:h-[72px] rounded-full bg-chalk-surface/40 shrink-0" />
      <div className="space-y-2 flex-1">
        <div className="h-5 bg-chalk-surface/40 rounded w-48" />
        <div className="h-3 bg-chalk-surface/40 rounded w-64" />
        <div className="h-3 bg-chalk-surface/40 rounded w-40" />
      </div>
    </div>
  );
}

// --- Card components ---

function VideoCard({ video }: { video: ChannelVideo }) {
  return (
    <Link
      href={`/watch?v=${video.videoId}`}
      className="group bg-chalk-surface/20 border border-chalk-border/20 rounded-xl overflow-hidden transition-all hover:bg-chalk-surface/40 hover:border-chalk-border/40 hover:scale-[1.02]"
    >
      <div className="relative aspect-video bg-chalk-surface/10">
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
          {video.duration}
        </div>
      </div>
      <div className="p-3 space-y-1.5">
        <h3 className="text-chalk-text text-sm font-medium leading-snug line-clamp-2 group-hover:text-chalk-accent transition-colors">
          {video.title}
        </h3>
        <p className="text-slate-500 text-[10px]">
          {formatViewCount(video.viewCount)} views{video.publishedText ? ` \u00b7 ${video.publishedText}` : ''}
        </p>
      </div>
    </Link>
  );
}

function PlaylistCard({ playlist }: { playlist: ChannelPlaylist }) {
  return (
    <Link
      href={`/playlist/${playlist.playlistId}`}
      className="group bg-chalk-surface/20 border border-chalk-border/20 rounded-xl overflow-hidden transition-all hover:bg-chalk-surface/40 hover:border-chalk-border/40 hover:scale-[1.02]"
    >
      <div className="relative aspect-video bg-chalk-surface/10">
        {playlist.thumbnailUrl ? (
          <img
            src={playlist.thumbnailUrl}
            alt={playlist.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-chalk-surface/30" />
        )}
        {playlist.videoCount && (
          <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
            {playlist.videoCount}
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="text-chalk-text text-sm font-medium leading-snug line-clamp-2 group-hover:text-chalk-accent transition-colors">
          {playlist.title}
        </h3>
      </div>
    </Link>
  );
}

// --- Main page ---

export default function ChannelPage() {
  const params = useParams();
  const channelId = params.id as string;

  // Data state
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [playlists, setPlaylists] = useState<ChannelPlaylist[]>([]);
  const [continuationToken, setContinuationToken] = useState<string | null>(null);

  // UI state
  const [tab, setTab] = useState<Tab>('videos');
  const [sort, setSort] = useState<SortOrder>('latest');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  // Loading state
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const sentinelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Set page title
  useEffect(() => {
    if (channel?.name) {
      document.title = `${channel.name} - chalk`;
    }
    return () => { document.title = 'chalk'; };
  }, [channel?.name]);

  // Fetch data when channelId, tab, or sort changes
  useEffect(() => {
    if (!channelId) return;

    const controller = new AbortController();
    setIsLoading(true);
    setError('');
    setVideos([]);
    setPlaylists([]);
    setContinuationToken(null);

    const params = new URLSearchParams({ id: channelId, tab, sort });
    fetch(`/api/youtube/channel?${params}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load channel');
        return res.json();
      })
      .then((data) => {
        setChannel(data.channel);
        setVideos(data.videos || []);
        setPlaylists(data.playlists || []);
        setContinuationToken(data.continuation || null);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Failed to load channel');
        }
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [channelId, tab, sort]);

  // Load more (infinite scroll)
  const handleLoadMore = useCallback(async () => {
    if (!continuationToken || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const params = new URLSearchParams({
        id: channelId,
        continuation: continuationToken,
        tab,
        sort,
      });
      const res = await fetch(`/api/youtube/channel?${params}`);
      if (!res.ok) throw new Error('Failed to load more');
      const data = await res.json();

      if (tab === 'playlists') {
        setPlaylists((prev) => [...prev, ...(data.playlists || [])]);
      } else {
        setVideos((prev) => [...prev, ...(data.videos || [])]);
      }
      setContinuationToken(data.continuation || null);
    } catch (err) {
      console.error('Load more error:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [channelId, continuationToken, isLoadingMore, tab, sort]);

  // Infinite scroll observer
  useEffect(() => {
    if (!continuationToken || !sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) handleLoadMore();
      },
      { rootMargin: '300px' }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [continuationToken, handleLoadMore]);

  // Filter videos by search query (client-side)
  const filteredVideos = useMemo(() => {
    if (!searchQuery.trim()) return videos;
    const q = searchQuery.toLowerCase();
    return videos.filter((v) => v.title.toLowerCase().includes(q));
  }, [videos, searchQuery]);

  const filteredPlaylists = useMemo(() => {
    if (!searchQuery.trim()) return playlists;
    const q = searchQuery.toLowerCase();
    return playlists.filter((p) => p.title.toLowerCase().includes(q));
  }, [playlists, searchQuery]);

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  // Close sort dropdown on outside click
  useEffect(() => {
    if (!sortOpen) return;
    const handleClick = () => setSortOpen(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [sortOpen]);

  const handleTabChange = (newTab: Tab) => {
    setTab(newTab);
    setSearchQuery('');
    setSearchOpen(false);
  };

  const handleSortChange = (newSort: SortOrder) => {
    setSort(newSort);
    setSortOpen(false);
  };

  // Extract handle from channelUrl
  const handle = channel?.channelUrl
    ? channel.channelUrl.includes('@')
      ? channel.channelUrl.split('@').pop()
        ? `@${channel.channelUrl.split('@').pop()}`
        : undefined
      : undefined
    : undefined;

  return (
    <div className="h-[100dvh] overflow-y-auto bg-chalk-bg">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-chalk-bg/80 backdrop-blur-sm border-b border-chalk-border/20 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="text-slate-400 hover:text-chalk-text transition-colors" aria-label="Back to home">
            <ArrowBendUpLeft size={20} weight="bold" />
          </Link>
          <Link href="/" className="flex items-center gap-1.5 text-chalk-text">
            <ChalkboardSimple size={20} />
            <span className="text-sm font-semibold">chalk</span>
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto">
        {/* Banner */}
        {isLoading ? (
          <div className="px-4 pt-4">
            <BannerSkeleton />
          </div>
        ) : channel?.bannerUrl ? (
          <div className="px-4 pt-4">
            <img
              src={channel.bannerUrl}
              alt=""
              className="w-full h-[120px] sm:h-[160px] object-cover rounded-xl"
            />
          </div>
        ) : (
          <div className="px-4 pt-4">
            <div className="w-full h-[80px] sm:h-[100px] bg-gradient-to-r from-chalk-surface/30 to-chalk-surface/10 rounded-xl" />
          </div>
        )}

        <div className="px-4 py-5">
          {/* Channel header */}
          {isLoading ? (
            <HeaderSkeleton />
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-400 text-sm">{error}</p>
              <Link href="/" className="text-chalk-accent text-xs mt-2 inline-block hover:underline">
                Back to search
              </Link>
            </div>
          ) : channel ? (
            <>
              {/* Avatar + info */}
              <div className="flex items-start gap-4 mb-5">
                {channel.avatarUrl && (
                  <img
                    src={channel.avatarUrl}
                    alt={channel.name}
                    className="w-14 h-14 sm:w-[72px] sm:h-[72px] rounded-full bg-chalk-surface/30 shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h1 className="text-lg sm:text-xl font-bold text-chalk-text truncate">
                      {channel.name}
                    </h1>
                    {channel.isVerified && (
                      <ShieldCheck size={18} weight="fill" className="text-slate-400 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {[
                      handle,
                      channel.subscriberCount,
                      channel.videoCount,
                    ]
                      .filter(Boolean)
                      .join(' \u00b7 ')}
                  </p>
                  {channel.description && (
                    <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 max-w-2xl">
                      {channel.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Tabs + controls */}
              <div className="flex items-center gap-2 mb-4 border-b border-chalk-border/20 pb-3 flex-wrap">
                {/* Tab pills */}
                <div className="flex gap-1 mr-auto">
                  <button
                    onClick={() => handleTabChange('videos')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                      tab === 'videos'
                        ? 'bg-chalk-text text-chalk-bg'
                        : 'text-slate-400 hover:text-chalk-text hover:bg-chalk-surface/30'
                    }`}
                  >
                    Videos
                  </button>
                  <button
                    onClick={() => handleTabChange('playlists')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                      tab === 'playlists'
                        ? 'bg-chalk-text text-chalk-bg'
                        : 'text-slate-400 hover:text-chalk-text hover:bg-chalk-surface/30'
                    }`}
                  >
                    Playlists
                  </button>
                </div>

                {/* Search toggle / input */}
                {searchOpen ? (
                  <div className="flex items-center gap-1.5 bg-chalk-surface/20 border border-chalk-border/30 rounded-full px-3 py-1">
                    <Binoculars size={14} className="text-slate-400 shrink-0" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search this channel..."
                      className="bg-transparent text-xs text-chalk-text placeholder:text-slate-500 outline-none w-32 sm:w-48"
                    />
                    <button
                      onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
                      className="text-slate-400 hover:text-chalk-text"
                    >
                      <XCircle size={12} weight="bold" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setSearchOpen(true)}
                    className="text-slate-400 hover:text-chalk-text p-1.5 rounded-full hover:bg-chalk-surface/30 transition-colors"
                    aria-label="Search this channel"
                  >
                    <Binoculars size={16} weight="bold" />
                  </button>
                )}

                {/* Sort dropdown (videos tab only) */}
                {tab === 'videos' && (
                  <div className="relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); setSortOpen(!sortOpen); }}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-chalk-text px-2 py-1.5 rounded-full hover:bg-chalk-surface/30 transition-colors"
                    >
                      {sort === 'latest' ? 'Latest' : 'Popular'}
                      <CaretDown size={12} />
                    </button>
                    {sortOpen && (
                      <div className="absolute right-0 top-full mt-1 bg-chalk-surface border border-chalk-border/30 rounded-lg shadow-xl py-1 z-10 min-w-[100px]">
                        <button
                          onClick={() => handleSortChange('latest')}
                          className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                            sort === 'latest' ? 'text-chalk-accent' : 'text-chalk-text hover:bg-chalk-surface/50'
                          }`}
                        >
                          Latest
                        </button>
                        <button
                          onClick={() => handleSortChange('popular')}
                          className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                            sort === 'popular' ? 'text-chalk-accent' : 'text-chalk-text hover:bg-chalk-surface/50'
                          }`}
                        >
                          Popular
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Content grid */}
              {tab === 'videos' ? (
                <>
                  {filteredVideos.length === 0 && !isLoadingMore && !isLoading ? (
                    <p className="text-slate-400 text-sm text-center py-8">
                      {searchQuery ? 'No matching videos' : 'No videos found'}
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {filteredVideos.map((video, i) => (
                        <VideoCard key={`${video.videoId}-${i}`} video={video} />
                      ))}
                      {isLoadingMore && Array.from({ length: 4 }).map((_, i) => (
                        <SkeletonCard key={`skeleton-${i}`} />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {filteredPlaylists.length === 0 && !isLoadingMore && !isLoading ? (
                    <p className="text-slate-400 text-sm text-center py-8">
                      {searchQuery ? 'No matching playlists' : 'No playlists found'}
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {filteredPlaylists.map((pl, i) => (
                        <PlaylistCard key={`${pl.playlistId}-${i}`} playlist={pl} />
                      ))}
                      {isLoadingMore && Array.from({ length: 4 }).map((_, i) => (
                        <SkeletonCard key={`skeleton-pl-${i}`} />
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Infinite scroll sentinel */}
              {continuationToken && !searchQuery && (
                <div ref={sentinelRef} className="h-1" />
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
