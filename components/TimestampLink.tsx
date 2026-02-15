'use client';

import { useVideoTime } from './VideoTimeContext';

interface TimestampLinkProps {
  timestamp: string; // e.g. "5:32"
  seconds: number;
  onSeek: (seconds: number) => void;
  videoId?: string;
}

export function TimestampLink({ timestamp, seconds, onSeek }: TimestampLinkProps) {
  const { currentTime, isPaused } = useVideoTime();
  const isNowPlaying = !isPaused && Math.abs(currentTime - seconds) <= 5;

  return (
    <button
      onClick={() => onSeek(seconds)}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-mono text-xs transition-all duration-300 cursor-pointer ${
        isNowPlaying
          ? 'bg-emerald-500/20 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.2)]'
          : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 hover:text-blue-300'
      }`}
      aria-label={`Seek to ${timestamp} in video`}
    >
      {isNowPlaying && (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
      )}
      {timestamp}
    </button>
  );
}
