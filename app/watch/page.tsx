'use client';

import { useState, useRef, useCallback, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { TranscriptPanel } from '@/components/TranscriptPanel';
import { ChatOverlay } from '@/components/ChatOverlay';
import { StudySummaryButton } from '@/components/StudySummary';
import { useTranscriptStream } from '@/hooks/useTranscriptStream';
import { useVideoTitle } from '@/hooks/useVideoTitle';
import { listCollections, addVideoToCollection, type StudyCollection } from '@/lib/video-sessions';
import type { MediaPlayerInstance } from '@vidstack/react';

// Dynamic import to avoid SSR issues with vidstack
const VideoPlayer = dynamic(
  () => import('@/components/VideoPlayer').then((m) => ({ default: m.VideoPlayer })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full aspect-video rounded-xl bg-chalk-surface/30 animate-pulse flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-chalk-surface/50 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-slate-500">
              <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
            </svg>
          </div>
          <span className="text-xs text-slate-500">Loading player...</span>
        </div>
      </div>
    ),
  }
);

const SHORTCUTS = [
  { keys: ['Space', 'K'], action: 'Play / Pause' },
  { keys: ['J'], action: 'Back 10s' },
  { keys: ['L'], action: 'Forward 10s' },
  { keys: ['\u2190'], action: 'Back 5s' },
  { keys: ['\u2192'], action: 'Forward 5s' },
  { keys: ['C'], action: 'Toggle chat' },
  { keys: ['F'], action: 'Fullscreen' },
  { keys: ['Esc'], action: 'Close chat' },
];

function KeyboardShortcutsButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`w-7 h-7 rounded-lg text-xs flex items-center justify-center transition-colors ${
          open
            ? 'bg-chalk-accent/15 text-chalk-accent border border-chalk-accent/30'
            : 'text-slate-500 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30'
        }`}
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts (?)"
      >
        ?
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-2 w-52 rounded-xl bg-chalk-surface border border-chalk-border/40 shadow-xl shadow-black/30 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-3 py-2 border-b border-chalk-border/30">
            <span className="text-xs font-medium text-chalk-text">Keyboard Shortcuts</span>
          </div>
          <div className="p-2 space-y-1">
            {SHORTCUTS.map((s) => (
              <div key={s.action} className="flex items-center justify-between px-2 py-1">
                <span className="text-[11px] text-slate-400">{s.action}</span>
                <div className="flex gap-1">
                  {s.keys.map((k) => (
                    <kbd key={k} className="px-1.5 py-0.5 rounded bg-chalk-bg/80 border border-chalk-border/40 text-[10px] font-mono text-slate-300">
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SaveToCollectionButton({ videoId, videoTitle }: { videoId: string; videoTitle?: string }) {
  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState<StudyCollection[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      listCollections().then(setCollections);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleSave = async (collectionId: string) => {
    await addVideoToCollection(collectionId, videoId, videoTitle);
    setSaved(collectionId);
    setTimeout(() => { setSaved(null); setOpen(false); }, 1000);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`w-7 h-7 rounded-lg text-xs flex items-center justify-center transition-colors ${
          open
            ? 'bg-chalk-accent/15 text-chalk-accent border border-chalk-accent/30'
            : 'text-slate-500 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30'
        }`}
        aria-label="Save to collection"
        title="Save to collection"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M3.75 2a.75.75 0 0 0-.75.75v10.5a.75.75 0 0 0 1.28.53L8 10.06l3.72 3.72a.75.75 0 0 0 1.28-.53V2.75a.75.75 0 0 0-.75-.75h-8.5Z" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-2 w-48 rounded-xl bg-chalk-surface border border-chalk-border/40 shadow-xl shadow-black/30 overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-chalk-border/30">
            <span className="text-xs font-medium text-chalk-text">Save to Collection</span>
          </div>
          <div className="max-h-40 overflow-y-auto">
            {collections.length === 0 ? (
              <div className="px-3 py-3 text-center">
                <p className="text-[11px] text-slate-500">No collections</p>
                <a href="/collections" className="text-[11px] text-chalk-accent hover:underline">Create one</a>
              </div>
            ) : (
              collections.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleSave(c.id)}
                  className="w-full text-left px-3 py-2 text-xs text-slate-400 hover:text-chalk-text hover:bg-chalk-bg/40 transition-colors flex items-center justify-between"
                >
                  <span className="truncate">{c.name}</span>
                  {saved === c.id && (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-emerald-400 shrink-0">
                      <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WatchContent() {
  const searchParams = useSearchParams();
  const videoId = searchParams.get('v') || '';

  const { segments, status, statusMessage, error, method, progress } = useTranscriptStream(videoId || null);
  const { title: videoTitle } = useVideoTitle(videoId || null);

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

  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);

  const handleAskAbout = useCallback((timestamp: number, _text: string) => {
    const mins = Math.floor(timestamp / 60);
    const secs = Math.floor(timestamp % 60);
    const ts = `${mins}:${secs.toString().padStart(2, '0')}`;
    setPendingQuestion(`What's being discussed at [${ts}]?`);
    setChatVisible(true);
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
          <div className="hidden sm:flex items-center gap-2 min-w-0 max-w-[400px]">
            <img
              src={`https://i.ytimg.com/vi/${videoId}/default.jpg`}
              alt=""
              className="w-8 h-6 object-cover rounded shrink-0"
            />
            <span className="text-xs text-slate-400 truncate" title={videoTitle || 'Video Assistant'}>
              {videoTitle || 'Video Assistant'}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <SaveToCollectionButton videoId={videoId} videoTitle={videoTitle || undefined} />
            <KeyboardShortcutsButton />
            <StudySummaryButton
              videoId={videoId}
              videoTitle={videoTitle || undefined}
              segments={segments}
              onSeek={handleSeek}
            />
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
                onAskAbout={handleAskAbout}
              />
            </div>
          )}

          {/* Chat overlay */}
          <ChatOverlay
            visible={chatVisible}
            segments={segments}
            currentTime={currentTime}
            videoId={videoId}
            videoTitle={videoTitle || undefined}
            onSeek={handleSeek}
            onToggle={toggleChat}
            pendingQuestion={pendingQuestion}
            onPendingQuestionConsumed={() => setPendingQuestion(null)}
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
            onAskAbout={handleAskAbout}
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
