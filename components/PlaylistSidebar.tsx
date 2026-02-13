'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// --- SVG Icon Helpers ---

const ClockIcon = () => (
  <svg className="w-2.5 h-2.5 text-slate-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 4.5V8l2.5 1.5" strokeLinecap="round" />
  </svg>
);

const ListIcon = () => (
  <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M2 4h12M2 8h12M2 12h12" strokeLinecap="round" />
  </svg>
);

const ChevronIcon = ({ collapsed }: { collapsed: boolean }) => (
  <svg
    className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// --- Types ---

interface PlaylistInfo {
  title: string;
  videoCount?: string;
  channelName?: string;
}

interface PlaylistVideo {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  duration: string;
  author: string;
  index: number;
}

export interface PlaylistSidebarProps {
  playlistId: string;
  currentVideoId: string;
  onVideoSelect: (videoId: string) => void;
}

// --- Animation variants ---

const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.03,
      duration: 0.25,
      ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
    },
  }),
};

// --- Video Row ---

function SidebarVideoRow({
  video,
  index,
  isCurrent,
  onSelect,
}: {
  video: PlaylistVideo;
  index: number;
  isCurrent: boolean;
  onSelect: () => void;
}) {
  const rowRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll current video into view
  useEffect(() => {
    if (isCurrent && rowRef.current) {
      rowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isCurrent]);

  return (
    <motion.div
      custom={index}
      variants={itemVariants}
      initial="hidden"
      animate="visible"
    >
      <button
        ref={rowRef}
        onClick={onSelect}
        className={`w-full flex items-start gap-2.5 py-2 px-2.5 rounded-lg text-left transition-all duration-200 ${
          isCurrent
            ? 'bg-chalk-accent/10 border-l-2 border-chalk-accent'
            : 'hover:bg-white/[0.03] border-l-2 border-transparent'
        }`}
      >
        {/* Chapter number */}
        <span className="font-mono text-[10px] text-slate-500 shrink-0 pt-0.5 w-5 text-right">
          {index + 1}
        </span>

        {/* Thumbnail */}
        <div className="relative shrink-0 w-[80px] aspect-video bg-chalk-surface/10 rounded-md overflow-hidden">
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {video.duration && (
            <div className="absolute bottom-0.5 right-0.5 bg-black/60 backdrop-blur-sm rounded px-1 py-px text-[9px] font-mono font-medium text-white/90">
              {video.duration}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h4 className={`text-xs font-medium leading-snug line-clamp-2 ${
            isCurrent ? 'text-chalk-accent' : 'text-chalk-text'
          }`}>
            {video.title}
          </h4>
          <div className="flex items-center gap-1 mt-1">
            <ClockIcon />
            <span className="font-mono text-[10px] text-slate-500">{video.duration}</span>
          </div>
        </div>
      </button>
    </motion.div>
  );
}

// --- Main Component ---

export default function PlaylistSidebar({ playlistId, currentVideoId, onVideoSelect }: PlaylistSidebarProps) {
  const [playlist, setPlaylist] = useState<PlaylistInfo | null>(null);
  const [videos, setVideos] = useState<PlaylistVideo[]>([]);
  const [continuationToken, setContinuationToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Fetch playlist data
  useEffect(() => {
    if (!playlistId) return;

    const controller = new AbortController();
    setIsLoading(true);

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
          console.error('Playlist sidebar error:', err);
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
      console.error('Playlist sidebar load more error:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [playlistId, continuationToken, isLoadingMore]);

  // Infinite scroll in sidebar
  useEffect(() => {
    if (!continuationToken || !sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) handleLoadMore();
      },
      { root: scrollRef.current, rootMargin: '100px' }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [continuationToken, handleLoadMore]);

  return (
    <div className="w-[320px] bg-chalk-bg border-l border-chalk-border/10 flex flex-col h-full">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2.5 px-4 py-3 border-b border-chalk-border/10 hover:bg-white/[0.02] transition-colors w-full text-left"
      >
        <ListIcon />
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="h-3.5 bg-chalk-surface/20 rounded w-32 animate-pulse" />
          ) : (
            <h3 className="text-xs font-semibold text-chalk-text truncate">
              {playlist?.title || 'Playlist'}
            </h3>
          )}
          {!isLoading && playlist?.videoCount && (
            <span className="font-mono text-[10px] text-slate-500">{playlist.videoCount}</span>
          )}
        </div>
        <ChevronIcon collapsed={collapsed} />
      </button>

      {/* Video list */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex-1 overflow-hidden"
          >
            <div ref={scrollRef} className="overflow-y-auto h-full p-2 space-y-0.5">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-2.5 py-2 px-2.5">
                    <div className="w-5 h-3 bg-chalk-surface/20 rounded animate-pulse" />
                    <div className="w-[80px] aspect-video bg-chalk-surface/20 rounded-md animate-pulse shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-chalk-surface/20 rounded w-full animate-pulse" />
                      <div className="h-2.5 bg-chalk-surface/20 rounded w-2/3 animate-pulse" />
                    </div>
                  </div>
                ))
              ) : (
                <>
                  {videos.map((video, i) => (
                    <SidebarVideoRow
                      key={`${video.videoId}-${i}`}
                      video={video}
                      index={i}
                      isCurrent={video.videoId === currentVideoId}
                      onSelect={() => onVideoSelect(video.videoId)}
                    />
                  ))}

                  {isLoadingMore && Array.from({ length: 2 }).map((_, i) => (
                    <div key={`loading-${i}`} className="flex items-start gap-2.5 py-2 px-2.5 opacity-50">
                      <div className="w-5 h-3 bg-chalk-surface/20 rounded animate-pulse" />
                      <div className="w-[80px] aspect-video bg-chalk-surface/20 rounded-md animate-pulse shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 bg-chalk-surface/20 rounded w-full animate-pulse" />
                        <div className="h-2.5 bg-chalk-surface/20 rounded w-2/3 animate-pulse" />
                      </div>
                    </div>
                  ))}

                  {continuationToken && <div ref={sentinelRef} className="h-1" />}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
