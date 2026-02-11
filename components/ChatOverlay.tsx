'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VideoAIMessage } from './VideoAIMessage';
import { ModelSelector, type ModelChoice } from './ModelSelector';
import { splitReasoningFromText } from '@/lib/stream-parser';
import { pickSuggestions } from '@/lib/suggestions';
import { saveVideoSession, loadVideoSession, createSharedNote, trackVideoEvent, createFlashcard } from '@/lib/video-sessions';
import { formatTimestamp, type TranscriptSegment } from '@/lib/video-utils';
import { QuizButton } from './QuizModal';
import { VocabularyButton } from './VocabularyPanel';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  thinkingDuration?: number;
  responseDuration?: number; // ms from send to completion
  model?: string; // which AI model generated the response
  rating?: 'up' | 'down'; // user rating
  reactions?: string[]; // emoji reactions e.g. ['bulb', 'fire']
}

interface ChatOverlayProps {
  visible: boolean;
  segments: TranscriptSegment[];
  currentTime: number;
  videoId?: string;
  videoTitle?: string;
  onSeek: (seconds: number) => void;
  onToggle?: () => void;
  pendingQuestion?: string | null;
  onPendingQuestionConsumed?: () => void;
}

/* ─── Inline icons ─── */

function ChatBubbleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M1 8.74c0 1.36.49 2.6 1.3 3.56-.13.77-.45 1.48-.91 2.08a.38.38 0 0 0 .3.62c1.07 0 2-.37 2.74-.93A6.47 6.47 0 0 0 7.5 15.5c3.59 0 6.5-2.98 6.5-6.76S11.09 2 7.5 2 1 4.96 1 8.74Z" />
    </svg>
  );
}

function SparkleIcon({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M8 .75a.75.75 0 0 1 .697.473l1.524 3.84 3.84 1.524a.75.75 0 0 1 0 1.396l-3.84 1.524-1.524 3.84a.75.75 0 0 1-1.394 0L5.78 9.507l-3.84-1.524a.75.75 0 0 1 0-1.396l3.84-1.524L7.303 1.223A.75.75 0 0 1 8 .75Z" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <path fillRule="evenodd" d="M2 8a.75.75 0 0 1 .75-.75h8.69L8.22 4.03a.75.75 0 0 1 1.06-1.06l4.5 4.5a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 0 1-1.06-1.06l3.22-3.22H2.75A.75.75 0 0 1 2 8Z" clipRule="evenodd" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />
    </svg>
  );
}

function DownArrowIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
      <path fillRule="evenodd" d="M8 2a.75.75 0 0 1 .75.75v8.69l3.22-3.22a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.22 3.22V2.75A.75.75 0 0 1 8 2Z" clipRule="evenodd" />
    </svg>
  );
}

/* ─── Context-based topic extraction ─── */

function extractContextTopics(segments: TranscriptSegment[], currentTime: number): string[] {
  if (segments.length === 0) return [];

  // Get segments within 60s of current time
  const nearby = segments.filter((s) => Math.abs(s.offset - currentTime) < 60);
  if (nearby.length === 0) return [];

  const text = nearby.map((s) => s.text).join(' ').toLowerCase();

  // Extract meaningful phrases (2-3 word combos that appear capitalized or quoted)
  const words = text.split(/\s+/).filter((w) => w.length > 4);
  // Count word frequency
  const freq = new Map<string, number>();
  for (const w of words) {
    const clean = w.replace(/[^a-z]/g, '');
    if (clean.length > 4 && !STOP_WORDS.has(clean)) {
      freq.set(clean, (freq.get(clean) || 0) + 1);
    }
  }

  // Top keywords by frequency
  const topWords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w);

  if (topWords.length === 0) return [];

  return topWords.map((w) => `What does "${w}" mean in this context?`).slice(0, 2);
}

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'being', 'could', 'didnt', 'doing', 'every',
  'first', 'going', 'great', 'gonna', 'gotta', 'would', 'could', 'there',
  'their', 'these', 'thing', 'think', 'those', 'where', 'which', 'while',
  'right', 'other', 'really', 'actually', 'basically', 'literally', 'something',
  'people', 'stuff', 'things', 'thats', 'youre', 'theyre',
]);

/* ─── Suggestion rows (vertical, full-width) ─── */

