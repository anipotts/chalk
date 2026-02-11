'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MediaPlayer, MediaProvider, type MediaPlayerInstance } from '@vidstack/react';
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';

interface VideoPlayerProps {
  videoId: string;
  onPause?: () => void;
  onPlay?: () => void;
  onTimeUpdate?: (currentTime: number) => void;
  onReady?: () => void;
  playerRef?: React.RefObject<MediaPlayerInstance | null>;
}

export function VideoPlayer({ videoId, onPause, onPlay, onTimeUpdate, onReady, playerRef }: VideoPlayerProps) {
  const internalRef = useRef<MediaPlayerInstance>(null);
  const player = playerRef || internalRef;
  const [speedOverlay, setSpeedOverlay] = useState<string | null>(null);
  const speedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showSpeed = useCallback((speed: string) => {
    setSpeedOverlay(speed);
    if (speedTimerRef.current) clearTimeout(speedTimerRef.current);
    speedTimerRef.current = setTimeout(() => setSpeedOverlay(null), 1200);
  }, []);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const p = player.current;
    if (!p) return;

    // Don't intercept when typing in input/textarea
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        if (p.paused) {
          p.play();
        } else {
          p.pause();
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        p.currentTime = Math.max(0, p.currentTime - 5);
        break;
      case 'ArrowRight':
        e.preventDefault();
        p.currentTime = p.currentTime + 5;
        break;
      case 'j':
        e.preventDefault();
        p.currentTime = Math.max(0, p.currentTime - 10);
        break;
      case 'l':
        e.preventDefault();
        p.currentTime = p.currentTime + 10;
        break;
      case 'f':
        e.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          (p as unknown as HTMLElement).requestFullscreen?.();
        }
        break;
      case ',':
      case '<':
        e.preventDefault();
        p.playbackRate = Math.max(0.25, p.playbackRate - 0.25);
        showSpeed(`${p.playbackRate}x`);
        break;
      case '.':
      case '>':
        e.preventDefault();
        p.playbackRate = Math.min(3, p.playbackRate + 0.25);
        showSpeed(`${p.playbackRate}x`);
        break;
    }
  }, [player]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="relative">
    {speedOverlay && (
      <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
        <div className="px-4 py-2 rounded-xl bg-black/70 backdrop-blur-sm text-white text-lg font-bold animate-in fade-in zoom-in-95 duration-150">
          {speedOverlay}
        </div>
      </div>
    )}
    <MediaPlayer
      ref={player}
      src={`youtube/${videoId}`}
      autoPlay
      aspectRatio="16/9"
      crossOrigin
      onPause={() => onPause?.()}
      onPlay={() => onPlay?.()}
      onTimeUpdate={(e) => {
        const detail = e as unknown as { currentTime: number };
        if (typeof detail?.currentTime === 'number') {
          onTimeUpdate?.(detail.currentTime);
        }
      }}
      onCanPlay={() => onReady?.()}
      className="w-full rounded-xl overflow-hidden bg-black"
    >
      <MediaProvider />
      <DefaultVideoLayout icons={defaultLayoutIcons} />
    </MediaPlayer>
    </div>
  );
}
