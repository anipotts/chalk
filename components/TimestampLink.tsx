'use client';

import { useState } from 'react';

interface TimestampLinkProps {
  timestamp: string; // e.g. "5:32"
  seconds: number;
  onSeek: (seconds: number) => void;
  videoId?: string;
}

export function TimestampLink({ timestamp, seconds, onSeek, videoId }: TimestampLinkProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoId) return;
    const link = `https://youtube.com/watch?v=${videoId}&t=${Math.floor(seconds)}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <span className="inline-flex items-center group/ts">
      <button
        onClick={() => onSeek(seconds)}
        className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-blue-500/20 text-blue-400 font-mono text-xs hover:bg-blue-500/30 hover:text-blue-300 transition-colors cursor-pointer"
        title={`Jump to ${timestamp}`}
        aria-label={`Seek to ${timestamp} in video`}
      >
        {timestamp}
      </button>
      {videoId && (
        <button
          onClick={handleShare}
          className={`ml-0.5 p-0.5 rounded transition-all ${
            copied
              ? 'text-emerald-400 opacity-100'
              : 'opacity-0 group-hover/ts:opacity-60 text-slate-500 hover:!opacity-100 hover:text-blue-400'
          }`}
          title={copied ? 'Copied!' : 'Copy YouTube link'}
          aria-label={`Copy link to ${timestamp}`}
        >
          {copied ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5">
              <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5">
              <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72Z" />
              <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z" />
            </svg>
          )}
        </button>
      )}
    </span>
  );
}
