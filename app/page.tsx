'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
  const inputRef = useRef<HTMLInputElement>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<'url' | 'search'>('search');

  // Unified input value
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');

  // Search state
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Pagination state
  const [continuationToken, setContinuationToken] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Recent videos
  const [recentVideos, setRecentVideos] = useState<RecentVideo[]>([]);

  // Abort controller for canceling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setRecentVideos(getRecentVideos());
  }, []);

  // Debounced search effect
  useEffect(() => {
    if (activeTab !== 'search' || inputValue.length < 2) {
      if (activeTab === 'search') {
        setSearchResults([]);
        setSearchError('');
        setContinuationToken(null);
      }
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort('new search');
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      setSearchError('');
      setContinuationToken(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch(
          `/api/youtube/search?q=${encodeURIComponent(inputValue)}&limit=20`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Search failed');
        }

        const data = await response.json();
        setSearchResults(data.results || []);
        setContinuationToken(data.continuation || null);
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
  }, [inputValue, activeTab]);

  // Cancel search when switching to URL tab
  useEffect(() => {
    if (activeTab === 'url' && abortControllerRef.current) {
      abortControllerRef.current.abort('new search');
    }
  }, [activeTab]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    setError('');

    // Auto-detect URL paste while in search mode
    if (activeTab === 'search' && extractVideoId(val.trim())) {
      setActiveTab('url');
    }
  };

  const handleUrlSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    const videoId = extractVideoId(trimmed);
    if (!videoId) {
      setError('Please enter a valid YouTube URL');
      return;
    }

    saveRecentVideo(videoId, trimmed);
    router.push(`/watch?v=${videoId}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && activeTab === 'url') {
      handleUrlSubmit();
    }
  };

  const handleTabSwitch = (tab: 'search' | 'url') => {
    setActiveTab(tab);
    setInputValue('');
    setError('');
    setSearchResults([]);
    setSearchError('');
    setContinuationToken(null);
    inputRef.current?.focus();
  };

  const handleSearchRetry = () => {
    setSearchError('');
    setInputValue((prev) => prev + ' ');
    setTimeout(() => setInputValue((prev) => prev.trim()), 50);
  };

  // Load more results (infinite scroll)
  const handleLoadMore = useCallback(async () => {
    if (!continuationToken || isLoadingMore) return;

    setIsLoadingMore(true);
    const controller = new AbortController();

    try {
      const response = await fetch(
        `/api/youtube/search?q=${encodeURIComponent(inputValue)}&continuation=${encodeURIComponent(continuationToken)}`,
        { signal: controller.signal }
      );

      if (!response.ok) throw new Error('Failed to load more');

      const data = await response.json();
      setSearchResults((prev) => [...prev, ...(data.results || [])]);
      setContinuationToken(data.continuation || null);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Load more error:', err);
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [continuationToken, isLoadingMore, inputValue]);

  const hasSearchContent = isSearching || searchResults.length > 0 || searchError;
  const showTabs = !inputValue;

  const pillClasses = (tab: 'search' | 'url') =>
    activeTab === tab
      ? 'bg-chalk-accent/15 text-chalk-accent border border-chalk-accent/30 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-200 flex items-center gap-1'
      : 'bg-transparent text-slate-500 hover:text-slate-300 border border-transparent rounded-lg px-2.5 py-1.5 text-xs transition-all duration-200 flex items-center gap-1';

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

          {/* Unified input with inline tab pills */}
          <div className="max-w-xl mx-auto">
            <div className="flex items-center gap-0 px-1 py-1 rounded-xl bg-chalk-surface/40 border border-chalk-border/30 focus-within:ring-2 focus-within:ring-chalk-accent/40 focus-within:border-chalk-accent/30 transition-colors">

              {/* Single input field */}
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={activeTab === 'search' ? 'Search for videos...' : 'Paste a YouTube URL...'}
                autoFocus
                className="flex-1 px-3 py-2.5 bg-transparent text-sm text-chalk-text placeholder:text-slate-600 focus:outline-none min-w-0"
              />

              {/* Right side: tab pills when empty, Watch button when URL detected */}
              {activeTab === 'url' && inputValue.trim() ? (
                <button
                  onClick={() => handleUrlSubmit()}
                  className="px-4 py-1.5 mr-1 rounded-lg bg-chalk-accent text-white text-xs font-medium hover:bg-chalk-accent/90 transition-colors shrink-0"
                >
                  Watch
                </button>
              ) : showTabs ? (
                <div className="flex gap-1 pr-1 shrink-0">
                  <button onClick={() => handleTabSwitch('search')} className={pillClasses('search')}>
                    <MagnifyingGlass size={14} weight="bold" />
                    Search
                  </button>
                  <button onClick={() => handleTabSwitch('url')} className={pillClasses('url')}>
                    URL
                  </button>
                </div>
              ) : null}
            </div>

            {error && (
              <p className="mt-2 text-xs text-red-400 text-center">{error}</p>
            )}
          </div>
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
              loadingMore={isLoadingMore}
              onLoadMore={continuationToken ? handleLoadMore : undefined}
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
