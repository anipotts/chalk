'use client';

import { useState, useEffect, useRef } from 'react';

interface CurriculumVideo {
  videoId: string;
  title: string;
  index: number;
  segmentCount: number;
}

interface UseCurriculumContextReturn {
  curriculumContext: string | null;
  videoCount: number;
  videos: CurriculumVideo[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Fetches and caches cross-video curriculum context for playlist videos.
 * Enables Opus 4.6's 1M context window to draw connections across videos.
 */
export function useCurriculumContext(
  playlistId: string | null,
  currentVideoId: string,
): UseCurriculumContextReturn {
  const [curriculumContext, setCurriculumContext] = useState<string | null>(null);
  const [videos, setVideos] = useState<CurriculumVideo[]>([]);
  const [videoCount, setVideoCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Map<string, { context: string; videos: CurriculumVideo[]; videoCount: number }>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!playlistId || !currentVideoId) {
      setCurriculumContext(null);
      setVideos([]);
      setVideoCount(0);
      return;
    }

    const cacheKey = `${playlistId}:${currentVideoId}`;

    // Check client-side cache
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setCurriculumContext(cached.context);
      setVideos(cached.videos);
      setVideoCount(cached.videoCount);
      return;
    }

    // Abort any in-flight request
    abortRef.current?.abort('new request');
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    fetch(`/api/curriculum-context?playlistId=${encodeURIComponent(playlistId)}&currentVideoId=${encodeURIComponent(currentVideoId)}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch curriculum context');
        return res.json();
      })
      .then((data) => {
        const result = {
          context: data.context || null,
          videos: data.videos || [],
          videoCount: data.videoCount || 0,
        };

        // Cache the result
        cacheRef.current.set(cacheKey, result);

        setCurriculumContext(result.context);
        setVideos(result.videos);
        setVideoCount(result.videoCount);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Curriculum context fetch error:', err);
        setError(err.message);
      })
      .finally(() => {
        setIsLoading(false);
      });

    return () => {
      controller.abort('cleanup');
    };
  }, [playlistId, currentVideoId]);

  return { curriculumContext, videoCount, videos, isLoading, error };
}
