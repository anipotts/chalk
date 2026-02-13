'use client';

import { useState, useRef, useEffect, useCallback, type RefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TextInput } from './TextInput';
import { ExchangeMessage, renderRichContent, type UnifiedExchange } from './ExchangeMessage';
import { LearnModeQuiz } from './LearnModeQuiz';
import type { VoiceState } from '@/hooks/useVoiceMode';
import type { TranscriptSegment, TranscriptSource } from '@/lib/video-utils';
import type { ParsedQuiz, ParsedExplanation, LearnModePhase, LearnAction } from '@/hooks/useLearnMode';
import type { LearnOption } from '@/hooks/useLearnOptions';

interface InteractionOverlayProps {
  visible: boolean;
  viewSize?: 'compact' | 'default' | 'expanded';
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

  // Read aloud
  autoReadAloud: boolean;
  onToggleAutoReadAloud: (enabled: boolean) => void;
  playingMessageId: string | null;
  onPlayMessage: (id: string, text: string) => void;
  isReadAloudLoading: boolean;

  // Unified state
  exchanges: UnifiedExchange[];
  onClearHistory: () => void;

  blurLevel: 'none' | 'active';
  onSeek: (seconds: number) => void;
  onClose: () => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  pendingKey?: string | null;
  onConsumePendingKey?: () => void;

