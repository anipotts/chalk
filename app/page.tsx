'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { extractVideoId } from '@/lib/video-utils';

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
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [recentVideos, setRecentVideos] = useState<RecentVideo[]>([]);

  useEffect(() => {
    setRecentVideos(getRecentVideos());
  }, []);

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

  return (
    <div className="min-h-screen bg-chalk-bg flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-xl text-center">
          <h1 className="text-3xl font-bold text-chalk-text mb-2">Chalk</h1>
          <p className="text-sm text-slate-500 mb-8">
            Learn from any YouTube video with AI
          </p>

          <form onSubmit={handleSubmit} className="flex gap-2">
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
            <p className="mt-2 text-xs text-red-400">{error}</p>
          )}
        </div>
      </div>

      {/* Recent videos */}
      {recentVideos.length > 0 && (
        <div className="px-4 pb-12 max-w-xl mx-auto w-full">
          <h2 className="text-xs font-medium text-slate-500 mb-3 uppercase tracking-wider">Recent</h2>
          <div className="space-y-2">
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
  );
}
