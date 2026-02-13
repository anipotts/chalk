'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { VoiceState } from '@/hooks/useVoiceMode';
import { XCircle, Microphone } from '@phosphor-icons/react';

interface VoiceExchange {
  id: string;
  userText: string;
  aiText: string;
}

interface VoiceOverlayProps {
  visible: boolean;
  voiceState: VoiceState;
  transcript: string;
  responseText: string;
  exchanges: VoiceExchange[];
  error: string | null;
  recordingDuration: number;
  isCloning: boolean;
  hasClone: boolean;
  videoTitle?: string;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancel: () => void;
  onStopPlayback: () => void;
  onClose: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* --- Animated visual elements --- */

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

export function VoiceOverlay({
  visible,
  voiceState,
  transcript,
  responseText,
  exchanges,
  error,
  recordingDuration,
  isCloning,
  hasClone,
  videoTitle,
  onStartRecording,
  onStopRecording,
  onCancel,
  onStopPlayback,
  onClose,
}: VoiceOverlayProps) {
  const stateLabel = {
    idle: 'Hold to speak',
    recording: 'Listening...',
    transcribing: 'Hearing you...',
    thinking: 'Thinking...',
    speaking: 'Hold mic to interrupt',
  };

  const isProcessing = voiceState === 'transcribing' || voiceState === 'thinking';

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
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors"
            title="Close voice mode (Esc)"
          >
            <XCircle size={16} weight="bold" />
          </button>

          {/* Main content */}
          <div className="relative z-10 flex flex-col items-center gap-6 max-w-md px-6">
            {/* Speaker info */}
            {videoTitle && (
              <div className="text-center">
                <p className="text-xs text-white/40 mb-1">Talking to</p>
                <p className="text-sm text-white/80 font-medium truncate max-w-[300px]">{videoTitle}</p>
              </div>
            )}

            {/* Voice clone status */}
            {isCloning && (
              <div className="flex items-center gap-2 text-xs text-amber-400/80">
                <div className="w-3 h-3 border-2 border-amber-400/50 border-t-amber-400 rounded-full animate-spin" />
                Cloning speaker voice...
              </div>
            )}
            {hasClone && !isCloning && voiceState === 'idle' && (
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
                  // Can interrupt at ANY state — start a new recording
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
                  <Microphone size={32} weight="fill"
                    className={voiceState === 'recording' ? 'text-white' : 'text-white/70'}
                  />
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
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 text-center max-w-[280px]"
              >
                {error}
              </motion.div>
            )}

            {/* Live transcript / response */}
            {(transcript || responseText) && (
              <div className="w-full max-w-sm space-y-3">
                {transcript && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-right"
                  >
                    <span className="inline-block text-sm text-white/90 bg-white/10 rounded-2xl rounded-br-md px-3 py-2 max-w-[260px]">
                      {transcript}
                    </span>
                  </motion.div>
                )}
                {responseText && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-left"
                  >
                    <span className="inline-block text-sm text-white/90 bg-chalk-accent/15 border border-chalk-accent/20 rounded-2xl rounded-bl-md px-3 py-2 max-w-[260px]">
                      {responseText}
                    </span>
                  </motion.div>
                )}
              </div>
            )}

            {/* Recent exchanges (last 2) */}
            {exchanges.length > 0 && !transcript && !responseText && (
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
                onClick={onCancel}
                className="text-xs text-white/40 hover:text-white/70 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
