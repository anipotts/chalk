'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VideoAIMessage } from './VideoAIMessage';
import { ModelSelector, type ModelChoice } from './ModelSelector';
import { splitReasoningFromText } from '@/lib/stream-parser';
import { pickSuggestions } from '@/lib/suggestions';
import { storageKey } from '@/lib/brand';
import { type TranscriptSegment, type TranscriptSource } from '@/lib/video-utils';
import { ChatsTeardrop, PaperPlaneTilt, StopCircle, CaretDoubleDown, XCircle } from '@phosphor-icons/react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  thinkingDuration?: number;
  responseDuration?: number;
  model?: string;
}

interface ChatOverlayProps {
  visible: boolean;
  segments: TranscriptSegment[];
  currentTime: number;
  videoId?: string;
  videoTitle?: string;
  transcriptSource?: TranscriptSource;
  onSeek: (seconds: number) => void;
  onToggle?: () => void;
  pendingQuestion?: string | null;
  onPendingQuestionConsumed?: () => void;
  variant?: 'sidebar' | 'overlay' | 'mobile';
  onMetaChange?: (meta: { messageCount: number; isStreaming: boolean }) => void;
}

/* --- Inline icons (Phosphor) --- */

/* --- Suggestion rows --- */

/** Render suggestion text with [M:SS] timestamps highlighted as blue pill-style spans */
function renderSuggestionText(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /\[(\d{1,2}:\d{2})\]/g;
  let lastIdx = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index));
    parts.push(
      <span key={match.index} className="text-chalk-accent font-medium">{match[1]}</span>
    );
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts.length > 0 ? parts : text;
}

function SuggestionRows({
  currentTime,
  hasTranscript,
  onSelect,
  videoTitle,
  compact,
}: {
  currentTime: number;
  hasTranscript: boolean;
  onSelect: (text: string) => void;
  videoTitle?: string;
  compact?: boolean;
}) {
  // Quantize to 30s buckets so suggestions don't flicker every second
  const stableTime = Math.floor(currentTime / 30) * 30;
  const count = compact ? 2 : 3;
  const suggestions = useMemo(() => {
    const base = pickSuggestions(currentTime, hasTranscript, count);
    if (!videoTitle) return base;
    const titleQ = `What are the main ideas in "${videoTitle.length > 50 ? videoTitle.slice(0, 50) + '...' : videoTitle}"?`;
    return [titleQ, ...base.slice(1)].slice(0, count);
  }, [videoTitle, stableTime, hasTranscript, count]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`flex flex-col ${compact ? 'py-4 px-1 gap-1' : 'py-6 px-2 gap-1.5'}`}>
      {suggestions.map((text) => (
        <button
          key={text}
          type="button"
          onClick={() => onSelect(text)}
          className={`group w-full flex items-center gap-3 rounded-lg text-slate-400 bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:text-slate-300 hover:border-white/[0.10] active:scale-[0.98] transition-all duration-150 cursor-pointer text-left ${
            compact ? 'px-3 py-2 text-[12px]' : 'px-3.5 py-2.5 text-[13px]'
          }`}
        >
          <span className="flex-1">{renderSuggestionText(text)}</span>
          <span className="text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <PaperPlaneTilt size={14} weight="bold" />
          </span>
        </button>
      ))}
    </div>
  );
}

/* --- Tone presets --- */

const TONE_PRESETS = [
  { id: 'eli5', label: 'ELI5', prefix: 'Explain this very simply, as if to a complete beginner with no background knowledge: ' },
  { id: 'coach', label: 'Coach', prefix: 'Act as a study coach. Be encouraging but push for deeper understanding: ' },
  { id: 'recap', label: 'Recap', prefix: 'Give a concise recap of: ' },
] as const;

type ToneId = typeof TONE_PRESETS[number]['id'] | null;

/* --- Chat storage --- */

const CHAT_STORAGE_PREFIX = storageKey('video-chat-');

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
  } catch { /* quota exceeded */ }
}

/* --- Main overlay --- */

