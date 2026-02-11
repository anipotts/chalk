'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VideoAIMessage } from './VideoAIMessage';
import { ModelSelector, type ModelChoice } from './ModelSelector';
import { splitReasoningFromText } from '@/lib/stream-parser';
import { formatTimestamp } from '@/lib/video-utils';
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
  videoTitle?: string;
  onSeek: (seconds: number) => void;
  onToggle?: () => void;
}

function SuggestionChips({
  currentTime,
  onSelect,
}: {
  currentTime: number;
  onSelect: (text: string) => void;
}) {
  const timestamp = formatTimestamp(currentTime);
  const suggestions = [
    'Summarize what was just covered',
    `Explain what's happening at ${timestamp}`,
    'Quiz me on this section',
  ];

  return (
    <div className="flex flex-col items-center justify-center py-4 px-4 gap-2.5">
      <span className="text-[11px] text-slate-500 font-medium tracking-wide uppercase">
        Try asking
      </span>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {suggestions.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => onSelect(text)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] text-slate-400 border border-white/[0.06] hover:bg-white/[0.10] hover:text-slate-300 hover:border-white/[0.10] transition-all duration-150 cursor-pointer"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChatOverlay({ visible, segments, currentTime, videoTitle, onSeek, onToggle }: ChatOverlayProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelChoice>('auto');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Focus input when overlay becomes visible
  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [visible]);

  // Auto-scroll on new messages
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

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

    try {
      // Build history for multi-turn
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

  const handleSubmit = async (e?: React.FormEvent) => {
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
          className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-center pointer-events-none px-0 sm:px-3 pb-0 sm:pb-3"
        >
          {/* Glass panel */}
          <div className="w-full max-w-5xl pointer-events-auto flex flex-col max-h-[50vh] max-h-[50dvh] sm:rounded-xl rounded-t-xl bg-slate-900/80 backdrop-blur-xl border border-white/[0.08] shadow-[0_-4px_24px_rgba(0,0,0,0.35)] overflow-hidden">

            {/* Header row */}
            <div className="flex items-center justify-between px-3 sm:px-4 pt-2.5 pb-1">
              <span className="text-xs font-medium text-slate-400">Ask about this video</span>
              <button
                onClick={onToggle}
                className="p-1.5 -mr-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                aria-label="Close chat"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 px-4 py-2 space-y-3">
              {messages.length === 0 && (
                <SuggestionChips
                  currentTime={currentTime}
                  onSelect={handleSuggestionSelect}
                />
              )}
              {messages.map((msg) => (
                <VideoAIMessage
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  isStreaming={isStreaming && msg.id === messages[messages.length - 1]?.id && msg.role === 'assistant'}
                  thinking={msg.thinking}
                  thinkingDuration={msg.thinkingDuration}
                  onSeek={onSeek}
                />
              ))}
            </div>

            {/* Input area */}
            <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 sm:px-4 pb-2.5 pb-safe pt-1.5">
              <div className="flex-1 flex items-center gap-0 rounded-lg bg-white/[0.06] border border-white/[0.08] focus-within:border-chalk-accent/40 focus-within:bg-white/[0.08] transition-all duration-200">
                <div className="pl-1.5 shrink-0">
                  <ModelSelector value={selectedModel} onChange={setSelectedModel} disabled={isStreaming} />
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about the video..."
                  disabled={isStreaming}
                  aria-label="Video question input"
                  className="flex-1 bg-transparent py-2 px-2.5 text-sm text-chalk-text placeholder:text-slate-500 focus:outline-none disabled:opacity-50"
                />
              </div>
              <button
                type="submit"
                disabled={isStreaming || !input.trim()}
                className="p-2 rounded-lg bg-chalk-accent text-white hover:bg-blue-500 disabled:opacity-0 disabled:scale-90 transition-all duration-200 shrink-0"
                aria-label="Send message"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.896 28.896 0 0 0 15.293-7.155.75.75 0 0 0 0-1.114A28.897 28.897 0 0 0 3.105 2.288Z" />
                </svg>
              </button>
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
