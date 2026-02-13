'use client';

import { useState, useRef, useCallback } from 'react';
import { splitReasoningFromText } from '@/lib/stream-parser';
import type { TranscriptSegment } from '@/lib/video-utils';

export interface QuizOption {
  id: string;
  text: string;
}

export interface QuizQuestion {
  question: string;
  options: QuizOption[];
  correctId: string;
  explanation: string;
  relatedTimestamp?: string;
}

export interface ParsedQuiz {
  type: 'quiz';
  questions: QuizQuestion[];
}

export interface ParsedExplanation {
  type: 'explanation';
  content: string;
  seekTo?: number;
  seekReason?: string;
}

export type ParsedAction = ParsedQuiz | ParsedExplanation;

export type LearnModePhase =
  | 'idle'
  | 'selecting_difficulty'
  | 'loading'
  | 'quiz_active'
  | 'reviewing';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

interface UseLearnModeOptions {
  segments: TranscriptSegment[];
  currentTime: number;
  videoId: string;
  videoTitle?: string;
}

export interface UseLearnModeReturn {
  phase: LearnModePhase;
  difficulty: Difficulty | null;
  openDifficultySelector: () => void;
  startLearnMode: (difficulty: Difficulty) => void;
  stopLearnMode: () => void;
  currentQuiz: ParsedQuiz | null;
  currentExplanation: ParsedExplanation | null;
  introText: string;
  selectAnswer: (questionIndex: number, optionId: string) => void;
  answers: Map<number, string>;
  requestNextBatch: () => void;
  isLoading: boolean;
  score: { correct: number; total: number };
  thinking: string | null;
  thinkingDuration: number | null;
  error: string | null;
}

/**
 * Extract JSON from a fenced code block in the response text.
 */
function extractJsonFromResponse(text: string): { intro: string; action: ParsedAction | null } {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) {
    return { intro: text.trim(), action: null };
  }

  const intro = text.slice(0, text.indexOf('```json')).trim();

  try {
    const parsed = JSON.parse(jsonMatch[1]);
    if (parsed.type === 'quiz' && Array.isArray(parsed.questions)) {
      return { intro, action: parsed as ParsedQuiz };
    }
    if (parsed.type === 'explanation' && typeof parsed.content === 'string') {
      return { intro, action: parsed as ParsedExplanation };
    }
  } catch {
    // JSON parse failed
  }

  return { intro, action: null };
}