function SuggestionRows({
  currentTime,
  hasTranscript,
  segments,
  onSelect,
  videoTitle,
}: {
  currentTime: number;
  hasTranscript: boolean;
  segments: TranscriptSegment[];
  onSelect: (text: string) => void;
  videoTitle?: string;
}) {
  const baseSuggestions = pickSuggestions(currentTime, hasTranscript, 3);
  // Replace first suggestion with a video-specific one if title is available
  const suggestions = useMemo(() => {
    if (!videoTitle) return baseSuggestions;
    const titleQ = `What are the main ideas in "${videoTitle.length > 50 ? videoTitle.slice(0, 50) + '...' : videoTitle}"?`;
    return [titleQ, ...baseSuggestions.slice(1)];
  }, [videoTitle, baseSuggestions]);
  const contextTopics = useMemo(
    () => extractContextTopics(segments, currentTime),
    [segments, currentTime]
  );

  return (
    <div className="flex flex-col items-center justify-center py-6 px-2 gap-4">
      {/* Empty-state label */}
      <div className="flex items-center gap-2 text-slate-500">
        <SparkleIcon />
        <span className="text-xs font-medium">Quick questions</span>
      </div>

      {/* Vertical suggestion buttons */}
      <div className="w-full flex flex-col gap-1.5">
        {suggestions.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => onSelect(text)}
            className="group w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-[13px] text-slate-400 bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:text-slate-300 hover:border-white/[0.10] active:scale-[0.98] transition-all duration-150 cursor-pointer text-left"
          >
            <span className="flex-1">{text}</span>
            <span className="text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <ArrowRightIcon />
            </span>
          </button>
        ))}
      </div>

      {/* Context-aware topic suggestions */}
      {contextTopics.length > 0 && (
        <div className="w-full space-y-1.5">
          <div className="flex items-center gap-1.5 text-slate-600 px-1">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path fillRule="evenodd" d="M11.986 3H12a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h.014A2.25 2.25 0 0 1 6.25 1h3.5a2.25 2.25 0 0 1 2.236 2ZM9.75 2.5h-3.5a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5Z" clipRule="evenodd" />
            </svg>
            <span className="text-[10px]">From current section</span>
          </div>
          {contextTopics.map((topic) => (
            <button
              key={topic}
              type="button"
              onClick={() => onSelect(topic)}
              className="group w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-[12px] text-slate-500 bg-chalk-accent/[0.03] border border-chalk-accent/10 hover:bg-chalk-accent/[0.08] hover:text-slate-300 hover:border-chalk-accent/20 active:scale-[0.98] transition-all duration-150 cursor-pointer text-left"
            >
              <span className="flex-1">{topic}</span>
              <span className="text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <ArrowRightIcon />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Follow-up suggestion chips ─── */

const GENERIC_FOLLOW_UPS = [
  'Tell me more',
  'Give me an example',
  'Why is that important?',
  'Explain it more simply',
  'Quiz me on this',
  'What comes next in the video?',
  'How does this relate to the rest?',
  'Can you summarize that?',
];

function generateContextualFollowUps(lastResponse: string): string[] {
  const suggestions: string[] = [];
  const text = lastResponse.toLowerCase();

  // Extract key nouns/topics from the response (simple extraction)
  const sentences = lastResponse.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  const firstSubject = sentences[0]?.trim().split(/\s+/).slice(0, 5).join(' ');

  // Pattern-based contextual suggestions
  if (/\[\d{1,2}:\d{2}\]/.test(lastResponse)) {
    suggestions.push('What happens right after that moment?');
  }
  if (text.includes('example') || text.includes('instance')) {
    suggestions.push('Can you give another example?');
  }
  if (text.includes('because') || text.includes('reason')) {
    suggestions.push('What are the implications of this?');
  }
  if (text.includes('step') || text.includes('process') || text.includes('first')) {
    suggestions.push('Walk me through each step');
  }
  if (text.includes('important') || text.includes('key') || text.includes('crucial')) {
    suggestions.push('Why does this matter in practice?');
  }
  if (text.includes('different') || text.includes('compare') || text.includes('versus')) {
    suggestions.push('Which approach is better and why?');
  }
  if (firstSubject && firstSubject.length > 10 && suggestions.length < 3) {
    suggestions.push(`Elaborate on "${firstSubject.length > 30 ? firstSubject.slice(0, 30) + '...' : firstSubject}"`);
  }

  // Fill remaining with generic
  while (suggestions.length < 3) {
    const generic = GENERIC_FOLLOW_UPS[Math.floor(Math.random() * GENERIC_FOLLOW_UPS.length)];
    if (!suggestions.includes(generic)) suggestions.push(generic);
  }

  return suggestions.slice(0, 3);
}

function FollowUpChips({ onSelect, lastResponse }: { onSelect: (text: string) => void; lastResponse?: string }) {
  const chips = useMemo(() => {
    if (lastResponse && lastResponse.length > 20) {
      return generateContextualFollowUps(lastResponse);
    }
    const shuffled = [...GENERIC_FOLLOW_UPS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 2);
  }, [lastResponse]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.2 }}
      className="flex gap-1.5 mt-2 flex-wrap"
    >
      {chips.map((text) => (
        <button
          key={text}
          type="button"
          onClick={() => onSelect(text)}
          className="px-2.5 py-1 rounded-full text-[11px] text-slate-400 bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:text-slate-300 hover:border-white/[0.10] transition-all duration-150"
        >
          {text}
        </button>
      ))}
    </motion.div>
  );
}

/* ─── Main overlay ─── */

const CHAT_STORAGE_PREFIX = 'chalk-video-chat-';

function loadChatHistory(videoId?: string): ChatMessage[] {
  if (!videoId || typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(`${CHAT_STORAGE_PREFIX}${videoId}`);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveChatHistory(videoId: string | undefined, messages: ChatMessage[]) {
  if (!videoId || typeof window === 'undefined') return;
  try {
    if (messages.length === 0) {
      localStorage.removeItem(`${CHAT_STORAGE_PREFIX}${videoId}`);
    } else {
      localStorage.setItem(`${CHAT_STORAGE_PREFIX}${videoId}`, JSON.stringify(messages));
    }
  } catch {
    // Quota exceeded — silently fail
  }
}

export function ChatOverlay({ visible, segments, currentTime, videoId, videoTitle, onSeek, onToggle, pendingQuestion, onPendingQuestionConsumed }: ChatOverlayProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChatHistory(videoId));
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedModel, setSelectedModelRaw] = useState<ModelChoice>(() => {
    if (typeof window === 'undefined') return 'auto';
    try { const stored = localStorage.getItem('chalk-chat-model'); return (stored as ModelChoice) || 'auto'; } catch { return 'auto'; }
  });
  const setSelectedModel = useCallback((m: ModelChoice) => { setSelectedModelRaw(m); try { localStorage.setItem('chalk-chat-model', m); } catch { /* ignore */ } }, []);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [shareStatus, setShareStatus] = useState<'idle' | 'sharing' | 'done'>('idle');
  const [flashcardStatus, setFlashcardStatus] = useState<'idle' | 'generating' | 'done'>('idle');
  const [eli5Mode, setEli5Mode] = useState(false);
  const [teachBackMode, setTeachBackMode] = useState(false);
  const [personality, setPersonality] = useState<'default' | 'encouraging' | 'strict' | 'socratic'>('default');
  const [catchUpRange, setCatchUpRange] = useState<{ from: number; to: number } | null>(null);
  const [takeaways, setTakeaways] = useState<{ text: string; timestamp: number }[] | null>(null);
  const [takeawaysLoading, setTakeawaysLoading] = useState(false);
  const [digestOpen, setDigestOpen] = useState(false);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestData, setDigestData] = useState<{ takeaways: { text: string; timestamp: number }[] } | null>(null);
  const [chatSearch, setChatSearch] = useState('');
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [inputHistoryIdx, setInputHistoryIdx] = useState(-1);
  const [ctxMenu, setCtxMenu] = useState<{ msgId: string; x: number; y: number } | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    if (!videoId || typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem(`chalk-pinned-${videoId}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const [savedMsgIds, setSavedMsgIds] = useState<Set<string>>(() => {
    if (!videoId || typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem(`chalk-saved-msgs-${videoId}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const [expandedMsgs, setExpandedMsgs] = useState<Set<string>>(new Set());
  const [inputSuggestionIdx, setInputSuggestionIdx] = useState(-1);
  const [suggestionsHidden, setSuggestionsHidden] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevTimeRef = useRef<number>(currentTime);
  const scrolledAtCountRef = useRef<number>(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const copyCounts = useRef<Map<string, number>>(new Map());

  // Max message content length for relative bars
  const maxContentLength = useMemo(() => {
    return Math.max(1, ...messages.filter((m) => m.role === 'assistant').map((m) => m.content.length));
  }, [messages]);

  // Video progress calculation
  const videoDuration = useMemo(() => {
    if (segments.length === 0) return 0;
    const last = segments[segments.length - 1];
    return last.offset + (last.duration || 0);
  }, [segments]);
  const videoProgress = videoDuration > 0 ? Math.min(currentTime / videoDuration, 1) : 0;

  // Input autocomplete suggestions from past questions
  const inputSuggestions = useMemo(() => {
    if (!input.trim() || input.trim().length < 2) return [];
    const query = input.trim().toLowerCase();
    const pastQuestions = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .filter((c, i, arr) => arr.indexOf(c) === i); // dedupe
    return pastQuestions
      .filter((q) => q.toLowerCase().includes(query) && q.toLowerCase() !== query)
      .slice(0, 3);
  }, [input, messages]);

  // Detect forward skips (>30s) to offer "What did I miss?" catch-up
  useEffect(() => {
    const delta = currentTime - prevTimeRef.current;
    if (delta > 30 && segments.length > 0) {
      setCatchUpRange({ from: prevTimeRef.current, to: currentTime });
    }
    prevTimeRef.current = currentTime;
  }, [currentTime, segments.length]);

  // Persist chat messages to localStorage + Supabase (background sync)
  useEffect(() => {
    if (!isStreaming) {
      saveChatHistory(videoId, messages);
      // Background Supabase sync
      if (videoId && messages.length > 0) {
        saveVideoSession(videoId, messages, videoTitle, selectedModel);
      }
    }
  }, [messages, videoId, videoTitle, selectedModel, isStreaming]);

  // Restore from Supabase if localStorage is empty
  useEffect(() => {
    if (videoId && messages.length === 0) {
      loadVideoSession(videoId).then((session) => {
        if (session && session.messages.length > 0) {
          setMessages(session.messages);
          saveChatHistory(videoId, session.messages);
        }
      });
    }
  }, [videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track video watch event
  useEffect(() => {
    if (videoId) {
      trackVideoEvent(videoId, 'watch', undefined, videoTitle);
    }
  }, [videoId, videoTitle]);

  // Focus input when overlay becomes visible
  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [visible]);

  // Auto-submit a pending question from transcript "ask about" button
  useEffect(() => {
    if (pendingQuestion && visible && !isStreaming) {
      submitMessage(pendingQuestion);
      onPendingQuestionConsumed?.();
    }
  }, [pendingQuestion, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll on new messages (smooth)
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    if (!isScrolledUp) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom, isScrolledUp]);

  // Track whether user has scrolled up
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const scrolledUp = scrollHeight - scrollTop - clientHeight > 60;
    if (scrolledUp && !isScrolledUp) {
      scrolledAtCountRef.current = messages.length;
    }
    setIsScrolledUp(scrolledUp);
    const maxScroll = scrollHeight - clientHeight;
    setScrollProgress(maxScroll > 0 ? scrollTop / maxScroll : 0);
  }, [isScrolledUp, messages.length]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const submitMessage = useCallback(async (prompt: string) => {
    if (!prompt || isStreaming) return;

    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    // Mode-specific prompt wrapping
    let effectivePrompt = prompt;
    if (teachBackMode) {
      effectivePrompt = `[TEACH BACK MODE] The student is trying to explain a concept back to you. Evaluate their explanation for accuracy and completeness based on the video content. Be encouraging but point out any misconceptions. Then ask a follow-up question to deepen their understanding. Student says: "${prompt}"`;
    } else if (eli5Mode) {
      effectivePrompt = `Explain this very simply, as if to a complete beginner with no background knowledge: ${prompt}`;
    }

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: prompt };
    const assistantId = (Date.now() + 1).toString();
    const newMessages = [...messages, userMsg];

    setMessages([...newMessages, { id: assistantId, role: 'assistant', content: '', model: selectedModel === 'auto' ? 'sonnet' : selectedModel }]);
    setInput('');
    setIsStreaming(true);
    setIsScrolledUp(false);

    try {
      const history = [...newMessages].map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch('/api/video-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: effectivePrompt,
          currentTimestamp: currentTime,
          segments,
          history,
          model: selectedModel,
          videoTitle,
          personality: personality !== 'default' ? personality : undefined,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullRaw = '';
      const thinkingStart = Date.now();
      let thinkingDuration: number | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        fullRaw += decoder.decode(value, { stream: true });
        const { reasoning, text, hasSeparator } = splitReasoningFromText(fullRaw);

        if (hasSeparator && !thinkingDuration) {
          thinkingDuration = Date.now() - thinkingStart;
        }

        const displayText = hasSeparator ? text : '';
        const displayReasoning = reasoning;

        setMessages((prev) => {
          const updated = [...prev];
          const idx = updated.findIndex((m) => m.id === assistantId);
          if (idx !== -1) {
            updated[idx] = {
              ...updated[idx],
              content: displayText,
              thinking: displayReasoning || undefined,
              thinkingDuration,
            };
          }
          return updated;
        });
        scrollToBottom();
      }

      // Final parse
      const finalSplit = splitReasoningFromText(fullRaw);
      const finalText = finalSplit.hasSeparator ? finalSplit.text : fullRaw;
      const finalReasoning = finalSplit.hasSeparator ? finalSplit.reasoning : '';

      if (!thinkingDuration && finalReasoning) {
        thinkingDuration = Date.now() - thinkingStart;
      }

      const responseDuration = Date.now() - thinkingStart;
      setMessages([
        ...newMessages,
        {
          id: assistantId,
          role: 'assistant',
          content: finalText,
          thinking: finalReasoning || undefined,
          thinkingDuration,
          responseDuration,
          model: selectedModel === 'auto' ? 'sonnet' : selectedModel,
        },
      ]);
      // Track total words learned
      try {
        const wordCount = finalText.split(/\s+/).filter(Boolean).length;
        const prev = parseInt(localStorage.getItem('chalk-total-words-learned') || '0', 10);
        localStorage.setItem('chalk-total-words-learned', String(prev + wordCount));
      } catch { /* ignore */ }
    } catch (error) {
      if (abortController.signal.aborted) return;
      const errMsg = error instanceof Error ? error.message : 'Something went wrong';
      setMessages([
        ...newMessages,
        { id: assistantId, role: 'assistant', content: `Error: ${errMsg}` },
      ]);
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming, messages, currentTime, segments, selectedModel, videoTitle, scrollToBottom, eli5Mode, teachBackMode, personality]);

  const handleSubmit = async (e?: { preventDefault(): void }) => {
    e?.preventDefault();
    const prompt = input.trim();
    await submitMessage(prompt);
  };

  const handleSuggestionSelect = (text: string) => {
    submitMessage(text);
  };

  const togglePin = useCallback((msgId: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      if (videoId) {
        try { localStorage.setItem(`chalk-pinned-${videoId}`, JSON.stringify([...next])); } catch { /* ignore */ }
      }
      return next;
    });
  }, [videoId]);

  const toggleSave = useCallback((msgId: string) => {
    setSavedMsgIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      if (videoId) {
        try { localStorage.setItem(`chalk-saved-msgs-${videoId}`, JSON.stringify([...next])); } catch { /* ignore */ }
      }
      return next;
    });
  }, [videoId]);

  // Keyboard: C to toggle chat, Escape to close, Ctrl+F to search, Ctrl+P to pin
  useEffect(() => {
    if (!visible) return;
    function handleKey(e: KeyboardEvent) {
      // Ctrl+F — open chat search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && messages.length > 2) {
        e.preventDefault();
        setChatSearchOpen(true);
        return;
      }
      // Ctrl+P — pin last AI response
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        const lastAI = [...messages].reverse().find((m) => m.role === 'assistant');
        if (lastAI) togglePin(lastAI.id);
        return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') {
          if (chatSearchOpen) { setChatSearchOpen(false); setChatSearch(''); return; }
          (e.target as HTMLElement).blur();
          onToggle?.();
        }
        return;
      }
      if (e.key === 'c') {
        e.preventDefault();
        onToggle?.();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onToggle, visible, messages, togglePin, chatSearchOpen]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320, mass: 0.8 }}
          className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-center pointer-events-none px-0 sm:px-4 pb-0 sm:pb-4"
        >
          {/* Glass panel */}
          <div
            role="dialog"
            aria-label="Video chat"
            className="w-full max-w-3xl pointer-events-auto relative flex flex-col max-h-[50dvh] sm:rounded-2xl rounded-t-2xl bg-gradient-to-t from-slate-900/95 to-slate-900/85 backdrop-blur-xl ring-1 ring-white/[0.08] shadow-[0_-4px_24px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)] overflow-hidden"
          >

            {/* Video progress bar */}
            {videoDuration > 0 && (
              <div className="h-0.5 bg-white/[0.04]">
                <div
                  className="h-full bg-chalk-accent/50 transition-[width] duration-500 ease-linear"
                  style={{ width: `${videoProgress * 100}%` }}
                />
              </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2 text-slate-400">
                <ChatBubbleIcon />
                <span className="text-xs font-medium">Ask about this video</span>
                <button
                  type="button"
                  onClick={() => setHeaderCollapsed((c) => !c)}
                  className="hidden sm:inline-flex items-center justify-center w-4 h-4 rounded text-slate-600 hover:text-slate-400 hover:bg-white/[0.06] transition-colors"
                  title={headerCollapsed ? 'Show stats' : 'Hide stats'}
                  aria-label={headerCollapsed ? 'Show header stats' : 'Hide header stats'}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`w-2.5 h-2.5 transition-transform ${headerCollapsed ? '-rotate-90' : ''}`}>
                    <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                  </svg>
                </button>
                {messages.filter((m) => m.role === 'assistant' && m.content.length > 300).length >= 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      const longIds = messages.filter((m) => m.role === 'assistant' && m.content.length > 300).map((m) => m.id);
                      const allExpanded = longIds.every((id) => expandedMsgs.has(id));
                      setExpandedMsgs(allExpanded ? new Set() : new Set(longIds));
                    }}
                    className="hidden sm:inline-flex items-center justify-center px-1 h-4 rounded text-[8px] text-slate-600 hover:text-slate-400 hover:bg-white/[0.06] transition-colors tabular-nums"
                    title={expandedMsgs.size > 0 ? 'Collapse all messages' : 'Expand all messages'}
                  >
                    {expandedMsgs.size > 0 ? '⊟' : '⊞'}
                  </button>
                )}
                {!headerCollapsed && messages.length >= 4 && (() => {
                  const userMsgs = messages.filter((m) => m.role === 'user');
                  const avgLen = userMsgs.reduce((a, m) => a + m.content.length, 0) / Math.max(1, userMsgs.length);
                  const depth = avgLen > 100 ? 'deep' : avgLen > 40 ? 'exploring' : 'starting';
                  const labels = { starting: 'Getting started', exploring: 'Exploring', deep: 'Deep dive' };
                  const colors = { starting: 'text-slate-500', exploring: 'text-amber-400', deep: 'text-emerald-400' };
                  return (
                    <span className={`text-[9px] font-medium ${colors[depth]} hidden sm:inline`}>
                      {labels[depth]}
                    </span>
                  );
                })()}
                {/* Context window coverage badge */}
                {!headerCollapsed && segments.length > 0 && (() => {
                  const totalDur = segments.length > 0 ? segments[segments.length - 1].offset + (segments[segments.length - 1].duration || 0) : 0;
                  if (totalDur <= 0) return null;
                  const winStart = Math.max(0, currentTime - 120);
                  const winEnd = Math.min(totalDur, currentTime + 60);
                  const windowSegs = segments.filter((s) => s.offset >= winStart && s.offset <= winEnd);
                  const pct = Math.round((windowSegs.length / segments.length) * 100);
                  return (
                    <span
                      className="hidden sm:inline-flex items-center gap-0.5 text-[8px] font-mono px-1 py-0.5 rounded bg-white/[0.04] text-slate-600"
                      title={`AI context: ${formatTimestamp(winStart)} → ${formatTimestamp(winEnd)} (${windowSegs.length}/${segments.length} segments)`}
                    >
                      <span className="w-1 h-1 rounded-full bg-emerald-500/60" />
                      {pct}%
                    </span>
                  );
                })()}
                {/* Pinned count */}
                {!headerCollapsed && pinnedIds.size > 0 && (
                  <span className="hidden sm:inline-flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-500/70">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2 h-2">
                      <path d="M10.97 2.22a.75.75 0 0 1 1.06 0l1.75 1.75a.75.75 0 0 1-.177 1.2l-2.032.904-.71.71 1.428 1.428a.75.75 0 0 1-1.06 1.06L9.8 7.844l-3.09 3.091a.75.75 0 0 1-1.06-1.06l3.09-3.091-1.428-1.428a.75.75 0 0 1 1.06-1.06l1.427 1.427.711-.71.904-2.032a.75.75 0 0 1 .177-.511l.398-.45Z" />
                      <path d="M3.28 12.72a.75.75 0 0 1 0-1.06l2-2a.75.75 0 1 1 1.06 1.06l-2 2a.75.75 0 0 1-1.06 0Z" />
                    </svg>
                    {pinnedIds.size}
                  </span>
                )}
                {/* Session stats */}
                {!headerCollapsed && messages.length >= 2 && (() => {
                  const userCount = messages.filter((m) => m.role === 'user').length;
                  const firstTs = parseInt(messages[0]?.id || '0', 10);
                  const elapsed = firstTs > 0 ? Math.round((Date.now() - firstTs) / 60000) : 0;
                  if (userCount === 0) return null;
                  return (
                    <span className="hidden sm:inline-flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded bg-white/[0.04] text-slate-600 tabular-nums">
                      {userCount} Q{userCount !== 1 ? 's' : ''}{elapsed > 0 ? ` · ${elapsed}m` : ''}
                    </span>
                  );
                })()}
                {!headerCollapsed && savedMsgIds.size > 0 && (
                  <span className="hidden sm:inline-flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded bg-white/[0.04] text-amber-500/60 tabular-nums">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2 h-2"><path fillRule="evenodd" d="M11.986 3H12a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h.014A2.25 2.25 0 0 1 6.25 1h3.5a2.25 2.25 0 0 1 2.236 2ZM6.25 2.5a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5Z" clipRule="evenodd" /></svg>
                    {savedMsgIds.size}
                  </span>
                )}
                {/* Average response time */}
                {!headerCollapsed && (() => {
                  const durations = messages.filter((m) => m.role === 'assistant' && m.responseDuration).map((m) => m.responseDuration!);
                  if (durations.length < 2) return null;
                  const avg = (durations.reduce((a, b) => a + b, 0) / durations.length / 1000).toFixed(1);
                  return (
                    <span className="hidden sm:inline-flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded bg-white/[0.04] text-slate-600 tabular-nums" title={`Average AI response time across ${durations.length} responses`}>
                      Avg {avg}s
                    </span>
                  );
                })()}
                {/* Longest response */}
                {!headerCollapsed && (() => {
                  const aiMsgs = messages.filter((m) => m.role === 'assistant' && m.content);
                  if (aiMsgs.length < 3) return null;
                  const maxWords = Math.max(...aiMsgs.map((m) => m.content.split(/\s+/).filter(Boolean).length));
                  return (
                    <span className="hidden sm:inline-flex items-center text-[8px] px-1 py-0.5 rounded bg-white/[0.04] text-slate-600 tabular-nums" title={`Longest AI response: ${maxWords} words`}>
                      Max {maxWords}w
                    </span>
                  );
                })()}
                {/* Longest question */}
                {!headerCollapsed && (() => {
                  const userMsgs = messages.filter((m) => m.role === 'user' && m.content);
                  if (userMsgs.length < 3) return null;
                  const maxQ = Math.max(...userMsgs.map((m) => m.content.split(/\s+/).filter(Boolean).length));
                  return (
                    <span className="hidden sm:inline-flex items-center text-[8px] px-1 py-0.5 rounded bg-white/[0.04] text-slate-600 tabular-nums" title={`Longest question: ${maxQ} words`}>
                      Q {maxQ}w
                    </span>
                  );
                })()}
                {/* Reaction tally */}
                {!headerCollapsed && messages.length > 0 && (() => {
                  let upCount = 0;
                  try {
                    for (const m of messages) {
                      if (m.role === 'assistant') {
                        const r = typeof window !== 'undefined' ? localStorage.getItem(`chalk-reaction-${m.id}`) : null;
                        if (r === 'up') upCount++;
                      }
                    }
                  } catch { /* ignore */ }
                  if (upCount === 0) return null;
                  return (
                    <span className="hidden sm:inline-flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-500/70">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2 h-2">
                        <path d="M2.09 15a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h1.382a1 1 0 0 0 .894-.553l2.236-4.472A.5.5 0 0 1 7.059 1.5h.382a1.5 1.5 0 0 1 1.5 1.5v2.5h3.559a1.5 1.5 0 0 1 1.487 1.704l-.971 6.5A1.5 1.5 0 0 1 11.53 15H2.09Z" />
                      </svg>
                      {upCount}
                    </span>
                  );
                })()}
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <>
                    <button
                      onClick={async () => {
                        if (!videoId || shareStatus === 'sharing') return;
                        setShareStatus('sharing');
                        const id = await createSharedNote(videoId, messages, videoTitle);
                        if (id) {
                          const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
                          const shareUrl = `${baseUrl}/study/${id}`;
                          await navigator.clipboard.writeText(shareUrl);
                          trackVideoEvent(videoId, 'share', { noteId: id }, videoTitle);
                          setShareStatus('done');
                          setTimeout(() => setShareStatus('idle'), 2000);
                        } else {
                          setShareStatus('idle');
                        }
                      }}
                      disabled={shareStatus === 'sharing'}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors text-[10px]"
                      aria-label={shareStatus === 'done' ? 'Link copied!' : 'Share study notes'}
                      title={shareStatus === 'done' ? 'Link copied!' : 'Share as link'}
                    >
                      {shareStatus === 'done' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-emerald-400">
                          <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                          <path d="M12 6a2 2 0 1 0-1.994-1.842L5.323 6.5a2 2 0 1 0 0 3l4.683 2.342a2 2 0 1 0 .67-1.342L5.994 8.158a2.03 2.03 0 0 0 0-.316L10.676 5.5A1.99 1.99 0 0 0 12 6Z" />
                        </svg>
                      )}
                      {shareStatus === 'done' ? 'Copied!' : shareStatus === 'sharing' ? '...' : 'Share'}
                    </button>
                    <button
                      onClick={() => {
                        const md = messages.map((m) =>
                          m.role === 'user' ? `**You:** ${m.content}` : `**Chalk:** ${m.content}`
                        ).join('\n\n---\n\n');
                        const header = videoTitle ? `# Chat: ${videoTitle}\n\n` : '# Video Chat\n\n';
                        const blob = new Blob([header + md], { type: 'text/markdown' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `chalk-chat${videoId ? `-${videoId}` : ''}.md`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors text-[10px]"
                      aria-label="Export chat"
                      title="Export as markdown"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                        <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h2.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 1 .439 1.061V12.5A1.5 1.5 0 0 1 8.5 14h-5A1.5 1.5 0 0 1 2 12.5v-9Zm6.5 3.75a.75.75 0 0 0-1.5 0v2.69l-.72-.72a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l2-2a.75.75 0 1 0-1.06-1.06l-.72.72V7.25Z" />
                      </svg>
                      Export
                    </button>
                    <button
                      onClick={() => {
                        const md = messages.map((m) => `**${m.role === 'user' ? 'You' : 'AI'}:** ${m.content}`).join('\n\n');
                        navigator.clipboard.writeText(md);
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors text-[10px]"
                      aria-label="Copy chat"
                      title="Copy conversation to clipboard"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                        <path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h2.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 1 .439 1.061V12.5A1.5 1.5 0 0 1 12 14h-5a1.5 1.5 0 0 1-1.5-1.5v-9Z" />
                        <path d="M3.5 5.75A.75.75 0 0 1 4.25 5h.5a.75.75 0 0 1 0 1.5h-.5A.75.75 0 0 1 3.5 5.75ZM4.25 8a.75.75 0 0 0 0 1.5h.5a.75.75 0 0 0 0-1.5h-.5Z" />
                      </svg>
                      Copy
                    </button>
                    <button
                      onClick={() => {
                        const plain = messages.map((m) => `${m.role === 'user' ? 'You' : 'AI'}: ${m.content}`).join('\n\n');
                        navigator.clipboard.writeText(plain);
                      }}
                      className="flex items-center gap-1 px-1.5 py-1 rounded-md text-slate-600 hover:text-slate-300 hover:bg-white/[0.06] transition-colors text-[9px]"
                      aria-label="Copy as plain text"
                      title="Copy as plain text (no formatting)"
                    >
                      TXT
                    </button>
                    <button
                      onClick={() => {
                        const data = { video: videoTitle || 'Untitled', exportedAt: new Date().toISOString(), messages: messages.map((m) => ({ role: m.role, content: m.content, ...(m.model ? { model: m.model } : {}) })) };
                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `chalk-chat-${Date.now()}.json`; a.click(); URL.revokeObjectURL(a.href);
                      }}
                      className="flex items-center gap-1 px-1.5 py-1 rounded-md text-slate-600 hover:text-slate-300 hover:bg-white/[0.06] transition-colors text-[9px]"
                      aria-label="Export as JSON"
                      title="Download conversation as JSON"
                    >
                      JSON
                    </button>
                    <button
                      onClick={() => {
                        const title = videoTitle || 'Video Chat';
                        const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Chalk - ${title}</title>
<style>
body { font-family: -apple-system, system-ui, sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; }
h1 { font-size: 20px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; }
.meta { color: #666; font-size: 13px; margin-bottom: 24px; }
.msg { margin-bottom: 16px; padding: 12px; border-radius: 8px; }
.user { background: #f0f4ff; border-left: 3px solid #3b82f6; }
.assistant { background: #f9fafb; border-left: 3px solid #10b981; }
.role { font-size: 11px; font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
.role.user-role { color: #3b82f6; }
.role.ai-role { color: #10b981; }
.content { font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
.footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #999; }
@media print { body { margin: 20px; } }
</style></head><body>
<h1>${title}</h1>
<div class="meta">${videoId ? `Video ID: ${videoId} · ` : ''}${messages.length} messages · Generated by Chalk</div>
${messages.map((m) => `<div class="msg ${m.role}"><div class="role ${m.role === 'user' ? 'user-role' : 'ai-role'}">${m.role === 'user' ? 'You' : 'Chalk AI'}</div><div class="content">${m.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div></div>`).join('\n')}
<div class="footer">Exported from Chalk · ${new Date().toLocaleDateString()}</div>
</body></html>`;
                        const win = window.open('', '_blank');
                        if (win) {
                          win.document.write(html);
                          win.document.close();
                        }
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors text-[10px]"
                      aria-label="Print chat"
                      title="Open printable version"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                        <path fillRule="evenodd" d="M3 4.75A2.75 2.75 0 0 1 5.75 2h4.5A2.75 2.75 0 0 1 13 4.75v1.5h.25A1.75 1.75 0 0 1 15 8v3.25a1.75 1.75 0 0 1-1.75 1.75H13v.25A2.75 2.75 0 0 1 10.25 16h-4.5A2.75 2.75 0 0 1 3 13.25V13h-.25A1.75 1.75 0 0 1 1 11.25V8a1.75 1.75 0 0 1 1.75-1.75H3v-1.5Z" clipRule="evenodd" />
                      </svg>
                      Print
                    </button>
                    <button
                      onClick={async () => {
                        if (!videoId || flashcardStatus === 'generating') return;
                        setFlashcardStatus('generating');
                        try {
                          const resp = await fetch('/api/generate-flashcards', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ messages, videoTitle }),
                          });
                          if (!resp.ok) throw new Error('Failed');
                          const { cards } = await resp.json();
                          if (cards && Array.isArray(cards)) {
                            for (const card of cards) {
                              await createFlashcard(videoId, card.front, card.back, videoTitle, card.timestamp);
                            }
                          }
                          setFlashcardStatus('done');
                          setTimeout(() => setFlashcardStatus('idle'), 2000);
                        } catch {
                          setFlashcardStatus('idle');
                        }
                      }}
                      disabled={flashcardStatus === 'generating'}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors text-[10px]"
                      aria-label={flashcardStatus === 'done' ? 'Flashcards created!' : 'Create flashcards'}
                      title={flashcardStatus === 'done' ? 'Flashcards created!' : 'Generate flashcards from conversation'}
                    >
                      {flashcardStatus === 'done' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-emerald-400">
                          <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                          <path d="M8 .75a.75.75 0 0 1 .697.473l1.524 3.84 3.84 1.524a.75.75 0 0 1 0 1.396l-3.84 1.524-1.524 3.84a.75.75 0 0 1-1.394 0L5.78 9.507l-3.84-1.524a.75.75 0 0 1 0-1.396l3.84-1.524L7.303 1.223A.75.75 0 0 1 8 .75Z" />
                        </svg>
                      )}
                      {flashcardStatus === 'done' ? 'Created!' : flashcardStatus === 'generating' ? '...' : 'Cards'}
                    </button>
                    {videoId && segments.length > 0 && (
                      <>
                        <button
                          onClick={async () => {
                            if (takeaways) { setTakeaways(null); return; }
                            setTakeawaysLoading(true);
                            try {
                              const resp = await fetch('/api/key-takeaways', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ segments, videoTitle }),
                              });
                              const data = await resp.json();
                              if (data.takeaways) setTakeaways(data.takeaways);
                            } catch { /* ignore */ }
                            setTakeawaysLoading(false);
                          }}
                          disabled={takeawaysLoading}
                          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-colors ${
                            takeaways
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.06]'
                          }`}
                          title="Key takeaways"
                        >
                          {takeawaysLoading ? (
                            <div className="w-3 h-3 border border-slate-500/40 border-t-slate-400 rounded-full animate-spin" />
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                              <path fillRule="evenodd" d="M11.986 3H12a2 2 0 0 1 2 2v6a2 2 0 0 1-1.5 1.937V7A2.5 2.5 0 0 0 10 4.5H4.063A2 2 0 0 1 6 3h.014A2.25 2.25 0 0 1 8.25 1h-.5a2.25 2.25 0 0 1 2.236 2ZM10 6H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1Zm-3 2.75a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 1.5 0v-3.5Zm3.5 0a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 1.5 0v-3.5Z" clipRule="evenodd" />
                            </svg>
                          )}
                          TL;DR
                        </button>
                        <QuizButton videoId={videoId} videoTitle={videoTitle} segments={segments} onSeek={onSeek} />
                        <VocabularyButton videoId={videoId} videoTitle={videoTitle} segments={segments} onSeek={onSeek} />
                        <button
                          onClick={() => {
                            // Build a quick quiz prompt from current section
                            const nearby = segments.filter(
                              (s) => Math.abs(s.offset - currentTime) < 120
                            );
                            const context = nearby.map((s) => s.text).join(' ').slice(0, 300);
                            const prompt = context
                              ? `Ask me a quick quiz question to test my understanding of what was just discussed: "${context.slice(0, 150)}..."`
                              : 'Ask me a quick quiz question about what we just watched.';
                            submitMessage(prompt);
                          }}
                          disabled={isStreaming}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                          title="Quick quiz about current section"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                            <path fillRule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z" clipRule="evenodd" />
                          </svg>
                          Quick Q
                        </button>
                        <button
                          onClick={async () => {
                            if (digestOpen) { setDigestOpen(false); return; }
                            setDigestOpen(true);
                            if (!digestData) {
                              setDigestLoading(true);
                              try {
                                const resp = await fetch('/api/key-takeaways', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ segments, videoTitle }),
                                });
                                const data = await resp.json();
                                if (data.takeaways) setDigestData({ takeaways: data.takeaways });
                              } catch { /* ignore */ }
                              setDigestLoading(false);
                            }
                          }}
                          disabled={digestLoading}
                          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-colors ${
                            digestOpen
                              ? 'bg-sky-500/15 text-sky-400'
                              : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.06]'
                          }`}
                          title="Video digest summary"
                        >
                          {digestLoading ? (
                            <div className="w-3 h-3 border border-slate-500/40 border-t-slate-400 rounded-full animate-spin" />
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                              <path d="M2.5 3A1.5 1.5 0 0 0 1 4.5v.793c.026.009.051.02.076.032L7.674 8.51c.206.1.446.1.652 0l6.598-3.185A.755.755 0 0 1 15 5.293V4.5A1.5 1.5 0 0 0 13.5 3h-11Z" />
                              <path d="M15 6.954 8.978 9.86a2.25 2.25 0 0 1-1.956 0L1 6.954V11.5A1.5 1.5 0 0 0 2.5 13h11a1.5 1.5 0 0 0 1.5-1.5V6.954Z" />
                            </svg>
                          )}
                          Digest
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => {
                        if (clearConfirm) {
                          setMessages([]); setInput(''); saveChatHistory(videoId, []); setClearConfirm(false);
                        } else {
                          setClearConfirm(true);
                          setTimeout(() => setClearConfirm(false), 2000);
                        }
                      }}
                      className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors text-[10px] ${clearConfirm ? 'text-red-400 bg-red-500/10' : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.06]'}`}
                      aria-label="Clear chat"
                      title="Clear conversation"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                        <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5A.75.75 0 0 1 9.95 6Z" clipRule="evenodd" />
                      </svg>
                      {clearConfirm ? 'Confirm?' : 'Clear'}
                    </button>
                  </>
                )}
                {/* Chat search toggle */}
                {messages.length > 2 && (
                  <button
                    onClick={() => { setChatSearchOpen((v) => !v); if (chatSearchOpen) setChatSearch(''); }}
                    className={`p-1 rounded-md transition-colors ${chatSearchOpen ? 'text-chalk-accent bg-chalk-accent/10' : 'text-slate-600 hover:text-slate-400 hover:bg-white/[0.04]'}`}
                    title="Search chat"
                    aria-label="Search chat messages"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                      <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={onToggle}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                  aria-label="Close chat (Escape)"
                >
                  <kbd className="text-[10px] text-slate-600 font-mono">Esc</kbd>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Chat search bar */}
            {chatSearchOpen && (
              <div className="px-3 py-1.5 border-b border-white/[0.06] flex items-center gap-2">
                <input
                  type="text"
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                  placeholder="Search messages..."
                  className="flex-1 bg-transparent text-xs text-chalk-text placeholder:text-slate-600 outline-none"
                  autoFocus
                />
                {chatSearch && (
                  <span className="text-[10px] text-slate-500 tabular-nums">
                    {messages.filter((m) => m.content.toLowerCase().includes(chatSearch.toLowerCase())).length} matches
                  </span>
                )}
              </div>
            )}

            {/* Scroll progress bar */}
            {messages.length > 2 && scrollProgress > 0 && scrollProgress < 1 && (
              <div className="h-[2px] bg-white/[0.03] shrink-0">
                <div className="h-full bg-chalk-accent/30 transition-[width] duration-100" style={{ width: `${Math.round(scrollProgress * 100)}%` }} />
              </div>
            )}

            {/* Conversation title — updates to latest topic when questions diverge */}
            {messages.length > 0 && (() => {
              const userMsgs = messages.filter((m) => m.role === 'user');
              if (userMsgs.length === 0) return null;
              let source = userMsgs[0];
              if (userMsgs.length >= 3) {
                const firstWords = new Set(userMsgs[0].content.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
                const lastWords = userMsgs[userMsgs.length - 1].content.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
                const overlap = lastWords.filter((w) => firstWords.has(w)).length;
                if (firstWords.size > 0 && lastWords.length > 0 && overlap / Math.max(firstWords.size, lastWords.length) < 0.3) {
                  source = userMsgs[userMsgs.length - 1];
                }
              }
              const title = source.content.length > 40 ? source.content.slice(0, 40).trim() + '...' : source.content;
              return (
                <div className="px-4 py-1 border-b border-chalk-border/10">
                  <span className="text-[10px] text-slate-600 italic truncate block">{title}</span>
                </div>
              );
            })()}

            {/* Messages */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              onClick={() => ctxMenu && setCtxMenu(null)}
              aria-live="polite"
              className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-4"
              style={{ overscrollBehavior: 'contain' }}
            >
              {/* Key takeaways card */}
              {takeaways && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-medium text-emerald-400">Key Takeaways</span>
                    <button
                      onClick={() => setTakeaways(null)}
                      className="text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                        <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                      </svg>
                    </button>
                  </div>
                  <ul className="space-y-1.5">
                    {takeaways.map((t, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-emerald-500 text-[10px] mt-0.5 shrink-0">&#x2022;</span>
                        <span className="text-[11px] text-slate-300 leading-relaxed flex-1">{t.text}</span>
                        {t.timestamp > 0 && (
                          <button
                            onClick={() => onSeek(t.timestamp)}
                            className="text-[9px] font-mono text-emerald-500/60 hover:text-emerald-400 shrink-0 transition-colors"
                          >
                            {formatTimestamp(t.timestamp)}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}

              {/* Video digest card */}
              {digestOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl bg-gradient-to-br from-sky-500/10 via-indigo-500/5 to-violet-500/10 border border-sky-500/20 overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-sky-500/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-sky-400">
                          <path d="M2.5 3A1.5 1.5 0 0 0 1 4.5v.793c.026.009.051.02.076.032L7.674 8.51c.206.1.446.1.652 0l6.598-3.185A.755.755 0 0 1 15 5.293V4.5A1.5 1.5 0 0 0 13.5 3h-11Z" />
                          <path d="M15 6.954 8.978 9.86a2.25 2.25 0 0 1-1.956 0L1 6.954V11.5A1.5 1.5 0 0 0 2.5 13h11a1.5 1.5 0 0 0 1.5-1.5V6.954Z" />
                        </svg>
                        <span className="text-xs font-semibold text-sky-300">Video Digest</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const last = segments.length > 0 ? segments[segments.length - 1] : null;
                            const dur = last ? Math.round((last.offset + (last.duration || 0)) / 60) : 0;
                            const takeawayText = digestData?.takeaways?.map((t, i) => `${i + 1}. ${t.text}`).join('\n') || 'No takeaways';
                            const chatCount = messages.filter((m) => m.role === 'user').length;
                            const text = `📋 Video Digest: ${videoTitle || 'Video'}\n\n⏱ Duration: ~${dur} min · ${segments.length} segments\n💬 ${chatCount} questions asked\n\n✨ Key Takeaways:\n${takeawayText}\n\n—Chalk Video Learning Assistant`;
                            navigator.clipboard.writeText(text);
                          }}
                          className="text-[9px] text-sky-500/60 hover:text-sky-400 transition-colors"
                          title="Copy digest"
                        >
                          Copy
                        </button>
                        <button onClick={() => setDigestOpen(false)} className="text-slate-500 hover:text-slate-300 transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                            <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 truncate">{videoTitle || 'Untitled Video'}</p>
                  </div>
                  <div className="px-4 py-2.5">
                    {/* Stats row */}
                    <div className="flex items-center gap-4 mb-2.5">
                      {segments.length > 0 && (() => {
                        const last = segments[segments.length - 1];
                        const dur = Math.round((last.offset + (last.duration || 0)) / 60);
                        return <span className="text-[10px] text-slate-500">~{dur} min</span>;
                      })()}
                      <span className="text-[10px] text-slate-500">{segments.length} segments</span>
                      <span className="text-[10px] text-slate-500">{messages.filter((m) => m.role === 'user').length} questions</span>
                    </div>
                    {/* Takeaways */}
                    {digestLoading ? (
                      <div className="flex items-center gap-2 py-3">
                        <div className="w-3 h-3 border border-sky-500/40 border-t-sky-400 rounded-full animate-spin" />
                        <span className="text-[10px] text-slate-500">Generating digest...</span>
                      </div>
                    ) : digestData?.takeaways ? (
                      <div>
                        <span className="text-[10px] font-medium text-sky-400/80 uppercase tracking-wider">Key Takeaways</span>
                        <ul className="mt-1.5 space-y-1.5">
                          {digestData.takeaways.map((t, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-sky-500/70 text-[10px] mt-0.5 shrink-0">{i + 1}.</span>
                              <span className="text-[11px] text-slate-300 leading-relaxed flex-1">{t.text}</span>
                              {t.timestamp > 0 && (
                                <button
                                  onClick={() => onSeek(t.timestamp)}
                                  className="text-[9px] font-mono text-sky-500/50 hover:text-sky-400 shrink-0 transition-colors"
                                >
                                  {formatTimestamp(t.timestamp)}
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500 py-2">Could not generate digest.</p>
                    )}
                    {/* What you explored */}
                    {messages.filter((m) => m.role === 'user').length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-sky-500/10">
                        <span className="text-[10px] font-medium text-indigo-400/80 uppercase tracking-wider">What You Explored</span>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {messages.filter((m) => m.role === 'user').slice(-6).map((m) => {
                            const preview = m.content.length > 30 ? m.content.slice(0, 30) + '...' : m.content;
                            return (
                              <span key={m.id} className="text-[9px] text-indigo-300/70 px-1.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/15">
                                {preview}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Learning path breadcrumb */}
              {messages.filter((m) => m.role === 'user').length >= 2 && (
                <div className="flex items-center gap-1 flex-wrap px-1 pb-1">
                  <span className="text-[9px] text-slate-600 shrink-0">Path:</span>
                  {messages
                    .filter((m) => m.role === 'user')
                    .slice(-5)
                    .map((m, i) => {
                      const words = m.content.split(/\s+/).filter((w) => w.length > 3).slice(0, 3).join(' ');
                      const label = words.length > 20 ? words.slice(0, 20) + '...' : words;
                      return (
                        <span key={m.id} className="flex items-center gap-1">
                          {i > 0 && <span className="text-[8px] text-slate-700">&rarr;</span>}
                          <span className="text-[9px] text-slate-500 px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/[0.05]">{label}</span>
                        </span>
                      );
                    })}
                </div>
              )}

              {messages.length === 0 && (
                <>
                  {/* Video context card */}
                  {videoId && (
                    <div className="flex items-center gap-3 px-4 pt-3">
                      <img
                        src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`}
                        alt=""
                        className="w-16 h-9 object-cover rounded-md bg-chalk-surface shrink-0"
                      />
                      <div className="min-w-0">
                        {videoTitle && <p className="text-[11px] text-chalk-text truncate font-medium">{videoTitle}</p>}
                        <p className="text-[9px] text-slate-600">{segments.length > 0 ? `${segments.length} segments` : 'No transcript'}</p>
                      </div>
                    </div>
                  )}
                  {(() => {
                    const hour = new Date().getHours();
                    const greeting = hour < 6 ? 'Late night study grind!' : hour < 12 ? 'Good morning study session!' : hour < 17 ? 'Afternoon learning!' : hour < 21 ? 'Evening study time!' : 'Night owl session!';
                    return (
                      <div className="text-center pt-2">
                        <span className="text-[10px] text-slate-600">{greeting}</span>
                      </div>
                    );
                  })()}
                  {segments.length === 0 && (
                    <div className="text-center px-4 pt-2">
                      <p className="text-[11px] text-slate-500">
                        No transcript available — responses will be based on the video title only
                      </p>
                    </div>
                  )}
                  <SuggestionRows
                    currentTime={currentTime}
                    hasTranscript={segments.length > 0}
                    segments={segments}
                    onSelect={handleSuggestionSelect}
                    videoTitle={videoTitle}
                  />
                </>
              )}
              {messages.map((msg, i) => {
                const searchActive = chatSearch.trim().length > 0;
                const matchesSearch = searchActive && msg.content.toLowerCase().includes(chatSearch.toLowerCase());
                const milestone = [5, 10, 20, 50, 100].includes(i + 1) ? i + 1 : 0;
                const turnNum = msg.role === 'user' ? messages.slice(0, i + 1).filter((m) => m.role === 'user').length : 0;
                const showDepth = turnNum > 0 && turnNum % 5 === 0;
                return (
                <div
                  key={msg.id}
                  className={`relative group/msg ${searchActive && !matchesSearch ? 'opacity-25 transition-opacity duration-200' : 'transition-opacity duration-200'}`}
                  onContextMenu={(e) => {
                    if (msg.role !== 'assistant' || !msg.content) return;
                    e.preventDefault();
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setCtxMenu({ msgId: msg.id, x: e.clientX - rect.left, y: e.clientY - rect.top });
                  }}
                >
                  {milestone > 0 && (
                    <p className="text-center text-[8px] text-slate-600 py-1">{milestone} messages</p>
                  )}
                  {showDepth && (
                    <div className="flex items-center gap-1.5 px-2 py-0.5">
                      <div className="flex-1 h-px bg-slate-700/20" />
                      <span className="text-[7px] text-slate-700 tabular-nums">Turn {turnNum}</span>
                      <div className="flex-1 h-px bg-slate-700/20" />
                    </div>
                  )}
                  {msg.role === 'user' && turnNum >= 3 && (() => {
                    const firstQ = messages.find((m) => m.role === 'user');
                    if (!firstQ || firstQ.id === msg.id) return null;
                    const firstWords = new Set(firstQ.content.toLowerCase().split(/\s+/).filter((w) => w.length > 4));
                    const curWords = msg.content.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
                    const shared = curWords.filter((w) => firstWords.has(w)).length;
                    if (firstWords.size > 2 && curWords.length > 2 && shared === 0) return (
                      <p className="text-center text-[7px] text-slate-700/60 py-0.5" title="Your question has shifted from the original topic">~ topic shifted ~</p>
                    );
                    return null;
                  })()}
                  {msg.role === 'user' && msg.content.trim().endsWith('?') && (() => {
                    const lq = msg.content.toLowerCase();
                    const type = /\b(what|which|who|where|when)\b/.test(lq) ? 'what' : /\b(why|how come|what caused)\b/.test(lq) ? 'why' : /\b(how|in what way|what steps)\b/.test(lq) ? 'how' : /\b(compare|vs\.?|versus|difference|differ|similarities)\b/.test(lq) ? 'compare' : null;
                    if (!type) return null;
                    const colors: Record<string, string> = { what: 'text-sky-400/40', why: 'text-purple-400/40', how: 'text-teal-400/40', compare: 'text-orange-400/40' };
                    const labels: Record<string, string> = { what: 'Factual question', why: 'Analytical question', how: 'Procedural question', compare: 'Comparative question' };
                    return <span className={`text-[7px] ${colors[type]} ml-1`} title={labels[type]}>{type}</span>;
                  })()}
                  {searchActive && matchesSearch && (
                    <div className="absolute left-0 w-0.5 h-full bg-chalk-accent/50 rounded-full" />
                  )}
                  {(() => {
                    const isLong = msg.role === 'assistant' && msg.content.length > 300 && i < messages.length - 1;
                    const isCollapsed = isLong && !expandedMsgs.has(msg.id);
                    const displayContent = isCollapsed ? msg.content.slice(0, 200).trim() + '...' : msg.content;
                    return (
                      <>
                        <VideoAIMessage
                          role={msg.role}
                          content={displayContent}
                          isStreaming={isStreaming && msg.id === messages[messages.length - 1]?.id && msg.role === 'assistant'}
                          thinking={msg.thinking}
                          thinkingDuration={msg.thinkingDuration}
                          responseDuration={msg.responseDuration}
                          messageId={msg.id}
                          onSeek={onSeek}
                          videoId={videoId}
                          pinned={pinnedIds.has(msg.id)}
                          onTogglePin={msg.role === 'assistant' ? () => togglePin(msg.id) : undefined}
                          maxContentLength={maxContentLength}
                        />
                        {isLong && (
                          <button
                            onClick={() => setExpandedMsgs((prev) => { const n = new Set(prev); if (n.has(msg.id)) n.delete(msg.id); else n.add(msg.id); return n; })}
                            className="text-[9px] text-chalk-accent/70 hover:text-chalk-accent mt-0.5 ml-1 transition-colors"
                          >
                            {isCollapsed ? 'Show more' : 'Show less'}
                          </button>
                        )}
                        {msg.role === 'assistant' && msg.model && msg.content && (
                          <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[8px] font-medium bg-white/[0.04] text-slate-600 border border-white/[0.06]" title={msg.model === 'opus' ? 'Claude Opus — deep reasoning model' : msg.model === 'sonnet' ? 'Claude Sonnet — balanced model' : msg.model === 'haiku' ? 'Claude Haiku — fast model' : msg.model}>
                            {msg.model === 'opus' ? 'Opus' : msg.model === 'sonnet' ? 'Sonnet' : msg.model === 'haiku' ? 'Haiku' : msg.model}
                          </span>
                        )}
                        {msg.role === 'assistant' && msg.content.length > 50 && (() => {
                          const lc = msg.content.toLowerCase();
                          const pos = /\b(great|excellent|correct|exactly|perfect|well done|absolutely|indeed)\b/.test(lc);
                          const neg = /\b(unfortunately|however|difficult|complex|wrong|error|mistake|careful)\b/.test(lc);
                          if (!pos && !neg) return null;
                          return (
                            <span className={`inline-block ml-1 mt-0.5 text-[8px] ${pos && !neg ? 'text-emerald-500/60' : neg && !pos ? 'text-amber-500/60' : 'text-slate-600'}`} title={pos && !neg ? 'Positive tone' : neg && !pos ? 'Cautionary tone' : 'Mixed tone'}>
                              {pos && !neg ? '\u2714' : neg && !pos ? '\u26A0' : '\u2696'}
                            </span>
                          );
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 80 && (() => {
                          const lc2 = msg.content.toLowerCase();
                          if (/\b(however|but actually|correction|not quite|actually,|to clarify|that's not|incorrect)\b/.test(lc2)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-rose-500/10 text-rose-400/50 border border-rose-500/10" title="This response contains a correction or clarification">corrective</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 60 && (() => {
                          if (/\b(is defined as|refers to|means that|is known as|stands for|is a type of)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-blue-500/10 text-blue-400/50 border border-blue-500/10" title="Contains a definition — consider saving as flashcard">def</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 60 && (() => {
                          if (/\b(for example|for instance|such as|e\.g\.|like this:|consider this|imagine)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-emerald-500/10 text-emerald-400/50 border border-emerald-500/10" title="Contains examples">ex</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 60 && (() => {
                          if (/\b(think of it as|it's like|similar to|just as .{3,30} so too|analogy|metaphor|picture this|imagine .{3,20} as)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-violet-500/10 text-violet-400/50 border border-violet-500/10" title="Contains an analogy or metaphor">analogy</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 60 && (() => {
                          if (/\b(in summary|to sum up|the key points? (are|is)|overall,|the main takeaway|to summarize|in short|bottom line)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-cyan-500/10 text-cyan-400/50 border border-cyan-500/10" title="Contains a summary">summary</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 60 && (() => {
                          if (/\b(keep in mind|note that|be aware|important to note|one caveat|disclaimer|worth noting|bear in mind)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-yellow-500/10 text-yellow-400/50 border border-yellow-500/10" title="Contains a caveat or disclaimer">caveat</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 80 && (() => {
                          if (/\b(step \d|first,? .{5,30}(then|next)|follow these steps|step-by-step)\b/i.test(msg.content) && /^(\d+\.|[-*•])\s/m.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-teal-500/10 text-teal-400/50 border border-teal-500/10" title="Contains step-by-step instructions">steps</span>
                          );
                          if (/^(\d+\.|[-*•])\s/m.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-amber-500/10 text-amber-400/50 border border-amber-500/10" title="Contains a structured list">list</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 80 && (() => {
                          const words = msg.content.split(/\s+/).filter(Boolean);
                          const techWords = words.filter((w) => w.length >= 8);
                          const ratio = words.length > 0 ? techWords.length / words.length : 0;
                          if (ratio >= 0.15 && techWords.length >= 5) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-indigo-500/10 text-indigo-400/50 border border-indigo-500/10" title={`Technical density: ${Math.round(ratio * 100)}% long terms (${techWords.length}/${words.length})`}>tech</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && (() => {
                          const refs = msg.content.match(/\[\d+:\d{2}\]/g);
                          if (refs && refs.length >= 2) {
                            const times = refs.map((r) => { const p = r.slice(1, -1).split(':'); return parseInt(p[0]) * 60 + parseInt(p[1]); });
                            const spread = Math.max(...times) - Math.min(...times);
                            if (spread >= 120) return (
                              <>
                                <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-sky-500/10 text-sky-400/50 border border-sky-500/10 tabular-nums" title={`${refs.length} timestamp references`}>{refs.length} refs</span>
                                <span className="inline-block ml-0.5 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-purple-500/10 text-purple-400/50 border border-purple-500/10" title={`Cross-references ${Math.round(spread / 60)}min of video`}>cross-ref</span>
                              </>
                            );
                            return <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-sky-500/10 text-sky-400/50 border border-sky-500/10 tabular-nums" title={`${refs.length} timestamp references`}>{refs.length} refs</span>;
                          }
                          return null;
                        })()}
                        {msg.role === 'assistant' && (() => {
                          const wc = msg.content.split(/\s+/).filter(Boolean).length;
                          if (wc > 0 && wc <= 100 && /\[\d+:\d{2}\]/.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-green-500/10 text-green-400/50 border border-green-500/10" title={`Concise answer: ${wc} words with timestamp citation`}>concise</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 60 && (() => {
                          if (/\b(to clarify|in other words|what I mean is|put simply|to be clear|essentially|that is to say|more precisely)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-lime-500/10 text-lime-400/50 border border-lime-500/10" title="Contains a clarification">clarify</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 20 && (() => {
                          if (/\b(great question|good thinking|you're on the right track|exactly right|well done|nice observation|good point|excellent question)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-pink-500/10 text-pink-400/50 border border-pink-500/10" title="Contains encouragement">encourage</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 40 && (() => {
                          if (/\b(be careful|watch out|common mistake|pitfall|don't confuse|important to remember|be aware that|careful not to)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-rose-500/10 text-rose-400/50 border border-rose-500/10" title="Contains a warning or pitfall">warn</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'user' && messages.indexOf(msg) > 0 && (() => {
                          if (/\b(what about|and also|how about|can you explain|tell me more|going back to|you mentioned|earlier you said|follow.?up|in addition)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-indigo-500/10 text-indigo-400/50 border border-indigo-500/10" title="Follow-up referencing prior context">follow-up</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 40 && (() => {
                          if (/\b(actually|correction|I should clarify|let me rephrase|more accurately|to be precise|I misspoke|upon reflection)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-amber-500/10 text-amber-400/50 border border-amber-500/10" title="Contains a correction or clarification">correction</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 60 && (() => {
                          const bullets = (msg.content.match(/(?:^|\n)\s*(?:\d+\.|[-•])\s/g) || []).length;
                          const ordinals = (msg.content.match(/\b(?:First(?:ly)?|Second(?:ly)?|Third(?:ly)?|Finally)\b/gi) || []).length;
                          if (bullets + ordinals >= 3) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-cyan-500/10 text-cyan-400/50 border border-cyan-500/10" title={`Multi-part answer: ${bullets + ordinals} sections detected`}>multi-part</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 20 && (() => {
                          if (/\b(you're right|that's correct|exactly|precisely|I agree|you nailed it|spot on|absolutely right)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-emerald-500/10 text-emerald-400/50 border border-emerald-500/10" title="AI agrees with your point">agrees</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 40 && (() => {
                          if (/\b(getting back to|the main point is|to answer your question|more importantly|the key takeaway|let's focus on|what matters here)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-violet-500/10 text-violet-400/50 border border-violet-500/10" title="AI redirects or refocuses the conversation">redirect</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 40 && (() => {
                          if (/\b(might be|could be|possibly|perhaps|it seems|one possibility|hypothetically|it's likely|I suspect|my guess)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-sky-500/10 text-sky-400/50 border border-sky-500/10" title="Contains speculative or hypothetical language">hypothesis</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 40 && (() => {
                          if (/\b(in other words|to elaborate|more specifically|to put it another way|what I mean is|to expand on|breaking this down|let me explain)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-rose-500/10 text-rose-400/50 border border-rose-500/10" title="Contains elaboration or expansion">elaboration</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 40 && (() => {
                          if (/\b(according to|research shows|studies indicate|experts say|the literature|evidence suggests|it's documented|published in)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-teal-500/10 text-teal-400/50 border border-teal-500/10" title="References external sources or research">reference</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 40 && (() => {
                          if (/\b(simply put|in simple terms|to simplify|basically|the short answer|in a nutshell|bottom line|long story short)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-lime-500/10 text-lime-400/50 border border-lime-500/10" title="Simplifies or summarizes content">simplified</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 40 && (() => {
                          if (/\b(I should note|keep in mind|important to remember|caveat|disclaimer|worth mentioning|I should mention|be aware)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-orange-500/10 text-orange-400/50 border border-orange-500/10" title="Contains a disclaimer or important caveat">disclaimer</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'user' && (() => {
                          const qmarks = (msg.content.match(/\?/g) || []).length;
                          if (qmarks >= 2) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-pink-500/10 text-pink-400/50 border border-pink-500/10" title={`${qmarks} questions in one message`}>{qmarks} Qs</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 60 && (() => {
                          if (/\b(on one hand|on the other hand|compared to|in contrast|while .+ is|whereas|the difference|pros and cons)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-indigo-500/10 text-indigo-400/50 border border-indigo-500/10" title="Contains comparison or contrast">comparison</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 20 && (() => {
                          if (/\b(great question|good thinking|you're on the right track|excellent point|that's insightful|well observed|keep going|nice catch)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-yellow-500/10 text-yellow-400/50 border border-yellow-500/10" title="Contains encouraging language">encouraging</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 40 && (() => {
                          if (/\b(let me teach|here's how|the concept is|to understand|think about it|the idea behind|the principle|fundamentally)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-purple-500/10 text-purple-400/50 border border-purple-500/10" title="Adopts a teaching or explanatory tone">teaching</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 40 && (() => {
                          if (/\b(for context|to give you context|the background is|historically|for background|the history|context here|some context)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-slate-500/10 text-slate-400/50 border border-slate-500/10" title="Provides additional context or background">context</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 40 && (() => {
                          if (/\b(moving on|switching gears|on a different note|turning to|now let's|speaking of|relatedly|that brings us)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-cyan-500/10 text-cyan-400/50 border border-cyan-500/10" title="Contains a topic transition">transition</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(I can't|I don't have access|beyond my|I'm not able|limitation|I cannot|outside my scope|I'm unable|unfortunately I)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-red-500/10 text-red-400/50 border border-red-500/10" title="Acknowledges a limitation">limitation</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(you should|I recommend|try to|consider|make sure|don't forget to|go ahead and|take a look at)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-green-500/10 text-green-400/50 border border-green-500/10" title="Suggests an action or recommendation">action</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 40 && (() => {
                          if (/\b(to recap|so far we've|let me summarize|in summary|we've covered|to sum up|the main points|we discussed)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-amber-500/10 text-amber-400/50 border border-amber-500/10" title="Recaps or summarizes the discussion">recap</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 40 && (() => {
                          if (/\b(it depends|nuanced|it's complicated|there's more to it|not black and white|on the spectrum|varies|context matters|it's relative)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-fuchsia-500/10 text-fuchsia-400/50 border border-fuchsia-500/10" title="Adds nuance or complexity to the answer">nuanced</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(I understand your|that must be|I can see why|I appreciate|that makes sense|I hear you|valid concern|understandable)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-pink-500/10 text-pink-400/50 border border-pink-500/10" title="Shows empathy or understanding">empathetic</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(I'm not sure|I'm uncertain|hard to say|unclear|ambiguous|debatable|open question|I don't know|it's hard to tell)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-gray-500/10 text-gray-400/50 border border-gray-500/10" title="Expresses uncertainty">uncertain</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(definitely|certainly|absolutely|without a doubt|I'm confident|clearly|no question|for sure|undoubtedly|I'm certain)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-emerald-500/10 text-emerald-400/50 border border-emerald-500/10" title="Expresses high confidence">confident</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 40 && (() => {
                          if (/\b(specifically|precisely|exactly|to be exact|the exact|pinpointing|narrowing down|to be precise|the precise)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-sky-500/10 text-sky-400/50 border border-sky-500/10" title="Contains precise or exact language">precise</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 60 && (() => {
                          const listMatches = (msg.content.match(/(?:^|\n)\s*(?:\d+\.|[-*])\s/g) || []).length;
                          if (listMatches >= 3) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-violet-500/10 text-violet-400/50 border border-violet-500/10" title={`Contains ${listMatches} list items`}>structured</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 40 && (() => {
                          if (/\b(actually|let me correct|I should clarify|to be more accurate|correction|more accurately|I was wrong|let me rephrase)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-orange-500/10 text-orange-400/50 border border-orange-500/10" title="Contains self-correction or clarification">corrected</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 40 && (() => {
                          if (/\b(for example|for instance|such as|e\.g\.|to illustrate|consider this|imagine|suppose that)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-teal-500/10 text-teal-400/50 border border-teal-500/10" title="Contains examples or illustrations">examples</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(I suggest|you might want|consider trying|I recommend|you could try|it would be worth|try to)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-lime-500/10 text-lime-400/50 border border-lime-500/10" title="Contains suggestions or recommendations">suggests</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 40 && (() => {
                          if (/\b(in summary|to summarize|overall|in conclusion|the key takeaway|the main point|to sum up|in short)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-cyan-500/10 text-cyan-400/50 border border-cyan-500/10" title="Contains a summary or conclusion">summary</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 40 && (() => {
                          if (/\b(think of it like|similar to how|just like|it's like|analogous to|comparable to|in the same way)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-amber-500/10 text-amber-400/50 border border-amber-500/10" title="Contains an analogy or comparison">analogy</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(is defined as|refers to|means that|in other words|also known as|stands for|which means|i\.e\.|that is to say)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-fuchsia-500/10 text-fuchsia-400/50 border border-fuchsia-500/10" title="Contains definitions or explanations">defines</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 40 && (() => {
                          if (/\b(keep in mind|it's worth noting|be aware|important to note|one thing to consider|bear in mind|do note that|worth mentioning)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-rose-500/10 text-rose-400/50 border border-rose-500/10" title="Contains caveats or important notes">caveat</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 40 && (() => {
                          if (/\b(it's possible that|potentially|might be|could be that|perhaps|one possibility is|there's a chance|speculatively)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-purple-500/10 text-purple-400/50 border border-purple-500/10" title="Contains speculative language">speculates</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(I think|in my opinion|it seems|arguably|I believe|from my perspective|as far as I can tell)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-amber-500/10 text-amber-400/50 border border-amber-500/10" title="Contains hedging language">hedges</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 40 && (() => {
                          if (/\b(in general|broadly speaking|as a rule|typically|for the most part|on the whole|by and large)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-cyan-500/10 text-cyan-400/50 border border-cyan-500/10" title="Contains generalization language">generalizes</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(admittedly|granted|I'll admit|to be fair|I concede|you have a point|fair enough)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-emerald-500/10 text-emerald-400/50 border border-emerald-500/10" title="Contains concession language">concedes</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 40 && (() => {
                          if (/\b(to some extent|in certain cases|under specific conditions|with some exceptions|depending on|provided that|as long as)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-pink-500/10 text-pink-400/50 border border-pink-500/10" title="Contains qualification language">qualifies</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 40 && (() => {
                          if (/\b(first|second|third|firstly|secondly|thirdly|lastly|finally|moreover|furthermore)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-blue-500/10 text-blue-400/50 border border-blue-500/10" title="Contains enumeration language">enumerates</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 40 && (() => {
                          if (/\b(in other words|that is to say|put differently|to put it simply|essentially|basically|what I mean is)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-orange-500/10 text-orange-400/50 border border-orange-500/10" title="Contains restatement language">restates</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(importantly|crucially|significantly|notably|it's worth noting|key point|above all|most importantly)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-red-500/10 text-red-400/50 border border-red-500/10" title="Contains emphasis language">emphasizes</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(perhaps|maybe|possibly|might|could be|it seems|appears to|likely|unlikely)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-yellow-500/10 text-yellow-400/50 border border-yellow-500/10" title="Contains hedging language">hedges</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(earlier|later|previously|before|after|at this point|meanwhile|subsequently|at \d+:\d{2})\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-cyan-500/10 text-cyan-400/50 border border-cyan-500/10" title="Contains temporal reference">temporal</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(if|unless|provided that|assuming|in case|supposing|when|whenever)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-purple-500/10 text-purple-400/50 border border-purple-500/10" title="Contains conditional language">conditional</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(you should|you can|try to|make sure|be sure to|you need to|you'll want to|go ahead and)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-emerald-500/10 text-emerald-400/50 border border-emerald-500/10" title="Contains instructional language">instructs</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(more than|less than|better|worse|similar to|different from|compared to|in comparison|larger|smaller|greater|fewer)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-teal-500/10 text-teal-400/50 border border-teal-500/10" title="Contains comparative language">compares</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(because|therefore|as a result|consequently|due to|since|thus|hence|so that|in order to)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-orange-500/10 text-orange-400/50 border border-orange-500/10" title="Contains causal language">causal</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(for example|for instance|such as|e\.g\.|like when|to illustrate|consider the case)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-violet-500/10 text-violet-400/50 border border-violet-500/10" title="Contains exemplification">examples</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(is defined as|means that|refers to|definition of|known as|described as|understood as)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-sky-500/10 text-sky-400/50 border border-sky-500/10" title="Contains definition">defines</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(\d+\s*%|\d+\s*percent|\d+\s*million|\d+\s*billion|\d+\s*thousand|\d+\s*trillion)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-emerald-500/10 text-emerald-400/50 border border-emerald-500/10" title="Contains quantitative data">numeric</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(step 1|first step|start by|begin with|next step|then you|finally|last step|follow these)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-lime-500/10 text-lime-400/50 border border-lime-500/10" title="Contains procedural/how-to content">how-to</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(if[\s\S]{1,40}then|would[\s\S]{1,30}if|assuming that|depending on|in the event|on the condition)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-purple-500/10 text-purple-400/50 border border-purple-500/10" title="Contains conditional reasoning">conditional</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(compared to|versus|on the other hand|in contrast|whereas|while[\s\S]{1,30}also|differ from|similar to)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-amber-500/10 text-amber-400/50 border border-amber-500/10" title="Contains comparison">compares</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(imagine|suppose|what if|hypothetically|in theory|theoretically|could potentially|might possibly)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-rose-500/10 text-rose-400/50 border border-rose-500/10" title="Contains hypothetical reasoning">hypothetical</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(importantly|crucially|significantly|notably|especially|particularly|above all|most importantly)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-fuchsia-500/10 text-fuchsia-400/50 border border-fuchsia-500/10" title="Contains emphasis markers">emphasis</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(first|second|third|step by step|next|then|finally|lastly|in order to)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-sky-500/10 text-sky-400/50 border border-sky-500/10" title="Contains sequential language">sequential</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(like a|similar to|just as|think of it as|analogous|resembles|akin to|comparable to)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-teal-500/10 text-teal-400/50 border border-teal-500/10" title="Contains analogical reasoning">analogical</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(to clarify|in other words|put simply|what this means|to be clear|specifically|more precisely|let me explain)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-emerald-500/10 text-emerald-400/50 border border-emerald-500/10" title="Contains clarification">clarifying</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(in summary|to sum up|overall|in conclusion|to summarize|the key point|bottom line|all in all)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-violet-500/10 text-violet-400/50 border border-violet-500/10" title="Contains summary language">summarizing</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(if we|imagine|suppose|what if|hypothetically|in theory|could potentially|assuming)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-fuchsia-500/10 text-fuchsia-400/50 border border-fuchsia-500/10" title="Contains hypothetical language">hypothetical</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(however|on the other hand|nevertheless|conversely|whereas|although|despite|contrary to)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-amber-500/10 text-amber-400/50 border border-amber-500/10" title="Contains contrastive language">contrastive</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(definitely|certainly|absolutely|undoubtedly|without question|clearly|unquestionably|indisputably)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-blue-500/10 text-blue-400/50 border border-blue-500/10" title="Contains definitive language">definitive</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(I recommend|I suggest|you should consider|it would be wise|my advice|best practice|tip|pro tip)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-rose-500/10 text-rose-400/50 border border-rose-500/10" title="Contains advisory language">advisory</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(here's how|follow these steps|the process is|to do this|start by|make sure to|remember to|keep in mind)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-indigo-500/10 text-indigo-400/50 border border-indigo-500/10" title="Contains instructive language">instructive</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(great question|good point|excellent observation|that's interesting|wonderful|fascinating|insightful|astute)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-emerald-500/10 text-emerald-400/50 border border-emerald-500/10" title="Contains appreciative language">appreciative</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.length > 30 && (() => {
                          if (/\b(actually|in fact|correction|to clarify|more accurately|to be precise|strictly speaking|let me correct)\b/i.test(msg.content)) return (
                            <span className="inline-block ml-1 mt-0.5 px-1 py-px rounded text-[7px] font-medium bg-red-500/10 text-red-400/50 border border-red-500/10" title="Contains corrective language">corrective</span>
                          );
                          return null;
                        })()}
                        {msg.role === 'assistant' && msg.content.split(/\s+/).filter(Boolean).length > 100 && (() => {
                          const wc = msg.content.split(/\s+/).filter(Boolean).length;
                          const maxWc = Math.max(...messages.filter(m => m.role === 'assistant' && m.content).map(m => m.content.split(/\s+/).filter(Boolean).length));
                          const pct = maxWc > 0 ? Math.round((wc / maxWc) * 100) : 0;
                          return (
                            <div className="w-full h-0.5 mt-1 rounded-full bg-white/[0.03] overflow-hidden opacity-0 group-hover/msg:opacity-100 transition-opacity" title={`${wc} words (${pct}% of longest)`}>
                              <div className="h-full rounded-full bg-chalk-accent/20" style={{ width: `${pct}%` }} />
                            </div>
                          );
                        })()}
                        {msg.role === 'assistant' && msg.content && (
                          <span className="inline-flex items-center gap-0.5 ml-1 mt-0.5">
                            <button onClick={() => setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, rating: m.rating === 'up' ? undefined : 'up' } : m))} className={`p-0.5 rounded transition-colors ${msg.rating === 'up' ? 'text-emerald-400' : 'text-slate-700 hover:text-slate-500'}`} title="Helpful">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5"><path d="M2.09 15a1 1 0 0 0 1-1V8a1 1 0 1 0-2 0v6a1 1 0 0 0 1 1ZM5.765 13H4.09V8.24l2.74-5.48a.5.5 0 0 1 .67-.22l.26.13a1.5 1.5 0 0 1 .77 1.78L7.82 7h4.27a2 2 0 0 1 1.95 2.43l-.95 4.25A2 2 0 0 1 11.14 15H7.09a2 2 0 0 1-1.325-.5Z" /></svg>
                            </button>
                            <button onClick={() => setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, rating: m.rating === 'down' ? undefined : 'down' } : m))} className={`p-0.5 rounded transition-colors ${msg.rating === 'down' ? 'text-red-400' : 'text-slate-700 hover:text-slate-500'}`} title="Not helpful">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5"><path d="M13.91 1a1 1 0 0 0-1 1v6a1 1 0 1 0 2 0V2a1 1 0 0 0-1-1ZM10.235 3h1.675v4.76l-2.74 5.48a.5.5 0 0 1-.67.22l-.26-.13a1.5 1.5 0 0 1-.77-1.78L8.18 9H3.91a2 2 0 0 1-1.95-2.43l.95-4.25A2 2 0 0 1 4.86 1h4.05a2 2 0 0 1 1.325.5Z" /></svg>
                            </button>
                            {/* Quick emoji reactions */}
                            {[
                              { key: 'bulb', emoji: '\uD83D\uDCA1', label: 'Insightful' },
                              { key: 'check', emoji: '\u2705', label: 'Accurate' },
                              { key: 'fire', emoji: '\uD83D\uDD25', label: 'Amazing' },
                              { key: 'confused', emoji: '\uD83D\uDE15', label: 'Unclear' },
                            ].map((r) => {
                              const has = msg.reactions?.includes(r.key);
                              return (
                                <button
                                  key={r.key}
                                  onClick={() => setMessages((prev) => prev.map((m) => {
                                    if (m.id !== msg.id) return m;
                                    const cur = m.reactions || [];
                                    return { ...m, reactions: has ? cur.filter((x) => x !== r.key) : [...cur, r.key] };
                                  }))}
                                  className={`p-0.5 rounded text-[9px] transition-all ${has ? 'opacity-100 scale-110' : 'opacity-0 group-hover/msg:opacity-60 hover:!opacity-100'}`}
                                  title={r.label}
                                >{r.emoji}</button>
                              );
                            })}
                          </span>
                        )}
                      </>
                    );
                  })()}
                  {/* Copy + Save icons */}
                  {msg.role === 'assistant' && msg.content && (
                    <div className="absolute top-1 right-1 flex items-center gap-0.5">
                      <button
                        onClick={(e) => {
                          navigator.clipboard.writeText(msg.content);
                          copyCounts.current.set(msg.id, (copyCounts.current.get(msg.id) || 0) + 1);
                          const btn = e.currentTarget;
                          btn.dataset.copied = 'true';
                          setTimeout(() => { btn.dataset.copied = ''; }, 1200);
                        }}
                        className="p-0.5 rounded opacity-0 group-hover/msg:opacity-100 transition-opacity text-slate-600 hover:text-slate-300 data-[copied=true]:text-emerald-400"
                        title="Copy message"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                          <path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h2.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 1 .439 1.061V9.5A1.5 1.5 0 0 1 12 11V8.621a3 3 0 0 0-.879-2.121L9 4.379A3 3 0 0 0 6.879 3.5H5.5Z" />
                          <path d="M4 5a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 4 14h5a1.5 1.5 0 0 0 1.5-1.5V8.621a1.5 1.5 0 0 0-.44-1.06L7.94 5.439A1.5 1.5 0 0 0 6.878 5H4Z" />
                        </svg>
                      </button>
                      {(copyCounts.current.get(msg.id) || 0) >= 2 && (
                        <span className="text-[7px] text-slate-600 tabular-nums opacity-0 group-hover/msg:opacity-100 transition-opacity" title={`Copied ${copyCounts.current.get(msg.id)} times`}>{copyCounts.current.get(msg.id)}x</span>
                      )}
                      <button
                        onClick={() => toggleSave(msg.id)}
                        className={`p-0.5 rounded opacity-0 group-hover/msg:opacity-100 transition-opacity ${savedMsgIds.has(msg.id) ? '!opacity-100 text-yellow-400' : 'text-slate-600 hover:text-yellow-400'}`}
                        title={savedMsgIds.has(msg.id) ? 'Unsave message' : 'Save message'}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                          <path fillRule="evenodd" d="M11.986 3H12a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h.014A2.25 2.25 0 0 1 6.25 1h3.5a2.25 2.25 0 0 1 2.236 2ZM6.25 2.5a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5Z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          const snippet = msg.content.length > 280 ? msg.content.slice(0, 277) + '...' : msg.content;
                          const attribution = videoTitle ? `\n\n— Chalk AI on "${videoTitle}"` : '\n\n— Chalk AI';
                          navigator.clipboard.writeText(snippet + attribution);
                          const btn = e.currentTarget;
                          btn.dataset.shared = 'true';
                          setTimeout(() => { btn.dataset.shared = ''; }, 1200);
                        }}
                        className="p-0.5 rounded opacity-0 group-hover/msg:opacity-100 transition-opacity text-slate-600 hover:text-sky-400 data-[shared=true]:text-sky-400"
                        title="Share snippet"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                          <path d="M12 6a2 2 0 1 0-1.994-1.842L5.724 6.29a2 2 0 1 0 0 3.42l4.282 2.132a2 2 0 1 0 .666-1.342L6.39 8.368a2.037 2.037 0 0 0 0-.736l4.282-2.132A1.993 1.993 0 0 0 12 6Z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          const prevUser = messages.slice(0, messages.indexOf(msg)).reverse().find((m) => m.role === 'user');
                          const front = prevUser ? prevUser.content : 'Question';
                          const back = msg.content.length > 200 ? msg.content.slice(0, 197) + '...' : msg.content;
                          const key = videoId ? `chalk-quick-flashcards-${videoId}` : 'chalk-quick-flashcards';
                          try {
                            const cards = JSON.parse(localStorage.getItem(key) || '[]');
                            cards.push({ front, back, created: Date.now() });
                            localStorage.setItem(key, JSON.stringify(cards));
                          } catch { /* ignore */ }
                          const btn = e.currentTarget;
                          btn.dataset.saved = 'true';
                          setTimeout(() => { btn.dataset.saved = ''; }, 1200);
                        }}
                        className="p-0.5 rounded opacity-0 group-hover/msg:opacity-100 transition-opacity text-slate-600 hover:text-violet-400 data-[saved=true]:text-violet-400"
                        title="Save as flashcard"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                          <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9ZM5.5 5a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1h-5ZM5 8.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5ZM5.5 10.5a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3Z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => { setInput('Can you explain that more simply?'); }}
                        className="p-0.5 rounded opacity-0 group-hover/msg:opacity-100 transition-opacity text-slate-600 hover:text-amber-400"
                        title="Ask to simplify"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                          <path d="M8 1a.75.75 0 0 1 .75.75v1.5a3.75 3.75 0 0 1-3 3.675v1.325h1.5a.75.75 0 0 1 0 1.5h-1.5v3.5a.75.75 0 0 1-1.5 0v-3.5H2.75a.75.75 0 0 1 0-1.5h1.5V6.925a3.75 3.75 0 0 1-3-3.675V1.75A.75.75 0 0 1 2 1a.75.75 0 0 1 .75.75v1.5a2.25 2.25 0 0 0 4.5 0v-1.5A.75.75 0 0 1 8 1Z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => { const quote = msg.content.length > 100 ? msg.content.slice(0, 97) + '...' : msg.content; setInput(`> ${quote}\n\n`); }}
                        className="p-0.5 rounded opacity-0 group-hover/msg:opacity-100 transition-opacity text-slate-600 hover:text-cyan-400"
                        title="Quote reply"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                          <path d="M3.3 12.04a.75.75 0 0 1-1.1-1.02L5.17 8 2.2 4.98a.75.75 0 0 1 1.1-1.02l3.5 3.56a.75.75 0 0 1 0 1.02l-3.5 3.5ZM8.75 12a.75.75 0 0 1 0-1.5h4.5a.75.75 0 0 1 0 1.5h-4.5Z" />
                        </svg>
                      </button>
                      {msg.content.length > 200 && (
                        <span className="text-[7px] text-slate-700 tabular-nums opacity-0 group-hover/msg:opacity-100 transition-opacity" title={`${msg.content.length} characters`}>{msg.content.length > 999 ? `${(msg.content.length / 1000).toFixed(1)}k` : msg.content.length}c</span>
                      )}
                    </div>
                  )}
                  {/* Context menu for assistant messages */}
                  {ctxMenu && ctxMenu.msgId === msg.id && msg.role === 'assistant' && (
                    <div
                      className="absolute z-30 flex flex-col py-1 rounded-lg bg-chalk-surface border border-chalk-border/50 shadow-xl backdrop-blur-sm animate-in fade-in zoom-in-95 duration-100"
                      style={{ left: Math.min(ctxMenu.x, 200), top: ctxMenu.y }}
                      onMouseLeave={() => setCtxMenu(null)}
                    >
                      <button
                        className="px-3 py-1.5 text-[11px] text-left text-slate-300 hover:text-chalk-text hover:bg-chalk-accent/15 transition-colors"
                        onClick={() => { navigator.clipboard.writeText(msg.content); setCtxMenu(null); }}
                      >Copy text</button>
                      <button
                        className="px-3 py-1.5 text-[11px] text-left text-slate-300 hover:text-chalk-text hover:bg-chalk-accent/15 transition-colors"
                        onClick={() => {
                          const quote = `> ${msg.content.replace(/\n/g, '\n> ')}`;
                          const attr = videoTitle ? `\n\n— *${videoTitle}*` : '';
                          navigator.clipboard.writeText(quote + attr);
                          setCtxMenu(null);
                        }}
                      >Copy as quote</button>
                      <button
                        className="px-3 py-1.5 text-[11px] text-left text-slate-300 hover:text-chalk-text hover:bg-chalk-accent/15 transition-colors"
                        onClick={() => {
                          const note = `## Chalk AI Note\n\n${msg.content}${videoTitle ? `\n\n*From: ${videoTitle}*` : ''}`;
                          navigator.clipboard.writeText(note);
                          setCtxMenu(null);
                        }}
                      >Copy as note</button>
                      <button
                        className="px-3 py-1.5 text-[11px] text-left text-slate-300 hover:text-chalk-text hover:bg-chalk-accent/15 transition-colors"
                        onClick={() => { togglePin(msg.id); setCtxMenu(null); }}
                      >{pinnedIds.has(msg.id) ? 'Unpin' : 'Pin'}</button>
                    </div>
                  )}
                  {/* Follow-up chips after last assistant message */}
                  {msg.role === 'assistant' && i === messages.length - 1 && !isStreaming && msg.content && (
                    <>
                      <FollowUpChips onSelect={handleSuggestionSelect} lastResponse={msg.content} />
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {['Tell me more', 'Give an example', 'Simplify this'].map((tmpl) => (
                          <button
                            key={tmpl}
                            onClick={() => submitMessage(tmpl)}
                            className="px-2 py-0.5 rounded-full text-[9px] text-slate-500 border border-chalk-border/20 hover:text-chalk-accent hover:border-chalk-accent/30 transition-colors"
                          >
                            {tmpl}
                          </button>
                        ))}
                        {/* Retry/regenerate last response */}
                        <button
                          onClick={() => {
                            const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
                            if (lastUserMsg) {
                              setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                              setTimeout(() => submitMessage(lastUserMsg.content), 50);
                            }
                          }}
                          className="px-2 py-0.5 rounded-full text-[9px] text-slate-500 border border-chalk-border/20 hover:text-amber-400 hover:border-amber-400/30 transition-colors flex items-center gap-1"
                          title="Regenerate response"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5">
                            <path fillRule="evenodd" d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08.932.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-1.242l.842.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44 1.241l-.84-.84v1.371a.75.75 0 0 1-1.5 0V9.591a.75.75 0 0 1 .75-.75H5.35a.75.75 0 0 1 0 1.5H3.98l.841.841a4.5 4.5 0 0 0 7.08-.932.75.75 0 0 1 1.025-.273Z" clipRule="evenodd" />
                          </svg>
                          Retry
                        </button>
                      </div>
                    </>
                  )}
                </div>
                );
              })}

              {/* Typing indicator — visible when streaming but no content yet */}
              {isStreaming && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && !messages[messages.length - 1].content && (
                <div className="flex items-center gap-1.5 px-3 py-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-chalk-accent/60 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-chalk-accent/60 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-chalk-accent/60 animate-bounce [animation-delay:300ms]" />
                </div>
              )}

              {/* "What did I miss?" catch-up banner */}
              {catchUpRange && !isStreaming && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-amber-400 shrink-0">
                    <path fillRule="evenodd" d="M8 1.75a.75.75 0 0 1 .692.462l1.41 3.393 3.664.293a.75.75 0 0 1 .428 1.317L11.46 9.63l.837 3.558a.75.75 0 0 1-1.12.814L8 12.28l-3.177 1.722a.75.75 0 0 1-1.12-.814l.837-3.558L1.806 7.215a.75.75 0 0 1 .428-1.317l3.664-.293 1.41-3.393A.75.75 0 0 1 8 1.75Z" clipRule="evenodd" />
                  </svg>
                  <span className="text-[11px] text-amber-300 flex-1">
                    Skipped {formatTimestamp(catchUpRange.from)} → {formatTimestamp(catchUpRange.to)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const q = `Summarize what was discussed between [${formatTimestamp(catchUpRange.from)}] and [${formatTimestamp(catchUpRange.to)}]. What did I miss?`;
                      setCatchUpRange(null);
                      submitMessage(q);
                    }}
                    className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 hover:text-amber-200 transition-colors whitespace-nowrap"
                  >
                    What did I miss?
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatchUpRange(null)}
                    className="p-0.5 rounded text-amber-500/50 hover:text-amber-400 transition-colors"
                    aria-label="Dismiss"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                      <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                    </svg>
                  </button>
                </motion.div>
              )}
              {/* Conversation stats summary */}
              {messages.length >= 3 && !isStreaming && (() => {
                const userCount = messages.filter((m) => m.role === 'user').length;
                const aiCount = messages.filter((m) => m.role === 'assistant' && m.content).length;
                const aiWords = messages.filter((m) => m.role === 'assistant').reduce((sum, m) => sum + m.content.split(/\s+/).filter(Boolean).length, 0);
                const userWords = messages.filter((m) => m.role === 'user').reduce((sum, m) => sum + m.content.split(/\s+/).filter(Boolean).length, 0);
                const totalWords = aiWords + userWords;
                const turns = Math.min(userCount, aiCount);
                const firstTs = parseInt(messages[0]?.id || '0', 10);
                const agoMin = firstTs > 0 ? Math.round((Date.now() - firstTs) / 60000) : 0;
                const agoLabel = agoMin < 1 ? 'just now' : agoMin < 60 ? `${agoMin}m ago` : `${Math.floor(agoMin / 60)}h ago`;
                return (
                  <div className="flex items-center justify-center gap-3 py-1.5 text-[9px] text-slate-600 flex-wrap">
                    <span>{turns} turn{turns !== 1 ? 's' : ''}</span>
                    <span className="text-slate-700">&middot;</span>
                    <span>{userCount} question{userCount !== 1 ? 's' : ''}</span>
                    <span className="text-slate-700">&middot;</span>
                    <span>{aiCount} answer{aiCount !== 1 ? 's' : ''}</span>
                    <span className="text-slate-700">&middot;</span>
                    <span>{totalWords.toLocaleString()} words</span>
                    <span className="text-slate-700">&middot;</span>
                    <span>avg {Math.round(totalWords / messages.length)}w/msg</span>
                    {firstTs > 0 && (<><span className="text-slate-700">&middot;</span><span>started {agoLabel}</span></>)}
                    {(() => {
                      const lastTs = parseInt(messages[messages.length - 1]?.id || '0', 10);
                      if (firstTs <= 0 || lastTs <= firstTs) return null;
                      const durMin = Math.round((lastTs - firstTs) / 60000);
                      if (durMin < 1) return null;
                      const rate = (messages.length / durMin).toFixed(1);
                      return <><span className="text-slate-700">&middot;</span><span>{durMin < 60 ? `${durMin}m` : `${Math.floor(durMin / 60)}h ${durMin % 60}m`} span</span><span className="text-slate-700">&middot;</span><span>{rate} msg/min</span></>;
                    })()}
                    {(() => {
                      const ups = messages.filter((m) => m.rating === 'up').length;
                      const downs = messages.filter((m) => m.rating === 'down').length;
                      if (ups + downs === 0) return null;
                      return (<><span className="text-slate-700">&middot;</span><span>{ups > 0 && `${ups}\u2191`}{ups > 0 && downs > 0 && ' '}{downs > 0 && `${downs}\u2193`}</span></>);
                    })()}
                    {messages.length >= 4 && (() => {
                      const stops = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','is','it','this','that','was','are','be','have','has','had','not','you','your','can','will','do','does','would','could','should','what','how','why','when','where','about','just','than','then','also','very','more','some','only','into','been','its','they','their','them','which','were','there','these','those','other','over','like','much','such','make','each','well','most','out','up','no']);
                      const allText = messages.map((m) => m.content.toLowerCase()).join(' ');
                      const words = allText.replace(/[^a-z\s]/g, '').split(/\s+/).filter((w) => w.length > 3 && !stops.has(w));
                      const freq = new Map<string, number>();
                      for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
                      const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
                      if (!top || top[1] < 3) return null;
                      return <><span className="text-slate-700">&middot;</span><span title="Most used word">#{top[0]}</span></>;
                    })()}
                  </div>
                );
              })()}
            </div>

            {/* Scroll-to-bottom pill */}
            <AnimatePresence>
              {isScrolledUp && messages.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex justify-center -mt-1 mb-1"
                >
                  <button
                    type="button"
                    onClick={() => { setIsScrolledUp(false); scrollToBottom(); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-chalk-surface/90 text-slate-300 border border-chalk-border/30 shadow-lg backdrop-blur-sm hover:bg-chalk-surface transition-colors"
                  >
                    <DownArrowIcon />
                    {(() => {
                      const unseen = messages.length - scrolledAtCountRef.current;
                      return unseen > 0 ? `${unseen} new` : 'New messages';
                    })()}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* New Topic pill — appears after 5+ messages to visually start a fresh thread */}
            {messages.length >= 5 && !isStreaming && (
              <div className="flex justify-center py-1">
                <button
                  type="button"
                  onClick={() => {
                    const divider: ChatMessage = { id: `divider-${Date.now()}`, role: 'assistant', content: '---\n**New topic started.** Ask a new question below.' };
                    setMessages((prev) => [...prev, divider]);
                    setTimeout(() => scrollToBottom(), 50);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] text-slate-500 border border-dashed border-slate-700/40 hover:text-chalk-accent hover:border-chalk-accent/30 hover:bg-chalk-accent/5 transition-colors"
                  title="Start a new topic in this conversation"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5">
                    <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                  </svg>
                  New Topic
                </button>
              </div>
            )}

            {/* Input area — unified pill shape */}
            <form
              onSubmit={handleSubmit}
              className="px-4 pt-3"
              style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
            >
              <div className="flex items-end rounded-xl bg-white/[0.06] ring-1 ring-white/[0.08] focus-within:ring-chalk-accent/50 focus-within:bg-white/[0.08] focus-within:shadow-[0_0_0_4px_rgba(59,130,246,0.12),0_0_12px_rgba(59,130,246,0.08)] transition-all duration-300">
                <div className="pl-2 pb-2.5 shrink-0 flex items-center gap-1">
                  <ModelSelector value={selectedModel} onChange={setSelectedModel} disabled={isStreaming} />
                  <button
                    type="button"
                    onClick={() => setEli5Mode((v) => !v)}
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold transition-all duration-150 ${
                      eli5Mode
                        ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30'
                        : 'text-slate-500 hover:text-slate-400 hover:bg-white/[0.06]'
                    }`}
                    aria-label={eli5Mode ? 'ELI5 mode on — click to disable' : 'Enable Explain Like I\'m 5 mode'}
                    title={eli5Mode ? 'ELI5 mode ON — answers simplified' : 'Explain Like I\'m 5'}
                  >
                    ELI5
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTeachBackMode((v) => !v); if (!teachBackMode) setEli5Mode(false); }}
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold transition-all duration-150 ${
                      teachBackMode
                        ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30'
                        : 'text-slate-500 hover:text-slate-400 hover:bg-white/[0.06]'
                    }`}
                    aria-label={teachBackMode ? 'Teach Back mode on' : 'Enable Teach Back mode'}
                    title={teachBackMode ? 'Teach Back ON — explain concepts to the AI' : 'Teach Back — explain what you learned'}
                  >
                    TB
                  </button>
                  <div className="relative group/pers">
                    <button
                      type="button"
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold transition-all duration-150 ${
                        personality !== 'default'
                          ? personality === 'encouraging' ? 'bg-pink-500/20 text-pink-400 ring-1 ring-pink-500/30'
                          : personality === 'strict' ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/30'
                          : 'bg-violet-500/20 text-violet-400 ring-1 ring-violet-500/30'
                          : 'text-slate-500 hover:text-slate-400 hover:bg-white/[0.06]'
                      }`}
                      title={personality === 'default' ? 'Study coach personality' : `${personality} mode`}
                    >
                      {personality === 'default' ? 'Coach' : personality === 'encouraging' ? '♥' : personality === 'strict' ? '!' : '?'}
                    </button>
                    <div className="absolute bottom-full left-0 mb-1 hidden group-hover/pers:flex flex-col bg-slate-800/95 backdrop-blur-sm rounded-lg border border-white/10 shadow-xl py-1 min-w-[130px] z-50">
                      {([['default', 'Default', ''], ['encouraging', 'Encouraging', 'Warm & supportive'], ['strict', 'Strict', 'Direct & challenging'], ['socratic', 'Socratic', 'Questions to guide']] as const).map(([key, label, desc]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setPersonality(key)}
                          className={`px-3 py-1.5 text-left text-[11px] transition-colors ${
                            personality === key
                              ? 'bg-white/10 text-slate-200'
                              : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-300'
                          }`}
                        >
                          <div className="font-medium">{label}</div>
                          {desc && <div className="text-[9px] text-slate-500">{desc}</div>}
                        </button>
                      ))}
                    </div>
                  </div>
                  {segments.length > 0 && !isStreaming && (
                    <button
                      type="button"
                      onClick={() => {
                        const start = Math.max(0, currentTime - 120);
                        const end = currentTime;
                        submitMessage(`Give me a quick recap of what was discussed in the last 2 minutes (from [${formatTimestamp(start)}] to [${formatTimestamp(end)}]).`);
                      }}
                      className="px-1.5 py-0.5 rounded-md text-[10px] font-bold text-slate-500 hover:text-slate-400 hover:bg-white/[0.06] transition-all duration-150"
                      title="Quick recap of last 2 minutes"
                    >
                      Recap
                    </button>
                  )}
                </div>
                {/* Autocomplete suggestions from past questions */}
                {inputSuggestions.length > 0 && !suggestionsHidden && (
                  <div className="flex flex-col border-b border-white/[0.06]">
                    {inputSuggestions.map((sug, i) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => { setInput(sug); setInputSuggestionIdx(-1); inputRef.current?.focus(); }}
                        className={`px-3 py-1.5 text-left text-[11px] truncate transition-colors ${i === inputSuggestionIdx ? 'bg-white/[0.08] text-slate-300' : 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-400'}`}
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                )}
                {input.endsWith('@') && !isStreaming && (
                  <div className="absolute bottom-full left-0 mb-1 flex gap-1 z-20 animate-in fade-in slide-in-from-bottom-1 duration-100">
                    {[
                      { key: 'quiz', label: 'Quiz me', prompt: 'Quiz me on what we just covered' },
                      { key: 'summary', label: 'Summarize', prompt: 'Summarize the key points so far' },
                      { key: 'explain', label: 'Explain', prompt: 'Explain this section in detail' },
                      { key: 'simplify', label: 'Simplify', prompt: 'Can you explain that more simply?' },
                    ].map((cmd) => (
                      <button key={cmd.key} onClick={() => setInput(cmd.prompt)} className="px-1.5 py-0.5 rounded text-[9px] bg-chalk-surface border border-chalk-border/40 text-slate-400 hover:text-chalk-text hover:border-chalk-accent/40 transition-colors">{cmd.label}</button>
                    ))}
                  </div>
                )}
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    setInputSuggestionIdx(-1);
                    setSuggestionsHidden(false);
                    // Auto-resize
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px';
                  }}
                  onKeyDown={(e) => {
                    // Handle autocomplete navigation
                    if (inputSuggestions.length > 0) {
                      if (e.key === 'Tab' || (e.key === 'ArrowDown' && inputSuggestionIdx < inputSuggestions.length - 1 && input.trim())) {
                        e.preventDefault();
                        setInputSuggestionIdx((prev) => Math.min(prev + 1, inputSuggestions.length - 1));
                        return;
                      }
                      if (e.key === 'ArrowUp' && inputSuggestionIdx > 0 && input.trim()) {
                        e.preventDefault();
                        setInputSuggestionIdx((prev) => prev - 1);
                        return;
                      }
                      if (e.key === 'Enter' && !e.shiftKey && inputSuggestionIdx >= 0) {
                        e.preventDefault();
                        setInput(inputSuggestions[inputSuggestionIdx]);
                        setInputSuggestionIdx(-1);
                        return;
                      }
                      if (e.key === 'Escape') {
                        setInputSuggestionIdx(-1);
                        setSuggestionsHidden(true);
                        return;
                      }
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      setInputHistoryIdx(-1);
                      handleSubmit();
                    }
                    // Input history: ArrowUp/Down to cycle through past questions
                    const userMsgs = messages.filter((m) => m.role === 'user');
                    if (e.key === 'ArrowUp' && !input.trim() && userMsgs.length > 0) {
                      e.preventDefault();
                      const nextIdx = inputHistoryIdx < userMsgs.length - 1 ? inputHistoryIdx + 1 : inputHistoryIdx;
                      setInputHistoryIdx(nextIdx);
                      setInput(userMsgs[userMsgs.length - 1 - nextIdx]?.content || '');
                    }
                    if (e.key === 'ArrowDown' && inputHistoryIdx >= 0) {
                      e.preventDefault();
                      const nextIdx = inputHistoryIdx - 1;
                      setInputHistoryIdx(nextIdx);
                      setInput(nextIdx >= 0 ? (userMsgs[userMsgs.length - 1 - nextIdx]?.content || '') : '');
                    }
                  }}
                  placeholder={isStreaming ? 'Generating response...' : teachBackMode ? 'Explain what you learned...' : (() => {
                    if (segments.length === 0) return 'Ask about the video...';
                    const msgCount = messages.length;
                    if (msgCount > 20) return `${msgCount} msgs — ask a focused question...`;
                    const totalDur = segments[segments.length - 1].offset + (segments[segments.length - 1].duration || 0);
                    if (currentTime < 15) return 'Ask about the intro...';
                    if (totalDur > 0 && currentTime > totalDur * 0.9) return 'Summarize the conclusion...';
                    const nearSeg = segments.find((s) => Math.abs(s.offset - currentTime) < 5);
                    if (nearSeg && nearSeg.text.trim().endsWith('?')) return 'Follow up on that question...';
                    const nearbyText = segments.filter((s) => Math.abs(s.offset - currentTime) < 30).map((s) => s.text).join(' ');
                    const kw = nearbyText.split(/\s+/).filter((w) => w.length > 6).slice(0, 1)[0];
                    if (kw) return `Ask about ${kw.toLowerCase().replace(/[^a-z]/g, '')}...`;
                    return 'Ask about the video...';
                  })()}
                  disabled={isStreaming}
                  aria-label="Video question input"
                  rows={1}
                  className="flex-1 bg-transparent py-2.5 px-3 text-sm text-chalk-text placeholder:text-slate-500 focus:outline-none disabled:opacity-50 resize-none max-h-24 overflow-y-auto"
                />
                {/* Clear input */}
                {!isStreaming && input.length > 5 && (
                  <button type="button" onClick={() => { setInput(''); inputRef.current?.focus(); if (inputRef.current) { inputRef.current.style.height = 'auto'; } }} className="p-1 rounded text-slate-600 hover:text-slate-400 transition-colors shrink-0" title="Clear input" aria-label="Clear input">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5"><path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" /></svg>
                  </button>
                )}
                {/* Link detection indicator */}
                {!isStreaming && /https?:\/\/\S+/i.test(input) && (
                  <span className="text-[8px] text-sky-400/70 shrink-0 flex items-center gap-0.5" title="URL detected in input">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5"><path d="M4.64 6.11a2.25 2.25 0 0 1 3.18 0l.71.71a.75.75 0 0 1-1.06 1.06l-.71-.71a.75.75 0 0 0-1.06 0l-2.12 2.12a.75.75 0 0 0 1.06 1.06l1.06-1.06a.75.75 0 1 1 1.06 1.06l-1.06 1.06a2.25 2.25 0 0 1-3.18-3.18l2.12-2.12Zm6.72-2.12a2.25 2.25 0 0 0-3.18 0l-.71.71a.75.75 0 0 0 1.06 1.06l.71-.71a.75.75 0 0 1 1.06 0l2.12 2.12a.75.75 0 0 1-1.06 1.06l-1.06-1.06a.75.75 0 1 0-1.06 1.06l1.06 1.06a2.25 2.25 0 0 0 3.18-3.18l-2.12-2.12Z" /></svg>
                    link
                  </span>
                )}
                {/* Word count + character counter */}
                {!isStreaming && input.length > 0 && (
                  <span className={`text-[9px] tabular-nums mr-1 shrink-0 ${input.length > 450 ? 'text-amber-400' : 'text-slate-600'}`}>
                    {input.length > 10 ? `${input.trim().split(/\s+/).filter(Boolean).length}w · ` : ''}{input.length}/500
                  </span>
                )}
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="p-2 mr-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.08] transition-all duration-150 shrink-0"
                    aria-label="Stop generating"
                  >
                    <StopIcon />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="p-2 mr-1.5 rounded-lg bg-chalk-accent text-white hover:bg-blue-500 disabled:opacity-30 disabled:bg-transparent disabled:text-slate-600 transition-all duration-200 shrink-0"
                    aria-label="Send message"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.896 28.896 0 0 0 15.293-7.155.75.75 0 0 0 0-1.114A28.897 28.897 0 0 0 3.105 2.288Z" />
                    </svg>
                  </button>
                )}
              </div>
            </form>
            {input.trim().split(/\s+/).filter(Boolean).length > 200 && (
              <p className="px-4 py-1 text-[9px] text-amber-400/70">Long message ({input.trim().split(/\s+/).filter(Boolean).length} words) — consider being more concise</p>
            )}
            {input.trim() && !isStreaming && input.trim().split(/\s+/).filter(Boolean).length <= 200 && (
              <p className="px-4 py-0.5 text-[8px] text-slate-700">Enter to send</p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
