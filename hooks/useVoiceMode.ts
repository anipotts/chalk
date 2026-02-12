'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { TranscriptSegment, TranscriptSource } from '@/lib/video-utils';

export type VoiceState = 'idle' | 'recording' | 'transcribing' | 'thinking' | 'speaking';

interface VoiceExchange {
  id: string;
  userText: string;
  aiText: string;
  timestamp: number;
}

interface UseVoiceModeOptions {
  segments: TranscriptSegment[];
  currentTime: number;
  videoId: string;
  videoTitle?: string;
  voiceId: string | null;
  transcriptSource?: TranscriptSource;
}

interface UseVoiceModeReturn {
  voiceState: VoiceState;
  transcript: string;
  responseText: string;
  exchanges: VoiceExchange[];
  error: string | null;
  recordingDuration: number;
  startRecording: () => void;
  stopRecording: () => void;
  cancelRecording: () => void;
  stopPlayback: () => void;
}

export function useVoiceMode({
  segments,
  currentTime,
  videoId,
  videoTitle,
  voiceId,
  transcriptSource,
}: UseVoiceModeOptions): UseVoiceModeReturn {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [responseText, setResponseText] = useState('');
  const [exchanges, setExchanges] = useState<VoiceExchange[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const exchangesRef = useRef(exchanges);

  const currentTimeRef = useRef(currentTime);
  const segmentsRef = useRef(segments);
  currentTimeRef.current = currentTime;
  segmentsRef.current = segments;
  exchangesRef.current = exchanges;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioRef.current?.pause();
      clearInterval(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  /**
   * Interrupt everything in progress — stop audio, cancel API calls, stop recording.
   * Called automatically when user starts a new recording mid-conversation.
   */
  const interruptAll = useCallback(() => {
    // Stop any playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }

    // Abort any in-flight API calls (STT, LLM, TTS)
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    // Stop any active recording
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    mediaRecorderRef.current = null;

    // Release mic stream
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    // Clear timer
    clearInterval(timerRef.current);
  }, []);

  const startRecording = useCallback(async () => {
    // INTERRUPT: stop whatever is happening (speaking, thinking, etc.)
    interruptAll();

    setError(null);
    setTranscript('');
    setResponseText('');
    chunksRef.current = [];
    setRecordingDuration(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(100);
      setVoiceState('recording');

      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied';
      setError(msg);
      setVoiceState('idle');
    }
  }, [interruptAll]);

  const processRecording = useCallback(async (audioBlob: Blob) => {
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Step 1: STT
      setVoiceState('transcribing');
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const sttResp = await fetch('/api/voice-stt', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!sttResp.ok) {
        const data = await sttResp.json().catch(() => ({ error: 'Transcription failed' }));
        throw new Error(data.error || 'Transcription failed');
      }

      const { text: userText } = await sttResp.json();
      if (!userText || userText.trim().length === 0) {
        throw new Error('No speech detected. Try speaking louder or closer to the mic.');
      }
      setTranscript(userText);

      // Step 2: LLM
      setVoiceState('thinking');

      // Use ref to get latest exchanges (avoids stale closure)
      const history = exchangesRef.current.slice(-10).flatMap((ex) => [
        { role: 'user' as const, content: ex.userText },
        { role: 'assistant' as const, content: ex.aiText },
      ]);
      history.push({ role: 'user' as const, content: userText });

      const chatResp = await fetch('/api/video-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          currentTimestamp: currentTimeRef.current,
          segments: segmentsRef.current,
          history,
          model: 'sonnet',
          videoTitle,
          transcriptSource,
          voiceMode: true,
        }),
        signal: controller.signal,
      });

      if (!chatResp.ok) {
        throw new Error('AI response failed');
      }

      const aiText = await chatResp.text();
      setResponseText(aiText);

      // Add to exchanges immediately (so next recording has context)
      const exchange: VoiceExchange = {
        id: String(Date.now()),
        userText,
        aiText,
        timestamp: currentTimeRef.current,
      };
      setExchanges((prev) => [...prev, exchange]);

      // Step 3: TTS
      setVoiceState('speaking');
      const ttsResp = await fetch('/api/voice-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: aiText,
          voiceId: voiceId || undefined,
        }),
        signal: controller.signal,
      });

      if (!ttsResp.ok) {
        // TTS failed — show text, go idle (user can still read the response)
        setVoiceState('idle');
        return;
      }

      const audioBuffer = await ttsResp.arrayBuffer();
      const audioBlob2 = new Blob([audioBuffer], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob2);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setVoiceState('idle');
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };

      audio.onerror = () => {
        setVoiceState('idle');
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };

      await audio.play();
    } catch (err) {
      if (controller.signal.aborted) return; // Interrupted — not an error
      const msg = err instanceof Error ? err.message : 'Voice processing failed';
      setError(msg);
      setVoiceState('idle');
    }
  }, [videoTitle, voiceId, transcriptSource]);

  const stopRecording = useCallback(() => {
    clearInterval(timerRef.current);

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    recorder.onstop = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      if (blob.size === 0) {
        setError('No audio recorded');
        setVoiceState('idle');
        return;
      }

      processRecording(blob);
    };

    recorder.stop();
  }, [processRecording]);

  const cancelRecording = useCallback(() => {
    interruptAll();
    setVoiceState('idle');
    setTranscript('');
    setResponseText('');
    setRecordingDuration(0);
  }, [interruptAll]);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current = null;
    }
    setVoiceState('idle');
  }, []);

  return {
    voiceState,
    transcript,
    responseText,
    exchanges,
    error,
    recordingDuration,
    startRecording,
    stopRecording,
    cancelRecording,
    stopPlayback,
  };
}