export function ChatOverlay({
  visible,
  segments,
  currentTime,
  videoId,
  videoTitle,
  transcriptSource,
  onSeek,
  onToggle,
  pendingQuestion,
  onPendingQuestionConsumed,
  variant = 'overlay',
  onMetaChange,
}: ChatOverlayProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const handleTimestampSeek = useCallback((seconds: number) => {
    onSeek(seconds);
    onToggle?.();
  }, [onSeek, onToggle]);

  // Load chat history from localStorage after hydration to avoid SSR mismatch
  useEffect(() => {
    setMessages(loadChatHistory(videoId));
    setHydrated(true);
  }, [videoId]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  // Report meta to parent (for whisper bar when collapsed)
  useEffect(() => {
    onMetaChange?.({ messageCount: messages.length, isStreaming });
  }, [messages.length, isStreaming, onMetaChange]);

  const [selectedModel, setSelectedModelRaw] = useState<ModelChoice>('auto');

  // Load saved model preference after mount to avoid hydration mismatch
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey('chat-model'));
      if (stored) setSelectedModelRaw(stored as ModelChoice);
    } catch { /* ignore */ }
  }, []);
  const setSelectedModel = useCallback((m: ModelChoice) => {
    setSelectedModelRaw(m);
    try { localStorage.setItem(storageKey('chat-model'), m); } catch { /* ignore */ }
  }, []);
  const [activeTone, setActiveTone] = useState<ToneId>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Abort any active stream on unmount to prevent resource leaks
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // Video progress
  const videoDuration = useMemo(() => {
    if (segments.length === 0) return 0;
    const last = segments[segments.length - 1];
    return last.offset + (last.duration || 0);
  }, [segments]);
  const videoProgress = videoDuration > 0 ? Math.min(currentTime / videoDuration, 1) : 0;

  // Persist chat to localStorage (only after hydration to avoid wiping saved data)
  useEffect(() => {
    if (!isStreaming && hydrated) saveChatHistory(videoId, messages);
  }, [messages, videoId, isStreaming, hydrated]);

  // Focus input when visible
  useEffect(() => {
    if (visible) setTimeout(() => inputRef.current?.focus(), 300);
  }, [visible]);

  // Auto-submit pending question
  useEffect(() => {
    if (pendingQuestion && visible && !isStreaming) {
      submitMessage(pendingQuestion);
      onPendingQuestionConsumed?.();
    }
  }, [pendingQuestion, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    if (!isScrolledUp) scrollToBottom();
  }, [messages, scrollToBottom, isScrolledUp]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setIsScrolledUp(scrollHeight - scrollTop - clientHeight > 60);
  }, []);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const submitMessage = useCallback(async (prompt: string) => {
    if (!prompt || isStreaming) return;

    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    // Apply tone prefix
    let effectivePrompt = prompt;
    if (activeTone) {
      const preset = TONE_PRESETS.find((t) => t.id === activeTone);
      if (preset) effectivePrompt = preset.prefix + prompt;
    }

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: prompt };
    const assistantId = (Date.now() + 1).toString();
    const newMessages = [...messages, userMsg];

    setMessages([...newMessages, { id: assistantId, role: 'assistant', content: '', model: selectedModel === 'auto' ? 'sonnet' : selectedModel }]);
    setInput('');
    setIsStreaming(true);
    setIsScrolledUp(false);

    try {
      const history = newMessages.map((m) => ({ role: m.role, content: m.content }));

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
          transcriptSource,
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
      const isDeepModel = selectedModel === 'opus';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        fullRaw += decoder.decode(value, { stream: true });

        if (isDeepModel) {
          const { reasoning, text, hasSeparator } = splitReasoningFromText(fullRaw);
          if (hasSeparator && !thinkingDuration) {
            thinkingDuration = Date.now() - thinkingStart;
          }
          setMessages((prev) => {
            const updated = [...prev];
            const idx = updated.findIndex((m) => m.id === assistantId);
            if (idx !== -1) {
              updated[idx] = {
                ...updated[idx],
                content: hasSeparator ? text : '',
                thinking: reasoning || undefined,
                thinkingDuration,
              };
            }
            return updated;
          });
        } else {
          // Non-Opus: all content is text, no reasoning
          setMessages((prev) => {
            const updated = [...prev];
            const idx = updated.findIndex((m) => m.id === assistantId);
            if (idx !== -1) {
              updated[idx] = { ...updated[idx], content: fullRaw };
            }
            return updated;
          });
        }
        scrollToBottom();
      }

      // Final parse
      let finalText: string;
      let finalReasoning: string | undefined;

      if (isDeepModel) {
        const finalSplit = splitReasoningFromText(fullRaw);
        finalText = finalSplit.hasSeparator ? finalSplit.text : fullRaw;
        finalReasoning = finalSplit.hasSeparator ? (finalSplit.reasoning || undefined) : undefined;
        if (!thinkingDuration && finalReasoning) {
          thinkingDuration = Date.now() - thinkingStart;
        }
      } else {
        finalText = fullRaw;
        finalReasoning = undefined;
      }

      const responseDuration = Date.now() - thinkingStart;
      setMessages([
        ...newMessages,
        {
          id: assistantId,
          role: 'assistant',
          content: finalText,
          thinking: finalReasoning,
          thinkingDuration,
          responseDuration,
          model: selectedModel === 'auto' ? 'sonnet' : selectedModel,
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
  }, [isStreaming, messages, currentTime, segments, selectedModel, videoTitle, transcriptSource, scrollToBottom, activeTone]);

  const handleSubmit = async (e?: { preventDefault(): void }) => {
    e?.preventDefault();
    await submitMessage(input.trim());
  };

  // Keyboard: Escape to close (overlay variant only — sidebar Escape is handled by WatchContent)
  useEffect(() => {
    if (!visible || variant === 'sidebar') return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onToggle?.();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [visible, variant, onToggle]);

  const handleClearChat = useCallback(() => {
    setMessages([]);
    saveChatHistory(videoId, []);
  }, [videoId]);

  const isSidebar = variant === 'sidebar';
  const isMobile = variant === 'mobile';

  const chatContent = (
    <>
      {/* Video progress bar — hidden on mobile */}
      {!isMobile && (
        <div className="h-0.5 bg-white/[0.03]">
          <div
            className="h-full bg-chalk-accent/50 transition-all duration-500 ease-linear"
            style={{ width: `${videoProgress * 100}%` }}
          />
        </div>
      )}

      {/* Header — hidden on mobile */}
      {!isMobile && (
        <div className={`flex items-center justify-between px-4 py-2.5 border-b ${isSidebar ? 'border-chalk-border/30' : 'border-white/[0.06]'}`}>
          <div className="flex items-center gap-2 text-slate-300">
            <ChatsTeardrop size={14} weight="fill" />
            <span className="text-xs font-medium">Ask about this video</span>
          </div>
          <div className="flex items-center gap-1.5">
            {messages.length > 0 && (
              <button
                onClick={handleClearChat}
                className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors px-1.5 py-0.5"
                title="Clear chat"
              >
                Clear
              </button>
            )}
            <button
              onClick={onToggle}
              className="w-6 h-6 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
              title="Close (Esc)"
              aria-label="Close chat"
            >
              <XCircle size={14} weight="bold" />
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={`flex-1 overflow-y-auto scroll-smooth ${
          isMobile ? 'px-3 py-2 space-y-3 overscroll-contain' : 'px-4 py-3 space-y-4'
        }`}
      >
        {messages.length === 0 ? (
          <SuggestionRows
            currentTime={currentTime}
            hasTranscript={segments.length > 0}
            onSelect={(text) => submitMessage(text)}
            videoTitle={videoTitle}
            compact={isMobile}
          />
        ) : (
          messages.map((msg) => (
            <VideoAIMessage
              key={msg.id}
              role={msg.role}
              content={msg.content}
              isStreaming={isStreaming && msg.id === messages[messages.length - 1]?.id && msg.role === 'assistant'}
              thinking={msg.thinking}
              thinkingDuration={msg.thinkingDuration}
              onSeek={handleTimestampSeek}
              videoId={videoId}
            />
          ))
        )}
      </div>

      {/* Scroll to bottom */}
      {isScrolledUp && (
        <div className="absolute bottom-[88px] left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={scrollToBottom}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-chalk-surface/90 border border-chalk-border/40 text-[11px] text-slate-400 hover:text-slate-200 shadow-lg transition-colors"
          >
            <CaretDoubleDown size={12} weight="bold" />
            New messages
          </button>
        </div>
      )}

      {/* Input area */}
      <div className={`flex-none border-t ${isSidebar ? 'border-chalk-border/30' : isMobile ? 'border-chalk-border/30' : 'border-white/[0.06]'} ${
        isMobile ? 'px-2 pt-2 pb-2' : 'px-3 pt-3 pb-4'
      }`}>
        {/* Mobile clear button */}
        {isMobile && messages.length > 0 && (
          <button
            onClick={handleClearChat}
            className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors mb-1.5 px-1"
          >
            Clear
          </button>
        )}

        {/* Model selector + tone presets — hidden on mobile */}
        {!isMobile && (
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            <ModelSelector
              value={selectedModel}
              onChange={setSelectedModel}
              disabled={isStreaming}
            />
            {TONE_PRESETS.map((tone) => (
              <button
                key={tone.id}
                onClick={() => setActiveTone(activeTone === tone.id ? null : tone.id)}
                className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  activeTone === tone.id
                    ? 'bg-chalk-accent/15 text-chalk-accent border border-chalk-accent/30'
                    : 'text-slate-500 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30'
                }`}
              >
                {tone.label}
              </button>
            ))}
          </div>
        )}

        {/* Input + send */}
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={isMobile ? 'Ask anything...' : 'Ask about this video...'}
            aria-label="Ask a question about this video"
            rows={1}
            className="flex-1 resize-none px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-chalk-text placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-chalk-accent/40 focus:border-chalk-accent/30 transition-colors"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="shrink-0 w-9 h-9 rounded-xl bg-red-500/15 text-red-400 border border-red-500/30 flex items-center justify-center hover:bg-red-500/25 transition-colors"
              title="Stop"
            >
              <StopCircle size={14} weight="fill" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="shrink-0 w-9 h-9 rounded-xl bg-chalk-accent/15 text-chalk-accent border border-chalk-accent/30 flex items-center justify-center hover:bg-chalk-accent/25 disabled:opacity-30 disabled:hover:bg-chalk-accent/15 transition-colors"
              title="Send"
            >
              <PaperPlaneTilt size={14} weight="fill" />
            </button>
          )}
        </form>
      </div>
    </>
  );

  // Sidebar or mobile variant: plain panel filling parent, no animation
  if (isSidebar || isMobile) {
    if (!visible) return null;
    return (
      <div className="flex flex-col h-full bg-chalk-bg relative">
        {chatContent}
      </div>
    );
  }

  // Overlay variant: floating panel with enter/exit animation (mobile)
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="absolute inset-x-4 bottom-4 top-4 z-40 flex flex-col rounded-2xl overflow-hidden border border-white/[0.08] bg-chalk-bg/80 backdrop-blur-xl shadow-2xl shadow-black/40"
        >
          {chatContent}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
