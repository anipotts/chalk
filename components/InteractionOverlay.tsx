'use client';

import { useState, useRef, useEffect, useCallback, type RefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TextInput } from './TextInput';
import { ExplorePills } from './ExplorePills';
import { ExchangeMessage, renderRichContent, type UnifiedExchange } from './ExchangeMessage';
import type { VoiceState } from '@/hooks/useVoiceMode';
import type { TranscriptSegment, TranscriptSource } from '@/lib/video-utils';

interface InteractionOverlayProps {
  visible: boolean;
  segments: TranscriptSegment[];
  currentTime: number;
  videoId: string;
  videoTitle?: string;
  transcriptSource?: TranscriptSource;
  voiceId: string | null;
  isVoiceCloning: boolean;

  // Voice state
  voiceState: VoiceState;
  voiceTranscript: string;
  voiceResponseText: string;
  voiceError: string | null;
  recordingDuration: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;

  // Text state
  isTextStreaming: boolean;
  currentUserText: string;
  currentAiText: string;
  textError: string | null;
  onTextSubmit: (text: string) => Promise<void>;
  onStopTextStream: () => void;

  // Unified state
  exchanges: UnifiedExchange[];
  onClearHistory: () => void;

  blurLevel: 'light' | 'full';
  onSeek: (seconds: number) => void;
  onClose: () => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Parse <options>opt1|opt2|opt3</options> from AI text. Returns [cleanText, options]. */
function parseExploreOptions(text: string): [string, string[]] {
  const match = text.match(/<options>([\s\S]*?)<\/options>/);
  if (!match) return [text, []];
  const cleanText = text.replace(/<options>[\s\S]*?<\/options>/, '').trimEnd();
  const options = match[1].split('|').map((o) => o.trim()).filter(Boolean);
  return [cleanText, options];
}

/* --- Voice mode visual elements --- */

function PulsingRings() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <motion.div
        className="absolute w-32 h-32 rounded-full border border-rose-500/30"
        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute w-32 h-32 rounded-full border border-rose-500/20"
        animate={{ scale: [1, 1.8, 1], opacity: [0.3, 0, 0.3] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      />
    </div>
  );
}

function SoundWaveBars() {
  const bars = [0.4, 0.7, 1, 0.6, 0.9, 0.5, 0.8];
  return (
    <div className="flex items-end gap-[3px] h-8">
      {bars.map((maxScale, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-emerald-400"
          animate={{
            height: ['8px', `${maxScale * 32}px`, '8px'],
          }}
          transition={{
            duration: 0.6 + i * 0.1,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.08,
          }}
        />
      ))}
    </div>
  );
}

function ThinkingDots() {
  return (
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
  );
}

function DownArrowIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
      <path fillRule="evenodd" d="M8 2a.75.75 0 0 1 .75.75v8.69l3.22-3.22a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.22 3.22V2.75A.75.75 0 0 1 8 2Z" clipRule="evenodd" />
    </svg>
  );
}

