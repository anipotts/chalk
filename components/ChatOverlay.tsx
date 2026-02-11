'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VideoAIMessage } from './VideoAIMessage';
import { ModelSelector, type ModelChoice } from './ModelSelector';
import { splitReasoningFromText } from '@/lib/stream-parser';
import { pickSuggestions } from '@/lib/suggestions';
import { saveVideoSession, loadVideoSession, createSharedNote, trackVideoEvent } from '@/lib/video-sessions';
import type { TranscriptSegment } from '@/lib/video-utils';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  thinkingDuration?: number;
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

/* ─── Suggestion rows (vertical, full-width) ─── */

function SuggestionRows({
  currentTime,
  hasTranscript,
  onSelect,
}: {
  currentTime: number;
  hasTranscript: boolean;
  onSelect: (text: string) => void;
}) {
  const suggestions = pickSuggestions(currentTime, hasTranscript, 3);

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
    </div>
  );
}

/* ─── Follow-up suggestion chips ─── */

const FOLLOW_UPS = [
  'Tell me more',
  'Give me an example',
  'Why is that important?',
  'Explain it more simply',
  'Quiz me on this',
  'What comes next in the video?',
  'How does this relate to the rest?',
  'Can you summarize that?',
];

function FollowUpChips({ onSelect }: { onSelect: (text: string) => void }) {
  // Pick 2 random follow-ups
  const chips = useMemo(() => {
    const shuffled = [...FOLLOW_UPS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 2);
  }, []);

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
  const [selectedModel, setSelectedModel] = useState<ModelChoice>('auto');
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [shareStatus, setShareStatus] = useState<'idle' | 'sharing' | 'done'>('idle');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Video progress calculation
  const videoDuration = useMemo(() => {
    if (segments.length === 0) return 0;
    const last = segments[segments.length - 1];
    return last.offset + (last.duration || 0);
  }, [segments]);
  const videoProgress = videoDuration > 0 ? Math.min(currentTime / videoDuration, 1) : 0;

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
    setIsScrolledUp(scrollHeight - scrollTop - clientHeight > 60);
  }, []);

  // Keyboard: C to toggle chat, Escape to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') {
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
  }, [onToggle]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const submitMessage = useCallback(async (prompt: string) => {
    if (!prompt || isStreaming) return;

    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: prompt };
    const assistantId = (Date.now() + 1).toString();
    const newMessages = [...messages, userMsg];

    setMessages([...newMessages, { id: assistantId, role: 'assistant', content: '' }]);
    setInput('');
    setIsStreaming(true);
    setIsScrolledUp(false);

    try {
      const history = [...newMessages].map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch('/api/video-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: prompt,
          currentTimestamp: currentTime,
          segments,
          history,
          model: selectedModel,
          videoTitle,
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

      setMessages([
        ...newMessages,
        {
          id: assistantId,
          role: 'assistant',
          content: finalText,
          thinking: finalReasoning || undefined,
          thinkingDuration,
        },
      ]);
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
  }, [isStreaming, messages, currentTime, segments, selectedModel, videoTitle, scrollToBottom]);

  const handleSubmit = async (e?: { preventDefault(): void }) => {
    e?.preventDefault();
    const prompt = input.trim();
    await submitMessage(prompt);
  };

  const handleSuggestionSelect = (text: string) => {
    submitMessage(text);
  };

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
                      onClick={() => { setMessages([]); setInput(''); saveChatHistory(videoId, []); }}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors text-[10px]"
                      aria-label="Clear chat"
                      title="Clear conversation"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                        <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5A.75.75 0 0 1 9.95 6Z" clipRule="evenodd" />
                      </svg>
                      Clear
                    </button>
                  </>
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

            {/* Messages */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              aria-live="polite"
              className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-4"
              style={{ overscrollBehavior: 'contain' }}
            >
              {messages.length === 0 && (
                <>
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
                    onSelect={handleSuggestionSelect}
                  />
                </>
              )}
              {messages.map((msg, i) => (
                <div key={msg.id}>
                  <VideoAIMessage
                    role={msg.role}
                    content={msg.content}
                    isStreaming={isStreaming && msg.id === messages[messages.length - 1]?.id && msg.role === 'assistant'}
                    thinking={msg.thinking}
                    thinkingDuration={msg.thinkingDuration}
                    onSeek={onSeek}
                  />
                  {/* Follow-up chips after last assistant message */}
                  {msg.role === 'assistant' && i === messages.length - 1 && !isStreaming && msg.content && (
                    <FollowUpChips onSelect={handleSuggestionSelect} />
                  )}
                </div>
              ))}
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
                    New messages
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input area — unified pill shape */}
            <form
              onSubmit={handleSubmit}
              className="px-4 pt-3"
              style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
            >
              <div className="flex items-end rounded-xl bg-white/[0.06] ring-1 ring-white/[0.08] focus-within:ring-chalk-accent/40 focus-within:bg-white/[0.08] focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.08)] transition-all duration-200">
                <div className="pl-2 pb-2.5 shrink-0">
                  <ModelSelector value={selectedModel} onChange={setSelectedModel} disabled={isStreaming} />
                </div>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    // Auto-resize
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px';
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder={isStreaming ? 'Generating response...' : 'Ask about the video...'}
                  disabled={isStreaming}
                  aria-label="Video question input"
                  rows={1}
                  className="flex-1 bg-transparent py-2.5 px-3 text-sm text-chalk-text placeholder:text-slate-500 focus:outline-none disabled:opacity-50 resize-none max-h-24 overflow-y-auto"
                />
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
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
