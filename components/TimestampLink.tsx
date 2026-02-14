'use client';

interface TimestampLinkProps {
  timestamp: string; // e.g. "5:32"
  seconds: number;
  onSeek: (seconds: number) => void;
  videoId?: string;
}

export function TimestampLink({ timestamp, seconds, onSeek }: TimestampLinkProps) {
  return (
    <button
      onClick={() => onSeek(seconds)}
      className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-blue-500/20 text-blue-400 font-mono text-xs hover:bg-blue-500/30 hover:text-blue-300 transition-colors cursor-pointer"
      aria-label={`Seek to ${timestamp} in video`}
    >
      {timestamp}
    </button>
  );
}
