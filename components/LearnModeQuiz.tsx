'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { renderRichContent } from './ExchangeMessage';
import type { ParsedQuiz, ParsedExplanation, LearnModePhase, LearnAction } from '@/hooks/useLearnMode';
import type { LearnOption } from '@/hooks/useLearnOptions';
import { CaretDown, ArrowRight, ClipboardText, DownloadSimple, CheckFat, XCircle, SkipForward, ArrowArcRight } from '@phosphor-icons/react';

interface LearnModeQuizProps {
  phase: LearnModePhase;
  quiz: ParsedQuiz | null;
  explanation: ParsedExplanation | null;
  introText: string;
  responseContent: string;
  exportableContent: string | null;
  answers: Map<number, string>;
  score: { correct: number; total: number };
  selectedAction: LearnAction | null;
  thinking: string | null;
  thinkingDuration: number | null;
  isLoading: boolean;
  error: string | null;
  learnOptions: LearnOption[];
  learnOptionsLoading: boolean;
  videoTitle?: string;
  videoId: string;
  onSelectAnswer: (questionIndex: number, optionId: string) => void;
  onSelectAction: (action: LearnAction) => void;
  onFocusInput?: () => void;
  onNextBatch: () => void;
  onStop: () => void;
  onSeek: (seconds: number) => void;
}

/**
 * Parse [M:SS] timestamps in text and return clickable elements.
 */
function renderTimestampText(
  text: string,
  onSeek: (seconds: number) => void,
): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g;
  let lastIdx = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    const seconds = match[3] !== undefined
      ? parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3])
      : parseInt(match[1]) * 60 + parseInt(match[2]);
    const display = match[0].slice(1, -1);
    parts.push(
      <button
        key={match.index}
        onClick={() => onSeek(seconds)}
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-chalk-accent/15 text-chalk-accent text-xs font-mono hover:bg-chalk-accent/25 transition-colors cursor-pointer"
      >
        {display}
      </button>,
    );
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  return parts.length > 0 ? parts : text;
}

function ThinkingPanel({ duration }: { thinking: string; duration: number | null }) {
  if (duration === null) return null;
  return (
    <div className="mb-4">
      <span className="text-[11px] text-slate-500 font-mono">
        thought for {(duration / 1000).toFixed(1)}s
      </span>
    </div>
  );
}