/** Timestamp hover tooltip showing transcript context */
function TimestampTooltip({
  seconds,
  segments,
  position,
}: {
  seconds: number;
  segments: TranscriptSegment[];
  position: { x: number; y: number };
}) {
  // Find the 2-3 nearest segments around the timestamp
  const sorted = [...segments].sort(
    (a, b) => Math.abs(a.offset - seconds) - Math.abs(b.offset - seconds)
  );
  const nearby = sorted.slice(0, 3).sort((a, b) => a.offset - b.offset);

  if (nearby.length === 0) return null;

  const formatTs = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.1 }}
      className="fixed z-50 bg-chalk-surface border border-chalk-border rounded-lg p-2 max-w-[300px] shadow-xl pointer-events-none"
      style={{ left: position.x, top: position.y - 8, transform: 'translate(-50%, -100%)' }}
    >
      <div className="space-y-1">
        {nearby.map((seg, i) => {
          const isExact = Math.abs(seg.offset - seconds) < 3;
          return (
            <div key={i} className={`text-xs leading-relaxed ${isExact ? 'text-chalk-text' : 'text-slate-500'}`}>
              <span className="font-mono text-[10px] text-slate-600 mr-1">[{formatTs(seg.offset)}]</span>
              {seg.text}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

const INITIAL_EXPLORE_PILLS = [
  'Understand key concepts',
  'Get a quick summary',
  'Quiz me on this',
  'Help me apply this',
];

export function InteractionOverlay({
  visible,
  segments,
  currentTime,
  videoId,
  videoTitle,
  transcriptSource,
  voiceId,
  isVoiceCloning,

  // Voice
  voiceState,
  voiceTranscript,
  voiceResponseText,
  voiceError,
  recordingDuration,
  onStartRecording,
  onStopRecording,
  onCancelRecording,

  // Text
  isTextStreaming,
  currentUserText,
  currentAiText,
  textError,
  onTextSubmit,
  onStopTextStream,

  // Unified
  exchanges,
  onClearHistory,

  blurLevel,
  onSeek,
  onClose,
  inputRef,
}: InteractionOverlayProps) {
  const [input, setInput] = useState('');
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Explore Mode state
  const [exploreMode, setExploreMode] = useState(false);
  const [explorePills, setExplorePills] = useState<string[]>([]);
  const [exploreGoal, setExploreGoal] = useState<string | null>(null);
  const [exploreExchanges, setExploreExchanges] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [exploreStreaming, setExploreStreaming] = useState(false);
  const [exploreCurrentAiText, setExploreCurrentAiText] = useState('');
  const [exploreCurrentUserText, setExploreCurrentUserText] = useState('');
  const [exploreError, setExploreError] = useState<string | null>(null);
  const exploreAbortRef = useRef<AbortController | null>(null);

  // Timestamp tooltip state
  const [tooltipInfo, setTooltipInfo] = useState<{ seconds: number; position: { x: number; y: number } } | null>(null);

  const handleTimestampSeek = useCallback((seconds: number) => {
    onSeek(seconds);
    onClose();
  }, [onSeek, onClose]);

  const isTextMode = voiceState === 'idle';
  const isProcessing = voiceState === 'transcribing' || voiceState === 'thinking';
  const hasClone = Boolean(voiceId) && !isVoiceCloning;

  // One-time cleanup of old localStorage keys
  useEffect(() => {
    try {
      localStorage.removeItem('chalk-chat-model');
      localStorage.removeItem('chalk-auto-pause-chat');
    } catch { /* ignore */ }
  }, []);

  // Show idle hint when: text mode + no exchanges + no input + no current text exchange
  const hasExploreContent = exploreExchanges.length > 0 || exploreCurrentAiText || exploreCurrentUserText;
  const showIdleHint = isTextMode && exchanges.length === 0 && !input && !currentUserText && !currentAiText && !isTextStreaming && !hasExploreContent;

  // Show text input area - always visible
  const showTextInput = true;

  // Activate text mode (open input)
  const activateTextMode = useCallback(() => {
    if (showIdleHint) {
      setTimeout(() => inputRef?.current?.focus(), 100);
    }
  }, [showIdleHint, inputRef]);

  const stateLabel = {
    idle: 'Hold to speak',
    recording: 'Listening...',
    transcribing: 'Hearing you...',
    thinking: 'Thinking...',
    speaking: 'Hold mic to interrupt',
  };

  // Auto-scroll
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    if (!isScrolledUp) scrollToBottom();
  }, [exchanges, currentAiText, exploreExchanges, exploreCurrentAiText, scrollToBottom, isScrolledUp]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setIsScrolledUp(scrollHeight - scrollTop - clientHeight > 60);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput('');

    if (exploreMode) {
      // Handle explore mode submission directly
      await submitExploreMessage(text);
    } else {
      await onTextSubmit(text);
    }
  }, [input, exploreMode, onTextSubmit]);

  // Toggle explore mode
  const toggleExploreMode = useCallback(() => {
    setExploreMode((prev) => {
      const next = !prev;
      if (next) {
        // Entering explore mode: show initial pills if no explore conversation yet
        if (exploreExchanges.length === 0) {
          setExplorePills(INITIAL_EXPLORE_PILLS);
        }
      } else {
        // Leaving explore mode: clear pills, keep exchanges for context
        setExplorePills([]);
        // Abort any in-flight explore stream
        if (exploreAbortRef.current) {
          exploreAbortRef.current.abort();
          exploreAbortRef.current = null;
        }
        setExploreStreaming(false);
        setExploreCurrentAiText('');
        setExploreCurrentUserText('');
      }
      return next;
    });
  }, [exploreExchanges.length]);

  // Submit explore message (calls API directly)
  const submitExploreMessage = useCallback(async (text: string) => {
    if (exploreStreaming) return;

    // Set goal on first message
    if (!exploreGoal) {
      setExploreGoal(text);
    }

    setExploreCurrentUserText(text);
    setExploreCurrentAiText('');
    setExplorePills([]);
    setExploreError(null);
    setExploreStreaming(true);

    // Build history for API
    const history = [
      ...exploreExchanges.map((ex) => ({
        role: ex.role,
        content: ex.text,
      })),
      { role: 'user' as const, content: text },
    ];

    const controller = new AbortController();
    exploreAbortRef.current = controller;

    try {
      const response = await fetch('/api/video-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          currentTimestamp: currentTime,
          segments,
          history,
          videoTitle,
          transcriptSource,
          exploreMode: true,
          exploreGoal: exploreGoal || text,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || 'Request failed');
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

        // Show text without the options block while streaming
        const [cleanText] = parseExploreOptions(fullText);
        setExploreCurrentAiText(cleanText);
      }

      // Parse final text for options
      const [cleanText, options] = parseExploreOptions(fullText);

      // Move current exchange to history
      setExploreExchanges((prev) => [
        ...prev,
        { role: 'user', text },
        { role: 'assistant', text: cleanText },
      ]);
      setExploreCurrentUserText('');
      setExploreCurrentAiText('');
      setExplorePills(options);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setExploreError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setExploreStreaming(false);
      exploreAbortRef.current = null;
    }
  }, [exploreStreaming, exploreGoal, exploreExchanges, currentTime, segments, videoTitle, transcriptSource]);

  // Handle pill selection
  const handlePillSelect = useCallback((option: string) => {
    submitExploreMessage(option);
  }, [submitExploreMessage]);

  // Focus text input (for "Something else..." pill)
  const focusInput = useCallback(() => {
    inputRef?.current?.focus();
  }, [inputRef]);

  // Timestamp tooltip via event delegation
  const handleMouseOver = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const button = target.closest('button[aria-label^="Seek to"]');
    if (button) {
      const label = button.getAttribute('aria-label') || '';
      const match = label.match(/Seek to (\d+):(\d{2})(?::(\d{2}))? in video/);
      if (match) {
        let seconds: number;
        if (match[3]) {
          seconds = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
        } else {
          seconds = parseInt(match[1]) * 60 + parseInt(match[2]);
        }
        const rect = button.getBoundingClientRect();
        setTooltipInfo({
          seconds,
          position: { x: rect.left + rect.width / 2, y: rect.top },
        });
      }
    }
  }, []);

  const handleMouseOut = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const button = target.closest('button[aria-label^="Seek to"]');
    if (button) {
      setTooltipInfo(null);
    }
  }, []);

  // Determine which exchanges and streaming text to show
  const showExploreUI = exploreMode;
  const activeExchanges = showExploreUI ? [] : exchanges; // Explore mode uses its own exchange list
  const activeStreaming = showExploreUI ? exploreStreaming : isTextStreaming;
  const activeUserText = showExploreUI ? exploreCurrentUserText : currentUserText;
  const activeAiText = showExploreUI ? exploreCurrentAiText : currentAiText;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="absolute inset-0 z-30 flex flex-col items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Backdrop with dynamic blur - clickable to close */}
          <div
            className={`absolute inset-0 ${blurLevel === 'full' ? 'bg-black/70' : 'bg-black/30'} backdrop-blur-xl cursor-pointer`}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                onClose();
              }
            }}
          />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors pointer-events-auto"
            title="Close (Esc)"
            aria-label="Close overlay"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>


          {/* UNIFIED INPUT MODE */}
          <motion.div
            key="text-mode"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative z-10 flex flex-col items-center w-full max-w-2xl mx-auto px-6 h-[80vh] max-h-[700px] pointer-events-none"
          >

              {/* Messages - unified container for all messages */}
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                onMouseOver={handleMouseOver}
                onMouseOut={handleMouseOut}
                className="flex-1 w-full overflow-y-auto scroll-smooth space-y-3 mb-4 pointer-events-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              >
                {/* Explore mode initial welcome */}
                {showExploreUI && exploreExchanges.length === 0 && !exploreCurrentUserText && !exploreStreaming && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3"
                  >
                    <div className="flex justify-start w-full">
                      <div className="max-w-[85%]">
                        <div className="text-[15px] text-slate-300 leading-relaxed">
                          What would you like to explore?
                        </div>
                        <ExplorePills
                          options={explorePills}
                          onSelect={handlePillSelect}
                          onFocusInput={focusInput}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Explore mode conversation history */}
                {showExploreUI && exploreExchanges.map((ex, i) => {
                  if (ex.role === 'user') {
                    return (
                      <motion.div
                        key={`explore-${i}`}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex justify-end w-full"
                      >
                        <div className="max-w-[85%] px-3.5 py-2 rounded-2xl bg-chalk-accent/90 text-white text-sm leading-relaxed break-words">
                          {ex.text}
                        </div>
                      </motion.div>
                    );
                  }
                  // Assistant message with pills after the last assistant message
                  const isLastAssistant = i === exploreExchanges.length - 1;
                  return (
                    <motion.div
                      key={`explore-${i}`}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-start w-full"
                    >
                      <div className="max-w-[85%]">
                        <div className="text-[15px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                          {renderRichContent(ex.text, handleTimestampSeek, videoId)}
                        </div>
                        {isLastAssistant && explorePills.length > 0 && !exploreStreaming && (
                          <ExplorePills
                            options={explorePills}
                            onSelect={handlePillSelect}
                            onFocusInput={focusInput}
                          />
                        )}
                      </div>
                    </motion.div>
                  );
                })}

                {/* Normal mode: past exchanges */}
                {!showExploreUI && exchanges.map((exchange) => (
                  <ExchangeMessage
                    key={exchange.id}
                    exchange={exchange}
                    onSeek={handleTimestampSeek}
                    videoId={videoId}
                  />
                ))}

                {/* Current streaming exchange */}
                {(activeUserText || activeAiText || (!showExploreUI && (voiceTranscript || voiceResponseText))) && (
                  <div className="space-y-3">
                    {/* User message (text or voice transcript) */}
                    {(activeUserText || (!showExploreUI && voiceTranscript)) && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex justify-end w-full"
                      >
                        <div className="max-w-[85%] px-3.5 py-2 rounded-2xl bg-chalk-accent/90 text-white text-sm leading-relaxed break-words">
                          {activeUserText || voiceTranscript}
                        </div>
                      </motion.div>
                    )}
                    {/* AI response */}
                    {(activeAiText || (!showExploreUI && voiceResponseText)) && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex justify-start w-full"
                      >
                        <div className="max-w-[85%]">
                          <div className="text-[15px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                            {renderRichContent(activeAiText || voiceResponseText, handleTimestampSeek, videoId)}
                            {(activeStreaming || voiceState === 'thinking') && (
                              <span className="inline-block w-0.5 h-4 bg-chalk-accent animate-pulse ml-0.5 align-middle" />
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}

                {/* Error message */}
                {(textError || voiceError || exploreError) && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2"
                  >
                    {textError || voiceError || exploreError}
                  </motion.div>
                )}
              </div>

              {/* Scroll to bottom button - only when there are exchanges */}
              {(exchanges.length > 0 || exploreExchanges.length > 0) && isScrolledUp && (
                <div className="absolute bottom-[72px] left-1/2 -translate-x-1/2 z-10 pointer-events-auto">
                  <button
                    onClick={scrollToBottom}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-chalk-surface/90 border border-chalk-border/40 text-[11px] text-slate-400 hover:text-slate-200 shadow-lg transition-colors"
                  >
                    <DownArrowIcon />
                    New messages
                  </button>
                </div>
              )}

              {/* Input row: Text input | Mic button | Send button */}
              {showTextInput && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className={`pointer-events-auto ${(exchanges.length > 0 || exploreExchanges.length > 0 || hasExploreContent) ? 'flex-none w-full' : 'w-full max-w-md'}`}
                >
                  {/* Unified input row */}
                  <div className="flex items-center gap-2">
                    <TextInput
                      value={input}
                      onChange={setInput}
                      onSubmit={handleSubmit}
                      isStreaming={activeStreaming}
                      onStop={showExploreUI ? () => {
                        if (exploreAbortRef.current) {
                          exploreAbortRef.current.abort();
                          exploreAbortRef.current = null;
                        }
                        setExploreStreaming(false);
                      } : onStopTextStream}
                      placeholder="Ask about this video..."
                      inputRef={inputRef}
                      autoFocus={true}
                      exploreMode={exploreMode}
                      onToggleExplore={toggleExploreMode}
                    />

                    {/* Mic button */}
                    <motion.button
                      className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                        voiceState === 'recording'
                          ? 'bg-rose-500 shadow-lg shadow-rose-500/30'
                          : voiceState === 'speaking'
                            ? 'bg-emerald-500/20 border border-emerald-500/40'
                            : voiceState === 'transcribing' || voiceState === 'thinking'
                              ? 'bg-chalk-accent/20 border border-chalk-accent/40'
                              : 'bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.15]'
                      }`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        if (voiceState === 'idle') onStartRecording();
                      }}
                      onPointerUp={(e) => {
                        e.preventDefault();
                        if (voiceState === 'recording') onStopRecording();
                      }}
                      onPointerLeave={(e) => {
                        e.preventDefault();
                        if (voiceState === 'recording') onStopRecording();
                      }}
                      whileTap={{ scale: 0.95 }}
                      title="Hold to record voice"
                      aria-label={voiceState === 'recording' ? 'Recording — release to stop' : voiceState === 'speaking' ? 'Speaker is responding' : 'Hold to record voice'}
                    >
                      {voiceState === 'speaking' ? (
                        <div className="scale-75">
                          <SoundWaveBars />
                        </div>
                      ) : (voiceState === 'transcribing' || voiceState === 'thinking') ? (
                        <ThinkingDots />
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"
                          className={`w-5 h-5 ${voiceState === 'recording' ? 'text-white' : 'text-white/70'}`}
                        >
                          <path d="M12 2a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4Z" />
                          <path d="M6 11a.75.75 0 0 0-1.5 0 7.5 7.5 0 0 0 6.75 7.46v2.79a.75.75 0 0 0 1.5 0v-2.79A7.5 7.5 0 0 0 19.5 11a.75.75 0 0 0-1.5 0 6 6 0 0 1-12 0Z" />
                        </svg>
                      )}
                    </motion.button>

                    {/* Send/Stop button */}
                    {activeStreaming ? (
                      <button
                        type="button"
                        onClick={showExploreUI ? () => {
                          if (exploreAbortRef.current) {
                            exploreAbortRef.current.abort();
                            exploreAbortRef.current = null;
                          }
                          setExploreStreaming(false);
                        } : onStopTextStream}
                        className="flex-shrink-0 w-11 h-11 rounded-xl bg-red-500/15 text-red-400 border border-red-500/30 flex items-center justify-center hover:bg-red-500/25 transition-colors"
                        title="Stop"
                        aria-label="Stop response"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                          <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />
                        </svg>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!input.trim()}
                        className="flex-shrink-0 w-11 h-11 rounded-xl bg-chalk-accent/15 text-chalk-accent border border-chalk-accent/30 flex items-center justify-center hover:bg-chalk-accent/25 disabled:opacity-30 disabled:hover:bg-chalk-accent/15 transition-colors"
                        title="Send"
                        aria-label="Send message"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M2 8a.75.75 0 0 1 .75-.75h8.69L8.22 4.03a.75.75 0 0 1 1.06-1.06l4.5 4.5a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 0 1-1.06-1.06l3.22-3.22H2.75A.75.75 0 0 1 2 8Z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Voice state indicator when recording/processing */}
                  {voiceState !== 'idle' && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="mt-3 text-center"
                    >
                      <p className={`text-sm font-medium ${
                        voiceState === 'recording' ? 'text-rose-400'
                          : voiceState === 'speaking' ? 'text-emerald-400'
                            : 'text-chalk-accent'
                      }`}>
                        {voiceState === 'recording' && `Recording... ${formatDuration(recordingDuration)}`}
                        {voiceState === 'transcribing' && 'Transcribing...'}
                        {voiceState === 'thinking' && 'Thinking...'}
                        {voiceState === 'speaking' && 'Speaking...'}
                      </p>
                    </motion.div>
                  )}

                  {/* Voice error */}
                  {voiceError && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-3 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2"
                    >
                      {voiceError}
                    </motion.div>
                  )}

                  {/* Clear button - at bottom */}
                  {(exchanges.length > 0 || exploreExchanges.length > 0) && (
                    <div className="mt-4 flex justify-center">
                      <button
                        onClick={() => {
                          onClearHistory();
                          if (exploreMode) {
                            setExploreExchanges([]);
                            setExploreGoal(null);
                            setExplorePills(INITIAL_EXPLORE_PILLS);
                            setExploreCurrentAiText('');
                            setExploreCurrentUserText('');
                            setExploreError(null);
                          }
                        }}
                        className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors"
                        title="Clear conversation history"
                      >
                        Clear history
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </motion.div>

          {/* VOICE MODE STATE - Now unified with text mode, keeping this for voice transcript display */}
          {false && !isTextMode && (
            <motion.div
              key="voice-mode"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`relative z-10 flex flex-col items-center gap-6 pointer-events-none ${
                exchanges.length > 0 ? 'w-full max-w-2xl mx-auto px-6 h-[80vh] max-h-[600px]' : 'max-w-md px-6'
              }`}
            >
              {/* Header - show when there are exchanges */}
              {exchanges.length > 0 && (
                <div className="w-full flex items-center justify-between mb-0 pointer-events-auto">
                  <div className="text-white/70 text-xs">
                    {videoTitle && <span className="font-medium">{videoTitle}</span>}
                  </div>
                  <button
                    onClick={onClearHistory}
                    className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors px-1.5 py-0.5"
                    title="Clear history"
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* Speaker info - show when no exchanges */}
              {exchanges.length === 0 && videoTitle && (
                <div className="text-center">
                  <p className="text-xs text-white/40 mb-1">Talking to</p>
                  <p className="text-sm text-white/80 font-medium truncate max-w-[300px]">{videoTitle}</p>
                </div>
              )}

              {/* Voice clone status */}
              {isVoiceCloning && (
                <div className="flex items-center gap-2 text-xs text-amber-400/80">
                  <div className="w-3 h-3 border-2 border-amber-400/50 border-t-amber-400 rounded-full animate-spin" />
                  Cloning speaker voice...
                </div>
              )}
              {hasClone && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400/70">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Voice cloned
                </div>
              )}

              {/* Messages - show when there are exchanges */}
              {exchanges.length > 0 && (
                <div
                  ref={scrollRef}
                  onScroll={handleScroll}
                  className="w-full max-h-[40vh] overflow-y-auto scroll-smooth space-y-4 mb-6 pointer-events-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                >
                  {/* Past exchanges */}
                  {exchanges.map((exchange) => (
                    <ExchangeMessage
                      key={exchange.id}
                      exchange={exchange}
                      onSeek={handleTimestampSeek}
                      videoId={videoId}
                    />
                  ))}

                  {/* Current voice exchange */}
                  {(voiceTranscript || voiceResponseText) && (
                    <div className="space-y-3">
                      {voiceTranscript && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex justify-end w-full"
                        >
                          <div className="max-w-[85%] px-3.5 py-2 rounded-2xl bg-chalk-accent/90 text-white text-sm leading-relaxed break-words">
                            {voiceTranscript}
                          </div>
                        </motion.div>
                      )}
                      {voiceResponseText && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex justify-start w-full"
                        >
                          <div className="max-w-[85%] text-[15px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                            {voiceResponseText}
                          </div>
                        </motion.div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Scroll to bottom button - only when there are exchanges */}
              {exchanges.length > 0 && isScrolledUp && (
                <div className="absolute bottom-[200px] left-1/2 -translate-x-1/2 z-10 pointer-events-auto">
                  <button
                    onClick={scrollToBottom}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-chalk-surface/90 border border-chalk-border/40 text-[11px] text-slate-400 hover:text-slate-200 shadow-lg transition-colors"
                  >
                    <DownArrowIcon />
                    New messages
                  </button>
                </div>
              )}

              {/* Central visualization area */}
              <div className="relative flex items-center justify-center w-40 h-40 pointer-events-auto">
                {voiceState === 'recording' && <PulsingRings />}

                {/* Mic button — push to talk */}
                <motion.button
                  className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-colors pointer-events-auto ${
                    voiceState === 'recording'
                      ? 'bg-rose-500 shadow-lg shadow-rose-500/30'
                      : voiceState === 'speaking'
                        ? 'bg-emerald-500/20 border-2 border-emerald-500/40 hover:bg-emerald-500/30'
                        : isProcessing
                          ? 'bg-chalk-accent/20 border-2 border-chalk-accent/40'
                          : 'bg-white/10 hover:bg-white/20 border-2 border-white/20 hover:border-white/40'
                  }`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    if (voiceState !== 'recording') onStartRecording();
                  }}
                  onPointerUp={(e) => {
                    e.preventDefault();
                    if (voiceState === 'recording') onStopRecording();
                  }}
                  onPointerLeave={(e) => {
                    e.preventDefault();
                    if (voiceState === 'recording') onStopRecording();
                  }}
                  whileTap={{ scale: 0.95 }}
                >
                  {voiceState === 'speaking' ? (
                    <SoundWaveBars />
                  ) : isProcessing ? (
                    <ThinkingDots />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"
                      className={`w-8 h-8 ${voiceState === 'recording' ? 'text-white' : 'text-white/70'}`}
                    >
                      <path d="M12 2a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4Z" />
                      <path d="M6 11a.75.75 0 0 0-1.5 0 7.5 7.5 0 0 0 6.75 7.46v2.79a.75.75 0 0 0 1.5 0v-2.79A7.5 7.5 0 0 0 19.5 11a.75.75 0 0 0-1.5 0 6 6 0 0 1-12 0Z" />
                    </svg>
                  )}
                </motion.button>
              </div>

              {/* State label + duration */}
              <div className="text-center">
                <p className={`text-sm font-medium ${
                  voiceState === 'recording' ? 'text-rose-400'
                    : voiceState === 'speaking' ? 'text-emerald-400'
                      : isProcessing ? 'text-chalk-accent'
                        : 'text-white/50'
                }`}>
                  {stateLabel[voiceState]}
                </p>
                {voiceState === 'recording' && (
                  <p className="text-xs text-white/30 mt-1 font-mono">{formatDuration(recordingDuration)}</p>
                )}
              </div>

              {/* Error message */}
              {voiceError && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 text-center max-w-[280px] pointer-events-auto"
                >
                  {voiceError}
                </motion.div>
              )}

              {/* Live transcript / response */}
              {(voiceTranscript || voiceResponseText) && (
                <div className="w-full max-w-sm space-y-3 pointer-events-auto">
                  {voiceTranscript && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-right"
                    >
                      <span className="inline-block text-sm text-white/90 bg-white/10 rounded-2xl rounded-br-md px-3 py-2 max-w-[260px]">
                        {voiceTranscript}
                      </span>
                    </motion.div>
                  )}
                  {voiceResponseText && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="text-left"
                    >
                      <span className="inline-block text-sm text-white/90 bg-chalk-accent/15 border border-chalk-accent/20 rounded-2xl rounded-bl-md px-3 py-2 max-w-[260px]">
                        {voiceResponseText}
                      </span>
                    </motion.div>
                  )}
                </div>
              )}

              {/* Recent exchanges (last 2) */}
              {exchanges.length > 0 && !voiceTranscript && !voiceResponseText && (
                <div className="w-full max-w-sm space-y-2 opacity-50 pointer-events-auto">
                  {exchanges.slice(-2).map((ex) => (
                    <div key={ex.id} className="space-y-1">
                      <p className="text-xs text-white/50 text-right truncate">{ex.userText}</p>
                      <p className="text-xs text-white/40 text-left truncate">{ex.aiText}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Cancel button during processing */}
              {isProcessing && (
                <button
                  onClick={onCancelRecording}
                  className="text-xs text-white/40 hover:text-white/70 transition-colors pointer-events-auto"
                >
                  Cancel
                </button>
              )}
            </motion.div>
          )}

          {/* Timestamp tooltip */}
          <AnimatePresence>
            {tooltipInfo && (
              <TimestampTooltip
                seconds={tooltipInfo.seconds}
                segments={segments}
                position={tooltipInfo.position}
              />
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
