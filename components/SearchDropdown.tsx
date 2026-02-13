'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { storageKey } from '@/lib/brand';

interface RecentVideo {
  id: string;
  url: string;
  title?: string;
  timestamp: number;
}

const RECENT_VIDEOS_KEY = storageKey('recent-videos');

function getRecentVideos(): RecentVideo[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_VIDEOS_KEY) || '[]');
  } catch {
    return [];
  }
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

interface SearchDropdownProps {
  isVisible: boolean;
  onSelectTopic: (topic: string) => void;
}

export default function SearchDropdown({ isVisible, onSelectTopic }: SearchDropdownProps) {
  const router = useRouter();
  const [recentVideos, setRecentVideos] = useState<RecentVideo[]>([]);

  useEffect(() => {
    if (isVisible) {
      setRecentVideos(getRecentVideos().slice(0, 8));
    }
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="absolute top-full left-0 right-0 mt-2 bg-chalk-surface/95 backdrop-blur-xl border border-chalk-border/50 rounded-xl shadow-2xl shadow-black/50 z-50 overflow-hidden"
    >
      <div className="p-3 max-h-[360px] overflow-y-auto">
        {recentVideos.length > 0 ? (
          <div>
            <h3 className="text-[11px] uppercase tracking-wider text-slate-500 font-medium font-mono px-1 mb-2">
              Recent
            </h3>
            <div className="space-y-0.5">
              {recentVideos.map((video) => (
                <button
                  key={video.id}
                  onClick={() => router.push(`/watch?v=${video.id}`)}
                  className="flex items-center gap-3 w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group"
                >
                  <img
                    src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`}
                    alt={video.title || video.id}
                    className="w-[60px] h-[34px] rounded-md object-cover bg-chalk-surface/30 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-300 truncate group-hover:text-chalk-text transition-colors">
                      {video.title || video.id}
                    </p>
                    <p className="text-[10px] text-slate-600 mt-0.5 font-mono">{timeAgo(video.timestamp)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-600 text-center py-3">No recent videos</p>
        )}
      </div>
    </motion.div>
  );
}
