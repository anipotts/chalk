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

    let cancelled = false;
    setLoading(true);

    fetch(
      `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    )
      .then((res) => res.json())
      .then((data: { title?: string; author_name?: string }) => {
        if (cancelled) return;
        if (data.title) {
          setTitle(data.title);
        }
        if (data.author_name) {
          setChannelName(data.author_name);
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Silently fail — title is optional
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [videoId]);

  return { title, channelName, loading };
}
