'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SearchResult, formatViewCount } from '@/lib/youtube-search';

// Typed search result union
interface ChannelResult {
  type: 'channel';
  channelId: string;
  name: string;
  thumbnailUrl: string;
  subscriberCount?: string;
  videoCount?: string;
  description?: string;
}

interface PlaylistResult {
  type: 'playlist';
  playlistId: string;
  title: string;
  thumbnailUrl: string;
  videoCount?: string;
  channelName?: string;
  channelId?: string;
}

type AnySearchResult = (SearchResult & { type?: 'video' }) | ChannelResult | PlaylistResult;

interface SearchResultsProps {
  results: AnySearchResult[];
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

function VideoCard({ result }: { result: SearchResult & { type?: 'video' } }) {
  const router = useRouter();

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

        {/* Author — use span+onClick to avoid nested <a> inside <Link> */}
        {result.channelId ? (
          <span
            role="link"
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              router.push(`/channel/${result.channelId}`);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                router.push(`/channel/${result.channelId}`);
              }
            }}
            className="text-slate-400 text-xs truncate block hover:text-chalk-accent transition-colors cursor-pointer"
          >
            {result.author}
          </span>
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

function ChannelCard({ result }: { result: ChannelResult }) {
  return (
    <Link
      href={`/channel/${result.channelId}`}
      className="group flex items-center gap-4 p-4 bg-chalk-surface/20 border border-chalk-border/20 rounded-xl transition-all hover:bg-chalk-surface/40 hover:border-chalk-border/40 col-span-2 sm:col-span-3"
    >
      {result.thumbnailUrl ? (
        <img
          src={result.thumbnailUrl}
          alt={result.name}
          className="w-16 h-16 rounded-full bg-chalk-surface/30 shrink-0 object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-16 h-16 rounded-full bg-chalk-surface/40 shrink-0 flex items-center justify-center text-slate-500 text-lg font-bold">
          {result.name.charAt(0)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h3 className="text-chalk-text text-sm font-medium group-hover:text-chalk-accent transition-colors">
          {result.name}
        </h3>
        <div className="flex items-center gap-2 mt-0.5">
          {result.subscriberCount && (
            <span className="text-slate-500 text-xs">{result.subscriberCount}</span>
          )}
          {result.videoCount && (
            <span className="text-slate-600 text-xs">{result.videoCount}</span>
          )}
        </div>
        {result.description && (
          <p className="text-slate-500 text-xs mt-1 line-clamp-2">{result.description}</p>
        )}
      </div>
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-chalk-accent/10 text-chalk-accent border border-chalk-accent/20 shrink-0">
        Channel
      </span>
    </Link>
  );
}

function PlaylistCard({ result }: { result: PlaylistResult }) {
  const router = useRouter();

  return (
    <Link
      href={`/playlist/${result.playlistId}`}
      className="group bg-chalk-surface/20 border border-chalk-border/20 rounded-xl overflow-hidden transition-all hover:bg-chalk-surface/40 hover:border-chalk-border/40 hover:scale-[1.02]"
    >
      <div className="relative aspect-video bg-chalk-surface/10">
        {result.thumbnailUrl ? (
          <img
            src={result.thumbnailUrl}
            alt={result.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-chalk-surface/20">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-slate-600">
              <path fillRule="evenodd" d="M2.625 6.75a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Zm4.875 0A.75.75 0 0 1 8.25 6h12a.75.75 0 0 1 0 1.5h-12a.75.75 0 0 1-.75-.75ZM2.625 12a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0ZM7.5 12a.75.75 0 0 1 .75-.75h12a.75.75 0 0 1 0 1.5h-12A.75.75 0 0 1 7.5 12Zm-4.875 5.25a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Zm4.875 0a.75.75 0 0 1 .75-.75h12a.75.75 0 0 1 0 1.5h-12a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
            </svg>
          </div>
        )}
        {result.videoCount && (
          <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path fillRule="evenodd" d="M2 3.75A.75.75 0 0 1 2.75 3h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 3.75ZM2 8a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8Zm0 4.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
            </svg>
            {result.videoCount} videos
          </div>
        )}
      </div>

      <div className="p-3 space-y-1.5">
        <h3 className="text-chalk-text text-sm font-medium leading-snug line-clamp-2 group-hover:text-chalk-accent transition-colors">
          {result.title}
        </h3>

        {result.channelName && (
          result.channelId ? (
            <span
              role="link"
              tabIndex={0}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(`/channel/${result.channelId}`);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  router.push(`/channel/${result.channelId}`);
                }
              }}
              className="text-slate-400 text-xs truncate block hover:text-chalk-accent transition-colors cursor-pointer"
            >
              {result.channelName}
            </span>
          ) : (
            <p className="text-slate-400 text-xs truncate">{result.channelName}</p>
          )
        )}

        <p className="text-slate-500 text-[10px]">Playlist</p>
      </div>
    </Link>
  );
}

function ResultCard({ result }: { result: AnySearchResult }) {
  if (result.type === 'channel') return <ChannelCard result={result} />;
  if (result.type === 'playlist') return <PlaylistCard result={result} />;
  return <VideoCard result={result as SearchResult & { type?: 'video' }} />;
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
        <p className="text-slate-400 text-sm">No results found</p>
        <p className="text-slate-500 text-xs">Try different keywords or a different search type</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6">
        {results.map((result, i) => {
          const key = result.type === 'channel' ? `ch-${result.channelId}-${i}`
            : result.type === 'playlist' ? `pl-${result.playlistId}-${i}`
            : `v-${(result as SearchResult).videoId}-${i}`;
          return <ResultCard key={key} result={result} />;
        })}

        {loadingMore && Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={`skeleton-${i}`} />
        ))}
      </div>

      {onLoadMore && <div ref={sentinelRef} className="h-1" />}
    </>
  );
}
