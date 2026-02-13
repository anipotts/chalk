'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ChalkboardSimple,
  ArrowBendUpLeft,
  Binoculars,
  ShieldCheck,
  XCircle,
  CaretDown,
} from '@phosphor-icons/react';
import { formatViewCount } from '@/lib/youtube-search';

// --- SVG Icon Helpers ---

const ClockIcon = () => (
  <svg className="w-3 h-3 text-slate-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 4.5V8l2.5 1.5" strokeLinecap="round" />
  </svg>
);

const EyeIcon = () => (
  <svg className="w-3 h-3 text-slate-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z" />
    <circle cx="8" cy="8" r="2" />
  </svg>
);

const CalendarIcon = () => (
  <svg className="w-3 h-3 text-slate-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="3" width="12" height="11" rx="1.5" />
    <path d="M2 6.5h12M5.5 2v2.5M10.5 2v2.5" strokeLinecap="round" />
  </svg>
);

const UsersIcon = () => (
  <svg className="w-3 h-3 text-slate-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="6" cy="5.5" r="2.5" />
    <path d="M1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" strokeLinecap="round" />
    <circle cx="11.5" cy="5.5" r="2" />
    <path d="M14.5 13.5c0-2 1-3 0-3" strokeLinecap="round" />
  </svg>
);

const ListIcon = () => (
  <svg className="w-3 h-3 text-white/90" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M2 4h12M2 8h12M2 12h12" strokeLinecap="round" />
  </svg>
);

const VideoIcon = () => (
  <svg className="w-3 h-3 text-slate-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="1.5" y="3" width="13" height="10" rx="1.5" />
    <path d="M6.5 6l3.5 2-3.5 2V6z" fill="currentColor" stroke="none" />
  </svg>
);

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

// --- Animation variants ---

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.05,
      duration: 0.3,
      ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
    },
  }),
};

const headerVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  },
};

// --- Card components ---

