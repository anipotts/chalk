'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { extractVideoId } from '@/lib/video-utils';
import { ChalkboardSimple, MagnifyingGlass } from '@phosphor-icons/react';
import { SearchResults } from '@/components/SearchResults';
import type { SearchResult } from '@/lib/youtube-search';

const RECENT_VIDEOS_KEY = 'chalk-recent-videos';

interface RecentVideo {
  id: string;
  url: string;
  title?: string;
  timestamp: number;
}

function getRecentVideos(): RecentVideo[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_VIDEOS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveRecentVideo(videoId: string, url: string, title?: string) {
  const recent = getRecentVideos().filter((v) => v.id !== videoId);
  recent.unshift({ id: videoId, url, title, timestamp: Date.now() });
  localStorage.setItem(RECENT_VIDEOS_KEY, JSON.stringify(recent.slice(0, 10)));
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function HomePage() {
  const router = useRouter();

  // Tab state
  const [activeTab, setActiveTab] = useState<'url' | 'search'>('search');

  // URL input state
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Recent videos
  const [recentVideos, setRecentVideos] = useState<RecentVideo[]>([]);

  // Abort controller for canceling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setRecentVideos(getRecentVideos());
  }, []);

  // Debounced search effect (still requires 2 chars, just no visible hint)
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setSearchError('');
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      setSearchError('');

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch(
          `/api/youtube/search?q=${encodeURIComponent(searchQuery)}&limit=9`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Search failed');
        }

        const data = await response.json();
        setSearchResults(data.results || []);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error('Search error:', err);
        setSearchError(err.message || 'Unable to search. Please try again.');
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [searchQuery]);

  // Cancel search when switching tabs
  useEffect(() => {
    if (activeTab === 'url' && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, [activeTab]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    const videoId = extractVideoId(trimmed);
    if (!videoId) {
      setError('Please enter a valid YouTube URL');
      return;
    }

    saveRecentVideo(videoId, trimmed);
    router.push(`/watch?v=${videoId}`);
  };

  const handleSearchRetry = () => {
    setSearchError('');
    setSearchQuery((prev) => prev + ' ');
    setTimeout(() => setSearchQuery((prev) => prev.trim()), 50);
  };

  const hasSearchContent = isSearching || searchResults.length > 0 || searchError;

  return (
    <div className="min-h-screen bg-chalk-bg flex flex-col">
      {/* Header + input — slides up smoothly when search results appear */}
      <div
        className="flex flex-col items-center px-4"
        style={{
          paddingTop: hasSearchContent ? '48px' : 'calc(50vh - 140px)',
          paddingBottom: hasSearchContent ? '8px' : '0px',
          transition: 'padding-top 0.5s cubic-bezier(0.4, 0, 0.2, 1), padding-bottom 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div className="w-full max-w-2xl">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-chalk-text mb-2 flex items-center justify-center gap-2">
              <ChalkboardSimple size={32} />
              chalk
            </h1>
            <p className="text-sm text-slate-500">
              Learn from any YouTube video with AI
            </p>
          </div>

          {/* Tab selector */}
          <div className="flex gap-2 justify-center mb-4">
            <button
              onClick={() => setActiveTab('search')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'search'
                  ? 'bg-chalk-accent/10 border border-chalk-accent/40 text-chalk-accent'
                  : 'bg-chalk-surface/20 border border-chalk-border/20 text-slate-400 hover:bg-chalk-surface/30'
              }`}
            >
              <MagnifyingGlass size={16} weight="bold" className="inline mr-1.5 -mt-0.5" />
              Search
            </button>
            <button
              onClick={() => setActiveTab('url')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'url'
                  ? 'bg-chalk-accent/10 border border-chalk-accent/40 text-chalk-accent'
                  : 'bg-chalk-surface/20 border border-chalk-border/20 text-slate-400 hover:bg-chalk-surface/30'
              }`}
            >
              URL
            </button>
          </div>

          {/* URL input tab */}
          {activeTab === 'url' && (
            <div>
              <form onSubmit={handleSubmit} className="flex gap-2 max-w-xl mx-auto">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setError(''); }}
                  placeholder="Paste a YouTube URL..."
                  autoFocus
                  className="flex-1 px-4 py-3 rounded-xl bg-chalk-surface/40 border border-chalk-border/30 text-sm text-chalk-text placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-chalk-accent/40 focus:border-chalk-accent/30 transition-colors"
                />
                <button
                  type="submit"
                  disabled={!url.trim()}
                  className="px-5 py-3 rounded-xl bg-chalk-accent text-white text-sm font-medium hover:bg-chalk-accent/90 disabled:opacity-40 disabled:hover:bg-chalk-accent transition-colors"
                >
                  Watch
                </button>
              </form>

              {error && (
                <p className="mt-2 text-xs text-red-400 text-center">{error}</p>
              )}
            </div>
          )}

          {/* Search input tab */}
          {activeTab === 'search' && (
            <div className="max-w-xl mx-auto">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for videos..."
                autoFocus
                className="w-full px-4 py-3 rounded-xl bg-chalk-surface/40 border border-chalk-border/30 text-sm text-chalk-text placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-chalk-accent/40 focus:border-chalk-accent/30 transition-colors"
              />
            </div>
          )}
        </div>
      </div>

      {/* Below-input content area — recent videos or search results */}
      <div className="flex-1 px-4 pb-8 overflow-y-auto">
        <div className="max-w-2xl mx-auto">
          {/* Search results */}
          {activeTab === 'search' && hasSearchContent && (
            <SearchResults
              results={searchResults}
              isLoading={isSearching}
              error={searchError}
              onRetry={handleSearchRetry}
            />
          )}

          {/* Recent videos — show below input when no search content */}
          {!hasSearchContent && recentVideos.length > 0 && (
            <div className="pt-6 max-w-xl mx-auto">
              <h2 className="text-xs font-medium text-slate-500 mb-3 uppercase tracking-wider">Recent</h2>
              <div className="space-y-1.5">
                {recentVideos.map((video) => (
                  <a
                    key={video.id}
                    href={`/watch?v=${video.id}`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-chalk-surface/20 border border-chalk-border/20 hover:bg-chalk-surface/40 hover:border-chalk-border/40 transition-colors group"
                  >
                    <img
                      src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`}
                      alt=""
                      className="w-20 h-[45px] rounded-md object-cover bg-chalk-surface/30 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-300 truncate group-hover:text-chalk-text transition-colors">
                        {video.title || video.id}
                      </p>
                      <p className="text-[10px] text-slate-600 mt-0.5">{timeAgo(video.timestamp)}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
