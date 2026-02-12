'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { SearchResult, formatViewCount } from '@/lib/youtube-search';

interface SearchResultsProps {
  results: SearchResult[];
  isLoading: boolean;
  error?: string;
  onRetry?: () => void;
  loadingMore?: boolean;
  onLoadMore?: () => void;
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

function VideoCard({ result }: { result: SearchResult }) {
  return (
    <Link
      href={`/watch?v=${result.videoId}`}
      className="group bg-chalk-surface/20 border border-chalk-border/20 rounded-xl overflow-hidden transition-all hover:bg-chalk-surface/40 hover:border-chalk-border/40 hover:scale-[1.02]"
    >
      <div className="relative aspect-video bg-chalk-surface/10">
        <img
          src={result.thumbnailUrl}
          alt={result.title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
          {result.duration}
        </div>
      </div>

      <div className="p-3 space-y-1.5">
        <h3 className="text-chalk-text text-sm font-medium leading-snug line-clamp-2 group-hover:text-chalk-accent transition-colors">
          {result.title}
        </h3>

        {/* Author — link to channel page if channelId available */}
        {result.channelId ? (
          <Link
            href={`/channel/${result.channelId}`}
            onClick={(e) => e.stopPropagation()}
            className="text-slate-400 text-xs truncate block hover:text-chalk-accent transition-colors"
          >
            {result.author}
          </Link>
        ) : (
          <p className="text-slate-400 text-xs truncate">
            {result.author}
          </p>
        )}

        <p className="text-slate-500 text-[10px]">
          {formatViewCount(result.viewCount)} views • {result.publishedText}
        </p>
      </div>
    </Link>
  );
}

export function SearchResults({ results, isLoading, error, onRetry, loadingMore, onLoadMore }: SearchResultsProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (!onLoadMore || !sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMore();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [onLoadMore]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6">
        {Array.from({ length: 9 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 text-center space-y-4">
        <div className="space-y-2">
          <p className="text-red-400 text-sm">{error}</p>
          <p className="text-slate-500 text-xs">
            Unable to search at the moment. Please try again or paste a URL instead.
          </p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-chalk-surface/40 hover:bg-chalk-surface/60 border border-chalk-border/40 rounded-lg text-sm text-chalk-text transition-colors"
          >
            Try Again
          </button>
        )}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="mt-8 text-center space-y-2">
        <p className="text-slate-400 text-sm">No videos found</p>
        <p className="text-slate-500 text-xs">Try different keywords or paste a URL instead</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6">
        {results.map((result, i) => (
          <VideoCard key={`${result.videoId}-${i}`} result={result} />
        ))}

        {/* Inline skeleton cards when loading more */}
        {loadingMore && Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={`skeleton-${i}`} />
        ))}
      </div>

      {/* Sentinel div for infinite scroll */}
      {onLoadMore && <div ref={sentinelRef} className="h-1" />}
    </>
  );
}
