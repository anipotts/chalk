'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { SearchResult, formatViewCount } from '@/lib/youtube-search';

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

// --- Typed search result union ---

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

export type { ChannelResult, PlaylistResult };
export type AnySearchResult = (SearchResult & { type?: 'video' }) | ChannelResult | PlaylistResult;

interface SearchResultsProps {
  results: AnySearchResult[];
  isLoading: boolean;
  error?: string;
  onRetry?: () => void;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

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

// --- Card Components ---

function VideoCard({ result, index }: { result: SearchResult & { type?: 'video' }; index: number }) {
  const router = useRouter();

  return (
    <motion.div
      custom={index}
      variants={itemVariants}
      initial="hidden"
      animate="visible"
    >
      <Link
        href={`/watch?v=${result.videoId}`}
        className="group block rounded-xl p-2 transition-all duration-200 hover:bg-chalk-surface/40"
      >
        <div className="relative aspect-video bg-chalk-surface/10 rounded-lg overflow-hidden">
          <img
            src={result.thumbnailUrl}
            alt={result.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {result.duration && (
            <div className="absolute bottom-1.5 right-1.5 bg-black/60 backdrop-blur-sm rounded-md px-1.5 py-0.5 text-[11px] font-mono font-medium text-white/90">
              {result.duration}
            </div>
          )}
        </div>

        <div className="mt-2.5 space-y-1.5">
          <h3 className="text-sm font-semibold text-chalk-text leading-snug line-clamp-2">
            {result.title}
          </h3>

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
              className="text-xs text-slate-400 truncate block hover:text-chalk-accent transition-colors cursor-pointer"
            >
              {result.author}
            </span>
          ) : (
            <p className="text-xs text-slate-400 truncate">{result.author}</p>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            {result.viewCount > 0 && (
              <span className="flex items-center gap-1 font-mono text-[11px] text-slate-500">
                <EyeIcon />
                {formatViewCount(result.viewCount)}
              </span>
            )}
            {result.duration && (
              <span className="flex items-center gap-1 font-mono text-[11px] text-slate-500">
                <ClockIcon />
                {result.duration}
              </span>
            )}
            {result.publishedText && (
              <span className="flex items-center gap-1 font-mono text-[11px] text-slate-500">
                <CalendarIcon />
                {result.publishedText}
              </span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function ChannelCard({ result, index }: { result: ChannelResult; index: number }) {
  return (
    <motion.div
      custom={index}
      variants={itemVariants}
      initial="hidden"
      animate="visible"
      className="col-span-1 sm:col-span-2 lg:col-span-3 xl:col-span-4"
    >
      <Link
        href={`/channel/${result.channelId}`}
        className="group flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 rounded-xl transition-all duration-200 hover:bg-chalk-surface/40"
      >
        {result.thumbnailUrl ? (
          <img
            src={result.thumbnailUrl}
            alt={result.name}
            className="w-16 h-16 rounded-full border-2 border-chalk-border/20 shrink-0 object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-16 h-16 rounded-full border-2 border-chalk-border/20 bg-chalk-surface/40 shrink-0 flex items-center justify-center text-slate-500 text-lg font-bold">
            {result.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h3 className="font-semibold text-base text-chalk-text group-hover:text-chalk-accent transition-colors">
            {result.name}
          </h3>
          <div className="flex items-center justify-center sm:justify-start gap-3 mt-1">
            {result.subscriberCount && (
              <span className="flex items-center gap-1 font-mono text-[11px] text-slate-500">
                <UsersIcon />
                {result.subscriberCount}
              </span>
            )}
            {result.videoCount && (
              <span className="font-mono text-[11px] text-slate-500">
                {result.videoCount}
              </span>
            )}
          </div>
          {result.description && (
            <p className="text-xs text-slate-400 mt-1.5 line-clamp-2">{result.description}</p>
          )}
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-chalk-accent/10 text-chalk-accent border border-chalk-accent/20 shrink-0">
          Channel
        </span>
      </Link>
    </motion.div>
  );
}

function PlaylistCard({ result, index }: { result: PlaylistResult; index: number }) {
  const router = useRouter();

  return (
    <motion.div
      custom={index}
      variants={itemVariants}
      initial="hidden"
      animate="visible"
    >
      <Link
        href={`/playlist/${result.playlistId}`}
        className="group block rounded-xl p-2 transition-all duration-200 hover:bg-chalk-surface/40"
      >
        {/* Stacked thumbnail effect */}
        <div className="relative">
          {/* Back layers */}
          <div className="absolute top-0 left-0 right-0 aspect-video rounded-lg bg-chalk-surface/10 transform translate-y-[-6px] translate-x-[4px] scale-[0.96] opacity-30" />
          <div className="absolute top-0 left-0 right-0 aspect-video rounded-lg bg-chalk-surface/20 transform translate-y-[-3px] translate-x-[2px] scale-[0.98] opacity-60" />
          {/* Main thumbnail */}
          <div className="relative aspect-video bg-chalk-surface/10 rounded-lg overflow-hidden">
            {result.thumbnailUrl ? (
              <img
                src={result.thumbnailUrl}
                alt={result.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-chalk-surface/20">
                <ListIcon />
              </div>
            )}
            {result.videoCount && (
              <div className="absolute bottom-1.5 right-1.5 bg-black/60 backdrop-blur-sm rounded-md px-1.5 py-0.5 flex items-center gap-1">
                <ListIcon />
                <span className="font-mono text-[11px] font-medium text-white/90">
                  {result.videoCount}{/^\d+$/.test(result.videoCount || '') ? ' videos' : ''}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-2.5 space-y-1.5">
          <h3 className="font-semibold text-sm text-chalk-text leading-snug line-clamp-2">
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
                className="text-xs text-slate-400 truncate block hover:text-chalk-accent transition-colors cursor-pointer"
              >
                {result.channelName}
              </span>
            ) : (
              <p className="text-xs text-slate-400 truncate">{result.channelName}</p>
            )
          )}
        </div>
      </Link>
    </motion.div>
  );
}

function ResultCard({ result, index }: { result: AnySearchResult; index: number }) {
  if (result.type === 'channel') return <ChannelCard result={result} index={index} />;
  if (result.type === 'playlist') return <PlaylistCard result={result} index={index} />;
  return <VideoCard result={result as SearchResult & { type?: 'video' }} index={index} />;
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-6 p-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-xl p-2">
            <div className="aspect-video bg-chalk-surface/20 rounded-lg animate-pulse" />
            <div className="mt-2.5 space-y-2">
              <div className="h-4 bg-chalk-surface/20 rounded w-full animate-pulse" />
              <div className="h-3 bg-chalk-surface/20 rounded w-3/4 animate-pulse" />
              <div className="h-3 bg-chalk-surface/20 rounded w-1/2 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 text-center space-y-4 p-6">
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
      <div className="mt-8 text-center space-y-2 p-6">
        <p className="text-slate-400 text-sm">No results found</p>
        <p className="text-slate-500 text-xs">Try different keywords or a different search type</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-6">
        {results.map((result, i) => {
          const key = result.type === 'channel' ? `ch-${result.channelId}-${i}`
            : result.type === 'playlist' ? `pl-${result.playlistId}-${i}`
            : `v-${(result as SearchResult).videoId}-${i}`;
          return <ResultCard key={key} result={result} index={i} />;
        })}

        {loadingMore && Array.from({ length: 4 }).map((_, i) => (
          <div key={`loading-${i}`} className="rounded-xl p-2">
            <div className="aspect-video bg-chalk-surface/20 rounded-lg opacity-50 animate-pulse" />
            <div className="mt-2.5 space-y-2">
              <div className="h-4 bg-chalk-surface/20 rounded w-full opacity-50 animate-pulse" />
              <div className="h-3 bg-chalk-surface/20 rounded w-3/4 opacity-50 animate-pulse" />
            </div>
          </div>
        ))}
      </div>

      {onLoadMore && <div ref={sentinelRef} className="h-1" />}
    </>
  );
}
