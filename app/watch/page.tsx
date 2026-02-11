'use client';

import { useState, useRef, useCallback, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { TranscriptPanel } from '@/components/TranscriptPanel';
import { ChatOverlay } from '@/components/ChatOverlay';
import { useTranscriptStream } from '@/hooks/useTranscriptStream';
import { useVideoTitle } from '@/hooks/useVideoTitle';
import { formatTimestamp } from '@/lib/video-utils';
import type { MediaPlayerInstance } from '@vidstack/react';

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

const SPEED_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 8, 10];

function SpeedControlButton({ playerRef }: { playerRef: React.RefObject<MediaPlayerInstance | null> }) {
  const [open, setOpen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      try {
        if (playerRef.current) setSpeed(playerRef.current.playbackRate);
      } catch { /* Vidstack $state proxy may throw during teardown */ }
    }, 500);
    return () => clearInterval(interval);
  }, [playerRef]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleSelect = (s: number) => {
    try {
      if (playerRef.current) {
        playerRef.current.playbackRate = s;
        setSpeed(s);
        localStorage.setItem('chalk-playback-speed', String(s));
      }
    } catch { /* Vidstack $state proxy may throw */ }
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`px-1.5 py-1 rounded-lg text-[11px] font-mono font-medium transition-colors ${
          speed !== 1
            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
            : 'text-slate-500 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30'
        }`}
        title="Playback speed"
      >
        {speed}x
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-2 w-28 rounded-xl bg-chalk-surface border border-chalk-border/40 shadow-xl shadow-black/30 z-50">
          <div className="p-1 max-h-64 overflow-y-auto">
            {SPEED_PRESETS.map((s) => (
              <button
                key={s}
                onClick={() => handleSelect(s)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  speed === s
                    ? 'bg-chalk-accent/15 text-chalk-accent font-medium'
                    : 'text-slate-400 hover:text-chalk-text hover:bg-chalk-bg/40'
                }`}
              >
                {s}x{s === 1 ? ' (Normal)' : ''}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* --- Mobile collapse/expand components --- */

function SectionGrip({ onTap, sectionName }: { onTap: () => void; sectionName: string }) {
  return (
    <button
      onClick={onTap}
      aria-expanded="true"
      aria-label={`Collapse ${sectionName}`}
      className="md:hidden flex-none h-6 w-full flex items-center justify-center cursor-pointer active:bg-white/[0.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chalk-accent"
    >
      <div className="w-8 h-[3px] rounded-full bg-white/[0.25] active:scale-x-150 transition-transform" />
    </button>
  );
}

function WhisperBar({ label, meta, onTap }: { label: string; meta?: string; onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      aria-expanded="false"
      aria-label={`Expand ${label}`}
      className="md:hidden w-full h-10 flex items-center justify-between px-4 active:bg-white/[0.04] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chalk-accent"
    >
      <span className="text-[11px] text-slate-400 font-medium tracking-wide">{label}</span>
      <div className="flex items-center gap-2">
        {meta && <span className="text-[10px] text-slate-400 font-mono">{meta}</span>}
        <span className="text-xs text-slate-400">&#9662;</span>
      </div>
    </button>
  );
}

function WatchContent() {
  const searchParams = useSearchParams();
  const videoId = searchParams.get('v') || '';

  const { segments, status, statusMessage, error, source, progress } = useTranscriptStream(videoId || null);
  const { title: videoTitle } = useVideoTitle(videoId || null);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const [chatVisible, setChatVisible] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcriptAutoOpened, setTranscriptAutoOpened] = useState(false);
  const [continueFrom, setContinueFrom] = useState<number | null>(null);
  const [sessionWatchTime, setSessionWatchTime] = useState(0);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [autoPauseChat, setAutoPauseChat] = useState(true);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [chatMeta, setChatMeta] = useState({ messageCount: 0, isStreaming: false });

  // Load preferences after mount to avoid hydration mismatch
  useEffect(() => {
    const stored = localStorage.getItem('chalk-auto-pause-chat');
    if (stored === 'false') setAutoPauseChat(false);
    try {
      const layout = localStorage.getItem('chalk-mobile-layout');
      if (layout) {
        const { tc, cc } = JSON.parse(layout);
        if (tc) setTranscriptCollapsed(true);
        if (cc) setChatCollapsed(true);
      }
    } catch { /* ignore */ }
  }, []);

  // Persist mobile collapse state
  useEffect(() => {
    try {
      localStorage.setItem('chalk-mobile-layout', JSON.stringify({ tc: transcriptCollapsed, cc: chatCollapsed }));
    } catch { /* ignore */ }
  }, [transcriptCollapsed, chatCollapsed]);
  const playerRef = useRef<MediaPlayerInstance>(null);
  const progressSaveRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const watchTimeRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const currentTimeRef = useRef(0);
  const segmentsRef = useRef(segments);

  const hasSegments = segments.length > 0;
  currentTimeRef.current = currentTime;
  segmentsRef.current = segments;

  // Load saved progress
  useEffect(() => {
    if (!videoId) return;
    try {
      const hash = window.location.hash;
      const hashMatch = hash.match(/^#t=(\d+(?:\.\d+)?)$/);
      if (hashMatch) {
        const seconds = parseFloat(hashMatch[1]);
        if (seconds > 0) { setContinueFrom(seconds); return; }
      }
      const saved = localStorage.getItem(`chalk-progress-${videoId}`);
      if (saved) {
        const seconds = parseFloat(saved);
        if (seconds > 5) setContinueFrom(seconds);
      }
    } catch { /* ignore */ }
  }, [videoId]);

  // Save progress every 5s (refs avoid interval churn on every time update)
  useEffect(() => {
    if (!videoId) return;
    progressSaveRef.current = setInterval(() => {
      const t = currentTimeRef.current;
      const segs = segmentsRef.current;
      if (t > 5) {
        localStorage.setItem(`chalk-progress-${videoId}`, String(t));
        if (segs.length > 0) {
          const lastSeg = segs[segs.length - 1];
          const dur = lastSeg.offset + (lastSeg.duration || 0);
          if (dur > 0) localStorage.setItem(`chalk-duration-${videoId}`, String(dur));
        }
      }
    }, 5000);
    return () => clearInterval(progressSaveRef.current);
  }, [videoId]);

  // Track watch time
  useEffect(() => {
    if (!isPaused) {
      watchTimeRef.current = setInterval(() => {
        setSessionWatchTime((t) => t + 1);
      }, 1000);
    } else {
      clearInterval(watchTimeRef.current);
    }
    return () => clearInterval(watchTimeRef.current);
  }, [isPaused]);

  // Seek to saved position once player is available
  useEffect(() => {
    if (continueFrom === null || !playerRef.current) return;
    const timer = setInterval(() => {
      try {
        if (playerRef.current && playerRef.current.duration > 0) {
          playerRef.current.currentTime = continueFrom;
          clearInterval(timer);
        }
      } catch { /* Vidstack $state proxy may throw during init */ }
    }, 200);
    return () => clearInterval(timer);
  }, [continueFrom]);

  // Keyboard detection for mobile
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const handleResize = () => {
      setKeyboardOpen(vv.height < window.innerHeight * 0.75);
    };
    vv.addEventListener('resize', handleResize);
    return () => vv.removeEventListener('resize', handleResize);
  }, []);

  // Auto-open transcript when segments arrive
  useEffect(() => {
    if (hasSegments && !transcriptAutoOpened) {
      setShowTranscript(true);
      setTranscriptAutoOpened(true);
    }
  }, [hasSegments, transcriptAutoOpened]);

  const handlePause = useCallback(() => {
    setIsPaused(true);
    if (autoPauseChat) setChatVisible(true);
  }, [autoPauseChat]);

  const handlePlay = useCallback(() => {
    setIsPaused(false);
    if (autoPauseChat) setChatVisible(false);
  }, [autoPauseChat]);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleSeek = useCallback((seconds: number) => {
    try {
      if (playerRef.current) {
        playerRef.current.currentTime = seconds;
        playerRef.current.play();
      }
    } catch { /* Vidstack $state proxy may throw */ }
  }, []);

  const toggleChat = useCallback(() => {
    setChatVisible((prev) => !prev);
  }, []);

  const handleAskAbout = useCallback((timestamp: number, text: string) => {
    if (text.startsWith('Summarize this:') || text.startsWith('Explain this')) {
      setPendingQuestion(text);
    } else {
      const mins = Math.floor(timestamp / 60);
      const secs = Math.floor(timestamp % 60);
      const ts = `${mins}:${secs.toString().padStart(2, '0')}`;
      setPendingQuestion(`What's being discussed at [${ts}]?`);
    }
    setChatVisible(true);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'c' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        toggleChat();
      }
      if (e.key === 'Escape') {
        setChatVisible(false);
      }
      if (e.key === 'f' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const el = document.querySelector('media-player');
        if (el && document.fullscreenEnabled) {
          if (document.fullscreenElement) document.exitFullscreen();
          else el.requestFullscreen();
        }
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [toggleChat]);

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

  const watchTimeDisplay = sessionWatchTime >= 60
    ? `${Math.floor(sessionWatchTime / 60)}m`
    : `${sessionWatchTime}s`;

  const chatProps = {
    segments,
    currentTime,
    videoId,
    videoTitle: videoTitle ?? undefined,
    transcriptSource: source ?? undefined,
    onSeek: handleSeek,
    onToggle: toggleChat,
    pendingQuestion,
    onPendingQuestionConsumed: () => setPendingQuestion(null),
  } as const;

  return (
    <div className="flex h-[100dvh] bg-chalk-bg overflow-hidden animate-in fade-in duration-300">
      {/* Transcript sidebar — left (desktop), smooth slide */}
      <div
        className={`hidden md:flex flex-none overflow-hidden transition-[width] duration-300 ease-out ${
          showTranscript ? 'w-[360px] border-r border-chalk-border/30' : 'w-0'
        }`}
      >
        <div className="w-[360px] flex-none h-full">
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
            onClose={() => setShowTranscript(false)}
            onAskAbout={handleAskAbout}
            videoId={videoId}
            videoTitle={videoTitle ?? undefined}
          />
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar — hidden on mobile, z-20 so speed dropdown escapes above the video area */}
        <div className="hidden md:flex flex-none items-center gap-3 px-4 py-2.5 border-b border-chalk-border/30 bg-chalk-bg/80 backdrop-blur-md relative z-20">
          <a href="/" className="flex items-center gap-1.5 text-lg font-semibold text-chalk-text hover:text-chalk-accent transition-colors">
            Chalk
          </a>
          <span className="text-slate-600 hidden sm:inline">|</span>
          <div className="flex-1 min-w-0 hidden sm:flex items-center gap-2">
            <span className="text-xs text-slate-400 truncate">
              {videoTitle || videoId}
            </span>
            {sessionWatchTime > 0 && (
              <span className="text-[10px] text-slate-600 shrink-0">{watchTimeDisplay}</span>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <SpeedControlButton playerRef={playerRef} />

            {/* Auto-pause toggle — desktop only */}
            <button
              onClick={() => {
                const next = !autoPauseChat;
                setAutoPauseChat(next);
                localStorage.setItem('chalk-auto-pause-chat', String(next));
              }}
              className={`hidden md:inline-flex px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                autoPauseChat
                  ? 'bg-chalk-accent/15 text-chalk-accent border border-chalk-accent/30'
                  : 'text-slate-500 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30'
              }`}
              title={autoPauseChat ? 'Chat auto-opens on pause (click to disable)' : 'Chat stays manual (click to auto-open on pause)'}
            >
              Auto-pause
            </button>

            <button
              onClick={() => setShowTranscript((v) => !v)}
              className={`hidden md:inline-flex px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                showTranscript
                  ? 'bg-chalk-accent/15 text-chalk-accent border border-chalk-accent/30'
                  : 'text-slate-500 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30'
              }`}
            >
              Transcript
            </button>

            <button
              onClick={toggleChat}
              className={`hidden md:inline-flex px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                chatVisible
                  ? 'bg-chalk-accent/15 text-chalk-accent border border-chalk-accent/30'
                  : 'text-slate-500 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30'
              }`}
            >
              Chat
            </button>
          </div>
        </div>

        {/* Video area */}
        <div className={`flex-none md:flex-1 flex flex-col overflow-hidden relative md:max-h-none transition-[height] duration-200 ease-out motion-reduce:transition-none ${
          keyboardOpen ? 'h-0' : (transcriptCollapsed && chatCollapsed) ? 'h-[calc(100dvh-80px)]' : 'h-[30dvh]'
        }`}>
          {/* Mobile back button */}
          <a
            href="/"
            className="md:hidden absolute top-2 left-2 z-10 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/80 active:scale-95 transition-transform"
            aria-label="Back to home"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
          </a>
          <div className="flex-1 md:flex md:items-center md:justify-center p-0 md:p-4 overflow-hidden">
            <div className="w-full max-w-5xl">
              <VideoPlayer
                playerRef={playerRef}
                videoId={videoId}
                onPause={handlePause}
                onPlay={handlePlay}
                onTimeUpdate={handleTimeUpdate}
              />
            </div>
          </div>
        </div>

        {/* Mobile transcript — collapsible */}
        <div className={`md:hidden flex flex-col border-t border-chalk-border/20 overflow-hidden transition-[height] duration-200 ease-out motion-reduce:transition-none ${
          keyboardOpen ? 'h-0'
            : transcriptCollapsed ? 'h-10'
            : chatCollapsed ? 'h-[calc(70dvh-40px)]'
            : 'h-[30dvh]'
        }`}>
          {transcriptCollapsed && !keyboardOpen ? (
            <WhisperBar
              label="Transcript"
              meta={
                status === 'connecting' || status === 'extracting' ? 'Loading...'
                  : segments.length === 0 ? 'No transcript'
                  : formatTimestamp(currentTime)
              }
              onTap={() => setTranscriptCollapsed(false)}
            />
          ) : (
            <>
              <SectionGrip onTap={() => setTranscriptCollapsed(true)} sectionName="transcript" />
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
                  variant="mobile"
                  onAskAbout={handleAskAbout}
                  videoId={videoId}
                  videoTitle={videoTitle ?? undefined}
                />
              </div>
            </>
          )}
        </div>

        {/* Mobile chat — collapsible */}
        <div className={`md:hidden flex flex-col overflow-hidden border-t border-chalk-border/20 pb-safe transition-[height] duration-200 ease-out motion-reduce:transition-none ${
          keyboardOpen ? 'h-[100dvh]'
            : chatCollapsed ? 'h-10'
            : transcriptCollapsed ? 'h-[calc(70dvh-40px)]'
            : 'h-[calc(40dvh)]'
        }`}>
          {chatCollapsed && !keyboardOpen ? (
            <WhisperBar
              label="Chat"
              meta={
                chatMeta.isStreaming ? 'Typing...'
                  : chatMeta.messageCount > 0 ? `${chatMeta.messageCount} msgs`
                  : undefined
              }
              onTap={() => setChatCollapsed(false)}
            />
          ) : (
            <>
              {!keyboardOpen && <SectionGrip onTap={() => setChatCollapsed(true)} sectionName="chat" />}
              <div className="flex-1 min-h-0 overflow-hidden">
                <ChatOverlay visible={true} variant="mobile" {...chatProps} onMetaChange={setChatMeta} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Chat sidebar — right (desktop), smooth slide */}
      <div
        className={`hidden md:flex flex-none overflow-hidden transition-[width] duration-300 ease-out ${
          chatVisible ? 'w-[360px] border-l border-chalk-border/30' : 'w-0'
        }`}
      >
        <div className="w-[360px] flex-none h-full">
          <ChatOverlay visible={true} variant="sidebar" {...chatProps} />
        </div>
      </div>
    </div>
  );
}

export default function WatchPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-chalk-bg">
        <div className="w-8 h-8 border-2 border-chalk-accent/30 border-t-chalk-accent rounded-full animate-spin" />
      </div>
    }>
      <WatchContent />
    </Suspense>
  );
}
