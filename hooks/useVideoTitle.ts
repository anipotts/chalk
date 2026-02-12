'use client';

import { useState, useEffect } from 'react';

/**
 * Fetch YouTube video title and channel name using the noembed.com API (no API key needed).
 * Falls back gracefully if the fetch fails.
 */
export function useVideoTitle(videoId: string | null): {
  title: string | null;
  channelName: string | null;
  loading: boolean;
} {
  const [title, setTitle] = useState<string | null>(null);
  const [channelName, setChannelName] = useState<string | null>(null);
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
      .then((data: { title?: string; author_name?: string }) => {
        if (data.title) {
          setTitle(data.title);
        }
        if (data.author_name) {
          setChannelName(data.author_name);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // Silently fail — title is optional
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [videoId]);

  return { title, channelName, loading };
}
