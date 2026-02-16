'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { storageKey } from '@/lib/brand';
import { X } from '@phosphor-icons/react';
import Image from 'next/image';

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
  compact?: boolean;
}

export default function SearchDropdown({ isVisible, onSelectTopic, compact = false }: SearchDropdownProps) {
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
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={`absolute top-full mt-1 rounded-lg border shadow-[0_8px_40px_rgba(0,0,0,0.5)] z-50 overflow-hidden ${
        compact
          ? 'left-0 w-[440px] border-white/[0.06]'
          : 'left-0 right-0 border-white/[0.04]'
      }`}
      style={compact
        ? { background: 'rgba(12,12,12,0.85)', backdropFilter: 'blur(40px) saturate(130%)', WebkitBackdropFilter: 'blur(40px) saturate(130%)' }
        : { background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(40px) saturate(130%)', WebkitBackdropFilter: 'blur(40px) saturate(130%)' }
      }
    >
      {recentVideos.length > 0 ? (
        <div className="py-1.5">
          <div className="px-3 py-1">
            <span className="text-[9px] tracking-[0.15em] uppercase text-white/20">
              Recent
            </span>
          </div>
          {recentVideos.map((video) => (
            <div
              key={video.id}
              role="button"
              onClick={() => router.push(`/watch?v=${video.id}`)}
              className="flex items-center gap-2.5 px-3 py-[6px] hover:bg-white/[0.04] transition-colors group cursor-pointer"
            >
              {/* Thumbnail */}
              <div className={`shrink-0 rounded overflow-hidden bg-white/[0.03] relative ${compact ? 'w-8 h-5' : 'w-10 h-6'}`}>
                <Image
                  src={`https://img.youtube.com/vi/${video.id}/default.jpg`}
                  alt=""
                  fill
                  className="object-cover opacity-60 group-hover:opacity-80 transition-opacity duration-200"
                  sizes={compact ? '32px' : '40px'}
                  unoptimized
                />
              </div>

              {/* Title + channel */}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-white/50 truncate leading-tight group-hover:text-white/80 transition-colors duration-200">
                  {video.title || video.id}
                </p>
                {video.channelName && (
                  <p className="text-[9px] text-white/20 truncate leading-tight mt-px group-hover:text-white/30 transition-colors duration-200">
                    {video.channelName}
                  </p>
                )}
              </div>

              {/* Time ago */}
              <span className="text-[9px] text-white/15 font-mono shrink-0 tabular-nums">
                {timeAgo(video.timestamp)}
              </span>

              {/* Remove button */}
              <button
                onClick={(e) => handleRemove(e, video.id)}
                className="shrink-0 p-0.5 rounded text-white/0 group-hover:text-white/20 hover:!text-white/50 hover:bg-white/[0.06] transition-all duration-200"
                title="Remove"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-white/20 text-center py-4">No recent videos</p>
      )}
    </motion.div>
  );
}
