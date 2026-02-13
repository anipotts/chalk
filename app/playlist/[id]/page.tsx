'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ChalkboardSimple, ArrowBendUpLeft } from '@phosphor-icons/react';

// --- SVG Icon Helpers ---

const ClockIcon = () => (
  <svg className="w-3 h-3 text-slate-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 4.5V8l2.5 1.5" strokeLinecap="round" />
  </svg>
);

const ListIcon = () => (
  <svg className="w-3.5 h-3.5 text-slate-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M2 4h12M2 8h12M2 12h12" strokeLinecap="round" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg className="w-3 h-3 text-slate-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// --- Types ---

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

// --- Animation variants ---

const rowVariants = {
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

// --- Video Row (Chapter) ---

function VideoRow({ video, index, playlistChannel }: { video: PlaylistVideo; index: number; playlistChannel?: string }) {
  const showChannel = playlistChannel ? video.author !== playlistChannel : false;

  return (
    <motion.div
      custom={index}
      variants={rowVariants}
      initial="hidden"
      animate="visible"
    >
      <Link
        href={`/watch?v=${video.videoId}`}
        className="group flex items-start gap-3 py-3 px-3 rounded-xl transition-all duration-200 hover:bg-white/[0.03]"
      >
        {/* Chapter number with timeline */}
        <div className="relative flex flex-col items-center shrink-0 w-8 pt-1">
          <div className="w-8 h-8 rounded-full bg-chalk-surface border border-chalk-border/30 flex items-center justify-center">
            <span className="font-mono text-sm font-semibold text-slate-400">{index + 1}</span>
          </div>
        </div>

        {/* Thumbnail */}
        <div className="relative shrink-0 w-[120px] aspect-video bg-chalk-surface/10 rounded-lg overflow-hidden">
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {video.duration && (
            <div className="absolute bottom-1 right-1 bg-black/60 backdrop-blur-sm rounded-md px-1.5 py-0.5 text-[10px] font-mono font-medium text-white/90">
              {video.duration}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 py-0.5">
          <h3 className="text-sm font-medium text-chalk-text leading-snug line-clamp-2 group-hover:text-chalk-accent transition-colors">
            {video.title}
          </h3>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="flex items-center gap-1 font-mono text-[11px] text-slate-500">
              <ClockIcon />
              {video.duration}
            </span>
            {showChannel && (
              <span className="text-xs text-slate-400 truncate">{video.author}</span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// --- Main Page ---

export default function PlaylistPage() {
  const params = useParams();
  const playlistId = params.id as string;

  const [playlist, setPlaylist] = useState<PlaylistInfo | null>(null);
  const [videos, setVideos] = useState<PlaylistVideo[]>([]);
  const [continuationToken, setContinuationToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [descExpanded, setDescExpanded] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);

  // Set page title when playlist loads
  useEffect(() => {
    if (playlist?.title) {
      document.title = `${playlist.title} - chalk`;
    }
    return () => { document.title = 'chalk'; };
  }, [playlist?.title]);

  // Initial fetch
  useEffect(() => {
    if (!playlistId) return;

    const controller = new AbortController();
    setIsLoading(true);
    setError('');

    fetch(`/api/youtube/playlist?id=${encodeURIComponent(playlistId)}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load playlist');
        return res.json();
      })
      .then((data) => {
        setPlaylist(data.playlist);
        setVideos(data.videos || []);
        setContinuationToken(data.continuation || null);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Failed to load playlist');
        }
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort('cleanup');
  }, [playlistId]);

  // Load more
  const handleLoadMore = useCallback(async () => {
    if (!continuationToken || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const res = await fetch(
        `/api/youtube/playlist?id=${encodeURIComponent(playlistId)}&continuation=${encodeURIComponent(continuationToken)}`
      );
      if (!res.ok) throw new Error('Failed to load more');
      const data = await res.json();
      setVideos((prev) => [...prev, ...(data.videos || [])]);
      setContinuationToken(data.continuation || null);
    } catch (err) {
      console.error('Load more error:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [playlistId, continuationToken, isLoadingMore]);

  // Infinite scroll observer
  useEffect(() => {
    if (!continuationToken || !sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleLoadMore();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [continuationToken, handleLoadMore]);

  return (
    <div className="h-[100dvh] overflow-y-auto bg-chalk-bg">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-chalk-bg/80 backdrop-blur-sm border-b border-chalk-border/20 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/" className="text-slate-400 hover:text-chalk-text transition-colors" aria-label="Back to home">
            <ArrowBendUpLeft size={20} weight="bold" />
          </Link>
          <Link href="/" className="flex items-center gap-1.5 text-chalk-text">
            <ChalkboardSimple size={20} />
            <span className="text-sm font-semibold">chalk</span>
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Playlist header */}
        {isLoading ? (
          <div className="flex flex-col sm:flex-row gap-6 mb-10">
            <div className="w-full sm:max-w-sm aspect-video bg-chalk-surface/20 rounded-xl animate-pulse shrink-0" />
            <div className="flex-1 space-y-3">
              <div className="h-6 bg-chalk-surface/20 rounded w-3/4 animate-pulse" />
              <div className="h-4 bg-chalk-surface/20 rounded w-1/2 animate-pulse" />
              <div className="h-3 bg-chalk-surface/20 rounded w-1/3 animate-pulse" />
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-400 text-sm">{error}</p>
            <Link href="/" className="text-chalk-accent text-xs mt-2 inline-block hover:underline">
              Back to search
            </Link>
          </div>
        ) : playlist ? (
          <>
            <motion.div
              variants={headerVariants}
              initial="hidden"
              animate="visible"
              className="flex flex-col sm:flex-row gap-6 mb-10"
            >
              {playlist.thumbnailUrl && (
                <div className="w-full sm:max-w-sm shrink-0">
                  <img
                    src={playlist.thumbnailUrl}
                    alt={playlist.title}
                    className="w-full aspect-video rounded-xl bg-chalk-surface/30 object-cover"
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold text-chalk-text leading-snug">{playlist.title}</h1>
                {playlist.channelName && (
                  <p className="text-sm text-slate-400 mt-2">
                    {playlist.channelId ? (
                      <Link href={`/channel/${playlist.channelId}`} className="hover:text-chalk-accent transition-colors">
                        {playlist.channelName}
                      </Link>
                    ) : (
                      playlist.channelName
                    )}
                  </p>
                )}
                {playlist.videoCount && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <ListIcon />
                    <span className="font-mono text-sm text-slate-500">{playlist.videoCount}</span>
                  </div>
                )}
                {playlist.description && (
                  <div className="mt-3">
                    <p className={`text-sm text-slate-400 leading-relaxed ${descExpanded ? '' : 'line-clamp-2'}`}>
                      {playlist.description}
                    </p>
                    {playlist.description.length > 120 && (
                      <button
                        onClick={() => setDescExpanded(!descExpanded)}
                        className="flex items-center gap-1 mt-1 text-xs text-slate-500 hover:text-chalk-text transition-colors"
                      >
                        {descExpanded ? 'Show less' : 'Show more'}
                        <span className={`transition-transform duration-200 ${descExpanded ? 'rotate-180' : ''}`}>
                          <ChevronDownIcon />
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>

            {/* Videos list — Course chapters */}
            {videos.length === 0 && !isLoadingMore ? (
              <p className="text-slate-400 text-sm text-center py-8">No videos found</p>
            ) : (
              <>
                {/* Timeline container */}
                <div className="relative">
                  {/* Vertical timeline line */}
                  <div
                    className="absolute left-[27px] top-6 bottom-6 w-px bg-chalk-border/20"
                    aria-hidden="true"
                  />

                  <div className="space-y-0.5">
                    {videos.map((video, i) => (
                      <VideoRow
                        key={`${video.videoId}-${i}`}
                        video={video}
                        index={i}
                        playlistChannel={playlist?.channelName}
                      />
                    ))}

                    {/* Loading more — subtle pulse */}
                    {isLoadingMore && Array.from({ length: 3 }).map((_, i) => (
                      <div key={`loading-${i}`} className="flex items-start gap-3 py-3 px-3">
                        <div className="w-8 h-8 rounded-full bg-chalk-surface/20 animate-pulse shrink-0" />
                        <div className="w-[120px] aspect-video bg-chalk-surface/20 rounded-lg animate-pulse shrink-0 opacity-50" />
                        <div className="flex-1 space-y-2 py-1">
                          <div className="h-4 bg-chalk-surface/20 rounded w-full animate-pulse opacity-50" />
                          <div className="h-3 bg-chalk-surface/20 rounded w-1/2 animate-pulse opacity-50" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {continuationToken && <div ref={sentinelRef} className="h-1" />}
              </>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
