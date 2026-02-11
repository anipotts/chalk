'use client';

import { useRef, useEffect, useCallback } from 'react';
import { MediaPlayer, MediaProvider, type MediaPlayerInstance } from '@vidstack/react';
import '@vidstack/react/player/styles/base.css';

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
    }
  }, [player]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <MediaPlayer
      ref={player}
      src={`youtube/${videoId}`}
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
    </MediaPlayer>
  );
}
