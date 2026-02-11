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
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [dailyGoal] = useState(() => getDailyGoal());
  const previewAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    setRecentVideos(getRecentVideos());
    setStreak(getStreak());
    setActivity(getActivity());
    setTodayMinutes(getTodayMinutes());
  }, []);

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
            Paste a YouTube URL. Pause the video. Ask AI anything about what you&apos;re watching.
          </p>

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

          {/* URL Input */}
          <form onSubmit={handleSubmit} className="w-full max-w-xl mx-auto">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(''); }}
                placeholder="Paste a YouTube URL..."
                className="flex-1 px-5 py-3.5 rounded-full bg-chalk-surface border border-chalk-border/40 text-chalk-text placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-chalk-accent/50 focus:border-transparent transition-all"
                autoFocus
              />
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
            <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3 text-center">
              Recent Videos
            </h3>
            <div className="space-y-1.5">
              {recentVideos.slice(0, 5).map((video) => {
                // Watch progress bar data
                let watchPct = 0;
                try {
                  const prog = typeof window !== 'undefined' ? parseFloat(localStorage.getItem(`chalk-progress-${video.id}`) || '0') : 0;
                  const dur = typeof window !== 'undefined' ? parseFloat(localStorage.getItem(`chalk-duration-${video.id}`) || '0') : 0;
                  if (dur > 0 && prog > 0) watchPct = Math.min(1, prog / dur);
                } catch { /* ignore */ }
                return (
                <button
                  key={video.id}
                  onClick={() => handleRecentClick(video)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-chalk-surface/30 border border-chalk-border/20 hover:bg-chalk-surface/50 hover:border-chalk-border/40 transition-all text-left relative overflow-hidden"
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
                  </div>
                  <div className="min-w-0 flex-1">
                    {video.title ? (
                      <>
                        <span className="text-xs text-chalk-text truncate block">{video.title}</span>
                        <span className="text-[10px] text-slate-500 truncate block">{video.url}</span>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400 truncate block">{video.url}</span>
                    )}
                    {/* Visit count + quick note */}
                    <div className="flex items-center gap-2 mt-0.5">
                      {(() => {
                        try {
                          const visits = typeof window !== 'undefined' ? parseInt(localStorage.getItem(`chalk-visits-${video.id}`) || '0', 10) : 0;
                          if (visits > 1) return (
                            <span className="text-[9px] text-slate-600 tabular-nums">{visits}x watched</span>
                          );
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
                </button>
              );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer links */}
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
