'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatTimestamp, type TranscriptSegment } from '@/lib/video-utils';

interface VocabTerm {
  term: string;
  definition: string;
  timestamp?: number;
  category?: string;
}

interface VocabularyButtonProps {
  videoId: string;
  videoTitle?: string;
  segments: TranscriptSegment[];
  onSeek: (seconds: number) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  concept: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  technique: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  tool: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  person: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  acronym: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
};

export function VocabularyButton({ videoId, videoTitle, segments, onSeek }: VocabularyButtonProps) {
  const [state, setState] = useState<'idle' | 'generating' | 'open'>('idle');
  const [terms, setTerms] = useState<VocabTerm[]>([]);
  const [filter, setFilter] = useState('');

  const generate = useCallback(async () => {
    setState('generating');
    try {
      const resp = await fetch('/api/extract-vocabulary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments, videoTitle }),
      });
      if (!resp.ok) throw new Error('Failed');
      const { terms: t } = await resp.json();
      if (t && Array.isArray(t)) {
        setTerms(t);
        setState('open');
      } else {
        setState('idle');
      }
    } catch {
      setState('idle');
    }
  }, [segments, videoTitle]);

  const filtered = filter
    ? terms.filter((t) => t.term.toLowerCase().includes(filter.toLowerCase()) || t.definition.toLowerCase().includes(filter.toLowerCase()))
    : terms;

  return (
    <>
      <button
        onClick={() => {
          if (state === 'idle') generate();
          else if (state === 'open') setState('idle');
          else if (terms.length > 0) setState('open');
        }}
        disabled={state === 'generating' || segments.length === 0}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors text-[10px] disabled:opacity-30"
        aria-label="Key terms"
        title="Extract key vocabulary"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
          <path d="M10.5 1A3.5 3.5 0 0 0 7 4.5V5H2.5A1.5 1.5 0 0 0 1 6.5v7A1.5 1.5 0 0 0 2.5 15h7a1.5 1.5 0 0 0 1.5-1.5V9h.5A3.5 3.5 0 0 0 15 5.5v-1A3.5 3.5 0 0 0 11.5 1h-1ZM11 5V4.5a2 2 0 0 0-2-2h-1a2 2 0 0 0-2 2V5h5ZM4.75 7.5a.75.75 0 0 0 0 1.5h2.5a.75.75 0 0 0 0-1.5h-2.5ZM4 11.25a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1-.75-.75Z" />
        </svg>
        {state === 'generating' ? '...' : 'Terms'}
      </button>

      <AnimatePresence>
        {state === 'open' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setState('idle')}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-chalk-surface border border-chalk-border/40 rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-chalk-border/30 shrink-0">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-chalk-accent">
                    <path d="M10.5 1A3.5 3.5 0 0 0 7 4.5V5H2.5A1.5 1.5 0 0 0 1 6.5v7A1.5 1.5 0 0 0 2.5 15h7a1.5 1.5 0 0 0 1.5-1.5V9h.5A3.5 3.5 0 0 0 15 5.5v-1A3.5 3.5 0 0 0 11.5 1h-1ZM11 5V4.5a2 2 0 0 0-2-2h-1a2 2 0 0 0-2 2V5h5ZM4.75 7.5a.75.75 0 0 0 0 1.5h2.5a.75.75 0 0 0 0-1.5h-2.5ZM4 11.25a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1-.75-.75Z" />
                  </svg>
                  <span className="text-sm font-medium text-chalk-text">Key Terms</span>
                  <span className="text-[10px] text-slate-500">{terms.length} terms</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={generate}
                    className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                    aria-label="Regenerate"
                    title="Regenerate vocabulary"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08.932.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-1.242l.842.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44 1.241l-.84-.84v1.371a.75.75 0 0 1-1.5 0V9.591a.75.75 0 0 1 .75-.75H5.35a.75.75 0 0 1 0 1.5H3.98l.841.841a4.5 4.5 0 0 0 7.08-.932.75.75 0 0 1 1.025-.273Z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setState('idle')}
                    className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                    aria-label="Close"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="px-5 py-2 border-b border-chalk-border/20 shrink-0">
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter terms..."
                  className="w-full px-3 py-1.5 rounded-lg bg-chalk-bg/60 border border-chalk-border/30 text-xs text-chalk-text placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-chalk-accent/50"
                />
              </div>

              {/* Terms list */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {filtered.length === 0 ? (
                  <p className="text-center text-xs text-slate-500 py-4">
                    {filter ? 'No matching terms' : 'No terms extracted'}
                  </p>
                ) : (
                  filtered.map((t, i) => (
                    <motion.div
                      key={t.term}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-chalk-text">{t.term}</span>
                        {t.category && (
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium border ${CATEGORY_COLORS[t.category] || 'bg-white/10 text-slate-400 border-white/10'}`}>
                            {t.category}
                          </span>
                        )}
                        {t.timestamp !== undefined && (
                          <button
                            onClick={() => onSeek(t.timestamp!)}
                            className="text-[10px] text-chalk-accent hover:underline ml-auto shrink-0"
                          >
                            [{formatTimestamp(t.timestamp)}]
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{t.definition}</p>
                    </motion.div>
                  ))
                )}
              </div>

              {/* Export button */}
              <div className="px-5 py-3 border-t border-chalk-border/30 shrink-0">
                <button
                  onClick={() => {
                    const md = terms.map((t) => {
                      let line = `**${t.term}**`;
                      if (t.category) line += ` _(${t.category})_`;
                      if (t.timestamp !== undefined) line += ` [${formatTimestamp(t.timestamp)}]`;
                      line += `\n${t.definition}`;
                      return line;
                    }).join('\n\n');
                    const header = videoTitle ? `# Key Terms: ${videoTitle}\n\n` : '# Key Terms\n\n';
                    const blob = new Blob([header + md], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `vocabulary${videoId ? `-${videoId}` : ''}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="w-full px-4 py-2 rounded-lg text-xs font-medium bg-white/[0.06] text-slate-400 border border-white/[0.08] hover:bg-white/[0.10] hover:text-slate-300 transition-colors"
                >
                  Export as Markdown
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
