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
  const [lastSessionAgo, setLastSessionAgo] = useState<string | null>(null);
  const [totalWordsLearned, setTotalWordsLearned] = useState(0);
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const [inputShake, setInputShake] = useState(false);
  const [tipIndex, setTipIndex] = useState(new Date().getDay());
  const [selectedVideoIdx, setSelectedVideoIdx] = useState(-1);
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
    router.push(`/watch?v=${videoId}`);
  };

  const handleRecentClick = (video: RecentVideo) => {
    recordStudyDay();
    router.push(`/watch?v=${video.id}`);
  };

  return (
    <div className="min-h-[100dvh] bg-chalk-bg flex flex-col">
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
          <h1 className="text-4xl sm:text-5xl font-bold text-chalk-text mb-3 tracking-tight">
            Chalk
          </h1>
          <p className="text-lg text-slate-400 mb-6 max-w-md mx-auto leading-relaxed">
            {(() => {
              const hour = new Date().getHours();
              const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
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
                <span className="ml-1 text-[9px] text-slate-600 font-normal normal-case">{recentVideos.length}</span>
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
                      <span className="text-[9px] text-slate-700 tabular-nums shrink-0">{agoLabel}</span>
                      <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); const updated = recentVideos.filter((v) => v.id !== video.id); setRecentVideos(updated); localStorage.setItem(RECENT_VIDEOS_KEY, JSON.stringify(updated)); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); const updated = recentVideos.filter((v) => v.id !== video.id); setRecentVideos(updated); localStorage.setItem(RECENT_VIDEOS_KEY, JSON.stringify(updated)); } }} className="opacity-0 group-hover/card:opacity-100 p-0.5 rounded text-slate-600 hover:text-red-400 transition-all" title="Remove"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5"><path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" /></svg></span>
                    </button>
                  );
                }
                return (
                <button
                  key={video.id}
                  onClick={() => handleRecentClick(video)}
                  className={`group/card w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-chalk-surface/30 border hover:bg-chalk-surface/50 hover:border-chalk-border/40 hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-chalk-accent/60 focus-visible:outline-none transition-all duration-200 text-left relative overflow-hidden ${vidIdx === selectedVideoIdx ? 'border-chalk-accent/50 ring-1 ring-chalk-accent/30' : 'border-chalk-border/20'}`}
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
                  <div className="relative shrink-0">
                    <img
                      src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`}
                      alt={video.title || ''}
                      className="w-20 h-11 object-cover rounded-lg bg-chalk-surface"
                    />
                    {watchPct > 0.9 && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-emerald-400">
                          <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                    {watchPct > 0 && watchPct <= 0.9 && (
                      <svg className="absolute -top-1 -left-1 w-4 h-4" viewBox="0 0 20 20">
                        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/10" />
                        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" className="text-chalk-accent" strokeDasharray={`${watchPct * 50.27} 50.27`} strokeLinecap="round" transform="rotate(-90 10 10)" />
                      </svg>
                    )}
                    {(() => {
                      try {
                        const dur = typeof window !== 'undefined' ? parseFloat(localStorage.getItem(`chalk-duration-${video.id}`) || '0') : 0;
                        if (dur <= 0) return null;
                        const mins = Math.floor(dur / 60);
                        const secs = Math.floor(dur % 60);
                        return (
                          <span className="absolute bottom-0.5 right-0.5 px-1 py-0 rounded text-[8px] font-mono font-medium bg-black/70 text-white/80">
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
                        if (!video.timestamp) return null;
                        const ago = Date.now() - video.timestamp;
                        const mins = Math.floor(ago / 60000);
                        const hrs = Math.floor(ago / 3600000);
                        const days = Math.floor(ago / 86400000);
                        const label = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : hrs < 24 ? `${hrs}h ago` : days < 7 ? `${days}d ago` : `${Math.floor(days / 7)}w ago`;
                        return (
                          <span className="text-[9px] text-slate-600 tabular-nums">{label}</span>
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
                        <span className="text-[9px] text-chalk-accent/70 tabular-nums">{Math.round(watchPct * 100)}%</span>
                      )}
                      {(() => {
                        try {
                          const chat = typeof window !== 'undefined' ? localStorage.getItem(`chalk-video-chat-${video.id}`) : null;
                          if (chat) {
                            const msgs = JSON.parse(chat);
                            const lastQ = [...msgs].reverse().find((m: { role: string }) => m.role === 'user');
                            if (lastQ) {
                              const preview = lastQ.content.length > 40 ? lastQ.content.slice(0, 40) + '...' : lastQ.content;
                              return <span className="text-[9px] text-slate-600 truncate" title={lastQ.content}>Q: {preview}</span>;
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
    </div>
  );
}
