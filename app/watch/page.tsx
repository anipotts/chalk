'use client';

import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { TranscriptPanel } from '@/components/TranscriptPanel';
import { ChatOverlay } from '@/components/ChatOverlay';
import type { TranscriptSegment } from '@/lib/video-utils';
import type { MediaPlayerInstance } from '@vidstack/react';

// Dynamic import to avoid SSR issues with vidstack
const VideoPlayer = dynamic(
  () => import('@/components/VideoPlayer').then((m) => ({ default: m.VideoPlayer })),
  { ssr: false }
);

function WatchContent() {
  const searchParams = useSearchParams();
  const videoId = searchParams.get('v') || '';

  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(true);
  const [transcriptError, setTranscriptError] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const [chatVisible, setChatVisible] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);

  const playerRef = useRef<MediaPlayerInstance>(null);

  // Fetch transcript on mount
  useEffect(() => {
    if (!videoId) return;
    setTranscriptLoading(true);
    setTranscriptError('');

    fetch('/api/transcript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Failed to fetch transcript' }));
          throw new Error(data.error || 'Failed to fetch transcript');
        }
        return res.json();
      })
      .then((data) => {
        setSegments(data.segments || []);
      })
      .catch((err) => {
        setTranscriptError(err.message);
      })
      .finally(() => {
        setTranscriptLoading(false);
      });
  }, [videoId]);

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
    <div className="flex h-screen bg-chalk-bg overflow-hidden">
      {/* Main area: video + chat overlay */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex-none flex items-center gap-3 px-4 py-2.5 border-b border-chalk-border/30 bg-chalk-bg/80 backdrop-blur-md">
          <a href="/" className="text-lg font-semibold text-chalk-text hover:text-chalk-accent transition-colors">
            Chalk
          </a>
          <span className="text-slate-600">|</span>
          <span className="text-xs text-slate-400 truncate">Video Assistant</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowTranscript((prev) => !prev)}
              className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                showTranscript
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

        {/* Video + overlay container */}
        <div className="flex-1 relative min-h-0">
          <div className="h-full flex items-start justify-center p-4 overflow-y-auto">
            <div className="w-full max-w-5xl">
              <VideoPlayer
                videoId={videoId}
                onPause={handlePause}
                onPlay={handlePlay}
                onTimeUpdate={handleTimeUpdate}
                playerRef={playerRef}
              />

              {/* Paused indicator */}
              {isPaused && !chatVisible && (
                <div className="mt-3 text-center">
                  <button
                    onClick={toggleChat}
                    className="text-xs text-slate-500 hover:text-chalk-accent transition-colors"
                  >
                    Press C or click to open chat
                  </button>
                </div>
              )}
            </div>
          </div>

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

      {/* Transcript sidebar (desktop) */}
      {showTranscript && (
        <div className="hidden lg:flex w-80 shrink-0">
          <TranscriptPanel
            segments={segments}
            currentTime={currentTime}
            onSeek={handleSeek}
            loading={transcriptLoading}
            error={transcriptError}
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
