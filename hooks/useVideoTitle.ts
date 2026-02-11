'use client';

import { useState, useEffect } from 'react';

/**
 * Fetch YouTube video title using the noembed.com API (no API key needed).
 * Falls back gracefully if the fetch fails.
 */
export function useVideoTitle(videoId: string | null): {
  title: string | null;
  loading: boolean;
} {
  const [title, setTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!videoId) return;

    setLoading(true);
    const controller = new AbortController();

    fetch(
      `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
      { signal: controller.signal }
    )
      .then((res) => res.json())
      .then((data: { title?: string }) => {
        if (data.title) {
          setTitle(data.title);
        }
      })
      .catch(() => {
        // Silently fail — title is optional
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [videoId]);

  return { title, loading };
}