function ActionSelector({
  options,
  isLoading: optionsLoading,
  onSelect,
  onFocusInput,
}: {
  options: LearnOption[];
  isLoading: boolean;
  onSelect: (action: LearnAction) => void;
  onFocusInput?: () => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Show keyboard hint after 1s
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  // Auto-hide hint after 3s
  useEffect(() => {
    if (!showHint) return;
    const timer = setTimeout(() => setShowHint(false), 3000);
    return () => clearTimeout(timer);
  }, [showHint]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % options.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + options.length) % options.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const opt = options[selectedIndex];
        if (opt) {
          if (opt.id === 'custom') {
            onFocusInput?.();
          } else {
            onSelect({ id: opt.id, label: opt.label, intent: opt.intent });
          }
        }
      } else if (e.key === 'Escape') {
        // Let parent handle escape
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [options, selectedIndex, onSelect, onFocusInput]);

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full flex flex-col items-center gap-3"
    >
      <div className="text-center">
        <p className="text-sm text-slate-300 font-medium mb-1">What would you like to do?</p>
        {optionsLoading && (
          <p className="text-[10px] text-slate-600">Generating options...</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5 w-full">
        {options.map((opt, i) => (
          <button
            key={opt.id}
            onClick={() => {
              if (opt.id === 'custom') {
                onFocusInput?.();
              } else {
                onSelect({ id: opt.id, label: opt.label, intent: opt.intent });
              }
            }}
            className={`group w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-left active:scale-[0.98] ${
              i === selectedIndex
                ? 'bg-chalk-accent/10 border-chalk-accent/30 ring-1 ring-chalk-accent/20'
                : 'bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.15]'
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${i === selectedIndex ? 'text-chalk-accent' : 'text-slate-200'}`}>
                {opt.label}
              </p>
              <p className="text-[11px] text-slate-500 truncate">{opt.description}</p>
            </div>
            {i === selectedIndex && (
              <ArrowRight size={14} weight="bold" className="text-chalk-accent flex-shrink-0" />
            )}
          </button>
        ))}
      </div>

      {/* Keyboard hint */}
      <AnimatePresence>
        {showHint && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="text-[10px] text-slate-600 text-center"
          >
            &uarr;&darr; to navigate &middot; Enter to select
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function LoadingState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center gap-4 py-8"
    >
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-chalk-accent"
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </div>
      <p className="text-xs text-slate-500">Opus 4.6 is analyzing the video content...</p>
    </motion.div>
  );
}

function ExportBar({ content, videoTitle }: { content: string; videoTitle?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [content]);

  const handleDownload = useCallback(() => {
    const filename = videoTitle
      ? `${videoTitle.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 50).trim()}.md`
      : 'chalk-notes.md';
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [content, videoTitle]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 pt-2"
    >
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-slate-400 hover:text-slate-200 hover:bg-white/[0.08] transition-colors"
      >
        <ClipboardText size={12} weight="bold" />
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <button
        onClick={handleDownload}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-slate-400 hover:text-slate-200 hover:bg-white/[0.08] transition-colors"
      >
        <DownloadSimple size={12} weight="bold" />
        Download .md
      </button>
    </motion.div>
  );
}

function QuizCard({
  question,
  questionIndex,
  selectedAnswer,
  onSelect,
  onSeek,
}: {
  question: {
    question: string;
    options: { id: string; text: string }[];
    correctId: string;
    explanation: string;
    relatedTimestamp?: string;
  };
  questionIndex: number;
  selectedAnswer: string | undefined;
  onSelect: (optionId: string) => void;
  onSeek: (seconds: number) => void;
}) {
  const answered = selectedAnswer !== undefined;
  const isCorrect = selectedAnswer === question.correctId;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: questionIndex * 0.1 }}
      className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <p className="text-sm text-slate-200 leading-relaxed">
          {renderTimestampText(question.question, onSeek)}
        </p>
      </div>

      <div className="p-2 space-y-1.5">
        {question.options.map((opt) => {
          let optionStyle = 'bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.15] text-slate-300';

          if (answered) {
            if (opt.id === question.correctId) {
              optionStyle = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300';
            } else if (opt.id === selectedAnswer && !isCorrect) {
              optionStyle = 'bg-red-500/10 border-red-500/30 text-red-300';
            } else {
              optionStyle = 'bg-white/[0.02] border-white/[0.05] text-slate-500';
            }
          }

          return (
            <button
              key={opt.id}
              onClick={() => !answered && onSelect(opt.id)}
              disabled={answered}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left ${optionStyle} ${
                !answered ? 'cursor-pointer active:scale-[0.98]' : 'cursor-default'
              }`}
            >
              <span className={`flex-shrink-0 w-6 h-6 rounded-full border flex items-center justify-center text-xs font-medium ${
                answered && opt.id === question.correctId
                  ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                  : answered && opt.id === selectedAnswer && !isCorrect
                    ? 'border-red-500/50 bg-red-500/20 text-red-300'
                    : 'border-white/[0.15] text-slate-500'
              }`}>
                {opt.id.toUpperCase()}
              </span>
              <span className="flex-1 text-sm leading-relaxed">{opt.text}</span>
              {answered && opt.id === question.correctId && (
                <CheckFat size={16} weight="fill" className="text-emerald-400 flex-shrink-0" />
              )}
              {answered && opt.id === selectedAnswer && !isCorrect && (
                <XCircle size={16} weight="fill" className="text-red-400 flex-shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {answered && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.2 }}
            className="border-t border-white/[0.06]"
          >
            <div className={`px-4 py-3 text-xs leading-relaxed ${
              isCorrect ? 'text-emerald-300/80' : 'text-amber-300/80'
            }`}>
              {renderTimestampText(question.explanation, onSeek)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function LearnModeQuiz({
  phase,
  quiz,
  explanation,
  introText,
  responseContent,
  exportableContent,
  answers,
  score,
  selectedAction,
  thinking,
  thinkingDuration,
  isLoading,
  error,
  learnOptions,
  learnOptionsLoading,
  videoTitle,
  videoId,
  onSelectAnswer,
  onSelectAction,
  onFocusInput,
  onNextBatch,
  onStop,
  onSeek,
}: LearnModeQuizProps) {
  // Action selector
  if (phase === 'selecting_action') {
    return (
      <div className="w-full space-y-4">
        <ActionSelector
          options={learnOptions}
          isLoading={learnOptionsLoading}
          onSelect={onSelectAction}
          onFocusInput={onFocusInput}
        />
        <div className="flex justify-center">
          <button
            onClick={onStop}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Loading with thinking
  if (phase === 'loading') {
    return (
      <div className="w-full space-y-2">
        {thinking && <ThinkingPanel thinking={thinking} duration={thinkingDuration} />}
        <LoadingState />
      </div>
    );
  }

  // Quiz active or reviewing
  if (phase === 'quiz_active' || phase === 'reviewing') {
    const allAnswered = quiz
      ? quiz.questions.every((_, i) => answers.has(i))
      : true;

    // Non-quiz response content (markdown rendering)
    const hasMarkdownResponse = !quiz && responseContent && phase === 'reviewing';

    return (
      <div className="w-full space-y-4">
        {/* Score badge */}
        {score.total > 0 && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {selectedAction && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-medium border bg-chalk-accent/10 border-chalk-accent/30 text-chalk-accent">
                  {selectedAction.label}
                </span>
              )}
            </div>
            <span className="text-xs text-slate-500 font-mono">
              {score.correct}/{score.total} correct
            </span>
          </div>
        )}

        {/* Thinking panel */}
        {thinking && <ThinkingPanel thinking={thinking} duration={thinkingDuration} />}

        {/* Intro text */}
        {introText && !hasMarkdownResponse && (
          <p className="text-sm text-slate-300 leading-relaxed">
            {renderTimestampText(introText, onSeek)}
          </p>
        )}

        {/* Markdown response content (non-quiz) */}
        {hasMarkdownResponse && (
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
              {renderRichContent(responseContent, onSeek, videoId)}
            </div>
          </div>
        )}

        {/* Explanation (structured) */}
        {explanation && !hasMarkdownResponse && (
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
            <p className="text-sm text-slate-300 leading-relaxed mb-3">
              {renderTimestampText(explanation.content, onSeek)}
            </p>
            {explanation.seekTo !== undefined && explanation.seekReason && (
              <button
                onClick={() => onSeek(explanation.seekTo!)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-chalk-accent/10 border border-chalk-accent/20 text-xs text-chalk-accent hover:bg-chalk-accent/20 transition-colors"
              >
                <SkipForward size={12} weight="fill" />
                {explanation.seekReason}
              </button>
            )}
          </div>
        )}

        {/* Quiz cards */}
        {quiz && (
          <div className="space-y-3">
            {quiz.questions.map((q, i) => (
              <QuizCard
                key={i}
                question={q}
                questionIndex={i}
                selectedAnswer={answers.get(i)}
                onSelect={(optionId) => onSelectAnswer(i, optionId)}
                onSeek={onSeek}
              />
            ))}
          </div>
        )}

        {/* Export bar for markdown responses */}
        {exportableContent && (
          <ExportBar content={exportableContent} videoTitle={videoTitle} />
        )}

        {/* Error */}
        {error && (
          <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={onStop}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Exit Learn Mode
          </button>
          {allAnswered && quiz && (
            <motion.button
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={onNextBatch}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-chalk-accent/15 text-chalk-accent border border-chalk-accent/30 text-sm font-medium hover:bg-chalk-accent/25 active:scale-[0.97] transition-all"
            >
              Continue
              <ArrowArcRight size={14} weight="bold" />
            </motion.button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
