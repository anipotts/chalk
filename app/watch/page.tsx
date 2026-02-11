'use client';

import { useState, useRef, useCallback, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { TranscriptPanel } from '@/components/TranscriptPanel';
import { ChatOverlay } from '@/components/ChatOverlay';
import { StudySummaryButton } from '@/components/StudySummary';
import { BookmarkButton } from '@/components/BookmarkButton';
import { VideoTimeline } from '@/components/VideoTimeline';
import { MindMapButton } from '@/components/MindMap';
import { formatTimestamp, extractVideoId } from '@/lib/video-utils';
import { useTranscriptStream } from '@/hooks/useTranscriptStream';
import { useVideoTitle } from '@/hooks/useVideoTitle';
import { listCollections, addVideoToCollection, createBookmark, listBookmarks, type StudyCollection } from '@/lib/video-sessions';
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
  { keys: ['A'], action: 'Set loop A/B' },
  { keys: ['B'], action: 'Bookmark moment' },
  { keys: ['M'], action: 'Focus mode' },
  { keys: ['P'], action: 'Picture-in-Picture' },
  { keys: ['T'], action: 'Copy timestamp link' },
  { keys: ['F'], action: 'Fullscreen' },
  { keys: ['/'], action: 'Search transcript' },
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

const SPEED_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function SpeedControlButton({ playerRef }: { playerRef: React.RefObject<MediaPlayerInstance | null> }) {
  const [open, setOpen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const ref = useRef<HTMLDivElement>(null);

  // Sync speed from player periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (playerRef.current) setSpeed(playerRef.current.playbackRate);
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
    if (playerRef.current) {
      playerRef.current.playbackRate = s;
      setSpeed(s);
    }
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
        <div className="absolute top-full right-0 mt-2 w-28 rounded-xl bg-chalk-surface border border-chalk-border/40 shadow-xl shadow-black/30 overflow-hidden z-50">
          <div className="p-1">
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

const QUEUE_KEY = 'chalk-video-queue';

interface QueueItem {
  id: string;
  title?: string;
}

function getQueue(): QueueItem[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveQueue(queue: QueueItem[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function PlaylistButton({ videoId }: { videoId: string }) {
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [addUrl, setAddUrl] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQueue(getQueue());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleAdd = () => {
    const id = extractVideoId(addUrl.trim());
    if (id && id !== videoId && !queue.some((q) => q.id === id)) {
      const newQueue = [...queue, { id }];
      setQueue(newQueue);
      saveQueue(newQueue);
      setAddUrl('');
      // Fetch title in background
      fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${encodeURIComponent(id)}`)
        .then((r) => r.json())
        .then((data: { title?: string }) => {
          if (data.title) {
            setQueue((prev) => {
              const updated = prev.map((q) => q.id === id ? { ...q, title: data.title } : q);
              saveQueue(updated);
              return updated;
            });
          }
        })
        .catch(() => {});
    }
    setAddUrl('');
  };

  const handleRemove = (id: string) => {
    const newQueue = queue.filter((q) => q.id !== id);
    setQueue(newQueue);
    saveQueue(newQueue);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`w-7 h-7 rounded-lg text-xs flex items-center justify-center transition-colors ${
          queue.length > 0
            ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
            : 'text-slate-500 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30'
        }`}
        aria-label="Video queue"
        title="Video queue"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M2 3.5A.5.5 0 0 1 2.5 3h11a.5.5 0 0 1 0 1h-11A.5.5 0 0 1 2 3.5Zm0 4A.5.5 0 0 1 2.5 7h7a.5.5 0 0 1 0 1h-7A.5.5 0 0 1 2 7.5Zm0 4A.5.5 0 0 1 2.5 11h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5Zm10-2a.5.5 0 0 1 .5.5v1.5H14a.5.5 0 0 1 0 1h-1.5V14a.5.5 0 0 1-1 0v-1.5H10a.5.5 0 0 1 0-1h1.5V10a.5.5 0 0 1 .5-.5Z" />
        </svg>
        {queue.length > 0 && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-purple-500 text-white text-[8px] font-bold flex items-center justify-center">
            {queue.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-2 w-64 rounded-xl bg-chalk-surface border border-chalk-border/40 shadow-xl shadow-black/30 overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-chalk-border/30">
            <span className="text-xs font-medium text-chalk-text">Up Next</span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {queue.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-slate-500 text-center">No videos queued</p>
            ) : (
              queue.map((item, i) => (
                <div key={item.id} className="flex items-center gap-2 px-3 py-2 hover:bg-chalk-bg/40 transition-colors">
                  <span className="text-[10px] text-slate-600 shrink-0 w-4">{i + 1}.</span>
                  <a
                    href={`/watch?v=${item.id}`}
                    className="text-xs text-slate-400 hover:text-chalk-accent truncate flex-1 transition-colors"
                  >
                    {item.title || item.id}
                  </a>
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="shrink-0 p-0.5 text-slate-600 hover:text-red-400 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                      <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="px-3 py-2 border-t border-chalk-border/30">
            <div className="flex gap-1.5">
              <input
                type="text"
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                placeholder="Add YouTube URL..."
                className="flex-1 px-2 py-1.5 rounded-lg bg-chalk-bg/60 border border-chalk-border/30 text-[11px] text-chalk-text placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-chalk-accent/50"
              />
              <button
                onClick={handleAdd}
                disabled={!addUrl.trim()}
                className="px-2 py-1.5 rounded-lg text-[10px] font-medium bg-chalk-accent/20 text-chalk-accent hover:bg-chalk-accent/30 disabled:opacity-30 transition-colors"
              >
                Add
              </button>
            </div>
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

  // Hot spots: track seek positions to show user activity on timeline
  const seekHistoryRef = useRef<number[]>([]);
  const [hotSpots, setHotSpots] = useState<number[]>([]);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const [chatVisible, setChatVisible] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcriptAutoOpened, setTranscriptAutoOpened] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);
  const [miniPlayer, setMiniPlayer] = useState(false);
  const [autoBookmarking, setAutoBookmarking] = useState(false);
  const [quickNote, setQuickNote] = useState('');
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const quickNoteRef = useRef<HTMLDivElement>(null);
  const [smartPause, setSmartPause] = useState(false);
  const lastChapterRef = useRef<number>(-1);

  const [continueFrom, setContinueFrom] = useState<number | null>(null);
  const [sessionWatchTime, setSessionWatchTime] = useState(0);
  const playerRef = useRef<MediaPlayerInstance>(null);
  const progressSaveRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const watchTimeRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Load saved progress
  useEffect(() => {
    if (!videoId) return;
    try {
      const saved = localStorage.getItem(`chalk-progress-${videoId}`);
      if (saved) {
        const seconds = parseFloat(saved);
        if (seconds > 5) setContinueFrom(seconds);
      }
    } catch { /* ignore */ }
  }, [videoId]);

  // Save progress every 5 seconds (also save duration for home page progress bars)
  useEffect(() => {
    if (!videoId) return;
    progressSaveRef.current = setInterval(() => {
      if (currentTime > 5) {
        localStorage.setItem(`chalk-progress-${videoId}`, String(currentTime));
        if (segments.length > 0) {
          const lastSeg = segments[segments.length - 1];
          const dur = lastSeg.offset + (lastSeg.duration || 0);
          if (dur > 0) localStorage.setItem(`chalk-duration-${videoId}`, String(dur));
        }
      }
    }, 5000);
    return () => clearInterval(progressSaveRef.current);
  }, [videoId, currentTime, segments]);

  // Track watch time (only counts when playing)
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

  // Focus score: engagement based on interactions per minute
  const [questionsAsked, setQuestionsAsked] = useState(0);
  const [bookmarksMade, setBookmarksMade] = useState(0);

  // Study score — gamified engagement tracking
  const [studyScore, setStudyScore] = useState(0);
  const scoreRef = useRef(0);

  // Load saved score
  useEffect(() => {
    if (!videoId) return;
    try {
      const saved = parseInt(localStorage.getItem(`chalk-score-${videoId}`) || '0', 10);
      setStudyScore(saved);
      scoreRef.current = saved;
    } catch { /* ignore */ }
  }, [videoId]);

  // Increment score helper
  const addScore = useCallback((points: number) => {
    if (!videoId) return;
    scoreRef.current += points;
    setStudyScore(scoreRef.current);
    localStorage.setItem(`chalk-score-${videoId}`, String(scoreRef.current));
  }, [videoId]);

  // +1 point per minute watched + record activity for heatmap
  useEffect(() => {
    if (sessionWatchTime > 0 && sessionWatchTime % 60 === 0) {
      addScore(1);
      // Record study minutes for daily activity heatmap
      try {
        const today = new Date().toISOString().split('T')[0];
        const activity = JSON.parse(localStorage.getItem('chalk-study-activity') || '{}');
        activity[today] = (activity[today] || 0) + 1;
        localStorage.setItem('chalk-study-activity', JSON.stringify(activity));
      } catch { /* ignore */ }
    }
    // Comprehension check every 5 minutes of watching
    if (sessionWatchTime > 0 && sessionWatchTime % 300 === 0) {
      setComprehensionCheck(true);
    }
  }, [sessionWatchTime, addScore]);

  const [comprehensionCheck, setComprehensionCheck] = useState(false);

  // Ambient mood: detect sentiment of active segment
  const ambientMood = useMemo(() => {
    if (segments.length === 0) return 'neutral';
    const activeIdx = segments.findIndex((seg, i) => {
      const next = segments[i + 1];
      return currentTime >= seg.offset && (!next || currentTime < next.offset);
    });
    if (activeIdx < 0) return 'neutral';
    const text = segments[activeIdx].text.toLowerCase();
    const positive = /\b(great|amazing|love|excellent|awesome|fantastic|wonderful|good|happy|exciting|beautiful|perfect|brilliant|success)\b/;
    const negative = /\b(bad|wrong|problem|difficult|terrible|worst|fail|error|issue|broken|hate|stupid|boring|confusing)\b/;
    if (positive.test(text)) return 'positive';
    if (negative.test(text)) return 'negative';
    return 'neutral';
  }, [segments, currentTime]);

  const hasSegments = segments.length > 0;
  const isLoadingTranscript = status === 'connecting' || status === 'extracting' || status === 'downloading' || status === 'transcribing';
  const transcriptAvailable = hasSegments || isLoadingTranscript;

  // Auto-generate chapter markers
  const chapters = useMemo(() => {
    if (segments.length < 10) return [];
    const last = segments[segments.length - 1];
    const totalDuration = last.offset + (last.duration || 0);
    if (totalDuration < 120) return [];
    const interval = Math.max(120, Math.min(300, totalDuration / 8));
    const result: { offset: number; label: string }[] = [];
    let nextTime = 0;
    for (const seg of segments) {
      if (seg.offset >= nextTime) {
        const text = seg.text.trim();
        if (text.length > 3) {
          let label = text.length > 30 ? text.slice(0, 30).replace(/\s\S*$/, '') + '...' : text;
          label = label.charAt(0).toUpperCase() + label.slice(1);
          result.push({ offset: seg.offset, label });
          nextTime = seg.offset + interval;
        }
      }
    }
    return result;
  }, [segments]);

  // Auto-open sidebar when first segment arrives
  if (hasSegments && !transcriptAutoOpened) {
    setShowTranscript(true);
    setTranscriptAutoOpened(true);
  }

  // Smart Rewind: auto-rewind 5s after long pause (>30s)
  const pauseStartRef = useRef<number>(0);

  // Show chat on pause, hide on play
  const handlePause = useCallback(() => {
    setIsPaused(true);
    setChatVisible(true);
    pauseStartRef.current = Date.now();
  }, []);

  const handlePlay = useCallback(() => {
    setIsPaused(false);
    setChatVisible(false);
    // Smart rewind after long pause
    const pauseDuration = Date.now() - pauseStartRef.current;
    if (pauseStartRef.current > 0 && pauseDuration > 30000 && playerRef.current) {
      const rewindTo = Math.max(0, playerRef.current.currentTime - 5);
      playerRef.current.currentTime = rewindTo;
      setToast('Rewinding 5s for context...');
      setTimeout(() => setToast(null), 1500);
    }
  }, []);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
    // Enforce A-B loop
    if (loopA !== null && loopB !== null && time >= loopB) {
      if (playerRef.current) {
        playerRef.current.currentTime = loopA;
      }
    }
    // Smart pause at chapter boundaries
    if (smartPause && chapters.length > 1) {
      const currentChapterIdx = chapters.findIndex((ch, i) => {
        const nextOffset = chapters[i + 1]?.offset ?? Infinity;
        return time >= ch.offset && time < nextOffset;
      });
      if (currentChapterIdx > lastChapterRef.current && lastChapterRef.current >= 0) {
        playerRef.current?.pause();
        setToast(`Chapter: ${chapters[currentChapterIdx]?.label || 'Next section'}`);
        setTimeout(() => setToast(null), 3000);
      }
      if (currentChapterIdx >= 0) lastChapterRef.current = currentChapterIdx;
    }
    // Milestone celebrations at 25%, 50%, 75%
    if (hasSegments) {
      const last = segments[segments.length - 1];
      const total = last.offset + (last.duration || 0);
      if (total > 60) {
        const pct = time / total;
        const milestones = [
          { threshold: 0.25, label: '25% — Keep going!' },
          { threshold: 0.50, label: '50% — Halfway there!' },
          { threshold: 0.75, label: '75% — Almost done!' },
        ];
        for (const m of milestones) {
          if (pct >= m.threshold && !milestonesTriggered.current.has(m.threshold)) {
            milestonesTriggered.current.add(m.threshold);
            addScore(2);
            setToast(m.label);
            setTimeout(() => setToast(null), 2000);
          }
        }
      }
    }
    // Video completion detection
    if (hasSegments && !completionTriggered.current) {
      const last = segments[segments.length - 1];
      const total = last.offset + (last.duration || 0);
      if (total > 60 && time >= total * 0.95) {
        completionTriggered.current = true;
        setVideoCompleted(true);
        addScore(10);
        // Generate recap topics from chapters or evenly-spaced segments
        const recapSources = chapters.length >= 3
          ? chapters.slice(0, 5).map((ch) => ({ text: ch.label, timestamp: ch.offset }))
          : segments.filter((_, i) => i % Math.max(1, Math.floor(segments.length / 5)) === 0).slice(0, 5).map((s) => {
            const t = s.text.trim();
            return { text: t.length > 40 ? t.slice(0, 40) + '...' : t, timestamp: s.offset };
          });
        setRecapTopics(recapSources);
        setRecapIndex(0);
        setTimeout(() => setVideoCompleted(false), 4000);
      }
    }
  }, [loopA, loopB, smartPause, chapters, hasSegments, segments, addScore]);

  const handleSeek = useCallback((seconds: number) => {
    if (playerRef.current) {
      // Track seek for hot spots
      seekHistoryRef.current.push(seconds);
      if (seekHistoryRef.current.length % 3 === 0) {
        // Compute hot spots every 3 seeks
        const counts = new Map<number, number>();
        for (const t of seekHistoryRef.current) {
          const bucket = Math.round(t / 10) * 10; // 10s buckets
          counts.set(bucket, (counts.get(bucket) || 0) + 1);
        }
        const spots = [...counts.entries()].filter(([, c]) => c >= 2).map(([t]) => t);
        setHotSpots(spots);
      }
      // Rewind context: if seeking backward >10s, show transcript context at new position
      const prevTime = playerRef.current.currentTime;
      playerRef.current.currentTime = seconds;
      playerRef.current.play();
      if (prevTime - seconds > 10 && segments.length > 0) {
        const seg = segments.find((s, i) => {
          const next = segments[i + 1];
          return seconds >= s.offset && (!next || seconds < next.offset);
        });
        if (seg) {
          const text = seg.text.trim();
          const preview = text.length > 60 ? text.slice(0, 60) + '...' : text;
          setToast(`${formatTimestamp(seconds)}: "${preview}"`);
          setTimeout(() => setToast(null), 2500);
        }
      }
    }
  }, [segments]);

  const toggleChat = useCallback(() => {
    setChatVisible((prev) => !prev);
  }, []);

  // Double-tap to seek (mobile)
  const [tapIndicator, setTapIndicator] = useState<'left' | 'right' | null>(null);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const handleDoubleTap = useCallback((e: React.TouchEvent) => {
    const now = Date.now();
    const touch = e.touches[0] || e.changedTouches[0];
    if (!touch) return;
    const dt = now - lastTapRef.current.time;
    if (dt < 300 && dt > 50) {
      // Double tap detected
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const side = touch.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
      if (side === 'left') {
        playerRef.current && (playerRef.current.currentTime = Math.max(0, playerRef.current.currentTime - 10));
      } else {
        playerRef.current && (playerRef.current.currentTime = playerRef.current.currentTime + 10);
      }
      setTapIndicator(side);
      setTimeout(() => setTapIndicator(null), 500);
    }
    lastTapRef.current = { time: now, x: touch.clientX };
  }, []);

  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [searchOffsets, setSearchOffsets] = useState<number[]>([]);
  const [videoCompleted, setVideoCompleted] = useState(false);
  const [recapTopics, setRecapTopics] = useState<{ text: string; timestamp: number }[]>([]);
  const [recapIndex, setRecapIndex] = useState(0);

  // Recap topic cycling effect
  useEffect(() => {
    if (recapTopics.length === 0) return;
    const interval = setInterval(() => {
      setRecapIndex((prev) => {
        if (prev >= recapTopics.length - 1) {
          clearInterval(interval);
          setTimeout(() => setRecapTopics([]), 1000);
          return prev;
        }
        return prev + 1;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [recapTopics.length]);
  const completionTriggered = useRef(false);
  const milestonesTriggered = useRef<Set<number>>(new Set());
  const [studyTimer, setStudyTimer] = useState<number | null>(null); // remaining seconds
  const studyTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const [showResume, setShowResume] = useState(false);
  const wasPlayingBeforeHide = useRef(false);

  // Auto-pause on tab switch, show resume pill on return
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) {
        // Tab hidden: remember if playing, then pause
        if (!isPaused && playerRef.current) {
          wasPlayingBeforeHide.current = true;
          playerRef.current.pause();
        } else {
          wasPlayingBeforeHide.current = false;
        }
      } else {
        // Tab visible again: offer resume if was playing
        if (wasPlayingBeforeHide.current) {
          setShowResume(true);
          wasPlayingBeforeHide.current = false;
          // Auto-dismiss after 4 seconds
          setTimeout(() => setShowResume(false), 4000);
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isPaused]);

  // Study timer countdown
  useEffect(() => {
    if (studyTimer !== null && studyTimer > 0) {
      studyTimerRef.current = setInterval(() => {
        setStudyTimer((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(studyTimerRef.current);
            // Auto-pause and notify
            playerRef.current?.pause();
            setToast('Timer done — take a break!');
            setTimeout(() => setToast(null), 3000);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(studyTimerRef.current);
    }
  }, [studyTimer !== null && studyTimer > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePiP = useCallback(async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        // Find the video element inside the player
        const container = document.querySelector('media-player');
        const video = container?.querySelector('video');
        if (video) {
          await video.requestPictureInPicture();
        } else {
          setToast('PiP not available for this video');
          setTimeout(() => setToast(null), 1500);
        }
      }
    } catch {
      setToast('PiP not supported');
      setTimeout(() => setToast(null), 1500);
    }
  }, []);

  // Keyboard shortcuts: B to bookmark, M for focus mode, P for PiP
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'a' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (loopA === null) {
          setLoopA(currentTime);
          setToast(`Loop start: ${formatTimestamp(currentTime)}`);
          setTimeout(() => setToast(null), 1500);
        } else if (loopB === null) {
          setLoopB(currentTime);
          setToast(`Loop: ${formatTimestamp(loopA)} → ${formatTimestamp(currentTime)}`);
          setTimeout(() => setToast(null), 2000);
        } else {
          setLoopA(null);
          setLoopB(null);
          setToast('Loop cleared');
          setTimeout(() => setToast(null), 1500);
        }
      }
      if (e.key === 'b' && !e.metaKey && !e.ctrlKey && videoId) {
        e.preventDefault();
        if (loopA !== null && loopB !== null) {
          // Section bookmark: save the A-B range
          const start = Math.min(loopA, loopB);
          const end = Math.max(loopA, loopB);
          createBookmark(videoId, start, `Section ${formatTimestamp(start)} → ${formatTimestamp(end)}`, videoTitle || undefined, 'amber');
          setToast(`Section bookmarked: ${formatTimestamp(start)} → ${formatTimestamp(end)}`);
        } else {
          // Smart bookmark name from nearby transcript
          const nearbySeg = segments.find((s) => Math.abs(s.offset - currentTime) < 5);
          const smartLabel = nearbySeg
            ? nearbySeg.text.trim().split(/\s+/).slice(0, 6).join(' ').replace(/[.,;:!?]+$/, '')
            : '';
          createBookmark(videoId, currentTime, smartLabel, videoTitle || undefined, 'blue');
          setToast(smartLabel ? `Bookmarked: "${smartLabel}"` : 'Bookmarked!');
        }
        setTimeout(() => setToast(null), 1500);
        addScore(3); // +3 for bookmarking
        setBookmarksMade((b) => b + 1);
      }
      if (e.key === 'm' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setFocusMode((v) => !v);
      }
      if (e.key === 'p' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        togglePiP();
      }
      if (e.key === 't' && !e.metaKey && !e.ctrlKey && videoId) {
        e.preventDefault();
        const secs = Math.floor(currentTime);
        const link = `https://youtube.com/watch?v=${videoId}&t=${secs}`;
        navigator.clipboard.writeText(link).then(() => {
          setToast(`Link copied at ${formatTimestamp(currentTime)}`);
          setTimeout(() => setToast(null), 2000);
        });
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [videoId, currentTime, videoTitle, loopA, loopB, togglePiP, addScore]);

  const handleAskAbout = useCallback((timestamp: number, text: string) => {
    // If text starts with "Summarize" or "Explain" it's from the selection toolbar — use as-is
    if (text.startsWith('Summarize this:') || text.startsWith('Explain this')) {
      setPendingQuestion(text);
    } else {
      const mins = Math.floor(timestamp / 60);
      const secs = Math.floor(timestamp % 60);
      const ts = `${mins}:${secs.toString().padStart(2, '0')}`;
      setPendingQuestion(`What's being discussed at [${ts}]?`);
    }
    setChatVisible(true);
    addScore(5); // +5 for asking a question
    setQuestionsAsked((q) => q + 1);
  }, [addScore]);

  // Quick note persistence
  useEffect(() => {
    if (!videoId) return;
    try {
      const saved = localStorage.getItem(`chalk-note-${videoId}`);
      if (saved) setQuickNote(saved);
    } catch { /* ignore */ }
  }, [videoId]);

  useEffect(() => {
    if (!quickNoteOpen) return;
    function handleClick(e: MouseEvent) {
      if (quickNoteRef.current && !quickNoteRef.current.contains(e.target as Node)) setQuickNoteOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [quickNoteOpen]);

  // First-visit onboarding
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    const key = 'chalk-onboarding-shown';
    if (!localStorage.getItem(key)) {
      setShowOnboarding(true);
      localStorage.setItem(key, '1');
    }
  }, []);
  useEffect(() => {
    if (!showOnboarding) return;
    const dismiss = () => setShowOnboarding(false);
    document.addEventListener('keydown', dismiss, { once: true });
    document.addEventListener('click', dismiss, { once: true });
    const timeout = setTimeout(dismiss, 8000);
    return () => { document.removeEventListener('keydown', dismiss); document.removeEventListener('click', dismiss); clearTimeout(timeout); };
  }, [showOnboarding]);

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
    <div className="flex h-[100dvh] bg-chalk-bg overflow-hidden animate-in fade-in duration-300 relative">
      {/* Ambient mood overlay */}
      <div
        className="absolute inset-0 pointer-events-none transition-colors duration-1000 z-0"
        style={{
          backgroundColor:
            ambientMood === 'positive' ? 'rgba(59,130,246,0.03)'
            : ambientMood === 'negative' ? 'rgba(239,68,68,0.02)'
            : 'transparent',
        }}
      />
      {/* Main area: video + chat overlay */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Study timer progress bar */}
        {studyTimer !== null && (
          <div className="flex-none h-0.5 bg-white/[0.03]">
            <div
              className={`h-full transition-all duration-1000 ease-linear ${
                studyTimer > 750 ? 'bg-emerald-500/60' : studyTimer > 375 ? 'bg-yellow-500/60' : 'bg-rose-500/60'
              }`}
              style={{ width: `${(studyTimer / (25 * 60)) * 100}%` }}
            />
          </div>
        )}

        {/* Top bar — hidden in focus mode */}
        {!focusMode && (
        <div className="flex-none flex items-center gap-3 px-4 py-2.5 border-b border-chalk-border/30 bg-chalk-bg/80 backdrop-blur-md">
          <a href="/" className={`relative flex items-center gap-1.5 text-lg font-semibold text-chalk-text hover:text-chalk-accent transition-colors group ${studyScore > 50 ? 'drop-shadow-[0_0_6px_rgba(234,179,8,0.3)]' : ''}`}>
            {hasSegments && (() => {
              const last = segments[segments.length - 1];
              const total = last.offset + (last.duration || 0);
              const pct = total > 0 ? Math.min(currentTime / total, 1) : 0;
              const r = 10;
              const circ = 2 * Math.PI * r;
              return (
                <svg width="24" height="24" viewBox="0 0 24 24" className="shrink-0 -mr-0.5">
                  <circle cx="12" cy="12" r={r} fill="none" stroke="currentColor" strokeWidth="2" className="opacity-10" />
                  <circle cx="12" cy="12" r={r} fill="none" stroke="currentColor" strokeWidth="2"
                    strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} strokeLinecap="round"
                    className={`${studyScore > 50 ? 'text-yellow-400' : 'text-chalk-accent'} transition-[stroke-dashoffset] duration-500 ease-linear`}
                    transform="rotate(-90 12 12)" />
                </svg>
              );
            })()}
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
            {hasSegments && (() => {
              const last = segments[segments.length - 1];
              const dur = last.offset + (last.duration || 0);
              const mins = Math.floor(dur / 60);
              return (
                <span className="text-[10px] text-slate-600 shrink-0">
                  ~{mins}m · {segments.length} segments
                </span>
              );
            })()}
          </div>
          <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
            {studyScore > 0 && (
              <span
                className={`hidden sm:inline px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums border ${
                  studyScore > 50
                    ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
                    : studyScore > 20
                      ? 'bg-slate-400/15 text-slate-300 border-slate-400/30'
                      : 'bg-amber-800/15 text-amber-600 border-amber-700/30'
                }`}
                title={`Study Score: ${studyScore} (${studyScore > 50 ? 'Gold' : studyScore > 20 ? 'Silver' : 'Bronze'})`}
              >
                {studyScore > 50 ? '\u2B50' : studyScore > 20 ? '\u26AA' : '\u{1F7E4}'} {studyScore}
              </span>
            )}
            {sessionWatchTime >= 60 && (
              <span className="hidden sm:inline text-[10px] text-slate-600 tabular-nums" title="Time watched this session">
                {Math.floor(sessionWatchTime / 60)}m watched
              </span>
            )}
            {sessionWatchTime >= 120 && (questionsAsked > 0 || bookmarksMade > 0) && (() => {
              const minutesWatched = sessionWatchTime / 60;
              const interactions = questionsAsked * 3 + bookmarksMade * 2;
              const focusPct = Math.min(100, Math.round((interactions / minutesWatched) * 25));
              const color = focusPct >= 70 ? 'text-emerald-400' : focusPct >= 40 ? 'text-amber-400' : 'text-slate-500';
              return (
                <span
                  className={`hidden sm:inline text-[10px] font-medium tabular-nums ${color}`}
                  title={`Focus Score: ${focusPct}% (${questionsAsked} questions, ${bookmarksMade} bookmarks in ${Math.floor(minutesWatched)}min)`}
                >
                  Focus {focusPct}%
                </span>
              );
            })()}
            {/* Study Timer */}
            <button
              onClick={() => {
                if (studyTimer !== null) {
                  // Cancel timer
                  clearInterval(studyTimerRef.current);
                  setStudyTimer(null);
                  setToast('Timer cancelled');
                  setTimeout(() => setToast(null), 1500);
                } else {
                  // Start 25-min pomodoro
                  setStudyTimer(25 * 60);
                  setToast('25 min study timer started');
                  setTimeout(() => setToast(null), 1500);
                }
              }}
              className={`hidden sm:flex items-center gap-1 h-7 px-1.5 rounded-lg text-[10px] font-mono tabular-nums transition-colors ${
                studyTimer !== null
                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  : 'text-slate-500 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30'
              }`}
              aria-label={studyTimer !== null ? `Timer: ${Math.floor(studyTimer / 60)}:${String(studyTimer % 60).padStart(2, '0')} — click to cancel` : 'Start 25min study timer'}
              title={studyTimer !== null ? 'Click to cancel timer' : 'Start 25min pomodoro timer'}
            >
              {studyTimer !== null ? (
                <>{Math.floor(studyTimer / 60)}:{String(studyTimer % 60).padStart(2, '0')}</>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path fillRule="evenodd" d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h3.25a.75.75 0 0 0 0-1.5h-2.5v-3.5Z" clipRule="evenodd" />
                </svg>
              )}
            </button>
            <SpeedControlButton playerRef={playerRef} />
            {chapters.length > 1 && (
              <button
                onClick={() => {
                  setSmartPause((v) => !v);
                  if (!smartPause) lastChapterRef.current = -1;
                }}
                className={`hidden sm:flex w-7 h-7 rounded-lg text-[9px] font-bold items-center justify-center transition-colors ${
                  smartPause
                    ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                    : 'text-slate-500 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30'
                }`}
                aria-label="Smart pause at chapter boundaries"
                title={smartPause ? 'Smart Pause ON — pauses at chapters' : 'Smart Pause — auto-pause at chapter boundaries'}
              >
                SP
              </button>
            )}
            {hasSegments && (
              <button
                onClick={() => {
                  const seg = segments[Math.floor(Math.random() * segments.length)];
                  if (seg) {
                    handleSeek(seg.offset);
                    setToast(`Jumped to ${formatTimestamp(seg.offset)}`);
                    setTimeout(() => setToast(null), 1500);
                  }
                }}
                className="hidden sm:flex w-7 h-7 rounded-lg text-xs items-center justify-center text-slate-500 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30 transition-colors"
                aria-label="Jump to random moment"
                title="Jump to random moment"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M10.49 2.22a.75.75 0 0 1 1.06 0l2.22 2.22a.75.75 0 0 1 0 1.06l-2.22 2.22a.75.75 0 1 1-1.06-1.06L11.94 5.5H10c-1.1 0-2.1.52-2.75 1.37l-2.5 3.26A2.75 2.75 0 0 1 2.56 11.5H1.75a.75.75 0 0 1 0-1.5h.81c.5 0 .96-.24 1.26-.63l2.5-3.26A4.25 4.25 0 0 1 10 4h1.94l-1.47-1.47a.75.75 0 0 1 0-1.06Zm0 6.56a.75.75 0 0 1 1.06 0l2.22 2.22a.75.75 0 0 1 0 1.06l-2.22 2.22a.75.75 0 1 1-1.06-1.06l1.47-1.47H10a4.25 4.25 0 0 1-3.68-2.12.75.75 0 0 1 1.3-.75A2.75 2.75 0 0 0 10 10.25h1.94l-1.47-1.47a.75.75 0 0 1 0-1.06ZM1.75 4h.81c.5 0 .96.24 1.26.63a.75.75 0 1 1-1.2.9A.25.25 0 0 0 2.56 5.5H1.75a.75.75 0 0 1 0-1.5Z" />
                </svg>
              </button>
            )}
            <BookmarkButton videoId={videoId} videoTitle={videoTitle || undefined} currentTime={currentTime} onSeek={handleSeek} />
            {segments.length > 0 && (
              <button
                onClick={async () => {
                  if (autoBookmarking) return;
                  setAutoBookmarking(true);
                  try {
                    const resp = await fetch('/api/key-takeaways', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ segments, videoTitle }),
                    });
                    const data = await resp.json();
                    if (data.takeaways && Array.isArray(data.takeaways)) {
                      for (const t of data.takeaways) {
                        if (t.timestamp > 0) {
                          await createBookmark(videoId, t.timestamp, t.text.slice(0, 60), videoTitle || undefined, 'green');
                        }
                      }
                      setToast(`Auto-bookmarked ${data.takeaways.length} key moments`);
                      setTimeout(() => setToast(null), 2000);
                    }
                  } catch { /* ignore */ }
                  setAutoBookmarking(false);
                }}
                disabled={autoBookmarking}
                className="hidden sm:flex w-7 h-7 rounded-lg text-xs items-center justify-center transition-colors text-slate-500 hover:text-emerald-400 bg-chalk-surface/50 border border-chalk-border/30 hover:border-emerald-500/30"
                aria-label="Auto-bookmark key moments"
                title="Auto-bookmark key moments (AI)"
              >
                {autoBookmarking ? (
                  <div className="w-3 h-3 border border-slate-500/40 border-t-emerald-400 rounded-full animate-spin" />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M8 .75a.75.75 0 0 1 .697.473l1.524 3.84 3.84 1.524a.75.75 0 0 1 0 1.396l-3.84 1.524-1.524 3.84a.75.75 0 0 1-1.394 0L5.78 9.507l-3.84-1.524a.75.75 0 0 1 0-1.396l3.84-1.524L7.303 1.223A.75.75 0 0 1 8 .75Z" />
                  </svg>
                )}
              </button>
            )}
            {/* Quick note to future self */}
            <div ref={quickNoteRef} className="hidden sm:block relative">
              <button
                onClick={() => setQuickNoteOpen((v) => !v)}
                className={`w-7 h-7 rounded-lg text-xs flex items-center justify-center transition-colors ${
                  quickNote
                    ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
                    : 'text-slate-500 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30'
                }`}
                aria-label="Note to future me"
                title={quickNote ? `Note: ${quickNote}` : 'Add a note for next time'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.262a1.75 1.75 0 0 0 0-2.474Z" />
                  <path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9A.75.75 0 0 1 14 9v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z" />
                </svg>
              </button>
              {quickNoteOpen && (
                <div className="absolute top-full right-0 mt-2 w-56 rounded-xl bg-chalk-surface border border-chalk-border/40 shadow-xl shadow-black/30 overflow-hidden z-50 p-3">
                  <p className="text-[10px] text-slate-500 mb-1.5">Note to future me</p>
                  <textarea
                    value={quickNote}
                    onChange={(e) => {
                      setQuickNote(e.target.value);
                      if (videoId) localStorage.setItem(`chalk-note-${videoId}`, e.target.value);
                    }}
                    placeholder="What should I remember about this video?"
                    rows={3}
                    className="w-full px-2.5 py-2 rounded-lg bg-chalk-bg/60 border border-chalk-border/30 text-[11px] text-chalk-text placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-yellow-500/50 resize-none"
                    autoFocus
                  />
                  {quickNote && (
                    <button
                      onClick={() => {
                        setQuickNote('');
                        if (videoId) localStorage.removeItem(`chalk-note-${videoId}`);
                      }}
                      className="mt-1.5 text-[9px] text-slate-500 hover:text-red-400 transition-colors"
                    >
                      Clear note
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="hidden sm:block"><PlaylistButton videoId={videoId} /></div>
            <div className="hidden sm:block"><SaveToCollectionButton videoId={videoId} videoTitle={videoTitle || undefined} /></div>
            <button
              onClick={() => setMiniPlayer((v) => !v)}
              className={`hidden sm:flex w-7 h-7 rounded-lg text-xs items-center justify-center transition-colors ${
                miniPlayer
                  ? 'bg-chalk-accent/15 text-chalk-accent border border-chalk-accent/30'
                  : 'text-slate-500 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30'
              }`}
              aria-label="Mini player"
              title="Mini player"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9Zm7 4a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5V8a.5.5 0 0 0-.5-.5H9Z" />
              </svg>
            </button>
            <button
              onClick={togglePiP}
              className="hidden sm:flex w-7 h-7 rounded-lg text-xs items-center justify-center text-slate-500 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30 transition-colors"
              aria-label="Picture-in-Picture"
              title="Picture-in-Picture (P)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M2 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4Zm6 1a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8Z" />
              </svg>
            </button>
            <KeyboardShortcutsButton />
            <MindMapButton
              videoId={videoId}
              videoTitle={videoTitle || undefined}
              segments={segments}
              onSeek={handleSeek}
            />
            <StudySummaryButton
              videoId={videoId}
              videoTitle={videoTitle || undefined}
              segments={segments}
              onSeek={handleSeek}
            />
            {/* Export Study Package */}
            {hasSegments && (
              <button
                onClick={async () => {
                  const bms = await listBookmarks(videoId);
                  const chatRaw = localStorage.getItem(`chalk-video-chat-${videoId}`);
                  const chat = chatRaw ? JSON.parse(chatRaw) as { role: string; content: string }[] : [];
                  const total = segments.length > 0 ? segments[segments.length - 1].offset + (segments[segments.length - 1].duration || 0) : 0;
                  const mins = Math.round(total / 60);

                  let md = `# ${videoTitle || 'Video Study Notes'}\n\n`;
                  md += `**Video:** https://youtube.com/watch?v=${videoId}\n`;
                  md += `**Duration:** ~${mins} min · ${segments.length} segments\n`;
                  md += `**Exported:** ${new Date().toLocaleString()}\n\n`;

                  if (bms.length > 0) {
                    md += `## Bookmarks\n\n`;
                    for (const bm of bms) {
                      md += `- **[${formatTimestamp(bm.timestamp_seconds)}]** ${bm.note || '(no note)'}\n`;
                    }
                    md += '\n';
                  }

                  if (chat.length > 0) {
                    md += `## Chat History\n\n`;
                    for (const msg of chat) {
                      md += msg.role === 'user' ? `**You:** ${msg.content}\n\n` : `**Chalk AI:** ${msg.content}\n\n---\n\n`;
                    }
                  }

                  const blob = new Blob([md], { type: 'text/markdown' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `chalk-study-${videoId}.md`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                  setToast('Study package exported');
                  setTimeout(() => setToast(null), 1500);
                }}
                className="hidden sm:flex w-7 h-7 rounded-lg text-xs items-center justify-center text-slate-500 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30 transition-colors"
                aria-label="Export study package"
                title="Export study package (markdown)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z" />
                  <path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z" />
                </svg>
              </button>
            )}
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
        )}

        {/* Video + transcript (mobile) + chat overlay */}
        <div className="flex-1 relative min-h-0 flex flex-col">
          {/* Video area — supports mini-player mode */}
          <div className={miniPlayer
            ? 'fixed bottom-20 right-4 z-50 w-72 shadow-2xl shadow-black/50 rounded-xl overflow-hidden border border-chalk-border/40 transition-all duration-300'
            : `${showTranscript && transcriptAvailable ? 'shrink-0 max-h-[55%] lg:max-h-none lg:flex-1' : 'flex-1'} overflow-hidden min-h-0`
          }>
            {miniPlayer && (
              <button
                onClick={() => setMiniPlayer(false)}
                className="absolute top-1 right-1 z-10 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
                aria-label="Expand video"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                </svg>
              </button>
            )}
            <div className={miniPlayer ? '' : 'flex items-start justify-center p-2 sm:p-4 h-full'}>
              <div
                className={miniPlayer ? 'w-full' : 'w-full max-w-5xl relative'}
                onTouchStart={handleDoubleTap}
                style={{
                  boxShadow: !focusMode && !miniPlayer && ambientMood !== 'neutral'
                    ? ambientMood === 'positive'
                      ? '0 0 30px rgba(59,130,246,0.12), 0 0 60px rgba(59,130,246,0.06)'
                      : '0 0 30px rgba(239,68,68,0.10), 0 0 60px rgba(239,68,68,0.05)'
                    : undefined,
                  borderRadius: !miniPlayer ? '0.75rem' : undefined,
                  transition: 'box-shadow 1s ease',
                }}
              >
                <VideoPlayer
                  videoId={videoId}
                  onPause={handlePause}
                  onPlay={handlePlay}
                  onTimeUpdate={handleTimeUpdate}
                  playerRef={playerRef}
                />
                {/* Double-tap seek indicator */}
                {tapIndicator && (
                  <div className={`absolute inset-y-0 ${tapIndicator === 'left' ? 'left-0 right-1/2' : 'left-1/2 right-0'} flex items-center justify-center pointer-events-none z-20`}>
                    <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center animate-ping">
                      <span className="text-white text-sm font-bold">{tapIndicator === 'left' ? '-10s' : '+10s'}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Chapter navigation bar with prev/next */}
          {!focusMode && chapters.length > 0 && (
            <div className="flex-none px-2 overflow-x-auto scrollbar-hide">
              <div className="flex items-center gap-1 py-1">
                {/* Prev chapter */}
                <button
                  onClick={() => {
                    const prev = [...chapters].reverse().find((ch) => ch.offset < currentTime - 2);
                    if (prev) {
                      handleSeek(prev.offset);
                      setToast(`← ${prev.label}`);
                      setTimeout(() => setToast(null), 1500);
                    }
                  }}
                  className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                  title="Previous chapter"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                    <path fillRule="evenodd" d="M12.78 7.28a.75.75 0 0 1-1.06 0L8 3.56 4.28 7.28a.75.75 0 0 1-1.06-1.06l4.25-4.25a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06Z" clipRule="evenodd" transform="rotate(-90 8 8)" />
                  </svg>
                </button>
                {chapters.map((ch, i) => {
                  const nextOffset = chapters[i + 1]?.offset ?? Infinity;
                  const isActive = currentTime >= ch.offset && currentTime < nextOffset;
                  // Auto-summary: first meaningful sentence from chapter's segments
                  const chapterSegs = segments.filter((s) => s.offset >= ch.offset && s.offset < nextOffset);
                  const chapterText = chapterSegs.map((s) => s.text).join(' ').trim();
                  const summary = chapterText.length > 80 ? chapterText.slice(0, 80) + '...' : chapterText;
                  // Difficulty estimation
                  const words = chapterText.split(/\s+/).filter(Boolean);
                  const avgLen = words.length > 0 ? words.reduce((a, w) => a + w.length, 0) / words.length : 0;
                  const longWordPct = words.length > 0 ? words.filter((w) => w.length > 8).length / words.length : 0;
                  const difficulty = avgLen > 6 || longWordPct > 0.15 ? 'hard' : avgLen > 4.5 || longWordPct > 0.08 ? 'medium' : 'easy';
                  const diffColors = { easy: 'bg-emerald-500', medium: 'bg-yellow-500', hard: 'bg-rose-500' };
                  return (
                    <button
                      key={ch.offset}
                      onClick={() => handleSeek(ch.offset)}
                      className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] transition-all whitespace-nowrap ${
                        isActive
                          ? 'bg-chalk-accent/20 text-chalk-accent border border-chalk-accent/30 font-medium'
                          : 'bg-chalk-surface/30 text-slate-500 border border-chalk-border/20 hover:text-slate-300 hover:border-chalk-border/40'
                      }`}
                      title={`${summary || ch.label} · ${difficulty}`}
                    >
                      <span className={`w-1 h-1 rounded-full ${diffColors[difficulty]} shrink-0`} />
                      {ch.label}
                    </button>
                  );
                })}
                {/* Next chapter */}
                <button
                  onClick={() => {
                    const next = chapters.find((ch) => ch.offset > currentTime + 2);
                    if (next) {
                      handleSeek(next.offset);
                      setToast(`→ ${next.label}`);
                      setTimeout(() => setToast(null), 1500);
                    }
                  }}
                  className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                  title="Next chapter"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                    <path fillRule="evenodd" d="M3.22 8.72a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1-1.06 1.06L8 4.94 4.28 8.72a.75.75 0 0 1-1.06 0Z" clipRule="evenodd" transform="rotate(90 8 8)" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Listening mode waveform visualizer */}
          {!focusMode && !isPaused && hasSegments && (() => {
            const nearbySegs = segments.filter((s) => Math.abs(s.offset - currentTime) < 15);
            const barCount = 8;
            const barData = Array.from({ length: barCount }, (_, i) => {
              const t = currentTime - 7.5 + (i / (barCount - 1)) * 15;
              const nearby = nearbySegs.filter((s) => Math.abs(s.offset - t) < 3);
              const words = nearby.reduce((a, s) => a + s.text.split(/\s+/).filter(Boolean).length, 0);
              return Math.min(1, words / 30);
            });
            return (
              <div className="flex-none flex items-end justify-center gap-0.5 h-3 px-4 -mt-0.5 opacity-30 transition-opacity">
                {barData.map((d, i) => (
                  <div
                    key={i}
                    className="w-1 rounded-full bg-chalk-accent/60 transition-all duration-300"
                    style={{ height: `${Math.max(2, d * 12)}px` }}
                  />
                ))}
              </div>
            );
          })()}

          {/* Interactive timeline with bookmark markers */}
          {!focusMode && (
            <VideoTimeline
              videoId={videoId}
              segments={segments}
              currentTime={currentTime}
              onSeek={handleSeek}
              videoTitle={videoTitle || undefined}
              loopA={loopA}
              loopB={loopB}
              searchOffsets={searchOffsets}
              hotSpots={hotSpots}
            />
          )}

          {/* Mobile inline transcript — separate flex section, hidden in focus mode */}
          {showTranscript && !focusMode && (hasSegments || isLoadingTranscript) && (
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
                videoId={videoId}
                videoTitle={videoTitle || undefined}
                onSearchMatchesChange={setSearchOffsets}
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

      {/* Transcript sidebar (desktop only) — hidden in focus mode */}
      {showTranscript && !focusMode && (
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
            videoId={videoId}
            videoTitle={videoTitle || undefined}
            onSearchMatchesChange={setSearchOffsets}
          />
        </div>
      )}

      {/* Focus mode indicator */}
      {focusMode && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-40 animate-in fade-in duration-200">
          <button
            onClick={() => setFocusMode(false)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-chalk-surface/80 border border-chalk-border/30 backdrop-blur-sm text-[10px] text-slate-500 hover:text-slate-300 transition-colors opacity-40 hover:opacity-100"
          >
            Focus Mode
            <kbd className="px-1 py-0.5 rounded bg-chalk-bg/60 border border-chalk-border/30 text-[9px] font-mono">M</kbd>
          </button>
        </div>
      )}

      {/* Continue from saved position */}
      {continueFrom !== null && isPaused && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-chalk-surface/95 border border-chalk-border/40 shadow-xl backdrop-blur-sm">
            <button
              onClick={() => {
                if (playerRef.current) {
                  playerRef.current.currentTime = continueFrom;
                  playerRef.current.play();
                }
                setContinueFrom(null);
              }}
              className="text-xs text-chalk-accent hover:text-blue-400 font-medium transition-colors"
            >
              Continue from {formatTimestamp(continueFrom)}
            </button>
            <button
              onClick={() => setContinueFrom(null)}
              className="text-slate-500 hover:text-slate-300 transition-colors"
              aria-label="Dismiss"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Resume pill (after tab switch) */}
      {showResume && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <button
            onClick={() => {
              setShowResume(false);
              playerRef.current?.play();
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-chalk-accent/90 text-white text-xs font-medium shadow-xl backdrop-blur-sm hover:bg-chalk-accent transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M3 3.732a1.5 1.5 0 0 1 2.305-1.265l6.706 4.267a1.5 1.5 0 0 1 0 2.531l-6.706 4.268A1.5 1.5 0 0 1 3 12.267V3.732Z" />
            </svg>
            Resume playback
          </button>
        </div>
      )}

      {/* Mobile FAB — Ask AI button */}
      {!chatVisible && (
        <button
          onClick={() => setChatVisible(true)}
          className="lg:hidden fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-chalk-accent text-white shadow-lg shadow-chalk-accent/30 flex items-center justify-center hover:bg-blue-600 active:scale-95 transition-all animate-in fade-in zoom-in-50 duration-300"
          aria-label="Ask AI"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M4.913 2.658c2.075-.27 4.19-.408 6.337-.408 2.147 0 4.262.139 6.337.408 1.922.25 3.291 1.861 3.405 3.727a4.403 4.403 0 0 0-1.032-.211 50.89 50.89 0 0 0-8.42 0c-2.358.196-4.04 2.19-4.04 4.434v4.286a4.47 4.47 0 0 0 2.433 3.984L7.28 21.53A.75.75 0 0 1 6 21v-2.634a7.95 7.95 0 0 1-.942-.042 4.046 4.046 0 0 1-3.368-3.135A48.5 48.5 0 0 1 1.5 11.5c0-2.36.078-4.656.23-6.88a4.049 4.049 0 0 1 3.183-3.962ZM15.75 7.5c-1.376 0-2.739.057-4.086.169C10.124 7.797 9 9.103 9 10.609v4.285c0 1.507 1.128 2.814 2.67 2.94 1.243.102 2.5.157 3.768.165l2.782 2.781a.75.75 0 0 0 1.28-.53v-2.39l.33-.026c1.542-.125 2.67-1.433 2.67-2.94v-4.286c0-1.505-1.125-2.811-2.664-2.94A49.392 49.392 0 0 0 15.75 7.5Z" />
          </svg>
        </button>
      )}

      {/* Toast notification */}
      {/* Video completion celebration */}
      {videoCompleted && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
          {/* Confetti particles */}
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={`confetti-${i}`}
              className="absolute w-2 h-2 rounded-full animate-ping"
              style={{
                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#ec4899'][i % 6],
                left: `${20 + Math.random() * 60}%`,
                top: `${30 + Math.random() * 40}%`,
                animationDelay: `${i * 100}ms`,
                animationDuration: '1.5s',
                opacity: 0.8,
              }}
            />
          ))}
          <div className="px-6 py-3 rounded-2xl bg-chalk-surface/95 border border-chalk-accent/40 shadow-2xl backdrop-blur-sm animate-in zoom-in-50 fade-in duration-300">
            <div className="text-center">
              <div className="text-2xl mb-1">🎉</div>
              <span className="text-sm font-bold text-chalk-text">Video Complete!</span>
              <p className="text-[10px] text-slate-400 mt-0.5">+10 study points</p>
            </div>
          </div>
        </div>
      )}

      {/* Video recap animation */}
      {recapTopics.length > 0 && !videoCompleted && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-in fade-in duration-300 pointer-events-none">
          <div className="px-5 py-3 rounded-xl bg-chalk-surface/95 border border-chalk-accent/20 shadow-2xl backdrop-blur-sm min-w-[240px]">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 text-center">Topics Covered</div>
            <div className="relative h-8 overflow-hidden">
              {recapTopics.map((topic, i) => (
                <div
                  key={i}
                  className="absolute inset-x-0 text-center transition-all duration-500"
                  style={{
                    opacity: i === recapIndex ? 1 : 0,
                    transform: i === recapIndex ? 'translateY(0)' : i < recapIndex ? 'translateY(-20px)' : 'translateY(20px)',
                  }}
                >
                  <span className="text-xs text-chalk-text font-medium">{topic.text}</span>
                  <span className="text-[9px] text-slate-500 ml-2 font-mono">{formatTimestamp(topic.timestamp)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-center gap-1 mt-2">
              {recapTopics.map((_, i) => (
                <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i <= recapIndex ? 'bg-chalk-accent' : 'bg-white/10'}`} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Comprehension check notification */}
      {comprehensionCheck && !chatVisible && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-500/15 border border-violet-500/30 shadow-xl backdrop-blur-sm">
            <span className="text-violet-400 text-xs font-medium">Quick comprehension check?</span>
            <button
              onClick={() => {
                setComprehensionCheck(false);
                setChatVisible(true);
                setPendingQuestion('Test my understanding — ask me a question about what was just discussed in the video.');
              }}
              className="px-2.5 py-1 rounded-lg bg-violet-500/20 text-violet-300 text-[10px] font-medium hover:bg-violet-500/30 transition-colors"
            >
              Quiz me
            </button>
            <button
              onClick={() => setComprehensionCheck(false)}
              className="text-slate-500 hover:text-slate-300 transition-colors"
              aria-label="Dismiss"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-chalk-surface/95 border border-chalk-border/40 shadow-xl backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-200 flex items-center gap-2">
          {toast === 'Bookmarked!' && (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-blue-400 animate-bounce" style={{ animationDuration: '0.5s', animationIterationCount: 2 }}>
              <path d="M3.75 2a.75.75 0 0 0-.75.75v10.5a.75.75 0 0 0 1.28.53L8 10.06l3.72 3.72a.75.75 0 0 0 1.28-.53V2.75a.75.75 0 0 0-.75-.75h-8.5Z" />
            </svg>
          )}
          <span className="text-xs text-chalk-text font-medium">{toast}</span>
        </div>
      )}

      {/* First-visit onboarding overlay */}
      {showOnboarding && (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-300">
          <div className="px-6 py-5 rounded-2xl bg-chalk-surface/95 border border-chalk-accent/30 shadow-2xl max-w-sm mx-4 animate-in zoom-in-95 duration-300">
            <h3 className="text-sm font-bold text-chalk-text text-center mb-1">Welcome to Chalk</h3>
            <p className="text-[10px] text-slate-500 text-center mb-4">Quick shortcuts to supercharge your learning</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'Space', desc: 'Play / Pause', icon: '▶' },
                { key: 'C', desc: 'Toggle AI Chat', icon: '💬' },
                { key: 'B', desc: 'Bookmark Moment', icon: '🔖' },
                { key: '/', desc: 'Search Transcript', icon: '🔍' },
              ].map((s) => (
                <div key={s.key} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <kbd className="px-2 py-1 rounded-md bg-chalk-bg border border-chalk-border/40 text-xs font-mono text-chalk-accent font-bold shrink-0">
                    {s.key}
                  </kbd>
                  <span className="text-[11px] text-slate-400">{s.desc}</span>
                </div>
              ))}
            </div>
            <p className="text-[9px] text-slate-600 text-center mt-3">Press any key or click to dismiss</p>
          </div>
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
