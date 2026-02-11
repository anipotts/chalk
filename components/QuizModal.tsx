'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatTimestamp, type TranscriptSegment } from '@/lib/video-utils';

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  timestamp?: number;
}

interface QuizModalProps {
  videoId: string;
  videoTitle?: string;
  segments: TranscriptSegment[];
  onSeek: (seconds: number) => void;
}

type QuizState = 'idle' | 'generating' | 'active' | 'results';

export function QuizButton({ videoId, videoTitle, segments, onSeek }: QuizModalProps) {
  const [state, setState] = useState<QuizState>('idle');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);

  const generate = useCallback(async () => {
    setState('generating');
    try {
      const resp = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments, videoTitle }),
      });
      if (!resp.ok) throw new Error('Failed');
      const { questions: qs } = await resp.json();
      if (qs && Array.isArray(qs) && qs.length > 0) {
        setQuestions(qs);
        setCurrentQ(0);
        setSelected(null);
        setRevealed(false);
        setScore(0);
        setAnswers([]);
        setState('active');
      } else {
        setState('idle');
      }
    } catch {
      setState('idle');
    }
  }, [segments, videoTitle]);

  const handleAnswer = useCallback(() => {
    if (selected === null) return;
    setRevealed(true);
    if (selected === questions[currentQ].correctIndex) {
      setScore((s) => s + 1);
    }
    setAnswers((prev) => [...prev, selected]);
  }, [selected, questions, currentQ]);

  const handleNext = useCallback(() => {
    if (currentQ + 1 >= questions.length) {
      setState('results');
    } else {
      setCurrentQ((q) => q + 1);
      setSelected(null);
      setRevealed(false);
    }
  }, [currentQ, questions.length]);

  const handleRetake = useCallback(() => {
    setCurrentQ(0);
    setSelected(null);
    setRevealed(false);
    setScore(0);
    setAnswers([]);
    setState('active');
  }, []);

  const LABELS = ['A', 'B', 'C', 'D'];

  return (
    <>
      <button
        onClick={() => state === 'idle' ? generate() : setState('active')}
        disabled={state === 'generating' || segments.length === 0}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors text-[10px] disabled:opacity-30"
        aria-label="Quiz mode"
        title="Test yourself with a quiz"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
          <path fillRule="evenodd" d="M4.475 5.458c-.284 0-.514-.237-.47-.517C4.28 3.24 5.576 2 7.825 2c2.25 0 3.768 1.36 3.768 3.208 0 1.64-.936 2.503-2.12 3.286C8.57 9.095 8.104 9.559 8.104 10.25h-1.5c0-1.183.648-1.854 1.565-2.505 1.06-.75 1.624-1.322 1.624-2.54 0-1.38-1.048-2.155-2.468-2.155-1.356 0-2.244.74-2.486 1.918a.473.473 0 0 1-.464.49ZM8.75 14a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" clipRule="evenodd" />
        </svg>
        {state === 'generating' ? '...' : 'Quiz'}
      </button>

      {/* Quiz Modal */}
      <AnimatePresence>
        {(state === 'active' || state === 'results') && (
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
              className="w-full max-w-lg bg-chalk-surface border border-chalk-border/40 rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-chalk-border/30">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-chalk-accent">
                    <path fillRule="evenodd" d="M4.475 5.458c-.284 0-.514-.237-.47-.517C4.28 3.24 5.576 2 7.825 2c2.25 0 3.768 1.36 3.768 3.208 0 1.64-.936 2.503-2.12 3.286C8.57 9.095 8.104 9.559 8.104 10.25h-1.5c0-1.183.648-1.854 1.565-2.505 1.06-.75 1.624-1.322 1.624-2.54 0-1.38-1.048-2.155-2.468-2.155-1.356 0-2.244.74-2.486 1.918a.473.473 0 0 1-.464.49ZM8.75 14a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-medium text-chalk-text">
                    {state === 'results' ? 'Quiz Results' : `Question ${currentQ + 1} of ${questions.length}`}
                  </span>
                </div>
                <button
                  onClick={() => setState('idle')}
                  className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                  aria-label="Close quiz"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                  </svg>
                </button>
              </div>

              {state === 'results' ? (
                /* Results view */
                <div className="p-5 space-y-4">
                  <div className="text-center space-y-2">
                    <div className="text-4xl font-bold text-chalk-text">
                      {score}/{questions.length}
                    </div>
                    <p className="text-sm text-slate-400">
                      {score === questions.length
                        ? 'Perfect score!'
                        : score >= questions.length * 0.7
                          ? 'Great job!'
                          : score >= questions.length * 0.4
                            ? 'Good effort — review the explanations below'
                            : 'Keep studying — you\'ll get there!'}
                    </p>
                    {/* Progress bar */}
                    <div className="w-full h-2 bg-chalk-bg/60 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          score === questions.length ? 'bg-emerald-500' : score >= questions.length * 0.7 ? 'bg-chalk-accent' : 'bg-amber-500'
                        }`}
                        style={{ width: `${(score / questions.length) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Question review */}
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {questions.map((q, i) => {
                      const isCorrect = answers[i] === q.correctIndex;
                      return (
                        <div key={i} className={`px-3 py-2 rounded-lg border ${isCorrect ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                          <div className="flex items-start gap-2">
                            <span className={`text-xs mt-0.5 ${isCorrect ? 'text-emerald-400' : 'text-red-400'}`}>
                              {isCorrect ? '\u2713' : '\u2717'}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-chalk-text leading-relaxed">{q.question}</p>
                              {!isCorrect && (
                                <p className="text-[11px] text-slate-500 mt-1">
                                  Correct: {LABELS[q.correctIndex]}. {q.options[q.correctIndex]}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleRetake}
                      className="flex-1 px-4 py-2 rounded-lg text-xs font-medium bg-chalk-accent/15 text-chalk-accent border border-chalk-accent/30 hover:bg-chalk-accent/25 transition-colors"
                    >
                      Retake Quiz
                    </button>
                    <button
                      onClick={generate}
                      className="flex-1 px-4 py-2 rounded-lg text-xs font-medium bg-white/[0.06] text-slate-400 border border-white/[0.08] hover:bg-white/[0.10] hover:text-slate-300 transition-colors"
                    >
                      New Questions
                    </button>
                  </div>
                </div>
              ) : questions[currentQ] ? (
                /* Question view */
                <div className="p-5 space-y-4">
                  <p className="text-sm text-chalk-text leading-relaxed font-medium">
                    {questions[currentQ].question}
                  </p>

                  <div className="space-y-2">
                    {questions[currentQ].options.map((opt, i) => {
                      const isCorrect = i === questions[currentQ].correctIndex;
                      const isSelected = selected === i;
                      let optClass = 'border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/[0.12]';
                      if (revealed) {
                        if (isCorrect) {
                          optClass = 'border-emerald-500/40 bg-emerald-500/10';
                        } else if (isSelected && !isCorrect) {
                          optClass = 'border-red-500/40 bg-red-500/10';
                        } else {
                          optClass = 'border-white/[0.05] bg-white/[0.02] opacity-50';
                        }
                      } else if (isSelected) {
                        optClass = 'border-chalk-accent/40 bg-chalk-accent/10';
                      }

                      return (
                        <button
                          key={i}
                          onClick={() => !revealed && setSelected(i)}
                          disabled={revealed}
                          className={`w-full text-left px-3.5 py-2.5 rounded-lg border text-xs transition-all flex items-center gap-3 ${optClass}`}
                        >
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                            revealed && isCorrect
                              ? 'bg-emerald-500/30 text-emerald-300'
                              : revealed && isSelected && !isCorrect
                                ? 'bg-red-500/30 text-red-300'
                                : isSelected
                                  ? 'bg-chalk-accent/30 text-chalk-accent'
                                  : 'bg-white/[0.06] text-slate-500'
                          }`}>
                            {LABELS[i]}
                          </span>
                          <span className={`flex-1 leading-relaxed ${
                            revealed && isCorrect ? 'text-emerald-300' : revealed && isSelected && !isCorrect ? 'text-red-300' : 'text-slate-300'
                          }`}>
                            {opt}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Explanation (after reveal) */}
                  {revealed && questions[currentQ].explanation && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="px-3 py-2 rounded-lg bg-chalk-bg/60 border border-chalk-border/30"
                    >
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        {questions[currentQ].explanation}
                      </p>
                      {questions[currentQ].timestamp !== undefined && (
                        <button
                          onClick={() => {
                            onSeek(questions[currentQ].timestamp!);
                            setState('idle');
                          }}
                          className="mt-1 text-[10px] text-chalk-accent hover:underline"
                        >
                          Jump to [{formatTimestamp(questions[currentQ].timestamp!)}]
                        </button>
                      )}
                    </motion.div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    {!revealed ? (
                      <button
                        onClick={handleAnswer}
                        disabled={selected === null}
                        className="flex-1 px-4 py-2 rounded-lg text-xs font-medium bg-chalk-accent text-white hover:bg-blue-500 disabled:opacity-30 disabled:bg-transparent disabled:text-slate-600 disabled:border disabled:border-white/[0.08] transition-all"
                      >
                        Check Answer
                      </button>
                    ) : (
                      <button
                        onClick={handleNext}
                        className="flex-1 px-4 py-2 rounded-lg text-xs font-medium bg-chalk-accent text-white hover:bg-blue-500 transition-all"
                      >
                        {currentQ + 1 >= questions.length ? 'See Results' : 'Next Question'}
                      </button>
                    )}
                  </div>

                  {/* Progress dots */}
                  <div className="flex justify-center gap-1.5">
                    {questions.map((_, i) => (
                      <div
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full transition-colors ${
                          i === currentQ
                            ? 'bg-chalk-accent'
                            : i < currentQ
                              ? answers[i] === questions[i].correctIndex ? 'bg-emerald-500' : 'bg-red-500'
                              : 'bg-white/[0.1]'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
