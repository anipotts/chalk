'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChalkboardSimple, ArrowBendUpLeft } from '@phosphor-icons/react';

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

function SkeletonCard() {
  return (
    <div className="flex gap-3 p-2 animate-pulse">
      <div className="w-40 aspect-video bg-chalk-surface/40 rounded-lg shrink-0" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-4 bg-chalk-surface/40 rounded w-full" />
        <div className="h-4 bg-chalk-surface/40 rounded w-3/4" />
        <div className="h-3 bg-chalk-surface/40 rounded w-1/2" />
      </div>
    </div>
  );
}

function VideoRow({ video, index }: { video: PlaylistVideo; index: number }) {
  return (
    <Link
      href={`/watch?v=${video.videoId}`}
      className="group flex gap-3 p-2 rounded-xl transition-all hover:bg-chalk-surface/30"
    >
      <span className="text-xs text-slate-600 font-mono self-center w-6 text-right shrink-0">
        {index + 1}
      </span>
      <div className="relative w-40 aspect-video bg-chalk-surface/10 rounded-lg overflow-hidden shrink-0">
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
      <div className="flex-1 min-w-0 py-0.5">
        <h3 className="text-chalk-text text-sm font-medium leading-snug line-clamp-2 group-hover:text-chalk-accent transition-colors">
          {video.title}
        </h3>
        <p className="text-slate-500 text-xs mt-1 truncate">{video.author}</p>
      </div>
    </Link>
  );
}

export default function PlaylistPage() {
  const params = useParams();
  const playlistId = params.id as string;

  const [playlist, setPlaylist] = useState<PlaylistInfo | null>(null);
  const [videos, setVideos] = useState<PlaylistVideo[]>([]);
  const [continuationToken, setContinuationToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');

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

    return () => controller.abort();
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

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Playlist header */}
        {isLoading ? (
          <div className="flex gap-4 mb-8 animate-pulse">
            <div className="w-48 aspect-video bg-chalk-surface/40 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-5 bg-chalk-surface/40 rounded w-3/4" />
              <div className="h-3 bg-chalk-surface/40 rounded w-1/2" />
              <div className="h-3 bg-chalk-surface/40 rounded w-1/4" />
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
            <div className="flex gap-4 mb-8">
              {playlist.thumbnailUrl && (
                <img
                  src={playlist.thumbnailUrl}
                  alt={playlist.title}
                  className="w-48 aspect-video rounded-xl bg-chalk-surface/30 object-cover shrink-0"
                />
              )}
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-chalk-text leading-snug">{playlist.title}</h1>
                {playlist.channelName && (
                  <p className="text-sm text-slate-400 mt-1">
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
                  <p className="text-xs text-slate-500 mt-1">{playlist.videoCount}</p>
                )}
                {playlist.description && (
                  <p className="text-xs text-slate-500 mt-2 line-clamp-3">{playlist.description}</p>
                )}
              </div>
            </div>

            {/* Videos list */}
            {videos.length === 0 && !isLoadingMore ? (
              <p className="text-slate-400 text-sm text-center py-8">No videos found</p>
            ) : (
              <>
                <div className="space-y-1">
                  {videos.map((video, i) => (
                    <VideoRow key={`${video.videoId}-${i}`} video={video} index={i} />
                  ))}
                  {isLoadingMore && Array.from({ length: 3 }).map((_, i) => (
                    <SkeletonCard key={`skeleton-${i}`} />
                  ))}
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
