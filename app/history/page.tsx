'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getRecentSessions } from '@/lib/video-sessions';

interface SessionEntry {
  id: string;
  video_id: string;
  video_title: string | null;
  messages: Array<{ role: string; content: string }>;
  updated_at: string;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function HistoryPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRecentSessions(50).then((data) => {
      setSessions(data as SessionEntry[]);
      setLoading(false);
    });
  }, []);

  return (
    <div className="min-h-screen bg-chalk-bg">
      {/* Header */}
      <div className="border-b border-chalk-border/30 bg-chalk-bg/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <a href="/" className="text-lg font-semibold text-chalk-text hover:text-chalk-accent transition-colors">
            Chalk
          </a>
          <span className="text-slate-600">|</span>
          <span className="text-sm text-slate-400">Study History</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-chalk-accent/40 border-t-chalk-accent rounded-full animate-spin" />
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="text-center py-16">
            <p className="text-slate-400 mb-2">No study sessions yet</p>
            <p className="text-xs text-slate-500 mb-4">Start watching a video and chatting to create sessions</p>
            <a href="/" className="text-chalk-accent text-sm hover:underline">Go watch a video</a>
          </div>
        )}

        <div className="space-y-2">
          {sessions.map((session) => {
            const messageCount = session.messages?.length || 0;
            const lastMessage = session.messages?.[session.messages.length - 1];
            const preview = lastMessage
              ? (lastMessage.content || '').slice(0, 100) + (lastMessage.content?.length > 100 ? '...' : '')
              : '';

            return (
              <button
                key={session.id}
                onClick={() => router.push(`/watch?v=${session.video_id}`)}
                className="w-full flex items-start gap-3 px-4 py-3 rounded-xl bg-chalk-surface/20 border border-chalk-border/20 hover:bg-chalk-surface/40 hover:border-chalk-border/40 transition-all text-left"
              >
                <img
                  src={`https://i.ytimg.com/vi/${session.video_id}/default.jpg`}
                  alt=""
                  className="w-16 h-10 object-cover rounded-lg bg-chalk-surface shrink-0 mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-chalk-text truncate">
                      {session.video_title || session.video_id}
                    </span>
                    <span className="text-[10px] text-slate-500 shrink-0">
                      {formatRelativeTime(session.updated_at)}
                    </span>
                  </div>
                  {preview && (
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">{preview}</p>
                  )}
                  <span className="text-[10px] text-slate-600 mt-0.5 inline-block">
                    {messageCount} message{messageCount !== 1 ? 's' : ''}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
