'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getDueFlashcards,
  listFlashcards,
  reviewFlashcard,
  deleteFlashcard,
  type StudyFlashcard,
} from '@/lib/video-sessions';

type ViewMode = 'review' | 'all';

export default function FlashcardsPage() {
  const [mode, setMode] = useState<ViewMode>('review');
  const [dueCards, setDueCards] = useState<StudyFlashcard[]>([]);
  const [allCards, setAllCards] = useState<StudyFlashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [due, all] = await Promise.all([getDueFlashcards(50), listFlashcards()]);
    setDueCards(due);
    setAllCards(all);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const currentCard = mode === 'review' ? dueCards[currentIndex] : null;

  const handleReview = async (quality: 'again' | 'hard' | 'easy') => {
    if (!currentCard || reviewing) return;
    setReviewing(true);
    await reviewFlashcard(currentCard.id, quality);
    setFlipped(false);
    setReviewing(false);

    if (currentIndex < dueCards.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // All done — refresh
      await refresh();
      setCurrentIndex(0);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteFlashcard(id);
    refresh();
  };

  // Keyboard shortcuts for review mode
  useEffect(() => {
    if (mode !== 'review' || !currentCard) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!flipped) setFlipped(true);
      }
      if (flipped) {
        if (e.key === '1') handleReview('again');
        else if (e.key === '2') handleReview('hard');
        else if (e.key === '3') handleReview('easy');
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [mode, currentCard, flipped]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-chalk-bg">
      {/* Header */}
      <div className="border-b border-chalk-border/30 bg-chalk-bg/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <a href="/" className="text-lg font-semibold text-chalk-text hover:text-chalk-accent transition-colors">
            Chalk
          </a>
          <span className="text-slate-600">|</span>
          <span className="text-sm text-slate-400">Flashcards</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => { setMode('review'); setCurrentIndex(0); setFlipped(false); }}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                mode === 'review'
                  ? 'bg-chalk-accent/15 text-chalk-accent border border-chalk-accent/30'
                  : 'text-slate-400 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30'
              }`}
            >
              Review ({dueCards.length} due)
            </button>
            <button
              onClick={() => setMode('all')}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                mode === 'all'
                  ? 'bg-chalk-accent/15 text-chalk-accent border border-chalk-accent/30'
                  : 'text-slate-400 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30'
              }`}
            >
              All Cards ({allCards.length})
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-chalk-accent/40 border-t-chalk-accent rounded-full animate-spin" />
          </div>
        )}

        {/* Review mode */}
        {!loading && mode === 'review' && (
          <>
            {dueCards.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-emerald-400">
                    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
                  </svg>
                </div>
                <p className="text-slate-400 mb-1">All caught up!</p>
                <p className="text-xs text-slate-500 mb-4">
                  {allCards.length > 0
                    ? 'No cards due for review. Come back later!'
                    : 'Generate flashcards from your video chat conversations.'}
                </p>
                {allCards.length === 0 && (
                  <a href="/" className="text-chalk-accent text-sm hover:underline">Go watch a video</a>
                )}
              </div>
            ) : currentCard && (
              <div className="flex flex-col items-center">
                {/* Progress */}
                <div className="w-full max-w-md mb-4 flex items-center justify-between text-[10px] text-slate-500">
                  <span>Card {currentIndex + 1} of {dueCards.length}</span>
                  {currentCard.video_title && (
                    <span className="truncate max-w-[200px]">{currentCard.video_title}</span>
                  )}
                </div>

                {/* Card */}
                <div
                  className="w-full max-w-md cursor-pointer perspective-1000"
                  onClick={() => !flipped && setFlipped(true)}
                >
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={flipped ? 'back' : 'front'}
                      initial={{ rotateY: 90, opacity: 0 }}
                      animate={{ rotateY: 0, opacity: 1 }}
                      exit={{ rotateY: -90, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className={`min-h-[240px] p-8 rounded-2xl border flex flex-col items-center justify-center text-center ${
                        flipped
                          ? 'bg-chalk-surface/50 border-chalk-border/40'
                          : 'bg-gradient-to-br from-chalk-surface/60 to-chalk-surface/30 border-chalk-accent/20'
                      }`}
                    >
                      {!flipped ? (
                        <>
                          <span className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">Question</span>
                          <p className="text-lg text-chalk-text leading-relaxed">{currentCard.front}</p>
                          <span className="text-[10px] text-slate-600 mt-6">Click or press Space to reveal</span>
                        </>
                      ) : (
                        <>
                          <span className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">Answer</span>
                          <p className="text-sm text-slate-300 leading-relaxed">{currentCard.back}</p>
                          {currentCard.timestamp_seconds != null && (
                            <span className="text-[10px] text-chalk-accent mt-3">
                              [{Math.floor(currentCard.timestamp_seconds / 60)}:{String(Math.floor(currentCard.timestamp_seconds % 60)).padStart(2, '0')}]
                            </span>
                          )}
                        </>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Review buttons */}
                {flipped && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 mt-6"
                  >
                    <button
                      onClick={() => handleReview('again')}
                      disabled={reviewing}
                      className="flex flex-col items-center gap-1 px-5 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                      <span className="text-sm font-medium">Again</span>
                      <kbd className="text-[10px] text-red-400/60 font-mono">1</kbd>
                    </button>
                    <button
                      onClick={() => handleReview('hard')}
                      disabled={reviewing}
                      className="flex flex-col items-center gap-1 px-5 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
                    >
                      <span className="text-sm font-medium">Hard</span>
                      <kbd className="text-[10px] text-yellow-400/60 font-mono">2</kbd>
                    </button>
                    <button
                      onClick={() => handleReview('easy')}
                      disabled={reviewing}
                      className="flex flex-col items-center gap-1 px-5 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                    >
                      <span className="text-sm font-medium">Easy</span>
                      <kbd className="text-[10px] text-emerald-400/60 font-mono">3</kbd>
                    </button>
                  </motion.div>
                )}
              </div>
            )}
          </>
        )}

        {/* All cards mode */}
        {!loading && mode === 'all' && (
          <>
            {allCards.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-slate-400 mb-2">No flashcards yet</p>
                <p className="text-xs text-slate-500">Chat with videos, then use &ldquo;Create Flashcards&rdquo; to generate study cards</p>
              </div>
            ) : (
              <div className="space-y-2">
                {allCards.map((card) => (
                  <div
                    key={card.id}
                    className="group p-4 rounded-xl bg-chalk-surface/20 border border-chalk-border/20 hover:bg-chalk-surface/30 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-chalk-text mb-1">{card.front}</p>
                        <p className="text-[11px] text-slate-400">{card.back}</p>
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
                          {card.video_title && <span className="truncate max-w-[200px]">{card.video_title}</span>}
                          <span>
                            {card.repetitions > 0
                              ? `Reviewed ${card.repetitions}x · Next: ${new Date(card.next_review).toLocaleDateString()}`
                              : 'New card'
                            }
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(card.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-500 hover:text-red-400 transition-all shrink-0"
                        title="Delete card"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
