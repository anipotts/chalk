'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { TranscriptPanel } from './TranscriptPanel';
import { useTranscriptStream } from '@/hooks/useTranscriptStream';
import { useVideoTitle } from '@/hooks/useVideoTitle';
import { X, ArrowLeft, ArrowSquareOut } from '@phosphor-icons/react';
import type { MediaPlayerInstance } from '@vidstack/react';

const VideoPlayer = dynamic(() => import('./VideoPlayer').then((m) => m.VideoPlayer), { ssr: false });

export interface SideVideoEntry {
  videoId: string;
  title: string;
  channelName: string;
  seekTo?: number;
}

interface SideVideoPanelProps {
  /** Stack of side videos. The last entry is the currently displayed one. */
  stack: SideVideoEntry[];
  onPop: () => void;
  onClose: () => void;
  onOpenVideo?: (videoId: string, title: string, channelName: string, seekTo?: number) => void;
}

export function SideVideoPanel({ stack, onPop, onClose, onOpenVideo }: SideVideoPanelProps) {
  const entry = stack[stack.length - 1];
  if (!entry) return null;

  return (
    <div className="flex flex-col h-full bg-chalk-bg">
      {/* Header */}
      <SidePanelHeader
        stack={stack}
        onPop={onPop}
        onClose={onClose}
        entry={entry}
      />

      {/* Content */}
      <SidePanelContent entry={entry} onOpenVideo={onOpenVideo} />
    </div>
  );
}

function SidePanelHeader({
  stack,
  onPop,
  onClose,
  entry,
}: {
  stack: SideVideoEntry[];
  onPop: () => void;
  onClose: () => void;
  entry: SideVideoEntry;
}) {
  return (
    <div className="flex-none flex items-center gap-2 px-4 py-2.5 border-b border-chalk-border/30 bg-chalk-bg/95 backdrop-blur-sm">
      {/* Back button (only if stack depth > 1) */}
      {stack.length > 1 && (
        <button
          onClick={onPop}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
          title="Back to previous video"
        >
          <ArrowLeft size={14} weight="bold" />
        </button>
      )}

      {/* Breadcrumb trail */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 text-[10px] text-slate-500 overflow-hidden">
          {stack.map((s, i) => (
            <span key={s.videoId} className="flex items-center gap-1 min-w-0">
              {i > 0 && <span className="text-slate-600">&rsaquo;</span>}
              <span className={`truncate ${i === stack.length - 1 ? 'text-slate-300' : ''}`}>
                {s.title.length > 35 ? s.title.slice(0, 35) + '...' : s.title}
              </span>
            </span>
          ))}
        </div>
        <div className="text-xs text-slate-400 truncate">{entry.channelName}</div>
      </div>

      {/* Open in new tab */}
      <button
        onClick={() => {
          const url = entry.seekTo
            ? `/watch?v=${entry.videoId}&t=${Math.floor(entry.seekTo)}`
            : `/watch?v=${entry.videoId}`;
          window.open(url, '_blank');
        }}
        className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
        title="Open in new tab"
      >
        <ArrowSquareOut size={14} />
      </button>

      {/* Close */}
      <button
        onClick={onClose}
        className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
        title="Close side panel"
      >
        <X size={14} weight="bold" />
      </button>
    </div>
  );
}

function SidePanelContent({ entry, onOpenVideo }: {
  entry: SideVideoEntry;
  onOpenVideo?: (videoId: string, title: string, channelName: string, seekTo?: number) => void;
}) {
  const playerRef = useRef<MediaPlayerInstance>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [showTranscript, setShowTranscript] = useState(true);

  // Fetch transcript for side video
  const {
    segments,
    status,
    statusMessage,
    source,
    progress,
    error,
  } = useTranscriptStream(entry.videoId);

  // Fetch title (falls back to the entry title)
  const { title: fetchedTitle } = useVideoTitle(entry.videoId);
  const displayTitle = fetchedTitle || entry.title;

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleSeek = useCallback((seconds: number) => {
    const player = playerRef.current;
    if (player) {
      player.currentTime = seconds;
    }
  }, []);

  const handleAskAbout = useCallback((_timestamp: number, _text: string) => {
    // Could integrate with the main chat in the future
  }, []);

  // Seek to entry timestamp on mount
  useEffect(() => {
    if (entry.seekTo && playerRef.current) {
      const timer = setTimeout(() => {
        if (playerRef.current) {
          playerRef.current.currentTime = entry.seekTo!;
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [entry.seekTo, entry.videoId]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Video player — full width in the 45% column */}
      <div className="flex-none">
        <div className="relative overflow-hidden">
          <VideoPlayer
            playerRef={playerRef}
            videoId={entry.videoId}
            onTimeUpdate={handleTimeUpdate}
          />
        </div>
        <div className="px-4 py-2">
          <div className="text-sm font-medium text-slate-200 line-clamp-2">{displayTitle}</div>
        </div>
      </div>

      {/* Toggle transcript */}
      <div className="flex-none flex items-center px-4 pb-1">
        <button
          onClick={() => setShowTranscript(v => !v)}
          className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${
            showTranscript
              ? 'bg-chalk-accent/15 text-chalk-accent'
              : 'text-slate-500 hover:text-slate-300 bg-white/[0.04]'
          }`}
        >
          Transcript
        </button>
      </div>

      {/* Transcript */}
      {showTranscript && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <TranscriptPanel
            segments={segments}
            currentTime={currentTime}
            onSeek={handleSeek}
            status={status}
            statusMessage={statusMessage}
            source={source}
            progress={progress}
            error={error ?? undefined}
            variant="sidebar"
            videoId={entry.videoId}
            videoTitle={displayTitle}
            onAskAbout={handleAskAbout}
          />
        </div>
      )}
    </div>
  );
}