  // Learn mode
  learnPhase: LearnModePhase;
  learnSelectedAction: LearnAction | null;
  learnQuiz: ParsedQuiz | null;
  learnExplanation: ParsedExplanation | null;
  learnIntroText: string;
  learnResponseContent: string;
  learnExportableContent: string | null;
  learnAnswers: Map<number, string>;
  learnScore: { correct: number; total: number };
  learnThinking: string | null;
  learnThinkingDuration: number | null;
  learnLoading: boolean;
  learnError: string | null;
  learnOptions: LearnOption[];
  learnOptionsLoading: boolean;
  onOpenLearnMode: () => void;
  onSelectAction: (action: LearnAction) => void;
  onFocusInput?: () => void;
  onSelectAnswer: (questionIndex: number, optionId: string) => void;
  onNextBatch: () => void;
  onStopLearnMode: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* --- Voice mode visual elements --- */

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

export function InteractionOverlay({
  visible,
  viewSize = 'default',
  videoId,
  videoTitle,
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

  // Read aloud
  autoReadAloud,
  onToggleAutoReadAloud,
  playingMessageId,
  onPlayMessage,
  isReadAloudLoading,

  // Unified
  exchanges,
  onClearHistory,

  blurLevel,
  onSeek,
  onClose,
  inputRef,
  pendingKey,
  onConsumePendingKey,

  // Learn mode
  learnPhase,
  learnSelectedAction,
  learnQuiz,
  learnExplanation,
  learnIntroText,
  learnResponseContent,
  learnExportableContent,
  learnAnswers,
  learnScore,
  learnThinking,
  learnThinkingDuration,
  learnLoading,
  learnError,
  learnOptions,
  learnOptionsLoading,
  onOpenLearnMode,
  onSelectAction,
  onFocusInput,
  onSelectAnswer,
  onNextBatch,
  onStopLearnMode,
}: InteractionOverlayProps) {
  const [input, setInput] = useState('');
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const viewMaxWidth = viewSize === 'compact' ? 'max-w-2xl' : viewSize === 'expanded' ? 'max-w-6xl' : 'max-w-4xl';

  const handleTimestampSeek = useCallback((seconds: number) => {
    onSeek(seconds);
    onClose();
  }, [onSeek, onClose]);

  const isTextMode = voiceState === 'idle';

  // One-time cleanup of old localStorage keys
  useEffect(() => {
    try {
      localStorage.removeItem('chalk-chat-model');
      localStorage.removeItem('chalk-auto-pause-chat');
    } catch { /* ignore */ }
  }, []);

  // Consume pending key from keyboard shortcut that opened the overlay
  useEffect(() => {
    if (pendingKey) {
      setInput((prev) => prev + pendingKey);
      onConsumePendingKey?.();
      // Focus after the character is set
      requestAnimationFrame(() => inputRef?.current?.focus());
    }
  }, [pendingKey, onConsumePendingKey, inputRef]);

  const isLearnModeActive = learnPhase !== 'idle';
  const hasContent = exchanges.length > 0 || isTextStreaming || !!currentUserText || !!currentAiText || !!voiceTranscript || !!voiceResponseText || isLearnModeActive;

  // Show idle hint when: text mode + no exchanges + no input + no current text exchange + not in learn mode
  const showIdleHint = isTextMode && exchanges.length === 0 && !input && !currentUserText && !currentAiText && !isTextStreaming && !isLearnModeActive;

  // Auto-scroll
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    if (!isScrolledUp) scrollToBottom();
  }, [exchanges, currentAiText, scrollToBottom, isScrolledUp]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setIsScrolledUp(scrollHeight - scrollTop - clientHeight > 60);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput('');
    await onTextSubmit(text);
  }, [input, onTextSubmit]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="absolute inset-0 z-30 flex flex-col items-center md:justify-start md:p-4 md:pt-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Backdrop - clickable to close only when blur is active, otherwise clicks pass through to video */}
          <div
            className={`absolute inset-0 transition-all duration-300 ${
              blurLevel === 'active'
                ? 'bg-black/40 backdrop-blur-md cursor-pointer'
                : 'pointer-events-none'
            }`}
            onClick={(e) => {
              if (blurLevel === 'active' && e.target === e.currentTarget) {
                onClose();
              }
            }}
          />


          {/* UNIFIED INPUT MODE — swipe down to dismiss */}
          <motion.div
            key="text-mode"
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 500) onClose();
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`relative z-10 flex flex-col w-full ${viewMaxWidth} mx-auto pointer-events-none flex-1 min-h-0 md:flex-none md:aspect-video md:overflow-hidden md:rounded-xl md:border-[3px] md:border-chalk-accent md:bg-black/70 md:backdrop-blur-2xl md:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.5)] transition-[max-width] duration-300 ease-out ${
              hasContent ? 'items-center' : 'items-center justify-end'
            }`}
          >
              {/* Mobile grip indicator for swipe-to-close */}
              <div className="md:hidden w-8 h-1 rounded-full bg-white/20 mx-auto mb-3 flex-shrink-0 pointer-events-auto" />

              {/* Messages - unified container for all messages */}
              {hasContent && <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 w-full overflow-y-auto scroll-smooth space-y-3 md:space-y-4 px-2 md:px-5 py-2 md:py-4 pointer-events-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              >
                {/* Past exchanges — always shown */}
                {exchanges.map((exchange) => (
                  <ExchangeMessage
                    key={exchange.id}
                    exchange={exchange}
                    onSeek={handleTimestampSeek}
                    videoId={videoId}
                    onPlayMessage={onPlayMessage}
                    isPlaying={playingMessageId === exchange.id}
                    isReadAloudLoading={isReadAloudLoading && playingMessageId === exchange.id}
                  />
                ))}

                {/* Current streaming exchange - same styling as history */}
                {(currentUserText || currentAiText || voiceTranscript || voiceResponseText) && (
                  <div className="space-y-3">
                    {/* User message (text or voice transcript) */}
                    {(currentUserText || voiceTranscript) && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex justify-end w-full"
                      >
                        <div className="max-w-[85%] px-3.5 py-2 rounded-2xl bg-chalk-accent/90 text-white text-sm leading-relaxed break-words">
                          {currentUserText || voiceTranscript}
                        </div>
                      </motion.div>
                    )}
                    {/* AI response — uses same renderRichContent as exchange history */}
                    {(currentAiText || voiceResponseText) && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex justify-start w-full"
                      >
                        <div className="max-w-[85%]">
                          <div className="text-[15px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                            {renderRichContent(currentAiText || voiceResponseText, handleTimestampSeek, videoId)}
                            {(isTextStreaming || voiceState === 'thinking') && (
                              <span className="inline-block w-0.5 h-4 bg-chalk-accent animate-pulse ml-0.5 align-middle" />
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}

                {/* Error message */}
                {(textError || voiceError) && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2"
                  >
                    {textError || voiceError}
                  </motion.div>
                )}

                {/* Learn mode content — shown below chat, not replacing it */}
                {isLearnModeActive && (
                  <LearnModeQuiz
                    phase={learnPhase}
                    quiz={learnQuiz}
                    explanation={learnExplanation}
                    introText={learnIntroText}
                    responseContent={learnResponseContent}
                    exportableContent={learnExportableContent}
                    answers={learnAnswers}
                    score={learnScore}
                    selectedAction={learnSelectedAction}
                    thinking={learnThinking}
                    thinkingDuration={learnThinkingDuration}
                    isLoading={learnLoading}
                    error={learnError}
                    learnOptions={learnOptions}
                    learnOptionsLoading={learnOptionsLoading}
                    videoTitle={videoTitle}
                    videoId={videoId}
                    onSelectAnswer={onSelectAnswer}
                    onSelectAction={onSelectAction}
                    onFocusInput={onFocusInput}
                    onNextBatch={onNextBatch}
                    onStop={onStopLearnMode}
                    onSeek={handleTimestampSeek}
                  />
                )}
              </div>}

              {/* Scroll to bottom button */}
              {exchanges.length > 0 && isScrolledUp && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 pointer-events-auto">
                  <button
                    onClick={scrollToBottom}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-chalk-surface/90 border border-chalk-border/40 text-[11px] text-slate-400 hover:text-slate-200 shadow-lg transition-colors"
                  >
                    <DownArrowIcon />
                    New messages
                  </button>
                </div>
              )}
            </motion.div>

            {/* Input area — below the messages frame */}
            <div className={`relative z-10 flex-none w-full ${viewMaxWidth} mx-auto pointer-events-none md:mt-3 transition-[max-width] duration-300 ease-out`}>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className={`pointer-events-auto ${exchanges.length > 0 || isLearnModeActive ? 'flex-none w-full' : 'w-full max-w-md mx-auto'}`}
              >
                {/* Unified input row */}
                <div className="flex items-center gap-2">
                  <TextInput
                    value={input}
                    onChange={setInput}
                    onSubmit={handleSubmit}
                    isStreaming={isTextStreaming}
                    onStop={onStopTextStream}
                    placeholder="Ask about this video..."
                    inputRef={inputRef}
                    autoFocus={true}
                    rightSlot={
                      <button
                        type="button"
                        onClick={isLearnModeActive ? onStopLearnMode : onOpenLearnMode}
                        disabled={isTextStreaming}
                        className={`h-7 px-2.5 rounded-lg text-[11px] font-medium transition-all disabled:opacity-30 ${
                          isLearnModeActive
                            ? 'bg-chalk-accent/15 text-chalk-accent hover:bg-chalk-accent/25'
                            : 'bg-white/[0.06] hover:bg-white/[0.12] text-white/50 hover:text-white/80'
                        }`}
                        title={isLearnModeActive ? 'Exit Learn Mode' : 'Start Learn Mode'}
                        aria-label={isLearnModeActive ? 'Exit Learn Mode' : 'Start Learn Mode'}
                      >
                        Learn
                      </button>
                    }
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
                  {isTextStreaming ? (
                    <button
                      type="button"
                      onClick={onStopTextStream}
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
                {exchanges.length > 0 && (
                  <div className="mt-4 flex justify-center">
                    <button
                      onClick={onClearHistory}
                      className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors"
                      title="Clear conversation history"
                    >
                      Clear history
                    </button>
                  </div>
                )}
              </motion.div>
            </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
