'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MediaPlayer, MediaProvider, type MediaPlayerInstance } from '@vidstack/react';
import { storageKey } from '@/lib/brand';
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';

/**
 * Safely read a property from the Vidstack player instance.
 * The player's internal $state proxy can throw "this.$state[prop] is not a function"
 * when React 19 strict mode tears down / double-mounts components while the proxy
 * is in an invalid state. This wrapper catches those errors gracefully.
 */
function safePlayerGet<T>(player: MediaPlayerInstance | null, getter: (p: MediaPlayerInstance) => T, fallback: T): T {
  if (!player) return fallback;
  try {
    return getter(player);
  } catch {
    return fallback;
  }
}

function safePlayerCall(player: MediaPlayerInstance | null, fn: (p: MediaPlayerInstance) => void): void {
  if (!player) return;
  try {
    fn(player);
  } catch {
    // Player proxy in invalid state — ignore
  }
}

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
        if (safePlayerGet(p, (pl) => pl.paused, true)) {
          safePlayerCall(p, (pl) => pl.play());
        } else {
          safePlayerCall(p, (pl) => pl.pause());
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        safePlayerCall(p, (pl) => { pl.currentTime = Math.max(0, pl.currentTime - 5); });
        break;
      case 'ArrowRight':
        e.preventDefault();
        safePlayerCall(p, (pl) => { pl.currentTime = pl.currentTime + 5; });
        break;
      case 'j':
        e.preventDefault();
        safePlayerCall(p, (pl) => { pl.currentTime = Math.max(0, pl.currentTime - 10); });
        break;
      case 'l':
        e.preventDefault();
        safePlayerCall(p, (pl) => { pl.currentTime = pl.currentTime + 10; });
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
        safePlayerCall(p, (pl) => {
          pl.playbackRate = Math.max(0.25, pl.playbackRate - 0.25);
          showSpeed(`${pl.playbackRate}x`);
          try { localStorage.setItem(storageKey('playback-speed'), String(pl.playbackRate)); } catch { /* ignore */ }
        });
        break;
      case '.':
      case '>':
        e.preventDefault();
        safePlayerCall(p, (pl) => {
          pl.playbackRate = Math.min(10, pl.playbackRate + 0.25);
          showSpeed(`${pl.playbackRate}x`);
          try { localStorage.setItem(storageKey('playback-speed'), String(pl.playbackRate)); } catch { /* ignore */ }
        });
        break;
    }
  }, [player, showSpeed]);

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
      playsInline
      keyDisabled
      autoPlay
      aspectRatio="16/9"
      onPause={() => onPause?.()}
      onPlay={() => onPlay?.()}
      onTimeUpdate={(e) => {
        try {
          const detail = e as unknown as { currentTime: number };
          if (typeof detail?.currentTime === 'number') {
            onTimeUpdate?.(detail.currentTime);
          }
        } catch {
          // Vidstack $state proxy may throw during teardown
        }
      }}
      onCanPlay={() => {
        try {
          const savedSpeed = localStorage.getItem(storageKey('playback-speed'));
          if (savedSpeed && player.current) {
            safePlayerCall(player.current, (pl) => { pl.playbackRate = parseFloat(savedSpeed); });
          }
        } catch { /* localStorage may throw in private browsing */ }
        onReady?.();
      }}
      className="w-full rounded-none md:rounded-2xl overflow-hidden bg-black"
    >
      <MediaProvider />
      <DefaultVideoLayout icons={defaultLayoutIcons} />
    </MediaPlayer>
    </div>
  );
}
