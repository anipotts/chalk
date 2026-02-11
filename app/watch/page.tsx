'use client';

import { useState, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { TranscriptPanel } from '@/components/TranscriptPanel';
import { ChatOverlay } from '@/components/ChatOverlay';
import { useTranscriptStream } from '@/hooks/useTranscriptStream';
import type { MediaPlayerInstance } from '@vidstack/react';

// Dynamic import to avoid SSR issues with vidstack
const VideoPlayer = dynamic(
  () => import('@/components/VideoPlayer').then((m) => ({ default: m.VideoPlayer })),
  { ssr: false }
);

function WatchContent() {
  const searchParams = useSearchParams();
  const videoId = searchParams.get('v') || '';

  const { segments, status, statusMessage, error, method, progress } = useTranscriptStream(videoId || null);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const [chatVisible, setChatVisible] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcriptAutoOpened, setTranscriptAutoOpened] = useState(false);

  const playerRef = useRef<MediaPlayerInstance>(null);

  const hasSegments = segments.length > 0;
  const isLoadingTranscript = status === 'connecting' || status === 'extracting' || status === 'downloading' || status === 'transcribing';
  const transcriptAvailable = hasSegments || isLoadingTranscript;

  // Auto-open sidebar when first segment arrives
  if (hasSegments && !transcriptAutoOpened) {
    setShowTranscript(true);
    setTranscriptAutoOpened(true);
  }

  // Show chat on pause, hide on play
  const handlePause = useCallback(() => {
    setIsPaused(true);
    setChatVisible(true);
  }, []);

  const handlePlay = useCallback(() => {
    setIsPaused(false);
    setChatVisible(false);
  }, []);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleSeek = useCallback((seconds: number) => {
    if (playerRef.current) {
      playerRef.current.currentTime = seconds;
      playerRef.current.play();
    }
  }, []);

  const toggleChat = useCallback(() => {
    setChatVisible((prev) => !prev);
  }, []);

  if (!videoId) {
    return (
      <div className="flex items-center justify-center h-screen bg-chalk-bg">
        <div className="text-center">
          <p className="text-slate-400 mb-4">No video specified</p>
          <a href="/" className="text-chalk-accent hover:underline text-sm">Go back home</a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] bg-chalk-bg overflow-hidden">
      {/* Main area: video + chat overlay */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex-none flex items-center gap-3 px-4 py-2.5 border-b border-chalk-border/30 bg-chalk-bg/80 backdrop-blur-md">
          <a href="/" className="text-lg font-semibold text-chalk-text hover:text-chalk-accent transition-colors">
            Chalk
          </a>
          <span className="text-slate-600 hidden sm:inline">|</span>
          <span className="text-xs text-slate-400 truncate hidden sm:inline">Video Assistant</span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => transcriptAvailable && setShowTranscript((prev) => !prev)}
              disabled={!transcriptAvailable && status !== 'error'}
              className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                !transcriptAvailable && status !== 'error'
                  ? 'text-slate-600 bg-chalk-surface/30 border border-chalk-border/20 cursor-not-allowed'
                  : showTranscript
                    ? 'bg-chalk-accent/15 text-chalk-accent border border-chalk-accent/30'
                    : 'text-slate-400 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30'
              }`}
            >
              Transcript
            </button>
            <button
              onClick={toggleChat}
              className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                chatVisible
                  ? 'bg-chalk-accent/15 text-chalk-accent border border-chalk-accent/30'
                  : 'text-slate-400 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30'
              }`}
            >
              Chat
            </button>
          </div>
        </div>

        {/* Video + transcript (mobile) + chat overlay */}
        <div className="flex-1 relative min-h-0 flex flex-col">
          {/* Video area — shrinks when transcript panel is open on mobile */}
          <div className={`${
            showTranscript && transcriptAvailable ? 'shrink-0 max-h-[55%] lg:max-h-none lg:flex-1' : 'flex-1'
          } overflow-hidden min-h-0`}>
            <div className="flex items-start justify-center p-2 sm:p-4 h-full">
              <div className="w-full max-w-5xl">
                <VideoPlayer
                  videoId={videoId}
                  onPause={handlePause}
                  onPlay={handlePlay}
                  onTimeUpdate={handleTimeUpdate}
                  playerRef={playerRef}
                />
              </div>
            </div>
          </div>

          {/* Mobile inline transcript — separate flex section, visible without scrolling */}
          {showTranscript && (hasSegments || isLoadingTranscript) && (
            <div className="lg:hidden flex-1 min-h-0 overflow-hidden">
              <TranscriptPanel
                segments={segments}
                currentTime={currentTime}
                onSeek={handleSeek}
                status={status}
                statusMessage={statusMessage}
                method={method}
                progress={progress}
                error={error || undefined}
                variant="inline"
                onClose={() => setShowTranscript(false)}
              />
            </div>
          )}

          {/* Chat overlay */}
          <ChatOverlay
            visible={chatVisible}
            segments={segments}
            currentTime={currentTime}
            onSeek={handleSeek}
            onToggle={toggleChat}
          />
        </div>
      </div>

      {/* Transcript sidebar (desktop only) */}
      {showTranscript && (
        <div className="hidden lg:block w-80 shrink-0 h-full overflow-hidden">
          <TranscriptPanel
            segments={segments}
            currentTime={currentTime}
            onSeek={handleSeek}
            status={status}
            statusMessage={statusMessage}
            method={method}
            progress={progress}
            error={error || undefined}
          />
        </div>
      )}
    </div>
  );
}

export default function WatchPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-chalk-bg">
        <div className="w-6 h-6 border-2 border-chalk-accent/40 border-t-chalk-accent rounded-full animate-spin" />
      </div>
    }>
      <WatchContent />
    </Suspense>
  );
}
