"use client";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ChatMessage } from "./ChatMessage";
import { ConversationSidebar } from "./ConversationSidebar";
import { ModelSelector, type ModelChoice } from "./ModelSelector";
import type { ChalkSpec } from "@/lib/schemas";
import { parseStreamContent, extractSpecFallback, splitReasoningFromText } from "@/lib/stream-parser";
import { getWelcomeExamples } from "@/lib/examples";
import { getDemoCacheEntry } from "@/lib/demo-cache";
import {
  listConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
  syncConversations,
  type Conversation,
  type ConversationMessage,
} from "@/lib/conversations";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  spec?: ChalkSpec | null;
  isJsonPending?: boolean;
  thinking?: string;
  thinkingDuration?: number;
}

function toConvMessages(msgs: Message[]): ConversationMessage[] {
  return msgs.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    spec: m.spec ?? undefined,
    thinking: m.thinking,
    thinkingDuration: m.thinkingDuration,
  }));
}

function fromConvMessages(msgs: ConversationMessage[]): Message[] {
  return msgs.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    spec: m.spec ?? null,
    thinking: m.thinking,
    thinkingDuration: m.thinkingDuration,
  }));
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelChoice>("auto");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Stable welcome examples — generated once per mount
  const welcomeExamples = useMemo(() => getWelcomeExamples(6), []);

  // Load conversations on mount — instant from localStorage, then sync from Supabase
  useEffect(() => {
    setConversations(listConversations());
    // Hydrate from Supabase in background
    syncConversations().then((synced) => {
      setConversations(synced);
    });
  }, []);

  const refreshConversations = useCallback(() => {
    setConversations(listConversations());
  }, []);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Persist messages to active conversation
  const persistMessages = useCallback(
    (msgs: Message[], convId: string | null) => {
      if (convId) {
        updateConversation(convId, { messages: toConvMessages(msgs) });
        refreshConversations();
      }
    },
    [refreshConversations],
  );

  const handleNewChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setActiveConvId(null);
    setIsStreaming(false);
    setSidebarOpen(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    abortRef.current?.abort();
    setIsStreaming(false);
    const conv = getConversation(id);
    if (conv) {
      setMessages(fromConvMessages(conv.messages));
      setActiveConvId(id);
      setSidebarOpen(false);
    }
  }, []);

  const handleDeleteConversation = useCallback(
    (id: string) => {
      deleteConversation(id);
      refreshConversations();
      if (activeConvId === id) {
        setMessages([]);
        setActiveConvId(null);
      }
    },
    [activeConvId, refreshConversations],
  );

  const handleRenameConversation = useCallback(
    (id: string, title: string) => {
      updateConversation(id, { title });
      refreshConversations();
    },
    [refreshConversations],
  );

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const prompt = input.trim();
    if (!prompt || isStreaming) return;

    // Abort any previous in-flight stream
    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    // Create conversation if none active
    let convId = activeConvId;
    if (!convId) {
      const conv = createConversation(prompt);
      convId = conv.id;
      setActiveConvId(convId);
      refreshConversations();
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: prompt,
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsStreaming(true);

    // Add placeholder assistant message
    const assistantId = (Date.now() + 1).toString();
    setMessages([
      ...newMessages,
      { id: assistantId, role: "assistant", content: "", spec: null },
    ]);

    // Save user message immediately
    persistMessages(newMessages, convId);

    try {
      // Check demo cache first — instant response for known demo prompts
      const cached = getDemoCacheEntry(prompt);
      if (cached && newMessages.length <= 1) {
        // Simulate brief streaming delay for natural feel
        await new Promise((r) => setTimeout(r, 300));
        const finalMessages: Message[] = [
          ...newMessages,
          {
            id: assistantId,
            role: "assistant",
            content: cached.text,
            spec: cached.spec,
            thinking: cached.thinking || undefined,
            thinkingDuration: cached.thinking ? 2400 : undefined,
          },
        ];
        setMessages(finalMessages);
        persistMessages(finalMessages, convId);
        setIsStreaming(false);
        return;
      }

      // Build history for multi-turn
      const history = newMessages.map((m) => ({
        role: m.role,
        content:
          m.role === "assistant" && m.spec ? JSON.stringify(m.spec) : m.content,
      }));

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, history, model: selectedModel }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullRaw = "";
      const thinkingStart = Date.now();
      let thinkingDuration: number | undefined;

      // Progressive streaming loop — update UI on every chunk
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullRaw += chunk;

        const { reasoning, text: fullText, hasSeparator } = splitReasoningFromText(fullRaw);

        if (hasSeparator && !thinkingDuration) {
          thinkingDuration = Date.now() - thinkingStart;
        }

        const { textContent, spec, jsonStarted } = parseStreamContent(fullText);
        const displayText = hasSeparator ? textContent : "";
        const displayReasoning = reasoning;

        // Update the assistant message in real-time
        setMessages((prev) => {
          const updated = [...prev];
          const idx = updated.findIndex((m) => m.id === assistantId);
          if (idx !== -1) {
            updated[idx] = {
              ...updated[idx],
              content: displayText,
              spec,
              isJsonPending: hasSeparator ? jsonStarted && !spec : false,
              thinking: displayReasoning || undefined,
              thinkingDuration,
            };
          }
          return updated;
        });

        // Auto-scroll as content streams in
        scrollToBottom();
      }

      // Final parse — handle both reasoning+text and plain text streams
      const finalSplit = splitReasoningFromText(fullRaw);
      const finalReasoning = finalSplit.hasSeparator ? finalSplit.reasoning : "";
      const finalFullText = finalSplit.hasSeparator ? finalSplit.text : fullRaw;

      if (!thinkingDuration && finalReasoning) {
        thinkingDuration = Date.now() - thinkingStart;
      }

      const finalParsed = parseStreamContent(finalFullText);
      const finalSpec = finalParsed.spec || extractSpecFallback(finalFullText);
      const finalText = finalParsed.textContent;

      const finalMessages: Message[] = [
        ...newMessages,
        {
          id: assistantId,
          role: "assistant",
          content: finalText || (finalSpec ? "" : finalFullText.trim()),
          spec: finalSpec,
          thinking: finalReasoning || undefined,
          thinkingDuration,
        },
      ];
      setMessages(finalMessages);
      persistMessages(finalMessages, convId);
    } catch (error) {
      // Don't show error for intentional aborts
      if (abortController.signal.aborted) return;

      const errMsg =
        error instanceof Error ? error.message : "Something went wrong";
      const errorMessages: Message[] = [
        ...newMessages,
        {
          id: assistantId,
          role: "assistant",
          content: `Error: ${errMsg}`,
          spec: null,
        },
      ];
      setMessages(errorMessages);
      persistMessages(errorMessages, convId);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex h-screen bg-chalk-bg">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed lg:relative z-40 lg:z-auto h-full w-72 shrink-0 transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <ConversationSidebar
          conversations={conversations}
          activeId={activeConvId}
          onSelect={handleSelectConversation}
          onNew={handleNewChat}
          onDelete={handleDeleteConversation}
          onRename={handleRenameConversation}
        />
      </div>

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex-none flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-chalk-border/30 bg-chalk-bg/80 backdrop-blur-md">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-chalk-surface text-slate-400 hover:text-chalk-text transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5A.75.75 0 0 1 2 10Z" clipRule="evenodd" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-semibold text-chalk-text">Chalk</h1>
            <p className="text-xs text-slate-500">Like texting a mathematician</p>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-6"
        >
          <div className="max-w-3xl mx-auto">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="text-4xl mb-3">&#x1D4D2;</div>
                <h2 className="text-2xl font-bold text-chalk-text mb-1">
                  Chalk
                </h2>
                <p className="text-slate-400 max-w-md text-sm leading-relaxed mb-8">
                  Type any math concept. Get an instant interactive visualization.
                </p>
                <div className="flex flex-wrap gap-2 justify-center max-w-xl">
                  {welcomeExamples.map((ex) => (
                    <button
                      key={ex.prompt}
                      onClick={() => {
                        setInput(ex.prompt);
                        setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                      className="px-3.5 py-2 text-xs rounded-xl bg-chalk-surface/60 border border-chalk-border/20 text-slate-400 hover:text-chalk-text hover:border-chalk-accent/40 hover:bg-chalk-surface transition-all duration-200"
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, idx) => (
              <ChatMessage
                key={msg.id}
                role={msg.role}
                content={msg.content}
                spec={msg.spec}
                isStreaming={
                  isStreaming &&
                  msg.id === messages[messages.length - 1]?.id &&
                  msg.role === "assistant"
                }
                isJsonPending={msg.isJsonPending}
                thinking={msg.thinking}
                thinkingDuration={msg.thinkingDuration}
                prompt={
                  msg.role === "assistant" && idx > 0
                    ? messages[idx - 1]?.content
                    : undefined
                }
              />
            ))}
          </div>
        </div>

        {/* Input bar */}
        <div className="flex-none p-3 sm:p-4 bg-chalk-bg/80 backdrop-blur-md border-t border-chalk-border/30">
          <div className="max-w-3xl mx-auto">
            {/* Model selector row */}
            <div className="flex items-center mb-2 pl-1">
              <ModelSelector
                value={selectedModel}
                onChange={setSelectedModel}
                disabled={isStreaming}
              />
            </div>
            <form
              onSubmit={handleSubmit}
              className="flex items-center gap-2"
            >
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
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-5 h-5"
                >
                  <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.896 28.896 0 0 0 15.293-7.155.75.75 0 0 0 0-1.114A28.897 28.897 0 0 0 3.105 2.288Z" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
