'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage } from './ChatMessage';
import type { ChalkSpec } from '@/lib/schemas';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  spec?: ChalkSpec | null;
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const prompt = input.trim();
    if (!prompt || isStreaming) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: prompt,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsStreaming(true);

    // Add placeholder assistant message
    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '', spec: null },
    ]);

    try {
      // Build history for multi-turn (exclude the placeholder)
      const history = messages.map((m) => ({
        role: m.role,
        content: m.role === 'assistant' && m.spec
          ? JSON.stringify(m.spec)
          : m.content,
      }));

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, history }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
      }

      // Try to parse the accumulated text as a ChalkSpec JSON
      let spec: ChalkSpec | null = null;
      try {
        // Find JSON in the response - Claude might wrap it in markdown or thinking tags
        const jsonMatch = fullText.match(/\{[\s\S]*"root"[\s\S]*"elements"[\s\S]*\}/);
        if (jsonMatch) {
          spec = JSON.parse(jsonMatch[0]);
        }
      } catch {
        // If parsing fails, just show as text
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: spec ? '' : fullText, spec }
            : m
        )
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Something went wrong';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `Error: ${errMsg}` }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-chalk-bg">
      {/* Header */}
      <div className="flex-none px-6 py-3 border-b border-chalk-border/30 bg-chalk-bg/80 backdrop-blur-md">
        <h1 className="text-lg font-semibold text-chalk-text">Chalk</h1>
        <p className="text-xs text-slate-500">Like texting a mathematician</p>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-4xl mb-4">&#x1D4D2;</div>
            <h2 className="text-xl font-semibold text-chalk-text mb-2">Welcome to Chalk</h2>
            <p className="text-slate-400 max-w-md text-sm leading-relaxed">
              Ask me anything about math. I&apos;ll create interactive visualizations to help you understand.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 justify-center">
              {['Plot sin(x)', 'Explain derivatives', 'Show me eigenvalues'].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion);
                    setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                  className="px-3 py-1.5 text-xs rounded-full bg-chalk-surface border border-chalk-border/30 text-slate-400 hover:text-chalk-text hover:border-chalk-accent/50 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            role={msg.role}
            content={msg.content}
            spec={msg.spec}
            isStreaming={isStreaming && msg.role === 'assistant' && !msg.content && !msg.spec}
          />
        ))}
      </div>

      {/* Input bar */}
      <div className="flex-none p-4 bg-chalk-bg/80 backdrop-blur-md border-t border-chalk-border/30">
        <form onSubmit={handleSubmit} className="flex items-center gap-2 max-w-3xl mx-auto">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me anything about math..."
            disabled={isStreaming}
            className="flex-1 px-4 py-3 rounded-full bg-chalk-surface border border-chalk-border/40 text-chalk-text placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-chalk-accent/50 focus:border-transparent disabled:opacity-50 transition-all"
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="p-3 rounded-full bg-chalk-accent text-white hover:bg-blue-600 disabled:opacity-30 disabled:hover:bg-chalk-accent transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.896 28.896 0 0 0 15.293-7.155.75.75 0 0 0 0-1.114A28.897 28.897 0 0 0 3.105 2.288Z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
