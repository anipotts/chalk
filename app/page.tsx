'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { extractVideoId } from '@/lib/video-utils';

const RECENT_VIDEOS_KEY = 'chalk-recent-videos';
const STREAK_KEY = 'chalk-study-streak';
const ACTIVITY_KEY = 'chalk-study-activity';
const DAILY_GOAL_KEY = 'chalk-daily-goal';

interface RecentVideo {
  id: string;
  url: string;
  title?: string;
  timestamp: number;
}

function getRecentVideos(): RecentVideo[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_VIDEOS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveRecentVideo(videoId: string, url: string, title?: string) {
  const recent = getRecentVideos().filter((v) => v.id !== videoId);
  recent.unshift({ id: videoId, url, title, timestamp: Date.now() });
  localStorage.setItem(RECENT_VIDEOS_KEY, JSON.stringify(recent.slice(0, 10)));
}

interface StreakData {
  currentStreak: number;
  lastStudyDate: string; // YYYY-MM-DD
  totalDays: number;
  freezesAvailable: number;
  freezeUsedDate?: string;
  longestStreak: number;
}

const STREAK_MILESTONES = [
  { days: 3, label: 'Starter', color: 'text-amber-600' },
  { days: 7, label: 'Dedicated', color: 'text-slate-300' },
  { days: 14, label: 'Committed', color: 'text-yellow-400' },
  { days: 30, label: 'Scholar', color: 'text-violet-400' },
];

function getStreak(): StreakData {
  if (typeof window === 'undefined') return { currentStreak: 0, lastStudyDate: '', totalDays: 0, freezesAvailable: 0, longestStreak: 0 };
  try {
    const data = JSON.parse(localStorage.getItem(STREAK_KEY) || '{}');
    return {
      currentStreak: data.currentStreak || 0,
      lastStudyDate: data.lastStudyDate || '',
      totalDays: data.totalDays || 0,
      freezesAvailable: data.freezesAvailable || 0,
      freezeUsedDate: data.freezeUsedDate,
      longestStreak: data.longestStreak || data.currentStreak || 0,
    };
  } catch {
    return { currentStreak: 0, lastStudyDate: '', totalDays: 0, freezesAvailable: 0, longestStreak: 0 };
  }
}

function recordStudyDay() {
  const today = new Date().toISOString().split('T')[0];
  const streak = getStreak();

  if (streak.lastStudyDate === today) return streak; // Already recorded today

  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];

  let newCurrentStreak: number;
  let newFreezes = streak.freezesAvailable;

  if (streak.lastStudyDate === yesterday) {
    // Consecutive day
    newCurrentStreak = streak.currentStreak + 1;
  } else if (streak.lastStudyDate === twoDaysAgo && streak.freezesAvailable > 0 && streak.freezeUsedDate !== today) {
    // Missed yesterday but have a freeze — use it
    newCurrentStreak = streak.currentStreak + 1;
    newFreezes = Math.max(0, newFreezes - 1);
  } else {
    // Streak broken
    newCurrentStreak = 1;
  }

  // Earn a freeze every 7 consecutive days
  if (newCurrentStreak > 0 && newCurrentStreak % 7 === 0) {
    newFreezes = Math.min(newFreezes + 1, 3); // Max 3 freezes
  }

  const newStreak: StreakData = {
    currentStreak: newCurrentStreak,
    lastStudyDate: today,
    totalDays: streak.totalDays + 1,
    freezesAvailable: newFreezes,
    freezeUsedDate: streak.lastStudyDate === twoDaysAgo ? today : streak.freezeUsedDate,
    longestStreak: Math.max(streak.longestStreak || 0, newCurrentStreak),
  };
  localStorage.setItem(STREAK_KEY, JSON.stringify(newStreak));

  // Also record activity for heatmap
  const activity = getActivity();
  if (!activity[today]) activity[today] = 0;
  activity[today] += 1; // minutes added on watch page, here just mark the day
  saveActivity(activity);

  return newStreak;
}

// Activity heatmap: { 'YYYY-MM-DD': minutes }
function getActivity(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(ACTIVITY_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveActivity(activity: Record<string, number>) {
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activity));
}

function getDailyGoal(): number {
  if (typeof window === 'undefined') return 15;
  try {
    return Number(localStorage.getItem(DAILY_GOAL_KEY)) || 15;
  } catch {
    return 15;
  }
}

function getTodayMinutes(): number {
  const today = new Date().toISOString().split('T')[0];
  const activity = getActivity();
  return activity[today] || 0;
}

