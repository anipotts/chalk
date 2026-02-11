'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VideoAIMessage } from './VideoAIMessage';
import { ModelSelector, type ModelChoice } from './ModelSelector';
import { splitReasoningFromText } from '@/lib/stream-parser';
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

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const prompt = input.trim();
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
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="absolute inset-x-0 bottom-0 z-20 flex flex-col max-h-[60%] pointer-events-auto"
        >
          {/* Gradient backdrop */}
          <div className="absolute inset-0 bg-gradient-to-t from-chalk-bg via-chalk-bg/95 to-transparent rounded-t-2xl" />

          {/* Chat content */}
          <div className="relative flex flex-col flex-1 min-h-0 px-4 pt-4 pb-3">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-chalk-text">Ask about this video</h3>
                <span className="text-[10px] text-slate-500 bg-chalk-surface/50 px-2 py-0.5 rounded-full">
                  Press C to toggle
                </span>
              </div>
              <button
                onClick={onToggle}
                className="p-1 rounded-lg text-slate-400 hover:text-chalk-text hover:bg-chalk-surface/50 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 mb-3 space-y-1">
              {messages.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-4">
                  Ask a question about what you&apos;re watching...
                </p>
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

            {/* Input */}
            <div>
              <div className="flex items-center mb-2">
                <ModelSelector value={selectedModel} onChange={setSelectedModel} disabled={isStreaming} />
              </div>
              <form onSubmit={handleSubmit} className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about the video..."
                  disabled={isStreaming}
                  className="flex-1 px-4 py-2.5 rounded-full bg-chalk-surface border border-chalk-border/40 text-chalk-text placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-chalk-accent/50 focus:border-transparent disabled:opacity-50 transition-all"
                />
                <button
                  type="submit"
                  disabled={isStreaming || !input.trim()}
                  className="p-2.5 rounded-full bg-chalk-accent text-white hover:bg-blue-600 disabled:opacity-30 disabled:hover:bg-chalk-accent transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.896 28.896 0 0 0 15.293-7.155.75.75 0 0 0 0-1.114A28.897 28.897 0 0 0 3.105 2.288Z" />
                  </svg>
                </button>
              </form>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
