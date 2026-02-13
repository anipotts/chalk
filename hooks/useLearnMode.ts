'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { splitReasoningFromText } from '@/lib/stream-parser';
import type { TranscriptSegment } from '@/lib/video-utils';
import type { LearnOption } from './useLearnOptions';

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
  | 'selecting_action'
  | 'loading'
  | 'quiz_active'
  | 'reviewing';

// Keep Difficulty type for backward compat but it's no longer primary
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export interface LearnAction {
  id: string;
  label: string;
  intent: 'patient' | 'impatient';
}

interface UseLearnModeOptions {
  segments: TranscriptSegment[];
  currentTime: number;
  videoId: string;
  videoTitle?: string;
}

export interface UseLearnModeReturn {
  phase: LearnModePhase;
  selectedAction: LearnAction | null;
  openActionSelector: () => void;
  executeAction: (action: LearnAction) => void;
  stopLearnMode: () => void;
  currentQuiz: ParsedQuiz | null;
  currentExplanation: ParsedExplanation | null;
  introText: string;
  responseContent: string;
  exportableContent: string | null;
  selectAnswer: (questionIndex: number, optionId: string) => void;
  answers: Map<number, string>;
  requestNextBatch: () => void;
  isLoading: boolean;
  score: { correct: number; total: number };
  thinking: string | null;
  thinkingDuration: number | null;
  error: string | null;
  // Legacy compat
  difficulty: Difficulty | null;
}

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
  const [selectedAction, setSelectedAction] = useState<LearnAction | null>(null);
  const [currentQuiz, setCurrentQuiz] = useState<ParsedQuiz | null>(null);
  const [currentExplanation, setCurrentExplanation] = useState<ParsedExplanation | null>(null);
  const [introText, setIntroText] = useState('');
  const [responseContent, setResponseContent] = useState('');
  const [exportableContent, setExportableContent] = useState<string | null>(null);
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
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { segmentsRef.current = segments; }, [segments]);

  const executeLearnAction = useCallback(async (action: LearnAction, userMessage?: string) => {
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
    setResponseContent('');
    setExportableContent(null);
    setAnswers(new Map());
    setPhase('loading');

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
          action: { id: action.id, label: action.label, intent: action.intent },
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

        if (reasoning) {
          setThinking(reasoning);
        }
        if (hasSeparator && !thinkingDone) {
          setThinkingDuration(Date.now() - thinkingStart);
          thinkingDone = true;
        }

        if (hasSeparator && text) {
          const { intro, action: parsedAction } = extractJsonFromResponse(text);
          setIntroText(intro);
          setResponseContent(text);
          if (parsedAction?.type === 'quiz') {
            setCurrentQuiz(parsedAction);
            setPhase('quiz_active');
          } else if (parsedAction?.type === 'explanation') {
            setCurrentExplanation(parsedAction);
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

      const { intro, action: parsedAction } = extractJsonFromResponse(finalText);
      setIntroText(intro);
      setResponseContent(finalText);

      if (parsedAction?.type === 'quiz') {
        setCurrentQuiz(parsedAction);
        setPhase('quiz_active');
        setExportableContent(null); // quizzes aren't exported as markdown
      } else if (parsedAction?.type === 'explanation') {
        setCurrentExplanation(parsedAction);
        setPhase('reviewing');
        setExportableContent(parsedAction.content);
      } else {
        // Non-quiz response — show as markdown content
        setPhase('reviewing');
        setExportableContent(finalText);
      }

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

  const openActionSelector = useCallback(() => {
    setPhase('selecting_action');
    setSelectedAction(null);
    setCurrentQuiz(null);
    setCurrentExplanation(null);
    setIntroText('');
    setResponseContent('');
    setExportableContent(null);
    setAnswers(new Map());
    setScore({ correct: 0, total: 0 });
    setThinking(null);
    setThinkingDuration(null);
    setError(null);
    historyRef.current = [];
  }, []);

  const executeAction = useCallback((action: LearnAction) => {
    setSelectedAction(action);
    const userMsg = `${action.label}. Focus on what I've watched so far.`;
    historyRef.current.push({ role: 'user', content: userMsg });
    executeLearnAction(action);
  }, [executeLearnAction]);

  const stopLearnMode = useCallback(() => {
    abortRef.current?.abort();
    setPhase('idle');
    setSelectedAction(null);
    setCurrentQuiz(null);
    setCurrentExplanation(null);
    setIntroText('');
    setResponseContent('');
    setExportableContent(null);
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
    if (!selectedAction) return;

    const answerSummary = currentQuiz?.questions.map((q, i) => {
      const selected = answers.get(i);
      const isCorrect = selected === q.correctId;
      return `Q: ${q.question} - ${isCorrect ? 'Correct' : 'Wrong'}${!isCorrect ? ` (selected "${selected}", correct was "${q.correctId}")` : ''}`;
    }).join('\n') || '';

    const userMessage = `Here are my answers:\n${answerSummary}\n\nGive me the next batch of questions, adapting difficulty based on my performance.`;
    executeLearnAction(selectedAction, userMessage);
  }, [selectedAction, currentQuiz, answers, executeLearnAction]);

  return {
    phase,
    selectedAction,
    openActionSelector,
    executeAction,
    stopLearnMode,
    currentQuiz,
    currentExplanation,
    introText,
    responseContent,
    exportableContent,
    selectAnswer,
    answers,
    requestNextBatch,
    isLoading,
    score,
    thinking,
    thinkingDuration,
    error,
    // Legacy compat
    difficulty: null,
  };
}