export function useLearnMode({
  segments,
  currentTime,
  videoId,
  videoTitle,
}: UseLearnModeOptions): UseLearnModeReturn {
  const [phase, setPhase] = useState<LearnModePhase>('idle');
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [currentQuiz, setCurrentQuiz] = useState<ParsedQuiz | null>(null);
  const [currentExplanation, setCurrentExplanation] = useState<ParsedExplanation | null>(null);
  const [introText, setIntroText] = useState('');
  const [answers, setAnswers] = useState<Map<number, string>>(new Map());
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [thinking, setThinking] = useState<string | null>(null);
  const [thinkingDuration, setThinkingDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const historyRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const currentTimeRef = useRef(currentTime);
  const segmentsRef = useRef(segments);
  currentTimeRef.current = currentTime;
  segmentsRef.current = segments;

  const fetchQuiz = useCallback(async (diff: Difficulty, userMessage?: string) => {
    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    setIsLoading(true);
    setError(null);
    setThinking(null);
    setThinkingDuration(null);
    setCurrentQuiz(null);
    setCurrentExplanation(null);
    setIntroText('');
    setAnswers(new Map());
    setPhase('loading');

    // Add user message to history if provided
    if (userMessage) {
      historyRef.current.push({ role: 'user', content: userMessage });
    }

    try {
      const response = await fetch('/api/learn-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments: segmentsRef.current,
          currentTimestamp: currentTimeRef.current,
          videoTitle,
          history: historyRef.current,
          difficulty: diff,
          score,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullRaw = '';
      const thinkingStart = Date.now();
      let thinkingDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        fullRaw += decoder.decode(value, { stream: true });

        const { reasoning, text, hasSeparator } = splitReasoningFromText(fullRaw);

        // Update thinking display
        if (reasoning) {
          setThinking(reasoning);
        }
        if (hasSeparator && !thinkingDone) {
          setThinkingDuration(Date.now() - thinkingStart);
          thinkingDone = true;
        }

        // Try to parse the text content as it streams
        if (hasSeparator && text) {
          const { intro, action } = extractJsonFromResponse(text);
          setIntroText(intro);
          if (action?.type === 'quiz') {
            setCurrentQuiz(action);
            setPhase('quiz_active');
          } else if (action?.type === 'explanation') {
            setCurrentExplanation(action);
            setPhase('reviewing');
          }
        }
      }

      // Final parse
      const finalSplit = splitReasoningFromText(fullRaw);
      const finalText = finalSplit.hasSeparator ? finalSplit.text : fullRaw;

      if (!thinkingDone && finalSplit.reasoning) {
        setThinkingDuration(Date.now() - thinkingStart);
      }

      const { intro, action } = extractJsonFromResponse(finalText);
      setIntroText(intro);

      if (action?.type === 'quiz') {
        setCurrentQuiz(action);
        setPhase('quiz_active');
      } else if (action?.type === 'explanation') {
        setCurrentExplanation(action);
        setPhase('reviewing');
      } else {
        // Fallback: show the text as intro even without structured action
        setPhase('reviewing');
      }

      // Save assistant response to history
      historyRef.current.push({ role: 'assistant', content: finalText });
    } catch (err) {
      if (abortController.signal.aborted) return;
      const errMsg = err instanceof Error ? err.message : 'Something went wrong';
      setError(errMsg);
      setPhase('reviewing');
    } finally {
      setIsLoading(false);
    }
  }, [videoTitle, score]);

  const openDifficultySelector = useCallback(() => {
    setPhase('selecting_difficulty');
    setDifficulty(null);
    setCurrentQuiz(null);
    setCurrentExplanation(null);
    setIntroText('');
    setAnswers(new Map());
    setScore({ correct: 0, total: 0 });
    setThinking(null);
    setThinkingDuration(null);
    setError(null);
    historyRef.current = [];
  }, []);

  const startLearnMode = useCallback((diff: Difficulty) => {
    setDifficulty(diff);
    fetchQuiz(diff);
  }, [fetchQuiz]);

  const stopLearnMode = useCallback(() => {
    abortRef.current?.abort();
    setPhase('idle');
    setDifficulty(null);
    setCurrentQuiz(null);
    setCurrentExplanation(null);
    setIntroText('');
    setAnswers(new Map());
    setScore({ correct: 0, total: 0 });
    setThinking(null);
    setThinkingDuration(null);
    setError(null);
    setIsLoading(false);
    historyRef.current = [];
  }, []);

  const selectAnswer = useCallback((questionIndex: number, optionId: string) => {
    setAnswers((prev) => {
      const next = new Map(prev);
      if (!next.has(questionIndex)) {
        next.set(questionIndex, optionId);

        // Update score
        if (currentQuiz?.questions[questionIndex]?.correctId === optionId) {
          setScore((s) => ({ correct: s.correct + 1, total: s.total + 1 }));
        } else {
          setScore((s) => ({ ...s, total: s.total + 1 }));
        }
      }
      return next;
    });
  }, [currentQuiz]);

  const requestNextBatch = useCallback(() => {
    if (!difficulty) return;

    // Build a summary of the user's answers for context
    const answerSummary = currentQuiz?.questions.map((q, i) => {
      const selected = answers.get(i);
      const isCorrect = selected === q.correctId;
      return `Q: ${q.question} - ${isCorrect ? 'Correct' : 'Wrong'}${!isCorrect ? ` (selected "${selected}", correct was "${q.correctId}")` : ''}`;
    }).join('\n') || '';

    const userMessage = `Here are my answers:\n${answerSummary}\n\nGive me the next batch of questions, adapting difficulty based on my performance.`;
    fetchQuiz(difficulty, userMessage);
  }, [difficulty, currentQuiz, answers, fetchQuiz]);

  return {
    phase,
    difficulty,
    openDifficultySelector,
    startLearnMode,
    stopLearnMode,
    currentQuiz,
    currentExplanation,
    introText,
    selectAnswer,
    answers,
    requestNextBatch,
    isLoading,
    score,
    thinking,
    thinkingDuration,
    error,
  };
}
