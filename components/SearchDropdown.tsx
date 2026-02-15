'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { storageKey } from '@/lib/brand';
import { X } from '@phosphor-icons/react';

interface RecentVideo {
  id: string;
  url: string;
  title?: string;
  channelName?: string;
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

function removeRecentVideo(id: string): RecentVideo[] {
  try {
    const videos = getRecentVideos().filter((v) => v.id !== id);
    localStorage.setItem(RECENT_VIDEOS_KEY, JSON.stringify(videos));
    return videos;
  } catch {
    return [];
  }
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
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

  const handleRemove = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    const updated = removeRecentVideo(id);
    setRecentVideos(updated.slice(0, 8));
  }, []);

  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="absolute top-full left-0 mt-2 bg-chalk-surface/95 backdrop-blur-xl border border-chalk-border/50 rounded-xl shadow-2xl shadow-black/50 z-50 overflow-hidden w-[320px]"
    >
      <div className="py-1.5 max-h-[300px] overflow-y-auto">
        {recentVideos.length > 0 ? (
          <div>
            <h3 className="text-[10px] uppercase tracking-wider text-slate-600 font-mono px-3 py-1">
              Recent
            </h3>
            {recentVideos.map((video) => (
              <div
                key={video.id}
                role="button"
                onClick={() => router.push(`/watch?v=${video.id}`)}
                className="flex items-center gap-2 w-full text-left px-3 py-1.5 hover:bg-white/[0.04] transition-colors group cursor-pointer"
              >
                <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                  <span className="text-[11px] text-slate-300 truncate group-hover:text-chalk-text transition-colors">
                    {video.title || video.id}
                  </span>
                  {video.channelName && (
                    <span className="text-[10px] text-slate-600 shrink-0 truncate max-w-[80px]">
                      {video.channelName}
                    </span>
                  )}
                </div>
                <span className="text-[9px] text-slate-600 font-mono shrink-0">{timeAgo(video.timestamp)}</span>
                <button
                  onClick={(e) => handleRemove(e, video.id)}
                  className="shrink-0 p-0.5 rounded text-slate-700 opacity-0 group-hover:opacity-100 hover:text-slate-400 hover:bg-white/[0.06] transition-all"
                  title="Remove"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-600 text-center py-3">No recent videos</p>
        )}
      </div>
    </motion.div>
  );
}
