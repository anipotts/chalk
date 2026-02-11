'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { formatTimestamp } from '@/lib/video-utils';
import {
  listBookmarks,
  createBookmark,
  deleteBookmark,
  type VideoBookmark,
} from '@/lib/video-sessions';

interface BookmarkButtonProps {
  videoId: string;
  videoTitle?: string;
  currentTime: number;
  onSeek: (seconds: number) => void;
}

const COLORS = [
  { name: 'blue', bg: 'bg-blue-500/20', text: 'text-blue-400', dot: 'bg-blue-400' },
  { name: 'yellow', bg: 'bg-yellow-500/20', text: 'text-yellow-400', dot: 'bg-yellow-400' },
  { name: 'green', bg: 'bg-emerald-500/20', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  { name: 'red', bg: 'bg-red-500/20', text: 'text-red-400', dot: 'bg-red-400' },
  { name: 'purple', bg: 'bg-purple-500/20', text: 'text-purple-400', dot: 'bg-purple-400' },
];

function getColorClasses(color: string) {
  return COLORS.find((c) => c.name === color) || COLORS[0];
}

export function BookmarkButton({ videoId, videoTitle, currentTime, onSeek }: BookmarkButtonProps) {
  const [open, setOpen] = useState(false);
  const [bookmarks, setBookmarks] = useState<VideoBookmark[]>([]);
  const [note, setNote] = useState('');
  const [selectedColor, setSelectedColor] = useState('blue');
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    listBookmarks(videoId).then(setBookmarks);
  }, [videoId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    await createBookmark(videoId, currentTime, note.trim(), videoTitle, selectedColor);
    setNote('');
    setSaving(false);
    refresh();
  };

  const handleDelete = async (id: string) => {
    await deleteBookmark(id);
    refresh();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`w-7 h-7 rounded-lg text-xs flex items-center justify-center transition-colors ${
          open
            ? 'bg-chalk-accent/15 text-chalk-accent border border-chalk-accent/30'
            : bookmarks.length > 0
              ? 'text-yellow-400 hover:text-yellow-300 bg-yellow-500/10 border border-yellow-500/20'
              : 'text-slate-500 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30'
        }`}
        aria-label="Bookmarks"
        title={`Bookmarks (${bookmarks.length})`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
          <path fillRule="evenodd" d="M11.986 3H12a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h.014A2.25 2.25 0 0 1 6.25 1h3.5a2.25 2.25 0 0 1 2.236 2ZM9.75 2.5h-3.5a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5Z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-72 rounded-xl bg-chalk-surface border border-chalk-border/40 shadow-xl shadow-black/30 overflow-hidden z-50">
          {/* Add bookmark form */}
          <div className="p-3 border-b border-chalk-border/30">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] text-slate-500">Bookmark at</span>
              <span className="text-xs font-mono text-chalk-accent">{formatTimestamp(currentTime)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                ref={inputRef}
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                placeholder="Add a note (optional)..."
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-chalk-bg/60 border border-chalk-border/30 text-xs text-chalk-text placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-chalk-accent/50"
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-2.5 py-1.5 rounded-lg text-xs bg-chalk-accent text-white hover:bg-blue-600 disabled:opacity-30 transition-colors shrink-0"
              >
                Save
              </button>
            </div>
            {/* Color picker */}
            <div className="flex items-center gap-1.5 mt-2">
              {COLORS.map((c) => (
                <button
                  key={c.name}
                  onClick={() => setSelectedColor(c.name)}
                  className={`w-4 h-4 rounded-full ${c.dot} transition-all ${
                    selectedColor === c.name ? 'ring-2 ring-white/30 scale-110' : 'opacity-50 hover:opacity-80'
                  }`}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          {/* Bookmarks list */}
          <div className="max-h-60 overflow-y-auto">
            {bookmarks.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <p className="text-[11px] text-slate-500">No bookmarks yet</p>
                <p className="text-[10px] text-slate-600 mt-0.5">Save moments you want to revisit</p>
              </div>
            ) : (
              bookmarks.map((bm) => {
                const colors = getColorClasses(bm.color);
                return (
                  <div
                    key={bm.id}
                    className="group flex items-start gap-2 px-3 py-2 hover:bg-chalk-bg/40 transition-colors"
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${colors.dot} mt-1.5 shrink-0`} />
                    <button
                      onClick={() => { onSeek(bm.timestamp_seconds); setOpen(false); }}
                      className="flex-1 text-left min-w-0"
                    >
                      <span className={`text-[10px] font-mono ${colors.text}`}>
                        {formatTimestamp(bm.timestamp_seconds)}
                      </span>
                      {bm.note && (
                        <p className="text-[11px] text-slate-400 truncate">{bm.note}</p>
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(bm.id)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-500 hover:text-red-400 transition-all shrink-0"
                      title="Delete bookmark"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                        <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                      </svg>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
