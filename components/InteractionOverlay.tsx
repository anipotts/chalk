'use client';

import { useState, useRef, useEffect, useCallback, type RefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TextInput } from './TextInput';
import { ExchangeMessage, type UnifiedExchange } from './ExchangeMessage';
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

export function InteractionOverlay({
  visible,
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
  const showIdleHint = isTextMode && exchanges.length === 0 && !input && !currentUserText && !currentAiText;

  // Show text input when in text mode (voice state is idle)
  const showTextInput = isTextMode;

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
          className="absolute inset-0 z-30 flex flex-col items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Backdrop with dynamic blur */}
          <div className={`absolute inset-0 ${blurLevel === 'full' ? 'bg-black/70' : 'bg-black/30'} backdrop-blur-xl`} />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors"
            title="Close (Esc)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>

          {/* IDLE HINT STATE */}
          {showIdleHint && (
            <motion.div
              key="idle-hint"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="relative z-10 cursor-pointer"
              onClick={() => inputRef?.current?.focus()}
            >
              <p className="text-slate-400 text-sm">
                Type to talk with {videoTitle ? <span className="text-white/80 font-medium">{videoTitle}</span> : 'this video'}
              </p>
            </motion.div>
          )}

          {/* TEXT MODE STATE */}
          {!showIdleHint && isTextMode && (
            <motion.div
              key="text-mode"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative z-10 w-full max-w-2xl mx-auto px-6 flex flex-col h-[80vh] max-h-[600px]"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="text-white/70 text-xs">
                  {videoTitle && <span className="font-medium">{videoTitle}</span>}
                </div>
                {exchanges.length > 0 && (
                  <button
                    onClick={onClearHistory}
                    className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors px-1.5 py-0.5"
                    title="Clear history"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Messages */}
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto scroll-smooth space-y-4 mb-4"
              >
                {/* Past exchanges */}
                {exchanges.map((exchange) => (
                  <ExchangeMessage
                    key={exchange.id}
                    exchange={exchange}
                    onSeek={onSeek}
                    videoId={videoId}
                  />
                ))}

                {/* Current streaming exchange */}
                {(currentUserText || currentAiText) && (
                  <div className="space-y-3">
                    {currentUserText && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex justify-end"
                      >
                        <div className="max-w-[80%] px-3.5 py-2 rounded-2xl rounded-br-sm bg-chalk-accent/90 text-white text-sm leading-relaxed break-words">
                          {currentUserText}
                        </div>
                      </motion.div>
                    )}
                    {currentAiText && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex justify-start"
                      >
                        <div className="text-[15px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                          {currentAiText}
                          {isTextStreaming && (
                            <span className="inline-block w-0.5 h-4 bg-chalk-accent/70 animate-pulse ml-0.5 align-middle" />
                          )}
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}

                {/* Error message */}
                {textError && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2"
                  >
                    {textError}
                  </motion.div>
                )}
              </div>

              {/* Scroll to bottom button */}
              {isScrolledUp && (
                <div className="absolute bottom-[72px] left-1/2 -translate-x-1/2 z-10">
                  <button
                    onClick={scrollToBottom}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-chalk-surface/90 border border-chalk-border/40 text-[11px] text-slate-400 hover:text-slate-200 shadow-lg transition-colors"
                  >
                    <DownArrowIcon />
                    New messages
                  </button>
                </div>
              )}

              {/* Text input */}
              {showTextInput && (
                <div className="flex-none">
                  <TextInput
                    value={input}
                    onChange={setInput}
                    onSubmit={handleSubmit}
                    isStreaming={isTextStreaming}
                    onStop={onStopTextStream}
                    placeholder="Ask about this video..."
                    inputRef={inputRef}
                    autoFocus={!showIdleHint}
                  />
                </div>
              )}
            </motion.div>
          )}

          {/* VOICE MODE STATE */}
          {!isTextMode && (
            <motion.div
              key="voice-mode"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative z-10 flex flex-col items-center gap-6 max-w-md px-6"
            >
              {/* Speaker info */}
              {videoTitle && (
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

              {/* Central visualization area */}
              <div className="relative flex items-center justify-center w-40 h-40">
                {voiceState === 'recording' && <PulsingRings />}

                {/* Mic button — push to talk */}
                <motion.button
                  className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-colors ${
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
                  className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 text-center max-w-[280px]"
                >
                  {voiceError}
                </motion.div>
              )}

              {/* Live transcript / response */}
              {(voiceTranscript || voiceResponseText) && (
                <div className="w-full max-w-sm space-y-3">
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
                <div className="w-full max-w-sm space-y-2 opacity-50">
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
                  className="text-xs text-white/40 hover:text-white/70 transition-colors"
                >
                  Cancel
                </button>
              )}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
