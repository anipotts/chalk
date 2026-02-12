'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChalkboardSimple, ArrowLeft } from '@phosphor-icons/react';
import { formatViewCount } from '@/lib/youtube-search';

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
          {formatViewCount(video.viewCount)} views • {video.publishedText}
        </p>
      </div>
    </Link>
  );
}

export default function ChannelPage() {
  const params = useParams();
  const channelId = params.id as string;

  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [continuationToken, setContinuationToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const sentinelRef = useRef<HTMLDivElement>(null);

  // Initial fetch
  useEffect(() => {
    if (!channelId) return;

    const controller = new AbortController();
    setIsLoading(true);
    setError('');

    fetch(`/api/youtube/channel?id=${encodeURIComponent(channelId)}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load channel');
        return res.json();
      })
      .then((data) => {
        setChannel(data.channel);
        setVideos(data.videos || []);
        setContinuationToken(data.continuation || null);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Failed to load channel');
        }
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [channelId]);

  // Load more
  const handleLoadMore = useCallback(async () => {
    if (!continuationToken || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const res = await fetch(
        `/api/youtube/channel?id=${encodeURIComponent(channelId)}&continuation=${encodeURIComponent(continuationToken)}`
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
  }, [channelId, continuationToken, isLoadingMore]);

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
    <div className="min-h-screen bg-chalk-bg">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-chalk-bg/80 backdrop-blur-sm border-b border-chalk-border/20 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/" className="text-slate-400 hover:text-chalk-text transition-colors" aria-label="Back to home">
            <ArrowLeft size={20} />
          </Link>
          <Link href="/" className="flex items-center gap-1.5 text-chalk-text">
            <ChalkboardSimple size={20} />
            <span className="text-sm font-semibold">chalk</span>
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Channel header */}
        {isLoading ? (
          <div className="flex items-center gap-4 mb-8 animate-pulse">
            <div className="w-16 h-16 rounded-full bg-chalk-surface/40" />
            <div className="space-y-2">
              <div className="h-5 bg-chalk-surface/40 rounded w-48" />
              <div className="h-3 bg-chalk-surface/40 rounded w-24" />
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
            <div className="flex items-center gap-4 mb-8">
              {channel.avatarUrl && (
                <img
                  src={channel.avatarUrl}
                  alt={channel.name}
                  className="w-16 h-16 rounded-full bg-chalk-surface/30"
                />
              )}
              <div>
                <h1 className="text-xl font-bold text-chalk-text">{channel.name}</h1>
                {channel.subscriberCount && (
                  <p className="text-xs text-slate-400 mt-0.5">{channel.subscriberCount}</p>
                )}
              </div>
            </div>

            {/* Videos grid */}
            {videos.length === 0 && !isLoadingMore ? (
              <p className="text-slate-400 text-sm text-center py-8">No videos found</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {videos.map((video, i) => (
                    <VideoCard key={`${video.videoId}-${i}`} video={video} />
                  ))}
                  {isLoadingMore && Array.from({ length: 4 }).map((_, i) => (
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
