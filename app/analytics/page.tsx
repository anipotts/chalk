'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Pulse, FilmStrip, ChatsTeardrop, ShareNetwork, BookmarkSimple } from '@phosphor-icons/react';

interface AnalyticsData {
  totalEvents: number;
  totalVideos: number;
  totalChats: number;
  totalShares: number;
  totalBookmarks: number;
  topVideos: Array<{ video_id: string; video_title: string | null; count: number }>;
  activityByDay: Array<{ date: string; count: number }>;
  recentActivity: Array<{ event_type: string; video_title: string | null; created_at: string }>;
}

async function fetchAnalytics(): Promise<AnalyticsData> {
  const empty: AnalyticsData = {
    totalEvents: 0, totalVideos: 0, totalChats: 0, totalShares: 0, totalBookmarks: 0,
    topVideos: [], activityByDay: [], recentActivity: [],
  };

  try {
    if (!supabase) return empty;

    // Fetch all events
    const { data: events, error } = await supabase
      .from('video_analytics')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error || !events) return empty;

    const totalEvents = events.length;
    const uniqueVideos = new Set(events.map((e) => e.video_id));
    const totalVideos = uniqueVideos.size;
    const totalChats = events.filter((e) => e.event_type === 'chat').length;
    const totalShares = events.filter((e) => e.event_type === 'share').length;
    const totalBookmarks = events.filter((e) => e.event_type === 'bookmark').length;

    // Top videos by event count
    const videoCountMap = new Map<string, { title: string | null; count: number }>();
    for (const e of events) {
      const existing = videoCountMap.get(e.video_id);
      if (existing) {
        existing.count++;
        if (!existing.title && e.video_title) existing.title = e.video_title;
      } else {
        videoCountMap.set(e.video_id, { title: e.video_title, count: 1 });
      }
    }
    const topVideos = [...videoCountMap.entries()]
      .map(([video_id, { title, count }]) => ({ video_id, video_title: title, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Activity by day (last 30 days)
    const dayMap = new Map<string, number>();
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dayMap.set(d.toISOString().split('T')[0], 0);
    }
    for (const e of events) {
      const day = new Date(e.created_at).toISOString().split('T')[0];
      if (dayMap.has(day)) {
        dayMap.set(day, (dayMap.get(day) || 0) + 1);
      }
    }
    const activityByDay = [...dayMap.entries()].map(([date, count]) => ({ date, count }));

    // Recent activity
    const recentActivity = events.slice(0, 20).map((e) => ({
      event_type: e.event_type,
      video_title: e.video_title,
      created_at: e.created_at,
    }));

    return { totalEvents, totalVideos, totalChats, totalShares, totalBookmarks, topVideos, activityByDay, recentActivity };
  } catch {
    return empty;
  }
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="p-4 rounded-xl bg-chalk-surface/20 border border-chalk-border/20">
      <div className="flex items-center gap-2 mb-2 text-slate-500">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold text-chalk-text tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}

function ActivityHeatmap({ data }: { data: Array<{ date: string; count: number }> }) {
  const maxCount = Math.max(1, ...data.map((d) => d.count));

  return (
    <div className="rounded-xl bg-chalk-surface/20 border border-chalk-border/20 p-4">
      <h3 className="text-xs font-medium text-chalk-text mb-3">Study Activity (30 days)</h3>
      <div className="flex gap-[3px] flex-wrap">
        {data.map((d) => {
          const intensity = d.count / maxCount;
          let bg = 'bg-chalk-border/20';
          if (d.count > 0) {
            if (intensity > 0.75) bg = 'bg-chalk-accent';
            else if (intensity > 0.5) bg = 'bg-chalk-accent/70';
            else if (intensity > 0.25) bg = 'bg-chalk-accent/40';
            else bg = 'bg-chalk-accent/20';
          }
          const dayName = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          return (
            <div
              key={d.date}
              className={`w-4 h-4 rounded-sm ${bg} transition-colors`}
              title={`${dayName}: ${d.count} event${d.count !== 1 ? 's' : ''}`}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <span className="text-[10px] text-slate-500">Less</span>
        <div className="flex gap-[2px]">
          {['bg-chalk-border/20', 'bg-chalk-accent/20', 'bg-chalk-accent/40', 'bg-chalk-accent/70', 'bg-chalk-accent'].map((bg) => (
            <div key={bg} className={`w-3 h-3 rounded-sm ${bg}`} />
          ))}
        </div>
        <span className="text-[10px] text-slate-500">More</span>
      </div>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  watch: { label: 'Watched', color: 'text-blue-400' },
  chat: { label: 'Chatted', color: 'text-emerald-400' },
  share: { label: 'Shared', color: 'text-purple-400' },
  bookmark: { label: 'Bookmarked', color: 'text-yellow-400' },
};

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics().then((d) => {
      setData(d);
      setLoading(false);
    });
  }, []);

  return (
    <div className="min-h-screen bg-chalk-bg">
      {/* Header */}
      <div className="border-b border-chalk-border/30 bg-chalk-bg/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <a href="/" className="text-lg font-semibold text-chalk-text hover:text-chalk-accent transition-colors">
            chalk
          </a>
          <span className="text-slate-600">|</span>
          <span className="text-sm text-slate-400">Study Analytics</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-chalk-accent/40 border-t-chalk-accent rounded-full animate-spin" />
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard
                label="Events"
                value={data.totalEvents}
                icon={<Pulse size={14} weight="bold" />}
              />
              <StatCard
                label="Videos"
                value={data.totalVideos}
                icon={<FilmStrip size={14} weight="duotone" />}
              />
              <StatCard
                label="Chats"
                value={data.totalChats}
                icon={<ChatsTeardrop size={14} weight="fill" />}
              />
              <StatCard
                label="Shares"
                value={data.totalShares}
                icon={<ShareNetwork size={14} weight="duotone" />}
              />
              <StatCard
                label="Bookmarks"
                value={data.totalBookmarks}
                icon={<BookmarkSimple size={14} weight="fill" />}
              />
            </div>

            {/* Activity heatmap */}
            <ActivityHeatmap data={data.activityByDay} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top videos */}
              <div className="rounded-xl bg-chalk-surface/20 border border-chalk-border/20 overflow-hidden">
                <div className="px-4 py-3 border-b border-chalk-border/20">
                  <h3 className="text-xs font-medium text-chalk-text">Most Studied Videos</h3>
                </div>
                {data.topVideos.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className="text-[11px] text-slate-500">No data yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-chalk-border/10">
                    {data.topVideos.map((v, i) => (
                      <a
                        key={v.video_id}
                        href={`/watch?v=${v.video_id}`}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-chalk-surface/30 transition-colors"
                      >
                        <span className="text-[10px] text-slate-500 w-4 text-center font-mono">{i + 1}</span>
                        <img
                          src={`https://i.ytimg.com/vi/${v.video_id}/default.jpg`}
                          alt=""
                          className="w-10 h-7 object-cover rounded shrink-0"
                        />
                        <span className="text-xs text-slate-400 truncate flex-1">
                          {v.video_title || v.video_id}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono shrink-0">
                          {v.count} events
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent activity */}
              <div className="rounded-xl bg-chalk-surface/20 border border-chalk-border/20 overflow-hidden">
                <div className="px-4 py-3 border-b border-chalk-border/20">
                  <h3 className="text-xs font-medium text-chalk-text">Recent Activity</h3>
                </div>
                {data.recentActivity.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className="text-[11px] text-slate-500">No activity yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-chalk-border/10 max-h-80 overflow-y-auto">
                    {data.recentActivity.map((a, i) => {
                      const info = EVENT_LABELS[a.event_type] || { label: a.event_type, color: 'text-slate-400' };
                      return (
                        <div key={i} className="flex items-center gap-3 px-4 py-2">
                          <span className={`text-[10px] font-medium ${info.color} w-16 shrink-0`}>
                            {info.label}
                          </span>
                          <span className="text-[11px] text-slate-400 truncate flex-1">
                            {a.video_title || 'Untitled'}
                          </span>
                          <span className="text-[10px] text-slate-500 shrink-0">
                            {formatRelativeTime(a.created_at)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
