'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactPlayer from 'react-player';
import { storageKey } from '@/lib/brand';

/**
 * Note: react-player with YouTube uses youtube-video-element under the hood.
 * The ref is actually a YoutubeVideoElement (extends HTMLElement), not a true
 * HTMLVideoElement — but it polyfills the media element API (.play(), .pause(),
 * .currentTime, .paused, .playbackRate, .duration), so it works at runtime.
 * `instanceof HTMLVideoElement` will return false.
 */

interface VideoPlayerProps {
  videoId: string;
  onPause?: () => void;
  onPlay?: () => void;
  onTimeUpdate?: (currentTime: number) => void;
  onReady?: () => void;
  playerRef?: React.RefObject<HTMLVideoElement | null>;
}

export function VideoPlayer({ videoId, onPause, onPlay, onTimeUpdate, onReady, playerRef }: VideoPlayerProps) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const player = playerRef || internalRef;
  const [speedOverlay, setSpeedOverlay] = useState<string | null>(null);
  const speedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

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
    const isEditable = (e.target as HTMLElement)?.isContentEditable;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || isEditable) return;

    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        if (p.paused) {
          p.play()?.catch(() => {});
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
          containerRef.current?.requestFullscreen?.();
        }
        break;
      case ',':
      case '<':
        e.preventDefault();
        {
          const newRate = Math.max(0.25, p.playbackRate - 0.25);
          p.playbackRate = newRate;
          showSpeed(`${newRate}x`);
          try { localStorage.setItem(storageKey('playback-speed'), String(newRate)); } catch { /* ignore */ }
        }
        break;
      case '.':
      case '>':
        e.preventDefault();
        {
          const newRate = Math.min(10, p.playbackRate + 0.25);
          p.playbackRate = newRate;
          showSpeed(`${newRate}x`);
          try { localStorage.setItem(storageKey('playback-speed'), String(newRate)); } catch { /* ignore */ }
        }
        break;
    }
  }, [player, showSpeed]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div ref={containerRef} className="relative aspect-video">
    {speedOverlay && (
      <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
        <div className="px-4 py-2 rounded-xl bg-black/70 backdrop-blur-sm text-white text-lg font-bold animate-in fade-in zoom-in-95 duration-150">
          {speedOverlay}
        </div>
      </div>
    )}
    <ReactPlayer
      ref={player}
      src={`https://www.youtube.com/watch?v=${videoId}`}
      controls
      playsInline
      style={{ aspectRatio: '16/9' }}
      width="100%"
      height="100%"
      onPause={() => onPause?.()}
      onPlay={() => onPlay?.()}
      onTimeUpdate={() => {
        const p = player.current;
        if (p && typeof p.currentTime === 'number') {
          onTimeUpdate?.(p.currentTime);
        }
      }}
      onLoadedMetadata={() => {
        try {
          const savedSpeed = localStorage.getItem(storageKey('playback-speed'));
          if (savedSpeed && player.current) {
            player.current.playbackRate = parseFloat(savedSpeed);
          }
        } catch { /* localStorage may throw in private browsing */ }
        // Auto-play after provider is ready
        player.current?.play()?.catch(() => {
          // Autoplay blocked — user will click the built-in play button
        });
        onReady?.();
      }}
      className="w-full rounded-none md:rounded-2xl overflow-hidden bg-black [&>*]:!w-full [&>*]:!h-full"
    />
    </div>
  );
}
