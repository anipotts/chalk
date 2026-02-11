'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { loadSharedNote } from '@/lib/video-sessions';
import { parseTimestampLinks } from '@/lib/video-utils';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function renderContentWithYouTubeLinks(content: string, videoId: string): React.ReactNode {
  const timestamps = parseTimestampLinks(content);
  if (timestamps.length === 0) return content;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const ts of timestamps) {
    if (ts.index > lastIndex) {
      parts.push(content.slice(lastIndex, ts.index));
    }
    const display = ts.match.slice(1, -1);
    parts.push(
      <a
        key={`ts-${ts.index}`}
        href={`https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(ts.seconds)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-blue-500/20 text-blue-400 font-mono text-xs hover:bg-blue-500/30 hover:text-blue-300 transition-colors"
      >
        {display}
      </a>
    );
    lastIndex = ts.index + ts.match.length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts;
}

export default function StudyNotePage() {
  const params = useParams();
  const noteId = params.id as string;

  const [note, setNote] = useState<{
    video_id: string;
    video_title: string | null;
    messages: ChatMessage[];
    view_count: number;
    created_at: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!noteId) return;
    loadSharedNote(noteId)
      .then((data) => {
        if (data) {
          setNote(data);
        } else {
          setError('Study notes not found');
        }
      })
      .catch(() => setError('Failed to load study notes'))
      .finally(() => setLoading(false));
  }, [noteId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-chalk-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-chalk-accent/40 border-t-chalk-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="min-h-screen bg-chalk-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 mb-4">{error || 'Not found'}</p>
          <a href="/" className="text-chalk-accent hover:underline text-sm">Go home</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-chalk-bg">
      {/* Header */}
      <div className="border-b border-chalk-border/30 bg-chalk-bg/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <a href="/" className="text-lg font-semibold text-chalk-text hover:text-chalk-accent transition-colors">
            Chalk
          </a>
          <span className="text-slate-600">|</span>
          <span className="text-xs text-slate-400">Shared Study Notes</span>
          <div className="ml-auto">
            <a
              href={`/watch?v=${note.video_id}`}
              className="px-3 py-1.5 rounded-lg text-xs bg-chalk-accent text-white hover:bg-blue-600 transition-colors"
            >
              Watch & Chat
            </a>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Video info */}
        <div className="flex items-start gap-4 mb-8">
          <img
            src={`https://i.ytimg.com/vi/${note.video_id}/mqdefault.jpg`}
            alt=""
            className="w-32 h-18 object-cover rounded-lg bg-chalk-surface shrink-0"
          />
          <div>
            <h1 className="text-lg font-semibold text-chalk-text mb-1">
              {note.video_title || 'Video Study Notes'}
            </h1>
            <p className="text-xs text-slate-500">
              Shared on {formatDate(note.created_at)} · {note.view_count} view{note.view_count !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="space-y-4">
          {note.messages.map((msg, i) => (
            <div key={i} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start gap-2.5'}>
              {msg.role === 'assistant' && (
                <div className="w-6 h-6 rounded-full bg-chalk-accent/15 text-chalk-accent flex items-center justify-center shrink-0 mt-0.5">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                    <path d="M8 .75a.75.75 0 0 1 .697.473l1.524 3.84 3.84 1.524a.75.75 0 0 1 0 1.396l-3.84 1.524-1.524 3.84a.75.75 0 0 1-1.394 0L5.78 9.507l-3.84-1.524a.75.75 0 0 1 0-1.396l3.84-1.524L7.303 1.223A.75.75 0 0 1 8 .75Z" />
                  </svg>
                </div>
              )}
              <div className={
                msg.role === 'user'
                  ? 'max-w-[80%] px-3.5 py-2 rounded-2xl rounded-br-sm bg-chalk-accent/90 text-white text-sm leading-relaxed'
                  : 'max-w-[80%] text-[15px] text-slate-300 leading-relaxed whitespace-pre-wrap'
              }>
                {msg.role === 'assistant'
                  ? renderContentWithYouTubeLinks(msg.content, note.video_id)
                  : msg.content
                }
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