// Fetch title in background and update localStorage
function fetchAndSaveTitle(videoId: string) {
  fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`)
    .then((r) => r.json())
    .then((data: { title?: string }) => {
      if (data.title) {
        const recent = getRecentVideos();
        const idx = recent.findIndex((v) => v.id === videoId);
        if (idx !== -1 && !recent[idx].title) {
          recent[idx].title = data.title;
          localStorage.setItem(RECENT_VIDEOS_KEY, JSON.stringify(recent));
        }
      }
    })
    .catch(() => {});
}

const TOPIC_TAGS: [RegExp, string, string][] = [
  [/\b(math|calculus|algebra|geometry|trig|equation|integral)\b/i, 'Math', 'text-blue-400 bg-blue-500/10 border-blue-500/20'],
  [/\b(physic|quantum|relativity|newton|force|energy)\b/i, 'Physics', 'text-violet-400 bg-violet-500/10 border-violet-500/20'],
  [/\b(chemistry|molecule|atom|reaction|element)\b/i, 'Chemistry', 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'],
  [/\b(biology|cell|dna|evolution|organism|gene)\b/i, 'Biology', 'text-green-400 bg-green-500/10 border-green-500/20'],
  [/\b(history|ancient|war|empire|revolution|century)\b/i, 'History', 'text-amber-400 bg-amber-500/10 border-amber-500/20'],
  [/\b(code|program|javascript|python|develop|software|api|react|algorithm)\b/i, 'Coding', 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'],
  [/\b(music|song|guitar|piano|melody|rhythm)\b/i, 'Music', 'text-pink-400 bg-pink-500/10 border-pink-500/20'],
  [/\b(cook|recipe|food|kitchen|bak)\b/i, 'Cooking', 'text-orange-400 bg-orange-500/10 border-orange-500/20'],
  [/\b(business|market|invest|econom|startup|finance)\b/i, 'Business', 'text-teal-400 bg-teal-500/10 border-teal-500/20'],
  [/\b(science|research|experiment|study|data)\b/i, 'Science', 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'],
];

function getTopicTag(title?: string): { label: string; className: string } | null {
  if (!title) return null;
  for (const [pattern, label, cls] of TOPIC_TAGS) {
    if (pattern.test(title)) return { label, className: cls };
  }
  return null;
}

interface VideoPreview {
  id: string;
  title: string;
  thumbnail: string;
}

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [recentVideos, setRecentVideos] = useState<RecentVideo[]>([]);
  const [streak, setStreak] = useState<StreakData>({ currentStreak: 0, lastStudyDate: '', totalDays: 0, freezesAvailable: 0, longestStreak: 0 });
  const [preview, setPreview] = useState<VideoPreview | null>(null);
  const [activity, setActivity] = useState<Record<string, number>>({});
  const [videoFilter, setVideoFilter] = useState('');
  const [videoSort, setVideoSort] = useState<'date' | 'title' | 'views'>('date');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [dailyGoal] = useState(() => getDailyGoal());
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [animatedCount, setAnimatedCount] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [lastSessionAgo, setLastSessionAgo] = useState<string | null>(null);
  const [totalWordsLearned, setTotalWordsLearned] = useState(0);
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const [inputShake, setInputShake] = useState(false);
  const [tipIndex, setTipIndex] = useState(new Date().getDay());
  const [selectedVideoIdx, setSelectedVideoIdx] = useState(-1);
  const [pinnedVideoIds, setPinnedVideoIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try { return new Set(JSON.parse(localStorage.getItem('chalk-pinned-videos') || '[]')); } catch { return new Set(); }
  });
  const previewAbort = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecentVideos(getRecentVideos());
    setStreak(getStreak());
    setActivity(getActivity());
    setTodayMinutes(getTodayMinutes());
    // Last session tracking
    try {
      const prev = localStorage.getItem('chalk-last-session');
      if (prev) {
        const ago = Date.now() - parseInt(prev, 10);
        const mins = Math.floor(ago / 60000);
        const hrs = Math.floor(ago / 3600000);
        const days = Math.floor(ago / 86400000);
        setLastSessionAgo(mins < 2 ? 'just now' : mins < 60 ? `${mins}m ago` : hrs < 24 ? `${hrs}h ago` : `${days}d ago`);
      }
      localStorage.setItem('chalk-last-session', String(Date.now()));
    } catch { /* ignore */ }
    // Total words learned
    try {
      const w = parseInt(localStorage.getItem('chalk-total-words-learned') || '0', 10);
      if (w > 0) setTotalWordsLearned(w);
    } catch { /* ignore */ }
  }, []);

  // Session duration timer
  useEffect(() => {
    const interval = setInterval(() => setSessionSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Animate video count from 0 to actual count on load
  useEffect(() => {
    const target = recentVideos.length;
    if (target === 0) { setAnimatedCount(0); return; }
    let frame: number;
    const duration = 400; // ms
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setAnimatedCount(Math.round(eased * target));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [recentVideos.length]);

  // Rotate study tips every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => setTipIndex((i) => (i + 1) % 7), 10000);
    return () => clearInterval(interval);
  }, []);

  // Global keyboard shortcuts: Enter → focus input or open selected, Escape → blur, arrows → navigate videos
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isInput = document.activeElement === inputRef.current;
      if (e.key === 'Escape' && isInput) {
        inputRef.current?.blur();
        return;
      }
      if (isInput) return; // Don't interfere with input typing
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedVideoIdx((prev) => Math.min(prev + 1, recentVideos.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedVideoIdx((prev) => Math.max(prev - 1, -1));
      } else if (e.key === 'Enter' && selectedVideoIdx >= 0 && selectedVideoIdx < recentVideos.length) {
        e.preventDefault();
        handleRecentClick(recentVideos[selectedVideoIdx]);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [recentVideos, selectedVideoIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch preview when URL changes
  useEffect(() => {
    const videoId = extractVideoId(url.trim());
    if (!videoId) {
      setPreview(null);
      return;
    }
    // Show thumbnail immediately
    setPreview({ id: videoId, title: '', thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` });
    // Fetch title
    previewAbort.current?.abort();
    const controller = new AbortController();
    previewAbort.current = controller;
    fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { title?: string }) => {
        if (data.title) setPreview((p) => p ? { ...p, title: data.title! } : p);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [url]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const videoId = extractVideoId(url.trim());
    if (!videoId) {
      setError('Please enter a valid YouTube URL');
      setInputShake(true);
      setTimeout(() => setInputShake(false), 500);
      return;
    }

    saveRecentVideo(videoId, url.trim());
    fetchAndSaveTitle(videoId);
    recordStudyDay();
    try { const k = `chalk-video-visits-${videoId}`; localStorage.setItem(k, String((parseInt(localStorage.getItem(k) || '0', 10) || 0) + 1)); } catch {}
    try { const sk = `chalk-video-streak-${videoId}`; const days: string[] = JSON.parse(localStorage.getItem(sk) || '[]'); const today = new Date().toISOString().split('T')[0]; if (days[days.length - 1] !== today) { days.push(today); localStorage.setItem(sk, JSON.stringify(days.slice(-30))); } } catch {}
    try { localStorage.setItem(`chalk-video-lastvisit-${videoId}`, String(Date.now())); } catch {}
    router.push(`/watch?v=${videoId}`);
  };

  const handleRecentClick = (video: RecentVideo) => {
    recordStudyDay();
    try { const k = `chalk-video-visits-${video.id}`; localStorage.setItem(k, String((parseInt(localStorage.getItem(k) || '0', 10) || 0) + 1)); } catch {}
    try { const sk = `chalk-video-streak-${video.id}`; const days: string[] = JSON.parse(localStorage.getItem(sk) || '[]'); const today = new Date().toISOString().split('T')[0]; if (days[days.length - 1] !== today) { days.push(today); localStorage.setItem(sk, JSON.stringify(days.slice(-30))); } } catch {}
    try { localStorage.setItem(`chalk-video-lastvisit-${video.id}`, String(Date.now())); } catch {}
    router.push(`/watch?v=${video.id}`);
  };

  return (
    <div className="min-h-[100dvh] bg-chalk-bg flex flex-col overflow-y-auto h-[100dvh]" onScroll={(e) => { const el = e.currentTarget; setShowScrollTop(el.scrollTop > 300); }} ref={scrollContainerRef}>
      {/* Hero with animated gradient */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16 relative overflow-hidden">
        {/* Animated background gradient */}
        <div className="absolute inset-0 opacity-30" style={{
          background: 'radial-gradient(ellipse at 30% 20%, rgba(59,130,246,0.15) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(139,92,246,0.12) 0%, transparent 50%)',
          animation: 'gradient-shift 15s ease-in-out infinite alternate',
        }} />
        <style>{`
          @keyframes gradient-shift {
            0% { transform: translate(0, 0) scale(1); }
            50% { transform: translate(-5%, 3%) scale(1.05); }
            100% { transform: translate(5%, -3%) scale(1); }
          }
        `}</style>
        <div className="text-center max-w-2xl mx-auto relative z-10">
          <h1 className="text-4xl sm:text-5xl font-bold text-chalk-text mb-3 tracking-tight shimmer-text">
            Chalk
          </h1>
          <p className="text-lg text-slate-400 mb-6 max-w-md mx-auto leading-relaxed">
            {(() => {
              const hour = new Date().getHours();
              const emoji = hour < 6 ? '\u{1F319}' : hour < 12 ? '\u2600\uFE0F' : hour < 17 ? '\u{1F44B}' : '\u{1F319}';
              const greeting = hour < 12 ? `Good morning ${emoji}` : hour < 17 ? `Good afternoon ${emoji}` : `Good evening ${emoji}`;
              const tip = hour < 12 ? 'Start your day with a video lesson.' : hour < 17 ? 'Perfect time for focused learning.' : 'Wind down with something interesting.';
              return `${greeting}! ${tip}`;
            })()}
          </p>

          {/* Rotating study tip */}
          <div className="mb-4 max-w-sm mx-auto">
            <p className="text-[10px] text-slate-600 italic">
              {[
                'Pause frequently to reflect on what you just learned.',
                'Try explaining a concept back to the AI in your own words.',
                'Bookmark key moments so you can revisit them later.',
                'Ask "why" questions to deepen understanding.',
                'Take notes alongside the video for better retention.',
                'Review your study streak to stay motivated.',
                'Compare what you learned today with yesterday.',
              ][tipIndex]}
            </p>
            <div className="h-0.5 mt-1 bg-chalk-border/10 rounded-full overflow-hidden">
              <div className="h-full bg-chalk-accent/20 rounded-full" style={{ animation: 'tipProgress 10s linear infinite' }} />
            </div>
          </div>

          {/* Study streak + daily goal + heatmap */}
          {(streak.currentStreak > 0 || todayMinutes > 0) && (
            <div className="mb-6 flex flex-col items-center gap-3">
              {/* Streak + Daily Goal row */}
              <div className="flex items-center gap-4">
                {streak.currentStreak > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className={`${streak.currentStreak >= 14 ? 'text-xl' : streak.currentStreak >= 7 ? 'text-lg' : 'text-base'}`}>🔥</span>
                    <span className="text-sm text-slate-400">
                      <span className="text-chalk-text font-semibold">{streak.currentStreak}</span> day streak
                    </span>
                    {/* Milestone badge */}
                    {(() => {
                      const milestone = [...STREAK_MILESTONES].reverse().find((m) => streak.currentStreak >= m.days);
                      return milestone ? (
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-current/20 ${milestone.color}`}>
                          {milestone.label}
                        </span>
                      ) : null;
                    })()}
                    {/* Streak freeze indicator */}
                    {streak.freezesAvailable > 0 && (
                      <span className="text-[10px] text-cyan-400/60 flex items-center gap-0.5" title={`${streak.freezesAvailable} streak freeze${streak.freezesAvailable > 1 ? 's' : ''} available (earned every 7 days)`}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                          <path d="M8 1a.75.75 0 0 1 .75.75v1.72a5.002 5.002 0 0 1 4.242 5.5A5 5 0 1 1 3.008 8.97a5.002 5.002 0 0 1 4.242-5.5V1.75A.75.75 0 0 1 8 1ZM5.25 8a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Z" />
                        </svg>
                        {streak.freezesAvailable}
                      </span>
                    )}
                    {/* Completed videos count */}
                    {(() => {
                      try {
                        const recent = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem(RECENT_VIDEOS_KEY) || '[]') : [];
                        let completed = 0;
                        for (const v of recent) {
                          const prog = parseFloat(localStorage.getItem(`chalk-progress-${v.id}`) || '0');
                          const dur = parseFloat(localStorage.getItem(`chalk-duration-${v.id}`) || '0');
                          if (dur > 0 && prog / dur > 0.9) completed++;
                        }
                        if (completed > 0) return (
                          <span className="text-[10px] text-emerald-500/60 flex items-center gap-0.5" title={`${completed} video${completed > 1 ? 's' : ''} completed`}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                              <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                            </svg>
                            {completed}
                          </span>
                        );
                      } catch { /* ignore */ }
                      return null;
                    })()}
                  </div>
                )}
                {/* Daily goal ring */}
                <div className="flex items-center gap-1.5">
                  <svg width="28" height="28" viewBox="0 0 28 28" className="shrink-0">
                    <circle cx="14" cy="14" r="11" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/[0.06]" />
                    <circle
                      cx="14" cy="14" r="11" fill="none" strokeWidth="2.5" strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 11}
                      strokeDashoffset={2 * Math.PI * 11 * (1 - Math.min(todayMinutes / dailyGoal, 1))}
                      className={todayMinutes >= dailyGoal ? 'text-emerald-400' : 'text-chalk-accent'}
                      stroke="currentColor"
                      transform="rotate(-90 14 14)"
                      style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                    />
                    {todayMinutes >= dailyGoal && (
                      <text x="14" y="15" textAnchor="middle" fontSize="9" fill="currentColor" className="text-emerald-400">✓</text>
                    )}
                  </svg>
                  <span className="text-[11px] text-slate-400">
                    <span className={`font-semibold ${todayMinutes >= dailyGoal ? 'text-emerald-400' : 'text-chalk-text'}`}>{todayMinutes}</span>/{dailyGoal}m today
                  </span>
                </div>
              </div>

              {/* 30-day activity heatmap */}
              {Object.keys(activity).length > 0 && (
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 30 }, (_, i) => {
                    const date = new Date(Date.now() - (29 - i) * 86400000).toISOString().split('T')[0];
                    const mins = activity[date] || 0;
                    const intensity = mins === 0 ? 0 : mins < 5 ? 1 : mins < 15 ? 2 : mins < 30 ? 3 : 4;
                    const colors = ['bg-white/[0.04]', 'bg-chalk-accent/20', 'bg-chalk-accent/40', 'bg-chalk-accent/60', 'bg-chalk-accent/80'];
                    return (
                      <div
                        key={date}
                        className={`w-2 h-2 rounded-[2px] ${colors[intensity]} transition-colors`}
                        title={`${date}: ${mins}m`}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Quick stats summary */}
          {recentVideos.length > 0 && (() => {
            let totalQs = 0;
            try {
              for (const v of recentVideos) {
                const chat = localStorage.getItem(`chalk-video-chat-${v.id}`);
                if (chat) {
                  const msgs = JSON.parse(chat);
                  totalQs += msgs.filter((m: { role: string }) => m.role === 'user').length;
                }
              }
            } catch { /* ignore */ }
            const totalMins = Object.values(activity).reduce((a, m) => a + m, 0);
            if (totalQs === 0 && totalMins === 0) return null;
            return (
              <div className="mb-4 flex items-center justify-center gap-3 text-[10px] text-slate-600">
                <span>{recentVideos.length} video{recentVideos.length !== 1 ? 's' : ''}</span>
                {totalQs > 0 && <><span className="text-slate-700">·</span><span>{totalQs} question{totalQs !== 1 ? 's' : ''} asked</span></>}
                {totalMins > 0 && <><span className="text-slate-700">·</span><span>{totalMins}m studied</span></>}
              </div>
            );
          })()}

          {/* URL Input */}
          <form onSubmit={handleSubmit} className="w-full max-w-xl mx-auto">
            <div className="flex items-center gap-2 relative transition-transform" style={inputShake ? { animation: 'shake 0.4s ease-in-out' } : undefined}>
              <input
                ref={inputRef}
                type="text"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(''); setClipboardUrl(null); }}
                onFocus={() => {
                  if (!url.trim() && navigator.clipboard?.readText) {
                    navigator.clipboard.readText().then((text) => {
                      if (text && /youtu\.?be/.test(text) && extractVideoId(text)) setClipboardUrl(text);
                    }).catch(() => {});
                  }
                }}
                onBlur={() => setTimeout(() => setClipboardUrl(null), 200)}
                placeholder="Paste a YouTube URL..."
                className="flex-1 px-5 py-3.5 rounded-full bg-chalk-surface border border-chalk-border/40 text-chalk-text placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-chalk-accent/50 focus:border-transparent transition-all"
                autoFocus
              />
              {url.trim() && (
                <span className="absolute right-[7.5rem] top-1/2 -translate-y-1/2">
                  {extractVideoId(url.trim()) ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-emerald-400">
                      <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-red-400/60">
                      <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                    </svg>
                  )}
                </span>
              )}
              {url.trim() && (
                <button
                  type="button"
                  onClick={() => { setUrl(''); setError(''); inputRef.current?.focus(); }}
                  className="absolute right-[5.5rem] top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-slate-500 hover:text-slate-300 hover:bg-white/10 transition-colors"
                  title="Clear URL"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                    <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                  </svg>
                </button>
              )}
              {clipboardUrl && !url.trim() && (
                <button type="button" onMouseDown={() => { setUrl(clipboardUrl); setClipboardUrl(null); }} className="absolute top-full mt-1 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-medium bg-chalk-accent/20 text-chalk-accent border border-chalk-accent/30 hover:bg-chalk-accent/30 transition-colors whitespace-nowrap z-10">
                  Paste from clipboard
                </button>
              )}
              <button
                type="submit"
                disabled={!url.trim()}
                className="px-6 py-3.5 rounded-full bg-chalk-accent text-white font-medium text-sm hover:bg-blue-600 disabled:opacity-30 disabled:hover:bg-chalk-accent transition-colors"
              >
                Watch
              </button>
            </div>
            {error && (
              <p className="mt-2 text-xs text-red-400 text-center">{error}</p>
            )}
          </form>
          <p className="text-[9px] text-slate-700 mt-1.5 text-center">
            Press <kbd className="px-1 py-0 rounded bg-chalk-surface/40 border border-chalk-border/20 text-[8px] font-mono">Enter</kbd> to focus
            {' · '}
            <kbd className="px-1 py-0 rounded bg-chalk-surface/40 border border-chalk-border/20 text-[8px] font-mono">Esc</kbd> to blur
          </p>

          {/* Quick actions */}
          <div className="flex items-center justify-center gap-3 mt-3">
            {[
              { href: '/history', label: 'History' },
              { href: '/collections', label: 'Collections' },
              { href: '/compare', label: 'Compare' },
              { href: '/math', label: 'Math Viz' },
            ].map((a) => (
              <a key={a.href} href={a.href} className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
                {a.label}
              </a>
            ))}
          </div>

          {/* Video preview card */}
          {preview && (
            <div className="mt-4 w-full max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-chalk-surface/50 border border-chalk-border/30">
                <img
                  src={preview.thumbnail}
                  alt={preview.title || ''}
                  className="w-24 h-[54px] object-cover rounded-lg bg-chalk-surface shrink-0"
                />
                <div className="min-w-0 flex-1">
                  {preview.title ? (
                    <span className="text-xs text-chalk-text line-clamp-2">{preview.title}</span>
                  ) : (
                    <span className="text-xs text-slate-500">Loading title...</span>
                  )}
                  <span className="text-[10px] text-slate-600 block mt-0.5">youtube.com/watch?v={preview.id}</span>
                </div>
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-emerald-400">
                    <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* Example URLs */}
          <div className="mt-6 flex flex-wrap gap-2 justify-center">
            {[
              { label: '3Blue1Brown', url: 'https://www.youtube.com/watch?v=WUvTyaaNkzM' },
              { label: 'Veritasium', url: 'https://www.youtube.com/watch?v=HeQX2HjkcNo' },
              { label: 'Fireship', url: 'https://www.youtube.com/watch?v=r-98YRAF1dY' },
            ].map((ex) => (
              <button
                key={ex.url}
                onClick={() => {
                  const id = extractVideoId(ex.url);
                  if (id) {
                    saveRecentVideo(id, ex.url, ex.label);
                    router.push(`/watch?v=${id}`);
                  }
                }}
                className="px-3 py-1.5 text-xs rounded-full bg-chalk-surface/60 border border-chalk-border/20 text-slate-400 hover:text-chalk-text hover:border-chalk-accent/40 transition-all"
              >
                Try {ex.label}
              </button>
            ))}
          </div>
        </div>

        {/* Recent videos */}
        {recentVideos.length > 0 && (
          <div className="mt-12 w-full max-w-xl mx-auto relative z-10">
            <div className="flex items-center justify-center gap-2 mb-3">
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Recent Videos
                <span className="ml-1 text-[9px] text-slate-600 font-normal normal-case tabular-nums">{animatedCount}</span>
              </h3>
              {recentVideos.length > 3 && (
                <>
                  <input
                    type="text"
                    value={videoFilter}
                    onChange={(e) => setVideoFilter(e.target.value)}
                    placeholder="Filter..."
                    className="w-24 px-2 py-0.5 rounded-md text-[10px] bg-chalk-surface/50 border border-chalk-border/30 text-chalk-text placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-chalk-accent/40"
                  />
                  <div className="flex items-center gap-0.5">
                    {(['date', 'title', 'views'] as const).map((s) => (
                      <button key={s} onClick={() => setVideoSort(s)} className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${videoSort === s ? 'text-chalk-accent bg-chalk-accent/10' : 'text-slate-600 hover:text-slate-400'}`}>
                        {s === 'date' ? 'Recent' : s === 'title' ? 'A-Z' : 'Views'}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button
                onClick={() => setViewMode((m) => m === 'grid' ? 'list' : 'grid')}
                className="px-1.5 py-0.5 rounded text-[9px] text-slate-600 hover:text-slate-400 hover:bg-chalk-surface/50 transition-colors"
                title={viewMode === 'grid' ? 'Switch to list' : 'Switch to grid'}
              >
                {viewMode === 'grid' ? 'List' : 'Grid'}
              </button>
              {recentVideos.length > 1 && (
                <button
                  onClick={() => { if (confirm('Clear all recent videos?')) { setRecentVideos([]); localStorage.setItem(RECENT_VIDEOS_KEY, '[]'); } }}
                  className="px-1.5 py-0.5 rounded text-[9px] text-red-500/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Clear all recent videos"
                >
                  Clear all
                </button>
              )}
            </div>
            {/* Category filter chips */}
            {(() => {
              const categories = new Set<string>();
              recentVideos.forEach((v) => { const tag = getTopicTag(v.title); if (tag) categories.add(tag.label); });
              if (categories.size < 2) return null;
              return (
                <div className="flex items-center gap-1 mb-2 flex-wrap">
                  <button onClick={() => setCategoryFilter(null)} className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${!categoryFilter ? 'text-chalk-accent bg-chalk-accent/10' : 'text-slate-600 hover:text-slate-400'}`}>All</button>
                  {[...categories].map((cat) => (
                    <button key={cat} onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)} className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${categoryFilter === cat ? 'text-chalk-accent bg-chalk-accent/10' : 'text-slate-600 hover:text-slate-400'}`}>{cat}</button>
                  ))}
                </div>
              );
            })()}
            {/* Time spent breakdown bar */}
            {(() => {
              const timeData = recentVideos.slice(0, 5).map((v) => {
                try {
                  const prog = typeof window !== 'undefined' ? parseFloat(localStorage.getItem(`chalk-progress-${v.id}`) || '0') : 0;
                  return { id: v.id, title: v.title || v.id, time: Math.round(prog) };
                } catch { return { id: v.id, title: v.title || v.id, time: 0 }; }
              }).filter((d) => d.time > 0);
              const totalTime = timeData.reduce((a, d) => a + d.time, 0);
              if (totalTime < 10) return null;
              const barColors = ['bg-blue-500/60', 'bg-violet-500/60', 'bg-emerald-500/60', 'bg-amber-500/60', 'bg-rose-500/60'];
              return (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] text-slate-600 uppercase tracking-wider">Time Invested</span>
                    <span className="text-[9px] text-slate-500 tabular-nums">{Math.round(totalTime / 60)}m total</span>
                  </div>
                  <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-white/[0.04]">
                    {timeData.map((d, i) => (
                      <div
                        key={d.id}
                        className={`${barColors[i % barColors.length]} transition-all`}
                        style={{ width: `${(d.time / totalTime) * 100}%` }}
                        title={`${d.title}: ${Math.round(d.time / 60)}m`}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {timeData.map((d, i) => (
                      <span key={d.id} className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${barColors[i % barColors.length]}`} />
                        <span className="text-[8px] text-slate-600 truncate max-w-[80px]">{d.title}</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
            <div className={viewMode === 'grid' ? 'space-y-1.5' : 'space-y-0.5'}>
              {[...recentVideos].sort((a, b) => {
                const aPinned = pinnedVideoIds.has(a.id) ? 1 : 0;
                const bPinned = pinnedVideoIds.has(b.id) ? 1 : 0;
                if (aPinned !== bPinned) return bPinned - aPinned;
                if (videoSort === 'title') return (a.title || a.url).localeCompare(b.title || b.url);
                if (videoSort === 'views') {
                  const va = typeof window !== 'undefined' ? parseInt(localStorage.getItem(`chalk-visits-${a.id}`) || '0', 10) : 0;
                  const vb = typeof window !== 'undefined' ? parseInt(localStorage.getItem(`chalk-visits-${b.id}`) || '0', 10) : 0;
                  return vb - va;
                }
                return b.timestamp - a.timestamp;
              }).slice(0, viewMode === 'list' ? 10 : 5).filter((v) => {
                  if (videoFilter.trim() && !(v.title || v.url).toLowerCase().includes(videoFilter.toLowerCase())) return false;
                  if (categoryFilter) { const tag = getTopicTag(v.title); if (!tag || tag.label !== categoryFilter) return false; }
                  return true;
                }).map((video, vidIdx) => {
                // Watch progress bar data
                let watchPct = 0;
                try {
                  const prog = typeof window !== 'undefined' ? parseFloat(localStorage.getItem(`chalk-progress-${video.id}`) || '0') : 0;
                  const dur = typeof window !== 'undefined' ? parseFloat(localStorage.getItem(`chalk-duration-${video.id}`) || '0') : 0;
                  if (dur > 0 && prog > 0) watchPct = Math.min(1, prog / dur);
                } catch { /* ignore */ }
                if (viewMode === 'list') {
                  const ago = Date.now() - video.timestamp;
                  const mins = Math.floor(ago / 60000);
                  const hrs = Math.floor(ago / 3600000);
                  const days = Math.floor(ago / 86400000);
                  const agoLabel = mins < 1 ? 'now' : mins < 60 ? `${mins}m` : hrs < 24 ? `${hrs}h` : `${days}d`;
                  let durLabel = '';
                  try {
                    const dur = typeof window !== 'undefined' ? parseFloat(localStorage.getItem(`chalk-duration-${video.id}`) || '0') : 0;
                    if (dur > 0) { const m = Math.floor(dur / 60); const s = Math.floor(dur % 60); durLabel = `${m}:${s.toString().padStart(2, '0')}`; }
                  } catch { /* ignore */ }
                  return (
                    <button key={video.id} onClick={() => handleRecentClick(video)} className={`group/card w-full flex items-center gap-2 px-3 py-1 rounded-lg hover:bg-chalk-surface/40 transition-colors text-left relative ${vidIdx === selectedVideoIdx ? 'ring-1 ring-chalk-accent/50 bg-chalk-surface/30' : ''}`}>
                      <img src={`https://i.ytimg.com/vi/${video.id}/default.jpg`} alt="" className="w-8 h-6 object-cover rounded shrink-0 bg-chalk-surface" />
                      <span className="text-[11px] text-chalk-text truncate flex-1">{video.title || video.url}</span>
                      {durLabel && <span className="text-[9px] text-slate-600 font-mono tabular-nums shrink-0">{durLabel}</span>}
                      {watchPct > 0.9 && <span className="text-[9px] text-emerald-500 shrink-0">done</span>}
                      {watchPct > 0 && watchPct <= 0.9 && <span className="text-[9px] text-chalk-accent/60 tabular-nums shrink-0">{Math.round(watchPct * 100)}%</span>}
                      <span className="text-[9px] text-slate-700 tabular-nums shrink-0">{agoLabel}</span>
                      <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); const updated = recentVideos.filter((v) => v.id !== video.id); setRecentVideos(updated); localStorage.setItem(RECENT_VIDEOS_KEY, JSON.stringify(updated)); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); const updated = recentVideos.filter((v) => v.id !== video.id); setRecentVideos(updated); localStorage.setItem(RECENT_VIDEOS_KEY, JSON.stringify(updated)); } }} className="opacity-0 group-hover/card:opacity-100 p-0.5 rounded text-slate-600 hover:text-red-400 transition-all" title="Remove"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5"><path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" /></svg></span>
                    </button>
                  );
                }
                return (
                <button
                  key={video.id}
                  onClick={() => handleRecentClick(video)}
                  className={`group/card w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-chalk-surface/30 border hover:bg-chalk-surface/50 hover:border-chalk-accent/30 hover:scale-[1.02] hover:shadow-lg hover:shadow-chalk-accent/5 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-chalk-accent/60 focus-visible:outline-none transition-all duration-200 text-left relative overflow-hidden ${vidIdx === selectedVideoIdx ? 'border-chalk-accent/50 ring-1 ring-chalk-accent/30' : 'border-chalk-border/20'}`}
                >
                  {/* Watch progress bar */}
                  {watchPct > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5">
                      <div
                        className={`h-full transition-all ${watchPct > 0.9 ? 'bg-emerald-500/60' : 'bg-chalk-accent/40'}`}
                        style={{ width: `${watchPct * 100}%` }}
                      />
                    </div>
                  )}
                  {/* Thumbnail */}
                  <div className="relative shrink-0 overflow-hidden rounded-lg w-20 aspect-video bg-chalk-surface">
                    <img
                      src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`}
                      alt={video.title || ''}
                      className="w-full h-full object-cover rounded-lg bg-chalk-surface transition-transform duration-200 group-hover/card:scale-105"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.classList.add('flex', 'items-center', 'justify-center'); const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('fill', 'currentColor'); svg.setAttribute('class', 'w-5 h-5 text-slate-600'); svg.innerHTML = '<path d="M2 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4Zm10.5 5.707L9.354 6.56a.5.5 0 0 0-.708 0L6 9.207l-1.146-1.147a.5.5 0 0 0-.708 0L3.5 8.707V12a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5V9.707Z"/>'; (e.target as HTMLImageElement).parentElement!.appendChild(svg); }}
                    />
                    {watchPct > 0.9 && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-emerald-400">
                          <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                        </svg>
                        {/* Sparkle accents */}
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="absolute top-0.5 right-1 w-2 h-2 text-yellow-300/70 animate-pulse">
                          <path d="M8 .75a.75.75 0 0 1 .697.473l1.524 3.84 3.84 1.524a.75.75 0 0 1 0 1.396l-3.84 1.524-1.524 3.84a.75.75 0 0 1-1.394 0L5.78 9.507l-3.84-1.524a.75.75 0 0 1 0-1.396l3.84-1.524L7.303 1.223A.75.75 0 0 1 8 .75Z" />
                        </svg>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="absolute bottom-1 left-1 w-1.5 h-1.5 text-emerald-300/60 animate-pulse [animation-delay:500ms]">
                          <path d="M8 .75a.75.75 0 0 1 .697.473l1.524 3.84 3.84 1.524a.75.75 0 0 1 0 1.396l-3.84 1.524-1.524 3.84a.75.75 0 0 1-1.394 0L5.78 9.507l-3.84-1.524a.75.75 0 0 1 0-1.396l3.84-1.524L7.303 1.223A.75.75 0 0 1 8 .75Z" />
                        </svg>
                      </div>
                    )}
                    {watchPct > 0 && watchPct <= 0.9 && (
                      <svg className="absolute -top-1 -left-1 w-4 h-4" viewBox="0 0 20 20">
                        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/10" />
                        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" className="text-chalk-accent" strokeDasharray={`${watchPct * 50.27} 50.27`} strokeLinecap="round" transform="rotate(-90 10 10)" />
                      </svg>
                    )}
                    <span className="absolute bottom-0.5 left-0.5 flex items-center gap-0.5 px-0.5 py-0 rounded bg-black/60">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" className="w-2 h-2" fill="none"><rect x="1" y="3.5" width="14" height="9" rx="2" fill="#FF0000"/><polygon points="6.5,5.5 11,8 6.5,10.5" fill="white"/></svg>
                    </span>
                    {(() => {
                      try {
                        const dur = typeof window !== 'undefined' ? parseFloat(localStorage.getItem(`chalk-duration-${video.id}`) || '0') : 0;
                        if (dur <= 0) return null;
                        const mins = Math.floor(dur / 60);
                        const secs = Math.floor(dur % 60);
                        const durColor = mins < 10 ? 'text-emerald-300' : mins < 30 ? 'text-amber-300' : 'text-red-300';
                        return (
                          <span className={`absolute bottom-0.5 right-0.5 px-1 py-0 rounded text-[8px] font-mono font-medium bg-black/70 ${durColor}`}>
                            {mins}:{secs.toString().padStart(2, '0')}
                          </span>
                        );
                      } catch { return null; }
                    })()}
                  </div>
                  <div className="min-w-0 flex-1">
                    {video.title ? (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-chalk-text truncate">{video.title}</span>
                          {(() => {
                            const tag = getTopicTag(video.title);
                            if (!tag) return null;
                            return <span className={`shrink-0 text-[8px] font-medium px-1 py-0 rounded border ${tag.className}`}>{tag.label}</span>;
                          })()}
                        </div>
                        {(() => {
                          const sep = video.title!.lastIndexOf(' - ');
                          const pipe = video.title!.lastIndexOf(' | ');
                          const idx = Math.max(sep, pipe);
                          if (idx > 0 && idx < video.title!.length - 3) {
                            const channel = video.title!.slice(idx + 3).trim();
                            if (channel.length > 1 && channel.length < 40) return <span className="text-[9px] text-slate-600 truncate block">{channel}</span>;
                          }
                          return null;
                        })()}
                        <span className="text-[10px] text-slate-500 truncate block">{video.url}</span>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400 truncate block">{video.url}</span>
                    )}
                    {/* Visit count + last watched + quick note */}
                    <div className="flex items-center gap-2 mt-0.5">
                      {(() => {
                        try {
                          const chat = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chat) {
                            const count = JSON.parse(chat).length;
                            if (count > 0) return (
                              <span className="text-[9px] text-slate-600 flex items-center gap-0.5 tabular-nums">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5">
                                  <path d="M1 8.74c0 1.36.49 2.6 1.3 3.56-.13.77-.45 1.48-.91 2.08a.38.38 0 0 0 .3.62c1.07 0 2-.37 2.74-.93A6.47 6.47 0 0 0 7.5 15.5c3.59 0 6.5-2.98 6.5-6.76S11.09 2 7.5 2 1 4.96 1 8.74Z" />
                                </svg>
                                {count}
                              </span>
                            );
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        const lastVisitTs = typeof window !== 'undefined' ? parseInt(localStorage.getItem(`chalk-video-lastvisit-${video.id}`) || '0', 10) : 0;
                        const ts = lastVisitTs || video.timestamp;
                        if (!ts) return null;
                        const ago = Date.now() - ts;
                        const mins = Math.floor(ago / 60000);
                        const hrs = Math.floor(ago / 3600000);
                        const days = Math.floor(ago / 86400000);
                        const label = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : hrs < 24 ? `${hrs}h ago` : days < 7 ? `${days}d ago` : (() => {
                          const d = new Date(ts);
                          return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        })();
                        return (
                          <span className="text-[9px] text-slate-600 tabular-nums" title={lastVisitTs ? 'Last visited' : 'Added'}>{label}</span>
                        );
                      })()}
                      {(() => {
                        try {
                          const visits = typeof window !== 'undefined' ? parseInt(localStorage.getItem(`chalk-visits-${video.id}`) || '0', 10) : 0;
                          if (visits >= 3) return (
                            <span className="text-[9px] text-orange-400/80 tabular-nums" title={`${visits} visits — on a streak!`}>🔥 {visits}x</span>
                          );
                          if (visits > 1) return (
                            <span className="text-[9px] text-slate-600 tabular-nums">{visits}x watched</span>
                          );
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {watchPct > 0 && watchPct <= 0.9 && (
                        <span className="text-[9px] text-chalk-accent/70 tabular-nums">{Math.round(watchPct * 100)}% watched</span>
                      )}
                      {(() => {
                        try {
                          const prog = typeof window !== 'undefined' ? parseFloat(localStorage.getItem(`chalk-progress-${video.id}`) || '0') : 0;
                          if (prog > 5) { const m = Math.floor(prog / 60); const s = Math.floor(prog % 60); return <span className="text-[9px] text-slate-600 tabular-nums">at {m}:{s.toString().padStart(2, '0')}</span>; }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const fc = typeof window !== 'undefined' ? localStorage.getItem(`chalk-quick-flashcards-${video.id}`) : null;
                          if (fc) {
                            const cards = JSON.parse(fc);
                            if (cards.length > 0) {
                              const due = cards.some((c: { created: number }) => Date.now() - c.created > 86400000);
                              return <><span className="text-[8px] text-violet-400/60 tabular-nums" title={`${cards.length} flashcard${cards.length > 1 ? 's' : ''} saved`}>{cards.length} card{cards.length > 1 ? 's' : ''}</span>{due && <span className="text-[7px] text-orange-400/50" title="Flashcards created 24h+ ago — time to review!">review due</span>}</>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const hasNotes = typeof window !== 'undefined' && !!localStorage.getItem(`chalk-note-${video.id}`);
                          if (!hasNotes) return null;
                          return (
                            <span className="text-[8px] text-sky-400/50 flex items-center gap-0.5" title="Has notes">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2 h-2"><path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L3.22 10.306a1 1 0 0 0-.26.447l-.78 3.126a.5.5 0 0 0 .6.6l3.126-.78a1 1 0 0 0 .447-.26l7.793-7.793a1.75 1.75 0 0 0 0-2.475l-.658-.658Z" /></svg>
                              notes
                            </span>
                          );
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const bm = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-bookmarks-${video.id}`) : null;
                          if (bm) {
                            const bookmarks = JSON.parse(bm);
                            if (bookmarks.length > 0) return (
                              <span className="text-[8px] text-amber-400/50 flex items-center gap-0.5 tabular-nums" title={`${bookmarks.length} bookmark${bookmarks.length > 1 ? 's' : ''}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2 h-2"><path d="M3.5 2A1.5 1.5 0 0 0 2 3.5v9.793a.5.5 0 0 0 .854.353L8 8.5l5.146 5.146a.5.5 0 0 0 .854-.353V3.5A1.5 1.5 0 0 0 12.5 2h-9Z" /></svg>
                                {bookmarks.length}
                              </span>
                            );
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chat = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chat) {
                            const msgs = JSON.parse(chat);
                            const aiWords = msgs.filter((m: { role: string }) => m.role === 'assistant').reduce((sum: number, m: { content: string }) => sum + m.content.split(/\s+/).filter(Boolean).length, 0);
                            if (aiWords > 50) return <span className="text-[8px] text-emerald-400/40 tabular-nums" title={`${aiWords} words from AI responses`}>{aiWords > 999 ? `${(aiWords / 1000).toFixed(1)}k` : aiWords}w AI</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const visits = typeof window !== 'undefined' ? parseInt(localStorage.getItem(`chalk-video-visits-${video.id}`) || '0', 10) : 0;
                          if (visits >= 2) return <span className="text-[8px] text-teal-400/40 tabular-nums" title={`${visits} sessions`}>{visits} sessions</span>;
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          let score = 0;
                          const chat = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chat) score += JSON.parse(chat).filter((m: { role: string }) => m.role === 'user').length;
                          const bm = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-bookmarks-${video.id}`) : null;
                          if (bm) score += JSON.parse(bm).length * 2;
                          const fc = typeof window !== 'undefined' ? localStorage.getItem(`chalk-flashcards-${video.id}`) : null;
                          if (fc) score += JSON.parse(fc).length * 3;
                          const note = typeof window !== 'undefined' ? localStorage.getItem(`chalk-note-${video.id}`) : null;
                          if (note) score += 2;
                          if (score > 3) {
                            const stars = Math.min(5, Math.ceil(score / 4));
                            return <span className="text-[8px] text-yellow-500/40" title={`Engagement score: ${score} (${stars}/5 stars)`}>{'★'.repeat(stars)}{'☆'.repeat(5 - stars)}</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const raw = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-streak-${video.id}`) : null;
                          if (raw) {
                            const days: string[] = JSON.parse(raw);
                            if (days.length >= 2) {
                              let streak = 1;
                              for (let d = days.length - 1; d > 0; d--) {
                                const diff = new Date(days[d]).getTime() - new Date(days[d - 1]).getTime();
                                if (diff >= 72000000 && diff <= 100800000) streak++; else break;
                              }
                              if (streak >= 2) return <span className="text-[8px] text-amber-400/40 tabular-nums" title={`${streak}-day study streak for this video`}>{streak}-day streak</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chat = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chat) {
                            const qCount = JSON.parse(chat).filter((m: { role: string }) => m.role === 'user').length;
                            if (qCount >= 2) return <span className="text-[8px] text-indigo-400/40 tabular-nums" title={`${qCount} questions asked`}>{qCount} Qs</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chat = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chat) {
                            const msgs = JSON.parse(chat);
                            const turns = Math.min(msgs.filter((m: { role: string }) => m.role === 'user').length, msgs.filter((m: { role: string }) => m.role === 'assistant').length);
                            if (turns >= 4) return <span className="text-[8px] text-pink-400/40 tabular-nums" title={`${turns} complete Q&A exchanges`}>{turns} turns deep</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chat = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chat) {
                            const aiMsgs = JSON.parse(chat).filter((m: { role: string; content: string }) => m.role === 'assistant' && m.content);
                            if (aiMsgs.length >= 3) {
                              const avgW = Math.round(aiMsgs.reduce((s: number, m: { content: string }) => s + m.content.split(/\s+/).filter(Boolean).length, 0) / aiMsgs.length);
                              return <span className="text-[8px] text-cyan-400/40 tabular-nums" title={`Average AI response: ~${avgW} words across ${aiMsgs.length} responses`}>~{avgW}w avg</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chat = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chat) {
                            const msgs = JSON.parse(chat);
                            const userWords = new Set<string>(msgs.filter((m: { role: string }) => m.role === 'user').map((m: { content: string }) => m.content.toLowerCase()).join(' ').split(/\s+/).filter((w: string) => w.length > 6));
                            const aiWords: string[] = msgs.filter((m: { role: string }) => m.role === 'assistant').map((m: { content: string }) => m.content.toLowerCase()).join(' ').split(/\s+/).filter((w: string) => w.length > 6);
                            const topics = [...new Set<string>(aiWords)].filter((w) => !userWords.has(w));
                            if (topics.length >= 3) return <span className="text-[8px] text-emerald-400/40 tabular-nums" title={`${topics.length} unique topic words in AI responses`}>{Math.min(topics.length, 99)} topics</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chat = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chat) {
                            const aiText: string = JSON.parse(chat).filter((m: { role: string; content: string }) => m.role === 'assistant' && m.content).map((m: { content: string }) => m.content.toLowerCase()).join(' ');
                            const stopWords = new Set(['about','after','again','also','been','before','being','between','both','could','does','doing','during','each','from','further','have','having','here','itself','just','more','most','much','myself','once','only','other','over','same','should','some','such','than','that','their','them','then','there','these','they','this','those','through','under','until','very','what','when','where','which','while','will','with','would','your','into','like','well','really','think','know','right','going','want','make','good','take','come','look','said','were','been','many','then','them','some','time','very','when','long','even','back','made','keep','still','hand','high','last','next','same','work','part','dont','didnt','just','also','than','only','come','than','over','such','cant','tell']);
                            const freq = new Map<string, number>();
                            for (const w of aiText.split(/\s+/)) {
                              if (w.length > 5 && !stopWords.has(w)) freq.set(w, (freq.get(w) || 0) + 1);
                            }
                            let topWord = '', topCount = 0;
                            for (const [w, c] of freq) { if (c > topCount) { topWord = w; topCount = c; } }
                            if (topCount >= 3) return <span className="text-[8px] text-fuchsia-400/40 truncate" title={`Most used AI word: "${topWord}" (${topCount}x)`}>top: {topWord}</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chat = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chat) {
                            const userQs: string[] = JSON.parse(chat).filter((m: { role: string; content: string }) => m.role === 'user' && m.content.trim().endsWith('?')).map((m: { content: string }) => m.content.toLowerCase());
                            if (userQs.length >= 2) {
                              const counts: Record<string, number> = { what: 0, why: 0, how: 0, compare: 0 };
                              for (const q of userQs) {
                                if (/\b(what|which|who|where|when)\b/.test(q)) counts.what++;
                                else if (/\b(why|how come|what caused)\b/.test(q)) counts.why++;
                                else if (/\b(how|in what way|what steps)\b/.test(q)) counts.how++;
                                else if (/\b(compare|vs\.?|versus|difference|differ)\b/.test(q)) counts.compare++;
                              }
                              const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                              if (top[0][1] > 0) {
                                const label = top[0][1] > top[1][1] ? `mostly ${top[0][0]}` : 'mixed Qs';
                                return <span className="text-[8px] text-lime-400/40" title={`Question types: what(${counts.what}) why(${counts.why}) how(${counts.how}) compare(${counts.compare})`}>{label}</span>;
                              }
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chat = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chat) {
                            const aiMsgs = JSON.parse(chat).filter((m: { role: string; responseDuration?: number }) => m.role === 'assistant' && m.responseDuration && m.responseDuration > 0);
                            if (aiMsgs.length >= 2) {
                              const avgMs = Math.round(aiMsgs.reduce((s: number, m: { responseDuration: number }) => s + m.responseDuration, 0) / aiMsgs.length);
                              const avgS = (avgMs / 1000).toFixed(1);
                              return <span className="text-[8px] text-slate-500/50 tabular-nums" title={`Average AI response time: ${avgS}s across ${aiMsgs.length} responses`}>~{avgS}s avg</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const bm = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-bookmarks-${video.id}`) : null;
                          if (bm) {
                            const bookmarks: { time: number }[] = JSON.parse(bm);
                            if (bookmarks.length >= 3) {
                              const times = bookmarks.map((b) => b.time).filter(Boolean).sort((a, b) => a - b);
                              const span = times.length >= 2 ? (times[times.length - 1] - times[0]) / 60 : 0;
                              if (span >= 1) {
                                const density = (bookmarks.length / span).toFixed(1);
                                return <span className="text-[8px] text-orange-400/40 tabular-nums" title={`${bookmarks.length} bookmarks across ${Math.round(span)}min — ${density}/min density`}>{density} bm/min</span>;
                              }
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const fc = typeof window !== 'undefined' ? localStorage.getItem(`chalk-flashcards-${video.id}`) : null;
                          if (fc) {
                            const cards = JSON.parse(fc);
                            if (cards.length >= 2) {
                              const bm = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-bookmarks-${video.id}`) : null;
                              const bmCount = bm ? JSON.parse(bm).length : 0;
                              const growth = cards.length > bmCount;
                              return <span className={`text-[8px] tabular-nums ${growth ? 'text-green-400/40' : 'text-slate-500/40'}`} title={`${cards.length} flashcards${growth ? ' (more than bookmarks!)' : ''}`}>{growth ? '+' : ''}{cards.length} cards</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const note = typeof window !== 'undefined' ? localStorage.getItem(`chalk-note-${video.id}`) : null;
                          if (note && note.trim().length > 0) {
                            const wc = note.trim().split(/\s+/).filter(Boolean).length;
                            const color = wc >= 100 ? 'text-emerald-400/50' : wc >= 20 ? 'text-slate-400/40' : 'text-slate-600/40';
                            return <span className={`text-[8px] ${color} tabular-nums`} title={`${wc} words in personal notes`}>{wc}w noted</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const lastVisit = typeof window !== 'undefined' ? parseInt(localStorage.getItem(`chalk-video-lastvisit-${video.id}`) || '0', 10) : 0;
                          if (lastVisit > 0) {
                            const ago = Date.now() - lastVisit;
                            const days = ago / 86400000;
                            if (days < 1) return <span className="text-[8px] text-green-400/50 font-medium" title="Studied today">active</span>;
                            if (days < 7) return <span className="text-[8px] text-yellow-400/40" title={`Last studied ${Math.floor(days)} day(s) ago`}>recent</span>;
                            return <span className="text-[8px] text-slate-600/40" title={`Last studied ${Math.floor(days)} days ago`}>cold</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chat = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chat) {
                            const msgs: { role: string; content: string }[] = JSON.parse(chat);
                            const userWords = msgs.filter((m) => m.role === 'user' && m.content).reduce((s, m) => s + m.content.split(/\s+/).length, 0);
                            const aiWords = msgs.filter((m) => m.role === 'assistant' && m.content).reduce((s, m) => s + m.content.split(/\s+/).length, 0);
                            if (userWords >= 5 && aiWords >= 5) {
                              const ratio = aiWords / userWords;
                              if (ratio >= 3) return <span className="text-[8px] text-blue-400/40" title={`AI wrote ${Math.round(ratio)}x more words than you`}>deep</span>;
                              if (ratio >= 0.5) return <span className="text-[8px] text-green-400/40" title={`Balanced dialog — AI/user word ratio: ${ratio.toFixed(1)}`}>dialog</span>;
                              return <span className="text-[8px] text-amber-400/40" title={`Query-heavy — you wrote more than AI`}>query-heavy</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chat = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chat) {
                            const aiMsgs = JSON.parse(chat).filter((m: { role: string; content: string }) => m.role === 'assistant' && m.content);
                            if (aiMsgs.length >= 2) {
                              const maxWc = Math.max(...aiMsgs.map((m: { content: string }) => m.content.split(/\s+/).filter(Boolean).length));
                              if (maxWc >= 50) return <span className="text-[8px] text-violet-400/40 tabular-nums" title={`Longest AI response: ${maxWc} words`}>max {maxWc}w</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chat = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chat) {
                            const aiMsgs: { role: string; content: string }[] = JSON.parse(chat).filter((m: { role: string; content: string }) => m.role === 'assistant' && m.content);
                            const allRefs = new Set<string>();
                            for (const m of aiMsgs) { const refs = m.content.match(/\[\d+:\d{2}\]/g); if (refs) refs.forEach((r) => allRefs.add(r)); }
                            if (allRefs.size >= 3) return <span className="text-[8px] text-sky-400/40 tabular-nums" title={`${allRefs.size} unique timestamps cited by AI`}>{allRefs.size} cited</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const stars = typeof window !== 'undefined' ? localStorage.getItem(`chalk-stars-${video.id}`) : null;
                          if (stars) {
                            const arr: number[] = JSON.parse(stars);
                            if (arr.length >= 2) return <span className="text-[8px] text-yellow-400/40 tabular-nums" title={`${arr.length} starred transcript segments`}>{arr.length} starred</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chat = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chat) {
                            const userMsgs: { role: string; content: string }[] = JSON.parse(chat).filter((m: { role: string; content: string }) => m.role === 'user' && m.content);
                            const timedQs = userMsgs.filter((m) => /\[\d+:\d{2}\]/.test(m.content));
                            if (timedQs.length >= 2) return <span className="text-[8px] text-fuchsia-400/40 tabular-nums" title={`${timedQs.length} questions referencing specific timestamps`}>{timedQs.length} timed Qs</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chat = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chat) {
                            const userMsgs2: { role: string; content: string }[] = JSON.parse(chat).filter((m: { role: string; content: string }) => m.role === 'user' && m.content);
                            if (userMsgs2.length >= 3) {
                              const avgWc = Math.round(userMsgs2.reduce((s, m) => s + m.content.split(/\s+/).filter(Boolean).length, 0) / userMsgs2.length);
                              if (avgWc >= 8) return <span className="text-[8px] text-orange-400/40 tabular-nums" title={`Average question length: ${avgWc} words across ${userMsgs2.length} questions`}>avg {avgWc}w/q</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chat = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chat) {
                            const allMsgs: { role: string; content: string }[] = JSON.parse(chat);
                            let maxStreak = 0, cur = 0;
                            for (let k = 0; k < allMsgs.length - 1; k++) {
                              if (allMsgs[k].role === 'user' && allMsgs[k + 1]?.role === 'assistant') { cur++; k++; } else { maxStreak = Math.max(maxStreak, cur); cur = 0; }
                            }
                            maxStreak = Math.max(maxStreak, cur);
                            if (maxStreak >= 3) return <span className="text-[8px] text-emerald-400/40 tabular-nums" title={`Longest consecutive Q&A exchange: ${maxStreak} turns`}>{maxStreak}-turn streak</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chat = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chat) {
                            const aiMsgs3: { role: string; model?: string }[] = JSON.parse(chat).filter((m: { role: string }) => m.role === 'assistant');
                            if (aiMsgs3.length >= 3) {
                              const counts: Record<string, number> = {};
                              for (const m of aiMsgs3) { const mdl = (m.model || 'unknown').split('-').pop() || 'unknown'; counts[mdl] = (counts[mdl] || 0) + 1; }
                              const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
                              if (top) return <span className="text-[8px] text-slate-500/40" title={`Most used model: ${top[0]} (${top[1]}/${aiMsgs3.length} responses)`}>via {top[0]}</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const bm = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-bookmarks-${video.id}`) : null;
                          const dur = typeof window !== 'undefined' ? parseFloat(localStorage.getItem(`chalk-duration-${video.id}`) || '0') : 0;
                          if (bm && dur > 60) {
                            const bmCount = JSON.parse(bm).length;
                            if (bmCount >= 2) {
                              const per10 = (bmCount / (dur / 600)).toFixed(1);
                              return <span className="text-[8px] text-pink-400/40 tabular-nums" title={`${bmCount} bookmarks across ${Math.round(dur / 60)} min — ${per10} per 10 min`}>{per10} bm/10m</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const fc = typeof window !== 'undefined' ? localStorage.getItem(`chalk-flashcards-${video.id}`) : null;
                          if (fc) {
                            const cards = JSON.parse(fc);
                            if (Array.isArray(cards) && cards.length >= 2) return <span className="text-[8px] text-yellow-400/40 tabular-nums" title={`${cards.length} flashcards created`}>{cards.length} cards</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const nt = typeof window !== 'undefined' ? localStorage.getItem(`chalk-note-${video.id}`) : null;
                          if (nt && nt.length >= 20) return <span className="text-[8px] text-lime-400/40 tabular-nums" title={`Note: ${nt.length} characters`}>{nt.length} ch note</span>;
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const stars = typeof window !== 'undefined' ? localStorage.getItem(`chalk-stars-${video.id}`) : null;
                          const dur = typeof window !== 'undefined' ? parseFloat(localStorage.getItem(`chalk-duration-${video.id}`) || '0') : 0;
                          if (stars && dur > 60) {
                            const starCount = JSON.parse(stars).length;
                            const estSegs = Math.max(1, Math.round(dur / 10));
                            const pct = Math.round((starCount / estSegs) * 100);
                            if (pct >= 5) return <span className="text-[8px] text-amber-400/40 tabular-nums" title={`${starCount} starred segments out of ~${estSegs} total (${pct}%)`}>{pct}% starred</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const prog = typeof window !== 'undefined' ? parseFloat(localStorage.getItem(`chalk-progress-${video.id}`) || '0') : 0;
                          const dur = typeof window !== 'undefined' ? parseFloat(localStorage.getItem(`chalk-duration-${video.id}`) || '0') : 0;
                          const visits = typeof window !== 'undefined' ? parseInt(localStorage.getItem(`chalk-video-visits-${video.id}`) || '0', 10) : 0;
                          if (visits >= 2 && prog > 0 && dur > 60) {
                            const pctPerVisit = Math.round((prog / dur) * 100 / visits);
                            if (pctPerVisit >= 1) return <span className="text-[8px] text-cyan-400/40 tabular-nums" title={`${Math.round((prog / dur) * 100)}% progress over ${visits} visits`}>{pctPerVisit}%/visit</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatQpm = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          const durQpm = typeof window !== 'undefined' ? parseFloat(localStorage.getItem(`chalk-duration-${video.id}`) || '0') : 0;
                          if (chatQpm && durQpm > 60) {
                            const qCount = JSON.parse(chatQpm).filter((m: { role: string }) => m.role === 'user').length;
                            if (qCount >= 3) {
                              const qpm = (qCount / (durQpm / 60)).toFixed(1);
                              if (parseFloat(qpm) >= 0.5) return <span className="text-[8px] text-violet-400/40 tabular-nums" title={`${qCount} questions across ${Math.round(durQpm / 60)} min`}>{qpm} q/min</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatMom = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatMom) {
                            const uMsgs = JSON.parse(chatMom).filter((m: { role: string }) => m.role === 'user');
                            if (uMsgs.length >= 6) {
                              const half = Math.floor(uMsgs.length / 2);
                              const firstHalf = half;
                              const secondHalf = uMsgs.length - half;
                              if (secondHalf > firstHalf) return <span className="text-[8px] text-green-400/40" title={`${firstHalf} questions in first half, ${secondHalf} in second half`}>&uarr; momentum</span>;
                              if (firstHalf > secondHalf) return <span className="text-[8px] text-red-400/40" title={`${firstHalf} questions in first half, ${secondHalf} in second half`}>&darr; momentum</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatUw = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatUw) {
                            const uMsgsUw: { role: string; content: string }[] = JSON.parse(chatUw).filter((m: { role: string; content: string }) => m.role === 'user' && m.content);
                            if (uMsgsUw.length >= 3) {
                              const allWords = new Set(uMsgsUw.flatMap(m => m.content.toLowerCase().split(/\s+/).filter(w => w.length > 3)));
                              if (allWords.size >= 20) return <span className="text-[8px] text-teal-400/40 tabular-nums" title={`${allWords.size} unique words across ${uMsgsUw.length} questions`}>{allWords.size} unique words</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatWpr = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatWpr) {
                            const aiMsgsWpr: { role: string; content: string }[] = JSON.parse(chatWpr).filter((m: { role: string; content: string }) => m.role === 'assistant' && m.content);
                            if (aiMsgsWpr.length >= 3) {
                              const avgWpr = Math.round(aiMsgsWpr.reduce((s, m) => s + m.content.split(/\s+/).filter(Boolean).length, 0) / aiMsgsWpr.length);
                              if (avgWpr >= 15) return <span className="text-[8px] text-rose-400/40 tabular-nums" title={`Average ${avgWpr} words per AI response across ${aiMsgsWpr.length} responses`}>avg {avgWpr}w/resp</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatCd = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatCd) {
                            const aiMsgsCd: { role: string; content: string }[] = JSON.parse(chatCd).filter((m: { role: string; content: string }) => m.role === 'assistant' && m.content);
                            if (aiMsgsCd.length >= 3) {
                              const totalCites = aiMsgsCd.reduce((s, m) => s + (m.content.match(/\[\d+:\d{2}\]/g) || []).length, 0);
                              const avgCite = (totalCites / aiMsgsCd.length).toFixed(1);
                              if (parseFloat(avgCite) >= 1) return <span className="text-[8px] text-sky-400/40 tabular-nums" title={`${totalCites} timestamp citations across ${aiMsgsCd.length} responses`}>{avgCite} cite/resp</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatLq = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatLq) {
                            const uMsgsLq: { role: string; content: string }[] = JSON.parse(chatLq).filter((m: { role: string; content: string }) => m.role === 'user' && m.content);
                            if (uMsgsLq.length >= 3) {
                              const maxWc = Math.max(...uMsgsLq.map(m => m.content.split(/\s+/).filter(Boolean).length));
                              if (maxWc >= 15) return <span className="text-[8px] text-indigo-400/40 tabular-nums" title={`Longest question: ${maxWc} words`}>max {maxWc}w</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatRr = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatRr) {
                            const allRr: { role: string; content: string }[] = JSON.parse(chatRr).filter((m: { role: string; content: string }) => m.content);
                            const uWords = allRr.filter(m => m.role === 'user').reduce((s, m) => s + m.content.split(/\s+/).filter(Boolean).length, 0);
                            const aWords = allRr.filter(m => m.role === 'assistant').reduce((s, m) => s + m.content.split(/\s+/).filter(Boolean).length, 0);
                            if (uWords >= 10 && allRr.length >= 6) {
                              const ratio = Math.round(aWords / uWords);
                              if (ratio >= 2) return <span className="text-[8px] text-purple-400/40 tabular-nums" title={`AI wrote ${aWords} words vs your ${uWords} words`}>{ratio}:1 ratio</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatSim = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatSim) {
                            const uMsgsSim: { role: string; content: string }[] = JSON.parse(chatSim).filter((m: { role: string; content: string }) => m.role === 'user' && m.content);
                            if (uMsgsSim.length >= 4) {
                              const firstWords = new Set(uMsgsSim[0].content.toLowerCase().split(/\s+/).filter(w => w.length > 3));
                              const lastWords = new Set(uMsgsSim[uMsgsSim.length - 1].content.toLowerCase().split(/\s+/).filter(w => w.length > 3));
                              if (firstWords.size > 0) {
                                const shared = [...firstWords].filter(w => lastWords.has(w)).length;
                                const pct = shared / firstWords.size;
                                if (pct < 0.3) return <span className="text-[8px] text-orange-400/40" title="First and last questions share few words — topic evolved">topic shift</span>;
                                if (pct >= 0.7) return <span className="text-[8px] text-blue-400/40" title="First and last questions share many words — stayed focused">focused</span>;
                              }
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatSr = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatSr) {
                            const aiMsgsSr: { role: string; content: string }[] = JSON.parse(chatSr).filter((m: { role: string; content: string }) => m.role === 'assistant' && m.content);
                            if (aiMsgsSr.length >= 3) {
                              const minWc = Math.min(...aiMsgsSr.map(m => m.content.split(/\s+/).filter(Boolean).length));
                              if (minWc <= 30) return <span className="text-[8px] text-slate-400/40 tabular-nums" title={`Shortest AI response: ${minWc} words`}>min {minWc}w</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatWf = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatWf) {
                            const uMsgsWf: { role: string; content: string }[] = JSON.parse(chatWf).filter((m: { role: string; content: string }) => m.role === 'user' && m.content);
                            if (uMsgsWf.length >= 3) {
                              const stop = new Set(['about','their','there','these','those','which','would','could','should','after','before','while','where','other','being','doing','having','getting','going','making','taking','using','saying','asking','telling']);
                              const freq: Record<string, number> = {};
                              for (const m of uMsgsWf) for (const w of m.content.toLowerCase().split(/\s+/).filter(w => w.length > 4 && !stop.has(w))) freq[w] = (freq[w] || 0) + 1;
                              const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
                              if (top && top[1] >= 3) return <span className="text-[8px] text-emerald-400/40" title={`"${top[0]}" appears ${top[1]} times in questions`}>&ldquo;{top[0]}&rdquo;</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const bmTot = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-bookmarks-${video.id}`) : null;
                          if (bmTot) {
                            const bmArr = JSON.parse(bmTot);
                            if (Array.isArray(bmArr) && bmArr.length >= 1) return <span className="text-[8px] text-pink-400/40 tabular-nums" title={`${bmArr.length} bookmarks saved`}>{bmArr.length} bm</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const starsTotal = typeof window !== 'undefined' ? localStorage.getItem(`chalk-stars-${video.id}`) : null;
                          if (starsTotal) {
                            const starArr = JSON.parse(starsTotal);
                            if (Array.isArray(starArr) && starArr.length >= 1) return <span className="text-[8px] text-yellow-400/40 tabular-nums" title={`${starArr.length} starred segments`}>{starArr.length} stars</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const progWc = typeof window !== 'undefined' ? parseFloat(localStorage.getItem(`chalk-progress-${video.id}`) || '0') : 0;
                          const durWc = typeof window !== 'undefined' ? parseFloat(localStorage.getItem(`chalk-duration-${video.id}`) || '0') : 0;
                          if (durWc > 60 && progWc > 0) {
                            const ratio = progWc / durWc;
                            if (ratio >= 0.9) return <span className="text-[8px] text-green-400/40" title={`Watched ${Math.round(ratio * 100)}% of video`}>completed</span>;
                            if (ratio >= 0.5) return <span className="text-[8px] text-yellow-400/40" title={`Watched ${Math.round(ratio * 100)}% of video`}>halfway</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatAvg = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatAvg) {
                            const uMsgsAvg: { role: string; content: string }[] = JSON.parse(chatAvg).filter((m: { role: string; content: string }) => m.role === 'user' && m.content);
                            if (uMsgsAvg.length >= 3) {
                              const avgLen = Math.round(uMsgsAvg.reduce((s, m) => s + m.content.split(/\s+/).filter(Boolean).length, 0) / uMsgsAvg.length);
                              if (avgLen >= 5) return <span className="text-[8px] text-fuchsia-400/40 tabular-nums" title={`Average question length: ${avgLen} words across ${uMsgsAvg.length} questions`}>avg {avgLen}w/q</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatDiv = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatDiv) {
                            const uMsgsDiv: { role: string; content: string }[] = JSON.parse(chatDiv).filter((m: { role: string; content: string }) => m.role === 'user' && m.content);
                            if (uMsgsDiv.length >= 3) {
                              const qTypes = new Set<string>();
                              const allText = uMsgsDiv.map(m => m.content.toLowerCase()).join(' ');
                              if (/\bwho\b/.test(allText)) qTypes.add('who');
                              if (/\bwhat\b/.test(allText)) qTypes.add('what');
                              if (/\bwhere\b/.test(allText)) qTypes.add('where');
                              if (/\bwhen\b/.test(allText)) qTypes.add('when');
                              if (/\bwhy\b/.test(allText)) qTypes.add('why');
                              if (/\bhow\b/.test(allText)) qTypes.add('how');
                              if (qTypes.size >= 3) return <span className="text-[8px] text-violet-400/40 tabular-nums" title={`Question types used: ${[...qTypes].join(', ')}`}>{qTypes.size} q-types</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatDur = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatDur) {
                            const allMsgsDur = JSON.parse(chatDur);
                            if (allMsgsDur.length >= 4) {
                              const estMinutes = Math.round(allMsgsDur.length * 5 / 60);
                              if (estMinutes >= 1) return <span className="text-[8px] text-lime-400/40 tabular-nums" title={`Estimated ${estMinutes} min chat session (${allMsgsDur.length} messages)`}>~{estMinutes}m chat</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const streakData = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-streak-${video.id}`) : null;
                          if (streakData) {
                            const dates: string[] = JSON.parse(streakData);
                            if (dates.length >= 3) {
                              const dayFreq: Record<string, number> = {};
                              const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                              for (const d of dates) { const day = dayNames[new Date(d).getDay()]; dayFreq[day] = (dayFreq[day] || 0) + 1; }
                              const peak = Object.entries(dayFreq).sort((a, b) => b[1] - a[1])[0];
                              if (peak && peak[1] >= 2) return <span className="text-[8px] text-cyan-400/40" title={`Most active day: ${peak[0]} (${peak[1]} visits)`}>peak: {peak[0]}</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatAvgAI = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatAvgAI) {
                            const aiMsgsAvg: { role: string; content: string }[] = JSON.parse(chatAvgAI).filter((m: { role: string; content: string }) => m.role === 'assistant' && m.content);
                            if (aiMsgsAvg.length >= 2) {
                              const avgWords = Math.round(aiMsgsAvg.reduce((s, m) => s + m.content.split(/\s+/).filter(Boolean).length, 0) / aiMsgsAvg.length);
                              if (avgWords >= 10) return <span className="text-[8px] text-indigo-400/40 tabular-nums" title={`Average AI response: ${avgWords} words across ${aiMsgsAvg.length} responses`}>avg {avgWords}w/a</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatAWR = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatAWR) {
                            const allAWR: { role: string; content?: string }[] = JSON.parse(chatAWR);
                            const aiW = allAWR.filter(m => m.role === 'assistant' && m.content).reduce((s, m) => s + m.content!.split(/\s+/).filter(Boolean).length, 0);
                            const totalW = allAWR.filter(m => m.content).reduce((s, m) => s + m.content!.split(/\s+/).filter(Boolean).length, 0);
                            if (totalW >= 20) {
                              const pct = Math.round((aiW / totalW) * 100);
                              if (pct >= 5 && pct <= 95) return <span className="text-[8px] text-rose-400/40 tabular-nums" title={`AI words: ${aiW} of ${totalW} total`}>{pct}% ai</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatUWR = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatUWR) {
                            const allUWR: { role: string; content?: string }[] = JSON.parse(chatUWR);
                            const userW = allUWR.filter(m => m.role === 'user' && m.content).reduce((s, m) => s + m.content!.split(/\s+/).filter(Boolean).length, 0);
                            const totalW = allUWR.filter(m => m.content).reduce((s, m) => s + m.content!.split(/\s+/).filter(Boolean).length, 0);
                            if (totalW >= 20) {
                              const pct = Math.round((userW / totalW) * 100);
                              if (pct >= 5 && pct <= 95) return <span className="text-[8px] text-violet-400/40 tabular-nums" title={`User words: ${userW} of ${totalW} total`}>{pct}% user</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatMRW = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatMRW) {
                            const allMRW: { role: string; content?: string }[] = JSON.parse(chatMRW);
                            const aiWc = allMRW.filter(m => m.role === 'assistant' && m.content).map(m => m.content!.split(/\s+/).filter(Boolean).length).sort((a, b) => a - b);
                            if (aiWc.length >= 2) {
                              const mid = Math.floor(aiWc.length / 2);
                              const median = aiWc.length % 2 ? aiWc[mid] : Math.round((aiWc[mid - 1] + aiWc[mid]) / 2);
                              if (median >= 5) return <span className="text-[8px] text-teal-400/40 tabular-nums" title={`Median AI response: ${median} words`}>{median} w median</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatTEC = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatTEC) {
                            const allTEC: { role: string; content?: string }[] = JSON.parse(chatTEC);
                            const userCount = allTEC.filter(m => m.role === 'user').length;
                            const aiCount = allTEC.filter(m => m.role === 'assistant').length;
                            const exchanges = Math.min(userCount, aiCount);
                            if (exchanges >= 2) return <span className="text-[8px] text-amber-400/40 tabular-nums" title={`${exchanges} conversation exchanges`}>{exchanges} exchanges</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatLRL = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatLRL) {
                            const allLRL: { role: string; content?: string }[] = JSON.parse(chatLRL);
                            const aiMsgs = allLRL.filter(m => m.role === 'assistant' && m.content);
                            if (aiMsgs.length >= 1 && allLRL.length >= 2) {
                              const wc = aiMsgs[aiMsgs.length - 1].content!.split(/\s+/).filter(Boolean).length;
                              if (wc >= 10) return <span className="text-[8px] text-rose-400/40 tabular-nums" title={`Last AI response: ${wc} words`}>{wc} w last</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatFRL = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatFRL) {
                            const allFRL: { role: string; content?: string }[] = JSON.parse(chatFRL);
                            const firstAI = allFRL.find(m => m.role === 'assistant' && m.content);
                            if (firstAI && allFRL.length >= 2) {
                              const wc = firstAI.content!.split(/\s+/).filter(Boolean).length;
                              if (wc >= 10) return <span className="text-[8px] text-sky-400/40 tabular-nums" title={`First AI response: ${wc} words`}>{wc} w first</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatQCS = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatQCS) {
                            const allQCS: { role: string; content?: string }[] = JSON.parse(chatQCS);
                            const userMsgs = allQCS.filter(m => m.role === 'user' && m.content);
                            if (userMsgs.length >= 3) {
                              const avgWords = Math.round(userMsgs.reduce((s, m) => s + m.content!.split(/\s+/).filter(Boolean).length, 0) / userMsgs.length);
                              if (avgWords >= 8) return <span className="text-[8px] text-lime-400/40 tabular-nums" title={`${avgWords} avg words per question`}>{avgWords} complexity</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatRGR = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatRGR) {
                            const allRGR: { role: string; content?: string }[] = JSON.parse(chatRGR);
                            const aiMsgs = allRGR.filter(m => m.role === 'assistant' && m.content);
                            if (aiMsgs.length >= 4) {
                              const firstWc = aiMsgs[0].content!.split(/\s+/).filter(Boolean).length;
                              const lastWc = aiMsgs[aiMsgs.length - 1].content!.split(/\s+/).filter(Boolean).length;
                              if (firstWc > 0) {
                                const ratio = Math.round((lastWc / firstWc) * 10) / 10;
                                if (ratio >= 1.5) return <span className="text-[8px] text-amber-400/40 tabular-nums" title={`Response grew ${ratio}x from first to last`}>{ratio}x growth</span>;
                              }
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatWPE = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatWPE) {
                            const allWPE: { role: string; content?: string }[] = JSON.parse(chatWPE);
                            const pairs: number[] = [];
                            for (let pi = 0; pi < allWPE.length - 1; pi++) {
                              if (allWPE[pi].role === 'user' && allWPE[pi + 1]?.role === 'assistant' && allWPE[pi].content && allWPE[pi + 1].content) {
                                const uW = allWPE[pi].content!.split(/\s+/).filter(Boolean).length;
                                const aW = allWPE[pi + 1].content!.split(/\s+/).filter(Boolean).length;
                                pairs.push(uW + aW);
                              }
                            }
                            if (pairs.length >= 3) {
                              const avg = Math.round(pairs.reduce((s, v) => s + v, 0) / pairs.length);
                              if (avg >= 20) return <span className="text-[8px] text-cyan-400/40 tabular-nums" title={`${avg} avg words per exchange`}>{avg} w/exchange</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatEMD = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatEMD) {
                            const allEMD: { role: string; content?: string }[] = JSON.parse(chatEMD);
                            const aiMsgs = allEMD.filter(m => m.role === 'assistant' && m.content);
                            if (aiMsgs.length >= 3) {
                              const totalEMs = aiMsgs.reduce((s, m) => s + (m.content!.match(/!/g) || []).length, 0);
                              const density = Math.round((totalEMs / aiMsgs.length) * 10) / 10;
                              if (density >= 0.3) return <span className="text-[8px] text-rose-400/40 tabular-nums" title={`${density} exclamation marks per AI message`}>{density} !/msg</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatQMD = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatQMD) {
                            const allQMD: { role: string; content?: string }[] = JSON.parse(chatQMD);
                            const userMsgs = allQMD.filter(m => m.role === 'user' && m.content);
                            if (userMsgs.length >= 3) {
                              const totalQMs = userMsgs.reduce((s, m) => s + (m.content!.match(/\?/g) || []).length, 0);
                              const density = Math.round((totalQMs / userMsgs.length) * 10) / 10;
                              if (density >= 0.5) return <span className="text-[8px] text-violet-400/40 tabular-nums" title={`${density} question marks per message`}>{density} ?/msg</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatSR2 = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatSR2) {
                            const allSR2: { role: string; content?: string }[] = JSON.parse(chatSR2);
                            const aiMsgs = allSR2.filter(m => m.role === 'assistant' && m.content);
                            if (aiMsgs.length >= 3) {
                              const minWords = Math.min(...aiMsgs.map(m => m.content!.split(/\s+/).filter(Boolean).length));
                              if (minWords >= 3) return <span className="text-[8px] text-sky-400/40 tabular-nums" title={`Shortest AI response: ${minWords} words`}>{minWords} word min R</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatLQ2 = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatLQ2) {
                            const allLQ2: { role: string; content?: string }[] = JSON.parse(chatLQ2);
                            const userMsgs = allLQ2.filter(m => m.role === 'user' && m.content);
                            if (userMsgs.length >= 3) {
                              const maxWords = Math.max(...userMsgs.map(m => m.content!.split(/\s+/).filter(Boolean).length));
                              if (maxWords >= 8) return <span className="text-[8px] text-emerald-400/40 tabular-nums" title={`Longest question: ${maxWords} words`}>{maxWords} word max Q</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatTS = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatTS) {
                            const allTS: { role: string; content?: string }[] = JSON.parse(chatTS);
                            const userMsgs = allTS.filter(m => m.role === 'user' && m.content);
                            if (userMsgs.length >= 4) {
                              let shifts = 0;
                              for (let ti = 1; ti < userMsgs.length; ti++) {
                                const prevWords = new Set(userMsgs[ti - 1].content!.toLowerCase().split(/\s+/).filter(w => w.length >= 4));
                                const currWords = userMsgs[ti].content!.toLowerCase().split(/\s+/).filter(w => w.length >= 4);
                                const overlap = currWords.some(w => prevWords.has(w));
                                if (!overlap) shifts++;
                              }
                              if (shifts >= 2) return <span className="text-[8px] text-indigo-400/40 tabular-nums" title={`${shifts} topic shifts detected`}>{shifts} topic shifts</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatCB = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatCB) {
                            const allCB: { role: string; content?: string }[] = JSON.parse(chatCB);
                            const userWords = allCB.filter(m => m.role === 'user' && m.content).reduce((s, m) => s + m.content!.split(/\s+/).filter(Boolean).length, 0);
                            const aiWords = allCB.filter(m => m.role === 'assistant' && m.content).reduce((s, m) => s + m.content!.split(/\s+/).filter(Boolean).length, 0);
                            if (allCB.length >= 4 && userWords > 0 && aiWords > 0) {
                              const ratio = Math.round(aiWords / userWords);
                              if (ratio >= 1) return <span className="text-[8px] text-fuchsia-400/40 tabular-nums" title={`Conversation balance: 1:${ratio} (you:AI words)`}>1:{ratio} balance</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatAV = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatAV) {
                            const allAV: { role: string; content?: string }[] = JSON.parse(chatAV);
                            const aiMsgs = allAV.filter(m => m.role === 'assistant' && m.content);
                            if (aiMsgs.length >= 4) {
                              const allWords = new Set(aiMsgs.flatMap(m => m.content!.toLowerCase().split(/\s+/).filter(Boolean)));
                              if (allWords.size >= 30) return <span className="text-[8px] text-orange-400/40 tabular-nums" title={`${allWords.size} unique words in AI responses`}>{allWords.size} AI vocab</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatUWD = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatUWD) {
                            const allUWD: { role: string; content?: string }[] = JSON.parse(chatUWD);
                            const userMsgs = allUWD.filter(m => m.role === 'user' && m.content);
                            if (userMsgs.length >= 4) {
                              const allWords = new Set(userMsgs.flatMap(m => m.content!.toLowerCase().split(/\s+/).filter(Boolean)));
                              if (allWords.size >= 20) return <span className="text-[8px] text-teal-400/40 tabular-nums" title={`${allWords.size} unique words in your questions`}>{allWords.size} unique words</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatQD = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatQD) {
                            const allQD: { role: string; content?: string }[] = JSON.parse(chatQD);
                            let exchanges = 0;
                            let totalQs = 0;
                            for (let ei = 0; ei < allQD.length - 1; ei++) {
                              if (allQD[ei].role === 'user' && allQD[ei + 1]?.role === 'assistant') {
                                exchanges++;
                                if (allQD[ei].content) totalQs += (allQD[ei].content!.match(/\?/g) || []).length;
                              }
                            }
                            if (exchanges >= 2) {
                              const density = Math.round((totalQs / exchanges) * 10) / 10;
                              if (density >= 1.0) return <span className="text-[8px] text-pink-400/40 tabular-nums" title={`Question density: ${density} questions per exchange`}>{density} q/exchange</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatER = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatER) {
                            const allER: { role: string; content?: string }[] = JSON.parse(chatER);
                            const exchangeWcs: number[] = [];
                            for (let ei = 0; ei < allER.length - 1; ei++) {
                              if (allER[ei].role === 'user' && allER[ei + 1]?.role === 'assistant' && allER[ei].content && allER[ei + 1].content) {
                                exchangeWcs.push(allER[ei].content!.split(/\s+/).filter(Boolean).length + allER[ei + 1].content!.split(/\s+/).filter(Boolean).length);
                              }
                            }
                            if (exchangeWcs.length >= 2) {
                              const minE = Math.min(...exchangeWcs);
                              const maxE = Math.max(...exchangeWcs);
                              if (maxE > minE) return <span className="text-[8px] text-amber-400/40 tabular-nums" title={`Exchange word range: ${minE}-${maxE}`}>{minE}-{maxE} word/exchange</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatEC = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatEC) {
                            const allEC: { role: string; content?: string }[] = JSON.parse(chatEC);
                            let pairCount = 0;
                            for (let ei = 0; ei < allEC.length - 1; ei++) {
                              if (allEC[ei].role === 'user' && allEC[ei + 1]?.role === 'assistant') pairCount++;
                            }
                            if (pairCount >= 2) return <span className="text-[8px] text-sky-400/40 tabular-nums" title={`${pairCount} question-answer exchanges`}>{pairCount} exchanges</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatSE = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatSE) {
                            const allSE: { role: string; content?: string }[] = JSON.parse(chatSE);
                            let minExchange = Infinity;
                            let pairCount = 0;
                            for (let ei = 0; ei < allSE.length - 1; ei++) {
                              if (allSE[ei].role === 'user' && allSE[ei + 1]?.role === 'assistant' && allSE[ei].content && allSE[ei + 1].content) {
                                pairCount++;
                                const combined = allSE[ei].content!.split(/\s+/).filter(Boolean).length + allSE[ei + 1].content!.split(/\s+/).filter(Boolean).length;
                                if (combined < minExchange) minExchange = combined;
                              }
                            }
                            if (pairCount >= 2 && minExchange >= 5 && minExchange < Infinity) return <span className="text-[8px] text-violet-400/40 tabular-nums" title={`Shortest exchange: ${minExchange} words`}>min {minExchange} word exchange</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatME = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatME) {
                            const allME: { role: string; content?: string }[] = JSON.parse(chatME);
                            let maxExchange = 0;
                            for (let ei = 0; ei < allME.length - 1; ei++) {
                              if (allME[ei].role === 'user' && allME[ei + 1]?.role === 'assistant' && allME[ei].content && allME[ei + 1].content) {
                                const combined = allME[ei].content!.split(/\s+/).filter(Boolean).length + allME[ei + 1].content!.split(/\s+/).filter(Boolean).length;
                                if (combined > maxExchange) maxExchange = combined;
                              }
                            }
                            const pairs = allME.filter((m, ei) => m.role === 'user' && allME[ei + 1]?.role === 'assistant').length;
                            if (pairs >= 2 && maxExchange >= 10) return <span className="text-[8px] text-red-400/40 tabular-nums" title={`Longest exchange: ${maxExchange} words`}>max {maxExchange} word exchange</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatMT = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatMT) {
                            const allMT: { role: string; content?: string }[] = JSON.parse(chatMT);
                            const msgsMT = allMT.filter(m => m.content);
                            if (msgsMT.length >= 4) {
                              const wcs = msgsMT.map(m => m.content!.split(/\s+/).filter(Boolean).length).sort((a, b) => a - b);
                              const mid = Math.floor(wcs.length / 2);
                              const median = wcs.length % 2 ? wcs[mid] : Math.round((wcs[mid - 1] + wcs[mid]) / 2);
                              if (median >= 5) return <span className="text-[8px] text-lime-400/40 tabular-nums" title={`Median words per turn: ${median}`}>med {median} words/turn</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatWT = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatWT) {
                            const allWT: { role: string; content?: string }[] = JSON.parse(chatWT);
                            const msgsWT = allWT.filter(m => m.content);
                            if (msgsWT.length >= 4) {
                              const totalWords = msgsWT.reduce((sum, m) => sum + m.content!.split(/\s+/).filter(Boolean).length, 0);
                              const avgPerTurn = Math.round(totalWords / msgsWT.length);
                              if (avgPerTurn >= 5) return <span className="text-[8px] text-emerald-400/40 tabular-nums" title={`Average words per turn: ${avgPerTurn}`}>avg {avgPerTurn} words/turn</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatQR2 = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatQR2) {
                            const allQR2: { role: string; content?: string }[] = JSON.parse(chatQR2);
                            const userMsgsQR2 = allQR2.filter(m => m.role === 'user' && m.content);
                            if (userMsgsQR2.length >= 2) {
                              const wcs = userMsgsQR2.map(m => m.content!.split(/\s+/).filter(Boolean).length);
                              const minW = Math.min(...wcs);
                              const maxW = Math.max(...wcs);
                              if (minW >= 1 && maxW > minW) return <span className="text-[8px] text-cyan-400/40 tabular-nums" title={`User question range: ${minW}-${maxW} words`}>{minW}-{maxW} q word range</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatAR = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatAR) {
                            const allAR: { role: string; content?: string }[] = JSON.parse(chatAR);
                            const aiMsgsAR = allAR.filter(m => m.role === 'assistant' && m.content);
                            if (aiMsgsAR.length >= 3) {
                              const wcs = aiMsgsAR.map(m => m.content!.split(/\s+/).filter(Boolean).length);
                              const minW = Math.min(...wcs);
                              const maxW = Math.max(...wcs);
                              if (minW >= 1 && maxW > minW) return <span className="text-[8px] text-orange-400/40 tabular-nums" title={`AI response range: ${minW}-${maxW} words`}>{minW}-{maxW} ai word range</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatSR = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatSR) {
                            const allSR: { role: string; content?: string }[] = JSON.parse(chatSR);
                            const aiMsgsSR = allSR.filter(m => m.role === 'assistant' && m.content);
                            if (aiMsgsSR.length >= 3) {
                              const minAiWords = Math.min(...aiMsgsSR.map(m => m.content!.split(/\s+/).filter(Boolean).length));
                              if (minAiWords >= 3) return <span className="text-[8px] text-pink-400/40 tabular-nums" title={`Shortest AI response: ${minAiWords} words`}>min {minAiWords} ai words</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatLM = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatLM) {
                            const allLM: { role: string; content?: string }[] = JSON.parse(chatLM);
                            const userMsgsLM = allLM.filter(m => m.role === 'user' && m.content);
                            if (userMsgsLM.length >= 1) {
                              const maxQWords = Math.max(...userMsgsLM.map(m => m.content!.split(/\s+/).filter(Boolean).length));
                              if (maxQWords >= 5) return <span className="text-[8px] text-lime-400/40 tabular-nums" title={`Longest user question: ${maxQWords} words`}>max {maxQWords} q words</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatUQ = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatUQ) {
                            const allUQ: { role: string; content?: string }[] = JSON.parse(chatUQ);
                            const userMsgsUQ = allUQ.filter(m => m.role === 'user' && m.content);
                            if (userMsgsUQ.length >= 2) {
                              const allWords = userMsgsUQ.flatMap(m => m.content!.toLowerCase().split(/\s+/).filter(w => w.length >= 3));
                              const uniqueCount = new Set(allWords).size;
                              if (uniqueCount >= 10) return <span className="text-[8px] text-violet-400/40 tabular-nums" title={`Unique question words: ${uniqueCount}`}>{uniqueCount} unique q words</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatMD = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatMD) {
                            const allMD: { role: string; content?: string }[] = JSON.parse(chatMD);
                            const aiMsgsMD = allMD.filter(m => m.role === 'assistant' && m.content);
                            if (aiMsgsMD.length >= 3) {
                              const wcs = aiMsgsMD.map(m => m.content!.split(/\s+/).filter(Boolean).length).sort((a, b) => a - b);
                              const mid = Math.floor(wcs.length / 2);
                              const median = wcs.length % 2 !== 0 ? wcs[mid] : Math.round((wcs[mid - 1] + wcs[mid]) / 2);
                              if (median >= 5) return <span className="text-[8px] text-cyan-400/40 tabular-nums" title={`Median AI response: ${median} words`}>med {median} ai words</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatRV = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatRV) {
                            const allRV: { role: string; content?: string }[] = JSON.parse(chatRV);
                            const aiMsgsRV = allRV.filter(m => m.role === 'assistant' && m.content);
                            if (aiMsgsRV.length >= 3) {
                              const wcs = aiMsgsRV.map(m => m.content!.split(/\s+/).filter(Boolean).length);
                              const mean = wcs.reduce((a, b) => a + b, 0) / wcs.length;
                              const variance = wcs.reduce((sum, w) => sum + (w - mean) ** 2, 0) / wcs.length;
                              const std = Math.round(Math.sqrt(variance));
                              if (std >= 5) return <span className="text-[8px] text-pink-400/40 tabular-nums" title={`AI response word count std dev: ±${std}`}>&plusmn;{std} words</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatMN = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatMN) {
                            const allMN: { role: string; content?: string }[] = JSON.parse(chatMN);
                            const aiMsgsMN = allMN.filter(m => m.role === 'assistant' && m.content);
                            if (aiMsgsMN.length >= 2) {
                              const minWords = Math.min(...aiMsgsMN.map(m => m.content!.split(/\s+/).filter(Boolean).length));
                              if (minWords >= 1) return <span className="text-[8px] text-teal-400/40 tabular-nums" title={`Shortest AI response: ${minWords} words`}>min {minWords} ai words</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatMW = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatMW) {
                            const allMW: { role: string; content?: string }[] = JSON.parse(chatMW);
                            const aiMsgsMW = allMW.filter(m => m.role === 'assistant' && m.content);
                            if (aiMsgsMW.length >= 1) {
                              const maxWords = Math.max(...aiMsgsMW.map(m => m.content!.split(/\s+/).filter(Boolean).length));
                              if (maxWords >= 10) return <span className="text-[8px] text-amber-400/40 tabular-nums" title={`Longest AI response: ${maxWords} words`}>max {maxWords} ai words</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatAQ = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatAQ) {
                            const allAQ: { role: string; content?: string }[] = JSON.parse(chatAQ);
                            const userMsgsAQ = allAQ.filter(m => m.role === 'user' && m.content);
                            if (userMsgsAQ.length >= 2) {
                              const totalWords = userMsgsAQ.reduce((sum, m) => sum + m.content!.split(/\s+/).filter(Boolean).length, 0);
                              const avg = Math.round(totalWords / userMsgsAQ.length);
                              if (avg >= 2) return <span className="text-[8px] text-indigo-400/40 tabular-nums" title={`Average question length: ${avg} words`}>avg {avg} w/q</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatUW = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatUW) {
                            const uMsgsUW: { role: string; content: string }[] = JSON.parse(chatUW).filter((m: { role: string; content: string }) => m.role === 'user' && m.content);
                            if (uMsgsUW.length >= 2) {
                              const stops = new Set(['the','a','an','is','are','was','were','be','been','do','does','did','have','has','had','will','would','could','should','can','may','might','shall','it','its','this','that','these','those','i','me','my','we','our','you','your','he','she','they','them','their','in','on','at','to','for','of','with','and','or','but','not','no','if','so','what','how','why','when','where','who','which']);
                              const allWords = uMsgsUW.flatMap(m => m.content.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stops.has(w)));
                              const uniqueW = new Set(allWords).size;
                              if (uniqueW >= 8) return <span className="text-[8px] text-emerald-400/40 tabular-nums" title={`${uniqueW} unique content words across ${uMsgsUW.length} questions`}>{uniqueW} unique words</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatTD = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatTD) {
                            const allTD: { role: string; content?: string }[] = JSON.parse(chatTD);
                            const userWords = allTD.filter(m => m.role === 'user' && m.content).flatMap(m => m.content!.toLowerCase().split(/\s+/).filter(w => w.length >= 5));
                            const uniqueTopics = new Set(userWords).size;
                            if (uniqueTopics >= 3) return <span className="text-[8px] text-lime-400/40 tabular-nums" title={`${uniqueTopics} unique topic words across questions`}>{uniqueTopics} topics</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatAWQ = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatAWQ) {
                            const allAWQ: { role: string; content?: string }[] = JSON.parse(chatAWQ);
                            const userMsgsAWQ = allAWQ.filter(m => m.role === 'user' && m.content);
                            if (userMsgsAWQ.length >= 2) {
                              const totalWords = userMsgsAWQ.reduce((sum, m) => sum + m.content!.split(/\s+/).filter(Boolean).length, 0);
                              const avg = (totalWords / userMsgsAWQ.length).toFixed(1);
                              return <span className="text-[8px] text-violet-400/40 tabular-nums" title={`${totalWords} total words across ${userMsgsAWQ.length} questions = ${avg} avg`}>avg {avg}w/q</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatUW = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatUW) {
                            const allUW: { role: string; content?: string }[] = JSON.parse(chatUW);
                            const userMsgsUW = allUW.filter(m => m.role === 'user' && m.content);
                            if (userMsgsUW.length >= 1) {
                              const totalWords = userMsgsUW.reduce((sum, m) => sum + m.content!.split(/\s+/).filter(Boolean).length, 0);
                              if (totalWords >= 5) return <span className="text-[8px] text-rose-400/40 tabular-nums" title={`Total user words: ${totalWords}`}>{totalWords} user words</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatLQ = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatLQ) {
                            const allLQ: { role: string; content?: string }[] = JSON.parse(chatLQ);
                            const userMsgsLQ = allLQ.filter(m => m.role === 'user' && m.content);
                            if (userMsgsLQ.length >= 2) {
                              const lastQ = userMsgsLQ[userMsgsLQ.length - 1];
                              const preview = lastQ.content!.length > 20 ? lastQ.content!.slice(0, 20) + '…' : lastQ.content!;
                              return <span className="text-[8px] text-zinc-400/40 truncate max-w-[120px]" title={`Last question: ${lastQ.content}`}>last: &ldquo;{preview}&rdquo;</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatFQ = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatFQ) {
                            const allFQ: { role: string; content?: string }[] = JSON.parse(chatFQ);
                            const firstQ = allFQ.find(m => m.role === 'user' && m.content);
                            if (firstQ && firstQ.content) {
                              const preview = firstQ.content.length > 20 ? firstQ.content.slice(0, 20) + '…' : firstQ.content;
                              return <span className="text-[8px] text-fuchsia-400/40 truncate max-w-[120px]" title={`First question: ${firstQ.content}`}>&ldquo;{preview}&rdquo;</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatSQ = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatSQ) {
                            const allSQ: { role: string; content?: string }[] = JSON.parse(chatSQ);
                            const userMsgsSQ = allSQ.filter(m => m.role === 'user' && m.content);
                            if (userMsgsSQ.length >= 2) {
                              const minWords = Math.min(...userMsgsSQ.map(m => m.content!.split(/\s+/).filter(Boolean).length));
                              return <span className="text-[8px] text-slate-400/40 tabular-nums" title={`Shortest question: ${minWords} words`}>{minWords} min q-words</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatMQ = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatMQ) {
                            const allMQ: { role: string; content?: string }[] = JSON.parse(chatMQ);
                            const userMsgsMQ = allMQ.filter(m => m.role === 'user' && m.content);
                            if (userMsgsMQ.length >= 1) {
                              const maxWords = Math.max(...userMsgsMQ.map(m => m.content!.split(/\s+/).filter(Boolean).length));
                              if (maxWords >= 5) return <span className="text-[8px] text-orange-400/40 tabular-nums" title={`Longest question: ${maxWords} words`}>{maxWords} max q-words</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatQA = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatQA) {
                            const allQA: { role: string; content?: string }[] = JSON.parse(chatQA);
                            const userCount = allQA.filter(m => m.role === 'user').length;
                            const aiCount = allQA.filter(m => m.role === 'assistant').length;
                            if (userCount >= 1 && aiCount >= 1) return <span className="text-[8px] text-indigo-400/40 tabular-nums" title={`${userCount} questions, ${aiCount} answers`}>{userCount}:{aiCount} Q/A</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatAW = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatAW) {
                            const allAW: { role: string; content?: string }[] = JSON.parse(chatAW);
                            const aiMsgsAW = allAW.filter(m => m.role === 'assistant' && m.content);
                            if (aiMsgsAW.length >= 2) {
                              const avgWords = Math.round(aiMsgsAW.reduce((sum, m) => sum + m.content!.split(/\s+/).filter(Boolean).length, 0) / aiMsgsAW.length);
                              return <span className="text-[8px] text-lime-400/40 tabular-nums" title={`Average AI response: ${avgWords} words`}>{avgWords} avg words</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatCC = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatCC) {
                            const allCC: { role: string; content?: string }[] = JSON.parse(chatCC);
                            const citeCount = allCC.filter(m => m.role === 'assistant' && m.content).reduce((sum, m) => sum + (m.content!.match(/\[\d+:\d{2}\]/g) || []).length, 0);
                            if (citeCount >= 1) return <span className="text-[8px] text-sky-400/40 tabular-nums" title={`${citeCount} timestamp citations in AI responses`}>{citeCount} cites</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatQR = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatQR) {
                            const allQR: { role: string; content?: string }[] = JSON.parse(chatQR);
                            const userQR = allQR.filter(m => m.role === 'user' && m.content).map(m => new Set(m.content!.toLowerCase().split(/\s+/).filter(w => w.length >= 3)));
                            let repeats = 0;
                            for (let ri = 0; ri < userQR.length; ri++) {
                              for (let rj = ri + 1; rj < userQR.length; rj++) {
                                const shared = [...userQR[ri]].filter(w => userQR[rj].has(w)).length;
                                if (shared >= 3) repeats++;
                              }
                            }
                            if (repeats >= 1) return <span className="text-[8px] text-amber-400/40 tabular-nums" title={`${repeats} question pairs share 3+ words`}>{repeats} repeats</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatRV = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatRV) {
                            const allRV: { role: string; content?: string }[] = JSON.parse(chatRV);
                            const aiWords = allRV.filter(m => m.role === 'assistant' && m.content).flatMap(m => m.content!.toLowerCase().split(/\s+/).filter(w => w.length >= 3));
                            const uniqueVocab = new Set(aiWords).size;
                            if (uniqueVocab >= 20) return <span className="text-[8px] text-teal-400/40 tabular-nums" title={`${uniqueVocab} unique words in AI responses`}>{uniqueVocab} vocab</span>;
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatQC = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatQC) {
                            const allQC: { role: string; content?: string }[] = JSON.parse(chatQC);
                            const userMsgsQC = allQC.filter(m => m.role === 'user' && m.content);
                            if (userMsgsQC.length >= 2) {
                              const complexities = userMsgsQC.map(m => {
                                const words = m.content!.toLowerCase().split(/\s+/).filter(Boolean);
                                const unique = new Set(words).size;
                                return words.length * (unique / Math.max(words.length, 1));
                              });
                              const avg = (complexities.reduce((a, b) => a + b, 0) / complexities.length).toFixed(1);
                              return <span className="text-[8px] text-fuchsia-400/40 tabular-nums" title={`Average question complexity score: ${avg}`}>{avg} complexity</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatLS = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatLS) {
                            const allLS: { role: string; timestamp?: number }[] = JSON.parse(chatLS);
                            const userTS = allLS.filter(m => m.role === 'user' && m.timestamp).map(m => m.timestamp!).sort((a, b) => a - b);
                            if (userTS.length >= 2) {
                              let maxGap = 0;
                              for (let gi = 1; gi < userTS.length; gi++) maxGap = Math.max(maxGap, userTS[gi] - userTS[gi - 1]);
                              const gapMin = Math.round(maxGap / (1000 * 60));
                              if (gapMin >= 5) return <span className="text-[8px] text-rose-400/40 tabular-nums" title={`Longest gap between questions: ${gapMin} minutes`}>{gapMin}m gap</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatQF = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatQF) {
                            const allQF: { role: string; timestamp?: number }[] = JSON.parse(chatQF);
                            const userMsgsQF = allQF.filter(m => m.role === 'user' && m.timestamp);
                            if (userMsgsQF.length >= 3) {
                              const first = userMsgsQF[0].timestamp!;
                              const last = userMsgsQF[userMsgsQF.length - 1].timestamp!;
                              const mins = (last - first) / (1000 * 60);
                              if (mins >= 1) {
                                const qpm = (userMsgsQF.length / mins).toFixed(1);
                                return <span className="text-[8px] text-teal-400/40 tabular-nums" title={`${userMsgsQF.length} questions over ${Math.round(mins)} min = ${qpm} q/min`}>{qpm}q/min</span>;
                              }
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatAge = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatAge) {
                            const allAge: { role: string; timestamp?: number }[] = JSON.parse(chatAge);
                            const firstTs = allAge.find(m => m.role === 'user' && m.timestamp)?.timestamp;
                            if (firstTs) {
                              const daysAgo = Math.floor((Date.now() - firstTs) / (1000 * 60 * 60 * 24));
                              if (daysAgo >= 1) return <span className="text-[8px] text-sky-400/40 tabular-nums" title={`First question asked ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`}>asked {daysAgo}d ago</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const streakData = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-streak-${video.id}`) : null;
                          if (streakData) {
                            const dates: string[] = JSON.parse(streakData);
                            if (dates.length >= 2) {
                              const sorted = [...new Set(dates)].sort();
                              let maxStreak = 1, cur = 1;
                              for (let si = 1; si < sorted.length; si++) {
                                const prev = new Date(sorted[si - 1]);
                                const next = new Date(sorted[si]);
                                const diff = (next.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
                                if (diff <= 1.5) { cur++; maxStreak = Math.max(maxStreak, cur); } else { cur = 1; }
                              }
                              if (maxStreak >= 2) return <span className="text-[8px] text-pink-400/40 tabular-nums" title={`Longest consecutive viewing streak: ${maxStreak} days`}>{maxStreak} day streak</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatMed = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatMed) {
                            const aiMsgsMed: { role: string; content: string }[] = JSON.parse(chatMed).filter((m: { role: string; content: string }) => m.role === 'assistant' && m.content);
                            if (aiMsgsMed.length >= 3) {
                              const wcs = aiMsgsMed.map(m => m.content.split(/\s+/).filter(Boolean).length).sort((a, b) => a - b);
                              const mid = Math.floor(wcs.length / 2);
                              const median = wcs.length % 2 ? wcs[mid] : Math.round((wcs[mid - 1] + wcs[mid]) / 2);
                              if (median >= 10) return <span className="text-[8px] text-orange-400/40 tabular-nums" title={`Median AI response length: ${median} words across ${aiMsgsMed.length} responses`}>med {median}w</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chatRatio = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chatRatio) {
                            const allRatio: { role: string }[] = JSON.parse(chatRatio);
                            const userCount = allRatio.filter(m => m.role === 'user').length;
                            const aiCount = allRatio.filter(m => m.role === 'assistant').length;
                            if (userCount >= 2 && aiCount >= 2) {
                              const ratio = (aiCount / userCount).toFixed(1);
                              return <span className="text-[8px] text-rose-400/40 tabular-nums" title={`Response ratio: ${aiCount} AI / ${userCount} user = ${ratio}:1`}>{ratio}:1 ratio</span>;
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chat = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chat) {
                            const msgs = JSON.parse(chat);
                            const lastQ = [...msgs].reverse().find((m: { role: string }) => m.role === 'user');
                            if (lastQ) {
                              const preview = lastQ.content.length > 40 ? lastQ.content.slice(0, 40) + '...' : lastQ.content;
                              const lastAI = [...msgs].reverse().find((m: { role: string }) => m.role === 'assistant');
                              const aiPreview = lastAI ? (lastAI.content.length > 50 ? lastAI.content.slice(0, 50).trim() + '...' : lastAI.content) : null;
                              return (
                                <>
                                  <span className="text-[9px] text-slate-600 truncate" title={lastQ.content}>Q: {preview}</span>
                                  {aiPreview && <span className="text-[8px] text-slate-700 truncate block max-w-[200px]" title={lastAI.content}>A: {aiPreview}</span>}
                                </>
                              );
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const chat = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chat) {
                            const userMsgs = JSON.parse(chat).filter((m: { role: string }) => m.role === 'user');
                            if (userMsgs.length >= 2) {
                              const first = userMsgs[0].content;
                              const last = userMsgs[userMsgs.length - 1].content;
                              if (first !== last) {
                                const fp = first.length > 35 ? first.slice(0, 35) + '...' : first;
                                return <span className="text-[8px] text-slate-700/50 truncate" title={`First question: ${first}`}>1st: {fp}</span>;
                              }
                            }
                          }
                        } catch { /* ignore */ }
                        return null;
                      })()}
                      {(() => {
                        try {
                          const note = typeof window !== 'undefined' ? localStorage.getItem(`chalk-note-${video.id}`) : null;
                          if (note) return (
                            <span className="text-[9px] text-yellow-400/70 truncate" title={note}>
                              📝 {note.length > 30 ? note.slice(0, 30) + '...' : note}
                            </span>
                          );
                        } catch { /* ignore */ }
                        return null;
                      })()}
                    </div>
                  </div>
                  {/* Pin button */}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPinnedVideoIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(video.id)) next.delete(video.id); else next.add(video.id);
                        localStorage.setItem('chalk-pinned-videos', JSON.stringify([...next]));
                        return next;
                      });
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setPinnedVideoIds((prev) => { const next = new Set(prev); if (next.has(video.id)) next.delete(video.id); else next.add(video.id); localStorage.setItem('chalk-pinned-videos', JSON.stringify([...next])); return next; }); } }}
                    className={`absolute top-1.5 right-6 p-0.5 rounded transition-all ${pinnedVideoIds.has(video.id) ? 'text-amber-400 opacity-100' : 'opacity-0 group-hover/card:opacity-100 text-slate-600 hover:text-amber-400 hover:bg-amber-500/10'}`}
                    title={pinnedVideoIds.has(video.id) ? 'Unpin from top' : 'Pin to top'}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                      <path d="M10.97 2.22a.75.75 0 0 1 1.06 0l1.75 1.75a.75.75 0 0 1-.177 1.206l-2.12 1.06-.818 2.455a.75.75 0 0 1-1.262.308L7.97 7.57 5.03 10.51a.75.75 0 1 1-1.06-1.06L6.91 6.51 5.48 5.08a.75.75 0 0 1 .308-1.262l2.455-.818 1.06-2.12a.75.75 0 0 1 .667-.36Z" />
                    </svg>
                  </span>
                  {/* Move up/down buttons */}
                  <span className="absolute bottom-1 right-6 flex items-center gap-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity">
                    {vidIdx > 0 && (
                      <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setRecentVideos((prev) => { const arr = [...prev]; const idx = arr.findIndex((v) => v.id === video.id); if (idx > 0) { [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]; } localStorage.setItem(RECENT_VIDEOS_KEY, JSON.stringify(arr)); return arr; }); }} className="p-0.5 rounded text-slate-700 hover:text-slate-400 hover:bg-white/[0.06] transition-colors" title="Move up">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2 h-2"><path fillRule="evenodd" d="M8 14a.75.75 0 0 1-.75-.75V4.56L4.03 7.78a.75.75 0 0 1-1.06-1.06l4.5-4.5a.75.75 0 0 1 1.06 0l4.5 4.5a.75.75 0 0 1-1.06 1.06L8.75 4.56v8.69A.75.75 0 0 1 8 14Z" clipRule="evenodd" /></svg>
                      </span>
                    )}
                    <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setRecentVideos((prev) => { const arr = [...prev]; const idx = arr.findIndex((v) => v.id === video.id); if (idx < arr.length - 1) { [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]; } localStorage.setItem(RECENT_VIDEOS_KEY, JSON.stringify(arr)); return arr; }); }} className="p-0.5 rounded text-slate-700 hover:text-slate-400 hover:bg-white/[0.06] transition-colors" title="Move down">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2 h-2"><path fillRule="evenodd" d="M8 2a.75.75 0 0 1 .75.75v8.69l3.22-3.22a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.22 3.22V2.75A.75.75 0 0 1 8 2Z" clipRule="evenodd" /></svg>
                    </span>
                  </span>
                  {/* Delete button */}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      const updated = recentVideos.filter((v) => v.id !== video.id);
                      setRecentVideos(updated);
                      localStorage.setItem(RECENT_VIDEOS_KEY, JSON.stringify(updated));
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); const updated = recentVideos.filter((v) => v.id !== video.id); setRecentVideos(updated); localStorage.setItem(RECENT_VIDEOS_KEY, JSON.stringify(updated)); } }}
                    className="absolute top-1.5 right-1.5 opacity-0 group-hover/card:opacity-100 p-0.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    title="Remove from history"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                      <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                    </svg>
                  </span>
                </button>
              );
              })}
            </div>
          </div>
        )}
        {recentVideos.length === 0 && (
          <div className="mt-12 text-center">
            <p className="text-sm text-slate-600">Paste a YouTube URL above to start learning</p>
            <p className="text-[10px] text-slate-700 mt-1">Your recent videos will appear here</p>
          </div>
        )}
        {recentVideos.length > 1 && (
          <p className="text-[9px] text-slate-700 text-center mt-2">&uarr;&darr; to navigate &middot; Enter to open</p>
        )}
      </div>

      {/* Recent activity timeline */}
      {recentVideos.length > 0 && (() => {
        const events: { label: string; time: number; icon: string }[] = [];
        recentVideos.slice(0, 5).forEach((v) => {
          events.push({ label: `Watched "${(v.title || v.id).slice(0, 30)}"`, time: v.timestamp, icon: 'play' });
          try {
            const chat = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${v.id}`) : null;
            if (chat) {
              const count = JSON.parse(chat).length;
              if (count > 0) events.push({ label: `${count} questions on "${(v.title || v.id).slice(0, 20)}"`, time: v.timestamp + 1, icon: 'chat' });
            }
          } catch { /* ignore */ }
        });
        events.sort((a, b) => b.time - a.time);
        const recent = events.slice(0, 4);
        if (recent.length < 2) return null;
        return (
          <div className="w-full max-w-xl mx-auto mt-6 relative z-10">
            <h4 className="text-[9px] text-slate-600 uppercase tracking-wider text-center mb-2">Recent Activity</h4>
            <div className="space-y-0 pl-4 border-l border-chalk-border/15">
              {recent.map((ev, i) => {
                const ago = Date.now() - ev.time;
                const mins = Math.floor(ago / 60000);
                const hrs = Math.floor(ago / 3600000);
                const days = Math.floor(ago / 86400000);
                const agoLabel = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : hrs < 24 ? `${hrs}h ago` : `${days}d ago`;
                return (
                  <div key={i} className="flex items-center gap-2 py-1 relative">
                    <div className="absolute -left-[17px] w-2 h-2 rounded-full bg-chalk-surface border border-chalk-border/30" />
                    <span className="text-[10px] text-slate-500 truncate flex-1">{ev.label}</span>
                    <span className="text-[9px] text-slate-700 tabular-nums shrink-0">{agoLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Footer links */}
      {(streak.totalDays > 0 || sessionSeconds > 0) && (
        <div className="flex items-center justify-center gap-3 py-2 text-[10px] text-slate-700">
          {streak.totalDays > 0 && <span>{streak.totalDays} total study day{streak.totalDays !== 1 ? 's' : ''}</span>}
          {streak.longestStreak > 1 && <><span>·</span><span>{streak.longestStreak} day best streak</span></>}
          {sessionSeconds >= 5 && (
            <>
              {streak.totalDays > 0 && <span>·</span>}
              <span className="tabular-nums">
                Session: {sessionSeconds < 60 ? `${sessionSeconds}s` : sessionSeconds < 3600 ? `${Math.floor(sessionSeconds / 60)}m ${sessionSeconds % 60}s` : `${Math.floor(sessionSeconds / 3600)}h ${Math.floor((sessionSeconds % 3600) / 60)}m`}
              </span>
            </>
          )}
          {lastSessionAgo && lastSessionAgo !== 'just now' && (
            <><span>·</span><span>Last visit: {lastSessionAgo}</span></>
          )}
          {totalWordsLearned > 0 && (
            <><span>·</span><span>{totalWordsLearned.toLocaleString()} words learned</span></>
          )}
          {recentVideos.length > 0 && (() => {
            let totalSec = 0;
            recentVideos.forEach((v) => {
              try {
                const dur = parseFloat(localStorage.getItem(`chalk-duration-${v.id}`) || '0');
                const pct = parseFloat(localStorage.getItem(`chalk-progress-${v.id}`) || '0');
                if (dur > 0 && pct > 0) totalSec += dur * Math.min(pct, 1);
              } catch { /* ignore */ }
            });
            if (totalSec < 60) return null;
            const h = Math.floor(totalSec / 3600);
            const m = Math.round((totalSec % 3600) / 60);
            return <><span>·</span><span>{h > 0 ? `${h}h ${m}m` : `${m}m`} studied</span></>;
          })()}
        </div>
      )}
      <div className="flex-none py-4 flex items-center justify-center gap-4 border-t border-chalk-border/20">
        <a href="/history" className="text-xs text-slate-500 hover:text-slate-400 transition-colors">
          Study History
        </a>
        <span className="text-slate-700">·</span>
        <a href="/collections" className="text-xs text-slate-500 hover:text-slate-400 transition-colors">
          Collections
        </a>
        <span className="text-slate-700">·</span>
        <a href="/flashcards" className="text-xs text-slate-500 hover:text-slate-400 transition-colors">
          Flashcards
        </a>
        <span className="text-slate-700">·</span>
        <a href="/analytics" className="text-xs text-slate-500 hover:text-slate-400 transition-colors">
          Analytics
        </a>
        <span className="text-slate-700">·</span>
        <a href="/compare" className="text-xs text-slate-500 hover:text-slate-400 transition-colors">
          Compare
        </a>
        <span className="text-slate-700">·</span>
        <a href="/math" className="text-xs text-slate-500 hover:text-slate-400 transition-colors">
          Math Visualizer
        </a>
      </div>
      <p className="text-[9px] text-slate-700 text-center pb-2">Chalk {new Date().getFullYear()}</p>
      {showScrollTop && (
        <button
          onClick={() => scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-50 w-8 h-8 rounded-full bg-chalk-surface border border-chalk-border/40 text-slate-400 hover:text-chalk-text hover:bg-chalk-surface/80 transition-all shadow-lg flex items-center justify-center"
          title="Scroll to top"
          aria-label="Scroll to top"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M8 14a.75.75 0 0 1-.75-.75V4.56L4.22 7.59a.75.75 0 0 1-1.06-1.06l4.25-4.25a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1-1.06 1.06L8.75 4.56v8.69A.75.75 0 0 1 8 14Z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  );
}
