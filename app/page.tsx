'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { extractVideoId } from '@/lib/video-utils';
import { ChalkboardSimple, Binoculars } from '@phosphor-icons/react';
import { SearchResults } from '@/components/SearchResults';
import type { AnySearchResult } from '@/components/SearchResults';
import { storageKey } from '@/lib/brand';
import { AnimatePresence } from 'framer-motion';

import SearchDropdown from '@/components/SearchDropdown';

const RECENT_VIDEOS_KEY = storageKey('recent-videos');

type SearchType = 'video' | 'channel' | 'playlist';
type SortBy = 'relevance' | 'viewCount' | 'date';

interface RecentVideo {
  id: string;
  url: string;
  title?: string;
  channelName?: string;
  timestamp: number;
}

function saveRecentVideo(videoId: string, url: string, title?: string) {
  const recent = getRecentVideos().filter((v) => v.id !== videoId);
  recent.unshift({ id: videoId, url, title, timestamp: Date.now() });
  localStorage.setItem(RECENT_VIDEOS_KEY, JSON.stringify(recent.slice(0, 10)));
}

function getRecentVideos(): RecentVideo[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_VIDEOS_KEY) || '[]');
  } catch {
    return [];
  }
}

export default function HomePageWrapper() {
  return (
    <Suspense fallback={
      <div className="h-screen bg-chalk-bg flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    }>
      <HomePage />
    </Suspense>
  );
}

function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<'url' | 'search'>('search');

  // Unified input value
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');

  // Search state
  const [searchResults, setSearchResults] = useState<AnySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchType, setSearchType] = useState<SearchType>('video');
  const [sortBy, setSortBy] = useState<SortBy>('relevance');

  // Pagination state
  const [continuationToken, setContinuationToken] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);

  // Focus state for orbit breathing
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Dropdown visibility
  const [showDropdown, setShowDropdown] = useState(false);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Smooth transition: delayed return to center
  const [isVisuallyRaised, setIsVisuallyRaised] = useState(false);
  const raiseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Abort controller for canceling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Handle ?q= query param from NavBar
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setInputValue(q);
      setActiveTab('search');
    }
  }, [searchParams]);

  // Mobile detection
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const hasSearchContent = isSearching || searchResults.length > 0 || searchError;
  const isSearchMode = !!(hasSearchContent && inputValue.length >= 2);

  // Smooth raise/lower: instant up, 2s delayed return to center
  useEffect(() => {
    if (isSearchMode) {
      if (raiseTimerRef.current) clearTimeout(raiseTimerRef.current);
      setIsVisuallyRaised(true);
    } else {
      raiseTimerRef.current = setTimeout(() => setIsVisuallyRaised(false), 2000);
    }
    return () => {
      if (raiseTimerRef.current) clearTimeout(raiseTimerRef.current);
    };
  }, [isSearchMode]);

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

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      setSearchError('');
      setContinuationToken(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        let url = `/api/youtube/search?q=${encodeURIComponent(inputValue)}&limit=20&type=${searchType}`;
        if (sortBy !== 'relevance') {
          url += `&sort=${sortBy}`;
        }
        const response = await fetch(url, { signal: controller.signal });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Search failed');
        }

        const data = await response.json();
        let results = data.results || [];

        // Client-side sort fallback if API doesn't support sort param
        if (sortBy === 'viewCount' && results.length > 0) {
          results = [...results].sort((a: AnySearchResult, b: AnySearchResult) => {
            const aViews = 'viewCount' in a ? parseInt(String(a.viewCount).replace(/[^0-9]/g, '')) || 0 : 0;
            const bViews = 'viewCount' in b ? parseInt(String(b.viewCount).replace(/[^0-9]/g, '')) || 0 : 0;
            return bViews - aViews;
          });
        } else if (sortBy === 'date' && results.length > 0) {
          results = [...results].sort((a: AnySearchResult, b: AnySearchResult) => {
            const aDate = 'publishedText' in a ? String(a.publishedText) : '';
            const bDate = 'publishedText' in b ? String(b.publishedText) : '';
            // Simple heuristic: "hours ago" < "days ago" < "weeks ago" < "months ago" < "years ago"
            const weight = (s: string) => {
              if (s.includes('hour')) return 1;
              if (s.includes('day')) return 2;
              if (s.includes('week')) return 3;
              if (s.includes('month')) return 4;
              if (s.includes('year')) return 5;
              return 6;
            };
            return weight(aDate) - weight(bDate);
          });
        }

        setSearchResults(results);
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
      abortControllerRef.current?.abort('search cancelled');
      abortControllerRef.current = null;
    };
  }, [inputValue, activeTab, searchType, sortBy]);

  // Cancel search when switching to URL tab
  useEffect(() => {
    if (activeTab === 'url' && abortControllerRef.current) {
      abortControllerRef.current.abort('tab switch');
    }
  }, [activeTab]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    setError('');
    setShowDropdown(val.length === 0);

    // Auto-detect URL paste while in search mode
    if (activeTab === 'search' && extractVideoId(val.trim())?.videoId) {
      setActiveTab('url');
    }
  };

  const handleUrlSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    const extracted = extractVideoId(trimmed);
    if (!extracted) {
      setError('Please enter a valid YouTube URL');
      return;
    }

    saveRecentVideo(extracted.videoId, trimmed);
    router.push(`/watch?v=${extracted.videoId}${extracted.startTime ? `&t=${extracted.startTime}` : ''}`);
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

  const handleSearchTypeChange = (type: SearchType) => {
    setSearchType(type);
    setSearchResults([]);
    setContinuationToken(null);
  };

  const handleSortChange = (sort: SortBy) => {
    setSortBy(sort);
    setSearchResults([]);
    setContinuationToken(null);
  };

  const handleInputFocus = () => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    setIsInputFocused(true);
    setShowDropdown(inputValue.length === 0);
  };

  const handleInputBlur = () => {
    blurTimeoutRef.current = setTimeout(() => {
      setIsInputFocused(false);
      setShowDropdown(false);
    }, 150);
  };

  const handleTopicSelect = (topic: string) => {
    setInputValue(topic);
    setShowDropdown(false);
    setActiveTab('search');
    inputRef.current?.focus();
  };

  // Load more results (infinite scroll)
  const handleLoadMore = useCallback(async () => {
    if (!continuationToken || isLoadingMore) return;

    setIsLoadingMore(true);
    const controller = new AbortController();

    try {
      const response = await fetch(
        `/api/youtube/search?q=${encodeURIComponent(inputValue)}&type=${searchType}&continuation=${encodeURIComponent(continuationToken)}`,
        { signal: controller.signal }
      );

      if (!response.ok) {
        setContinuationToken(null);
        return;
      }

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
  }, [continuationToken, isLoadingMore, inputValue, searchType]);

  const showTabs = !inputValue;

  const pillClasses = (tab: 'search' | 'url') =>
    activeTab === tab
      ? 'bg-chalk-accent/15 text-chalk-accent border border-chalk-accent/30 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-200 flex items-center gap-1'
      : 'bg-transparent text-slate-500 hover:text-slate-300 border border-transparent rounded-lg px-2.5 py-1.5 text-xs transition-all duration-200 flex items-center gap-1';

  const searchTypePillClasses = (type: SearchType) =>
    searchType === type
      ? 'bg-chalk-accent/15 text-chalk-accent border border-chalk-accent/30'
      : 'bg-transparent text-slate-500 hover:text-slate-300 border border-chalk-border/20 hover:border-chalk-border/40';

  // The search input element (shared between orbit center and raised state)
  const searchInput = (
    <div className="w-full max-w-lg mx-auto relative">
      <div className="flex items-center gap-0 px-1 py-1 rounded-xl bg-chalk-surface/40 border border-chalk-border/30 focus-within:ring-2 focus-within:ring-chalk-accent/40 focus-within:border-chalk-accent/30 transition-colors backdrop-blur-sm">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder={activeTab === 'search' ? 'Search for videos, channels, or playlists...' : 'Paste a YouTube URL...'}
          aria-label={activeTab === 'search' ? 'Search for videos, channels, or playlists' : 'Paste a YouTube URL'}
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
              <Binoculars size={14} weight="bold" />
              Search
            </button>
            <button onClick={() => handleTabSwitch('url')} className={pillClasses('url')}>
              URL
            </button>
          </div>
        ) : null}
      </div>

      {/* Search dropdown */}
      <AnimatePresence>
        {showDropdown && isInputFocused && activeTab === 'search' && (
          <SearchDropdown
            isVisible={true}
            onSelectTopic={handleTopicSelect}
          />
        )}
      </AnimatePresence>

      {error && (
        <p className="mt-2 text-xs text-red-400 text-center">{error}</p>
      )}
    </div>
  );

  const showFilterPills = activeTab === 'search' && inputValue.length >= 2;

  return (
    <div className="h-screen bg-chalk-bg flex flex-col overflow-hidden">
      {/* Header area — smooth paddingTop transition between centered and raised */}
      <div
        className="flex flex-col items-center px-4 shrink-0 transition-[padding] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ paddingTop: isVisuallyRaised ? '3rem' : 'calc(50vh - 80px)', paddingBottom: isVisuallyRaised ? '0.5rem' : '0' }}
      >
        <div className="w-full max-w-2xl">
          {/* Logo and tagline — single element with smooth scale/opacity */}
          <div className={`text-center mb-2 transition-all duration-500 origin-center ${isVisuallyRaised ? 'scale-75' : 'scale-100'}`}>
            <h1 className="text-2xl font-bold text-chalk-text mb-1.5 flex items-center justify-center gap-2">
              <ChalkboardSimple size={28} />
              chalk
            </h1>
            <div className={`transition-all duration-500 overflow-hidden ${isVisuallyRaised ? 'opacity-0 max-h-0' : 'opacity-100 max-h-8'}`}>
              <p className="text-sm text-slate-500 mb-2">
                Learn from any YouTube video with AI
              </p>
            </div>
          </div>

          {/* Search input */}
          {searchInput}

          {/* Search type filter pills + sort — always rendered, visibility controlled */}
          <div className={`flex items-center gap-1.5 mt-3 justify-center flex-wrap transition-all duration-300 overflow-hidden ${
            showFilterPills ? 'opacity-100 max-h-20' : 'opacity-0 max-h-0 mt-0'
          }`}>
            {(['video', 'channel', 'playlist'] as SearchType[]).map((type) => {
              const label = type === 'video' ? 'Videos' : type === 'channel' ? 'Channels' : 'Playlists';
              return (
                <button
                  key={type}
                  onClick={() => handleSearchTypeChange(type)}
                  aria-label={`Filter by ${label}`}
                  aria-pressed={searchType === type}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition-all duration-200 ${searchTypePillClasses(type)}`}
                >
                  {label}
                </button>
              );
            })}

            {searchResults.length > 0 && (
              <select
                value={sortBy}
                onChange={(e) => handleSortChange(e.target.value as SortBy)}
                className="ml-2 text-xs bg-chalk-surface/60 border border-chalk-border/30 rounded-lg px-2 py-1 text-slate-400 focus:outline-none focus:ring-1 focus:ring-chalk-accent/40 cursor-pointer"
              >
                <option value="relevance">Relevance</option>
                <option value="viewCount">Most viewed</option>
                <option value="date">Upload date</option>
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Below-input content area — search results */}
      <div className="flex-1 px-4 pb-8 overflow-y-auto">
        <div className="max-w-2xl mx-auto">
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
        </div>
      </div>
    </div>
  );
}
