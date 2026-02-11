'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { extractVideoId } from '@/lib/video-utils';

const RECENT_VIDEOS_KEY = 'chalk-recent-videos';

interface RecentVideo {
  id: string;
  url: string;
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

function saveRecentVideo(videoId: string, url: string) {
  const recent = getRecentVideos().filter((v) => v.id !== videoId);
  recent.unshift({ id: videoId, url, timestamp: Date.now() });
  localStorage.setItem(RECENT_VIDEOS_KEY, JSON.stringify(recent.slice(0, 10)));
}

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [recentVideos, setRecentVideos] = useState<RecentVideo[]>([]);

  useEffect(() => {
    setRecentVideos(getRecentVideos());
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const videoId = extractVideoId(url.trim());
    if (!videoId) {
      setError('Please enter a valid YouTube URL');
      return;
    }

    saveRecentVideo(videoId, url.trim());
    router.push(`/watch?v=${videoId}`);
  };

  const handleRecentClick = (video: RecentVideo) => {
    router.push(`/watch?v=${video.id}`);
  };

  return (
    <div className="min-h-screen bg-chalk-bg flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-bold text-chalk-text mb-3 tracking-tight">
            Chalk
          </h1>
          <p className="text-lg text-slate-400 mb-10 max-w-md mx-auto leading-relaxed">
            Paste a YouTube URL. Pause the video. Ask AI anything about what you&apos;re watching.
          </p>

          {/* URL Input */}
          <form onSubmit={handleSubmit} className="w-full max-w-xl mx-auto">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(''); }}
                placeholder="Paste a YouTube URL..."
                className="flex-1 px-5 py-3.5 rounded-full bg-chalk-surface border border-chalk-border/40 text-chalk-text placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-chalk-accent/50 focus:border-transparent transition-all"
                autoFocus
              />
              <button
                type="submit"
                disabled={!url.trim()}
                className="px-6 py-3.5 rounded-full bg-chalk-accent text-white font-medium text-sm hover:bg-blue-600 disabled:opacity-30 disabled:hover:bg-chalk-accent transition-colors"
              >
                Watch
              </button>
            </div>
            {error && (
              <p className="mt-2 text-xs text-red-400 text-center">{error}</p>
            )}
          </form>

          {/* Example URLs */}
          <div className="mt-6 flex flex-wrap gap-2 justify-center">
            {[
              { label: '3Blue1Brown', url: 'https://www.youtube.com/watch?v=WUvTyaaNkzM' },
              { label: 'Veritasium', url: 'https://www.youtube.com/watch?v=HeQX2HjkcNo' },
              { label: 'Fireship', url: 'https://www.youtube.com/watch?v=r-98YRAF1dY' },
            ].map((ex) => (
              <button
                key={ex.url}
                onClick={() => {
                  const id = extractVideoId(ex.url);
                  if (id) {
                    saveRecentVideo(id, ex.url);
                    router.push(`/watch?v=${id}`);
                  }
                }}
                className="px-3 py-1.5 text-xs rounded-full bg-chalk-surface/60 border border-chalk-border/20 text-slate-400 hover:text-chalk-text hover:border-chalk-accent/40 transition-all"
              >
                Try {ex.label}
              </button>
            ))}
          </div>
        </div>

        {/* Recent videos */}
        {recentVideos.length > 0 && (
          <div className="mt-12 w-full max-w-xl mx-auto">
            <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3 text-center">
              Recent Videos
            </h3>
            <div className="space-y-1.5">
              {recentVideos.slice(0, 5).map((video) => (
                <button
                  key={video.id}
                  onClick={() => handleRecentClick(video)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-chalk-surface/30 border border-chalk-border/20 hover:bg-chalk-surface/50 hover:border-chalk-border/40 transition-all text-left"
                >
                  {/* Thumbnail */}
                  <img
                    src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`}
                    alt=""
                    className="w-20 h-11 object-cover rounded-lg bg-chalk-surface shrink-0"
                  />
                  <span className="text-xs text-slate-400 truncate">{video.url}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer link to math viz */}
      <div className="flex-none py-4 text-center border-t border-chalk-border/20">
        <a href="/math" className="text-xs text-slate-500 hover:text-slate-400 transition-colors">
          Chalk Math Visualizer
        </a>
      </div>
    </div>
  );
}
