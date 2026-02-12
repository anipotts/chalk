/**
 * SearchResults Component
 * Displays YouTube search results in a responsive grid
 */

'use client';

import Link from 'next/link';
import { SearchResult, formatViewCount } from '@/lib/youtube-search';

interface SearchResultsProps {
  results: SearchResult[];
  isLoading: boolean;
  error?: string;
  onRetry?: () => void;
}

/**
 * Skeleton loader for search results
 */
function SkeletonCard() {
  return (
    <div className="bg-chalk-surface/20 border border-chalk-border/20 rounded-xl overflow-hidden animate-pulse">
      {/* Thumbnail skeleton */}
      <div className="aspect-video bg-chalk-surface/40" />

      {/* Content skeleton */}
      <div className="p-3 space-y-2">
        {/* Title lines */}
        <div className="h-4 bg-chalk-surface/40 rounded w-full" />
        <div className="h-4 bg-chalk-surface/40 rounded w-3/4" />

        {/* Metadata line */}
        <div className="h-3 bg-chalk-surface/40 rounded w-1/2" />
      </div>
    </div>
  );
}

/**
 * Video result card
 */
function VideoCard({ result }: { result: SearchResult }) {
  return (
    <Link
      href={`/watch?v=${result.videoId}`}
      className="group bg-chalk-surface/20 border border-chalk-border/20 rounded-xl overflow-hidden transition-all hover:bg-chalk-surface/40 hover:border-chalk-border/40 hover:scale-[1.02]"
    >
      {/* Thumbnail with duration badge */}
      <div className="relative aspect-video bg-chalk-surface/10">
        <img
          src={result.thumbnailUrl}
          alt={result.title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {/* Duration badge */}
        <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
          {result.duration}
        </div>
      </div>

      {/* Video info */}
      <div className="p-3 space-y-1.5">
        {/* Title - max 2 lines with ellipsis */}
        <h3 className="text-chalk-text text-sm font-medium leading-snug line-clamp-2 group-hover:text-chalk-accent transition-colors">
          {result.title}
        </h3>

        {/* Author */}
        <p className="text-slate-400 text-xs truncate">
          {result.author}
        </p>

        {/* View count and published date */}
        <p className="text-slate-500 text-[10px]">
          {formatViewCount(result.viewCount)} views • {result.publishedText}
        </p>
      </div>
    </Link>
  );
}

export function SearchResults({ results, isLoading, error, onRetry }: SearchResultsProps) {
  // Loading state - show skeleton grid
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6">
        {Array.from({ length: 9 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  // Error state
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

  // Empty state
  if (results.length === 0) {
    return (
      <div className="mt-8 text-center space-y-2">
        <p className="text-slate-400 text-sm">No videos found</p>
        <p className="text-slate-500 text-xs">Try different keywords or paste a URL instead</p>
      </div>
    );
  }

  // Results grid
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6">
      {results.map((result) => (
        <VideoCard key={result.videoId} result={result} />
      ))}
    </div>
  );
}