function VideoCard({ video, index }: { video: ChannelVideo; index: number }) {
  return (
    <motion.div
      custom={index}
      variants={itemVariants}
      initial="hidden"
      animate="visible"
    >
      <Link
        href={`/watch?v=${video.videoId}`}
        className="group block rounded-xl p-2 transition-all duration-200 hover:bg-chalk-surface/40"
      >
        <div className="relative aspect-video bg-chalk-surface/10 rounded-lg overflow-hidden">
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {video.duration && (
            <div className="absolute bottom-1.5 right-1.5 bg-black/60 backdrop-blur-sm rounded-md px-1.5 py-0.5 text-[11px] font-mono font-medium text-white/90">
              {video.duration}
            </div>
          )}
        </div>
        <div className="mt-2.5 space-y-1.5">
          <h3 className="text-sm font-semibold text-chalk-text leading-snug line-clamp-2 group-hover:text-chalk-accent transition-colors">
            {video.title}
          </h3>
          <div className="flex items-center gap-3 flex-wrap">
            {video.viewCount > 0 && (
              <span className="flex items-center gap-1 font-mono text-[11px] text-slate-500">
                <EyeIcon />
                {formatViewCount(video.viewCount)}
              </span>
            )}
            {video.duration && (
              <span className="flex items-center gap-1 font-mono text-[11px] text-slate-500">
                <ClockIcon />
                {video.duration}
              </span>
            )}
            {video.publishedText && (
              <span className="flex items-center gap-1 font-mono text-[11px] text-slate-500">
                <CalendarIcon />
                {video.publishedText}
              </span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function PlaylistCard({ playlist, index }: { playlist: ChannelPlaylist; index: number }) {
  return (
    <motion.div
      custom={index}
      variants={itemVariants}
      initial="hidden"
      animate="visible"
    >
      <Link
        href={`/playlist/${playlist.playlistId}`}
        className="group block rounded-xl p-2 transition-all duration-200 hover:bg-chalk-surface/40"
      >
        {/* Stacked thumbnail effect */}
        <div className="relative">
          <div className="absolute top-0 left-0 right-0 aspect-video rounded-lg bg-chalk-surface/10 transform translate-y-[-6px] translate-x-[4px] scale-[0.96] opacity-30" />
          <div className="absolute top-0 left-0 right-0 aspect-video rounded-lg bg-chalk-surface/20 transform translate-y-[-3px] translate-x-[2px] scale-[0.98] opacity-60" />
          <div className="relative aspect-video bg-chalk-surface/10 rounded-lg overflow-hidden">
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
              <div className="absolute bottom-1.5 right-1.5 bg-black/60 backdrop-blur-sm rounded-md px-1.5 py-0.5 flex items-center gap-1">
                <ListIcon />
                <span className="font-mono text-[11px] font-medium text-white/90">
                  {playlist.videoCount}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="mt-2.5">
          <h3 className="text-sm font-semibold text-chalk-text leading-snug line-clamp-2 group-hover:text-chalk-accent transition-colors">
            {playlist.title}
          </h3>
        </div>
      </Link>
    </motion.div>
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
          <div className="px-6 pt-6">
            <div className="w-full h-[120px] sm:h-[160px] bg-chalk-surface/20 rounded-xl animate-pulse" />
          </div>
        ) : channel?.bannerUrl ? (
          <div className="px-6 pt-6">
            <div className="rounded-xl overflow-hidden">
              <img
                src={channel.bannerUrl}
                alt=""
                className="w-full h-[120px] sm:h-[160px] object-cover"
              />
            </div>
          </div>
        ) : (
          <div className="px-6 pt-6">
            <div className="w-full h-[80px] sm:h-[100px] bg-gradient-to-r from-chalk-surface/30 to-chalk-surface/10 rounded-xl" />
          </div>
        )}

        <div className="px-6 py-6">
          {/* Channel header */}
          {isLoading ? (
            <div className="flex items-center gap-4 animate-pulse">
              <div className="w-20 h-20 rounded-full bg-chalk-surface/20 shrink-0" />
              <div className="space-y-2 flex-1">
                <div className="h-6 bg-chalk-surface/20 rounded w-48" />
                <div className="h-3 bg-chalk-surface/20 rounded w-64" />
              </div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-400 text-sm">{error}</p>
              <Link href="/" className="text-chalk-accent text-xs mt-2 inline-block hover:underline">
                Back to search
              </Link>
            </div>
          ) : channel ? (
            <>
              {/* Avatar + info — overlapping banner */}
              <motion.div
                variants={headerVariants}
                initial="hidden"
                animate="visible"
                className="flex items-start gap-4 mb-6 -mt-10 relative z-10"
              >
                {channel.avatarUrl ? (
                  <img
                    src={channel.avatarUrl}
                    alt={channel.name}
                    className="w-20 h-20 rounded-full bg-chalk-surface/30 shrink-0 ring-4 ring-chalk-bg"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-chalk-surface/40 shrink-0 ring-4 ring-chalk-bg flex items-center justify-center text-slate-500 text-xl font-bold">
                    {channel.name.charAt(0)}
                  </div>
                )}
                <div className="min-w-0 flex-1 pt-6">
                  <div className="flex items-center gap-1.5">
                    <h1 className="text-2xl font-bold text-chalk-text truncate">
                      {channel.name}
                    </h1>
                    {channel.isVerified && (
                      <ShieldCheck size={18} weight="fill" className="text-slate-400 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1.5">
                    {handle && (
                      <span className="font-mono text-sm text-slate-500">{handle}</span>
                    )}
                    {channel.subscriberCount && (
                      <span className="flex items-center gap-1 font-mono text-sm text-slate-500">
                        <UsersIcon />
                        {channel.subscriberCount}
                      </span>
                    )}
                    {channel.videoCount && (
                      <span className="flex items-center gap-1 font-mono text-sm text-slate-500">
                        <VideoIcon />
                        {channel.videoCount}
                      </span>
                    )}
                  </div>
                  {channel.description && (
                    <p className="text-xs text-slate-400 mt-2 line-clamp-2 max-w-2xl leading-relaxed">
                      {channel.description}
                    </p>
                  )}
                </div>
              </motion.div>

              {/* Tabs + controls */}
              <div className="flex items-center gap-2 mb-6 flex-wrap">
                {/* Underlined tabs */}
                <div className="flex gap-6 mr-auto">
                  <button
                    onClick={() => handleTabChange('videos')}
                    className={`relative pb-2 text-sm font-medium transition-colors ${
                      tab === 'videos'
                        ? 'text-chalk-text font-semibold'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    Videos
                    {tab === 'videos' && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-chalk-accent rounded-full" />
                    )}
                  </button>
                  <button
                    onClick={() => handleTabChange('playlists')}
                    className={`relative pb-2 text-sm font-medium transition-colors ${
                      tab === 'playlists'
                        ? 'text-chalk-text font-semibold'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    Playlists
                    {tab === 'playlists' && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-chalk-accent rounded-full" />
                    )}
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
                    className="text-slate-400 hover:text-chalk-text p-1.5 rounded-lg hover:bg-chalk-surface/30 transition-colors"
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
                      className="flex items-center gap-1.5 bg-chalk-surface border border-chalk-border/30 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-400 hover:text-chalk-text transition-colors"
                    >
                      {sort === 'latest' ? 'Latest' : 'Popular'}
                      <CaretDown size={12} />
                    </button>
                    {sortOpen && (
                      <div className="absolute right-0 top-full mt-1 bg-chalk-surface border border-chalk-border/30 rounded-lg shadow-xl py-1 z-10 min-w-[100px]">
                        <button
                          onClick={() => handleSortChange('latest')}
                          className={`w-full text-left px-3 py-1.5 text-xs font-mono transition-colors ${
                            sort === 'latest' ? 'text-chalk-accent' : 'text-chalk-text hover:bg-white/[0.04]'
                          }`}
                        >
                          Latest
                        </button>
                        <button
                          onClick={() => handleSortChange('popular')}
                          className={`w-full text-left px-3 py-1.5 text-xs font-mono transition-colors ${
                            sort === 'popular' ? 'text-chalk-accent' : 'text-chalk-text hover:bg-white/[0.04]'
                          }`}
                        >
                          Popular
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Separator */}
              <div className="border-b border-chalk-border/10 mb-6" />

              {/* Content grid */}
              {tab === 'videos' ? (
                <>
                  {filteredVideos.length === 0 && !isLoadingMore && !isLoading ? (
                    <p className="text-slate-400 text-sm text-center py-8">
                      {searchQuery ? 'No matching videos' : 'No videos found'}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {filteredVideos.map((video, i) => (
                        <VideoCard key={`${video.videoId}-${i}`} video={video} index={i} />
                      ))}
                      {isLoadingMore && Array.from({ length: 4 }).map((_, i) => (
                        <div key={`skeleton-${i}`} className="rounded-xl p-2">
                          <div className="aspect-video bg-chalk-surface/20 rounded-lg animate-pulse opacity-50" />
                          <div className="mt-2.5 space-y-2">
                            <div className="h-4 bg-chalk-surface/20 rounded w-full animate-pulse opacity-50" />
                            <div className="h-3 bg-chalk-surface/20 rounded w-3/4 animate-pulse opacity-50" />
                          </div>
                        </div>
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {filteredPlaylists.map((pl, i) => (
                        <PlaylistCard key={`${pl.playlistId}-${i}`} playlist={pl} index={i} />
                      ))}
                      {isLoadingMore && Array.from({ length: 4 }).map((_, i) => (
                        <div key={`skeleton-pl-${i}`} className="rounded-xl p-2">
                          <div className="aspect-video bg-chalk-surface/20 rounded-lg animate-pulse opacity-50" />
                          <div className="mt-2.5 space-y-2">
                            <div className="h-4 bg-chalk-surface/20 rounded w-full animate-pulse opacity-50" />
                          </div>
                        </div>
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
