"use client";

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { InteractionOverlay } from "@/components/InteractionOverlay";
import { useTranscriptStream } from "@/hooks/useTranscriptStream";
import { useVideoTitle } from "@/hooks/useVideoTitle";
import { formatTimestamp } from "@/lib/video-utils";
import { storageKey } from "@/lib/brand";
import { ChalkboardSimple, Play, Microphone, ArrowBendUpLeft, MagnifyingGlass } from "@phosphor-icons/react";
import { KaraokeCaption } from "@/components/KaraokeCaption";
import type { MediaPlayerInstance } from "@vidstack/react";

import { useUnifiedMode } from "@/hooks/useUnifiedMode";
import { useVoiceClone } from "@/hooks/useVoiceClone";
import { useLearnMode } from "@/hooks/useLearnMode";
import { useLearnOptions } from "@/hooks/useLearnOptions";
import { useCurriculumContext } from "@/hooks/useCurriculumContext";
import { useKnowledgeContext } from "@/hooks/useKnowledgeContext";
import { SideVideoPanel, type SideVideoEntry } from "@/components/SideVideoPanel";

const VideoPlayer = dynamic(
  () =>
    import("@/components/VideoPlayer").then((m) => ({
      default: m.VideoPlayer,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex justify-center items-center w-full rounded-xl animate-pulse aspect-video bg-chalk-surface/30">
        <div className="flex flex-col gap-3 items-center">
          <div className="flex justify-center items-center w-12 h-12 rounded-full bg-chalk-surface/50">
            <Play size={24} weight="fill" className="text-slate-500" />
          </div>
          <span className="text-xs text-slate-500">Loading player...</span>
        </div>
      </div>
    ),
  },
);

const SPEED_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const VIEW_SIZE_CYCLE = ["compact", "default", "expanded"] as const;

function SpeedControlButton({
  playerRef,
}: {
  playerRef: React.RefObject<MediaPlayerInstance | null>;
}) {
  const [open, setOpen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      try {
        if (playerRef.current) setSpeed(playerRef.current.playbackRate);
      } catch {
        /* Vidstack $state proxy may throw during teardown */
      }
    }, 500);
    return () => clearInterval(interval);
  }, [playerRef]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleSelect = (s: number) => {
    try {
      if (playerRef.current) {
        playerRef.current.playbackRate = s;
        setSpeed(s);
        localStorage.setItem(storageKey("playback-speed"), String(s));
      }
    } catch {
      /* Vidstack $state proxy may throw */
    }
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`px-1.5 py-1 rounded-lg text-[11px] font-mono font-medium transition-colors ${
          speed !== 1
            ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
            : "text-slate-500 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30"
        }`}
        title="Playback speed"
      >
        {speed}x
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-28 rounded-xl border shadow-xl bg-chalk-surface border-chalk-border/40 shadow-black/30">
          <div className="overflow-y-auto p-1 max-h-64">
            {SPEED_PRESETS.map((s) => (
              <button
                key={s}
                onClick={() => handleSelect(s)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  speed === s
                    ? "bg-chalk-accent/15 text-chalk-accent font-medium"
                    : "text-slate-400 hover:text-chalk-text hover:bg-chalk-bg/40"
                }`}
              >
                {s}x{s === 1 ? " (Normal)" : ""}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* --- Mobile collapse/expand components --- */

function SectionGrip({
  onTap,
  sectionName,
}: {
  onTap: () => void;
  sectionName: string;
}) {
  return (
    <button
      onClick={onTap}
      aria-expanded="true"
      aria-label={`Collapse ${sectionName}`}
      className="md:hidden flex-none h-6 w-full flex items-center justify-center cursor-pointer active:bg-white/[0.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chalk-accent"
    >
      <div className="w-8 h-[3px] rounded-full bg-white/[0.25] active:scale-x-150 transition-transform" />
    </button>
  );
}

function WhisperBar({
  label,
  meta,
  onTap,
}: {
  label: string;
  meta?: string;
  onTap: () => void;
}) {
  return (
    <button
      onClick={onTap}
      aria-expanded="false"
      aria-label={`Expand ${label}`}
      className="md:hidden w-full h-10 flex items-center justify-between px-4 active:bg-white/[0.04] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chalk-accent"
    >
      <span className="text-[11px] text-slate-400 font-medium tracking-wide">
        {label}
      </span>
      <div className="flex gap-2 items-center">
        {meta && (
          <span className="text-[10px] text-slate-400 font-mono">{meta}</span>
        )}
        <span className="text-xs text-slate-400">&#9662;</span>
      </div>
    </button>
  );
}

function MobileChatTrigger({
  onTap,
  channelName,
}: {
  onTap: () => void;
  channelName?: string | null;
}) {
  return (
    <button
      onClick={onTap}
      className="md:hidden flex-none flex items-center gap-3 px-4 py-3 border-t border-chalk-border/30 bg-chalk-bg/95 backdrop-blur-md w-full active:bg-white/[0.03] transition-colors"
    >
      <div className="flex-1 text-xs text-left truncate text-slate-500">
        {channelName
          ? `Ask ${channelName} anything...`
          : "Ask about this video..."}
      </div>
      <Microphone size={20} weight="fill" className="flex-shrink-0 text-white/30" />
    </button>
  );
}

function WatchContent() {
  const searchParams = useSearchParams();
  const videoId = searchParams.get("v") || "";
  const urlStartTime = searchParams.get("t");
  const playlistId = searchParams.get("list") || null;
  const navRouter = useRouter();
  const [navSearchValue, setNavSearchValue] = useState("");

  const { segments, status, statusMessage, error, source, progress, durationSeconds, metadata } =
    useTranscriptStream(videoId || null);
  const { title: videoTitle, channelName } = useVideoTitle(videoId || null);

  // Prefer hook title/channel, fall back to transcript metadata
  const effectiveTitle = videoTitle || metadata?.title || null;
  const effectiveChannel = channelName || metadata?.author || null;

  const [currentTime, setCurrentTime] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const [interactionVisible, setInteractionVisible] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [sideStack, setSideStack] = useState<SideVideoEntry[]>([]);
  const [continueFrom, setContinueFrom] = useState<number | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [viewSizeIndex, setViewSizeIndex] = useState(1); // start at 'default' (M)
  const viewSize = VIEW_SIZE_CYCLE[viewSizeIndex];
  const [learnEverOpened, setLearnEverOpened] = useState(false);

  // Load preferences after mount to avoid hydration mismatch
  useEffect(() => {
    try {
      const layout = localStorage.getItem(storageKey("mobile-layout"));
      if (layout) {
        const { tc } = JSON.parse(layout);
        if (tc) setTranscriptCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Persist mobile collapse state
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey("mobile-layout"),
        JSON.stringify({ tc: transcriptCollapsed }),
      );
    } catch {
      /* ignore */
    }
  }, [transcriptCollapsed]);
  const playerRef = useRef<MediaPlayerInstance>(null);
  const progressSaveRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const currentTimeRef = useRef(0);
  const segmentsRef = useRef(segments);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasPlayedOnce = useRef(false);

  const hasSegments = segments.length > 0;

  const cycleViewSize = useCallback(() => {
    setViewSizeIndex((prev) => (prev + 1) % VIEW_SIZE_CYCLE.length);
  }, []);

  const viewMaxWidth =
    viewSize === "compact"
      ? "max-w-2xl"
      : viewSize === "expanded"
        ? "max-w-6xl"
        : "max-w-4xl";

  // Sync refs outside of render (React 19 safe)
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);
  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  // Save to recent videos (localStorage) so landing page shows them
  useEffect(() => {
    if (!videoId) return;
    try {
      const key = storageKey("recent-videos");
      const recent: Array<{
        id: string;
        url: string;
        title?: string;
        channelName?: string;
        timestamp: number;
      }> = JSON.parse(localStorage.getItem(key) || "[]");
      const existing = recent.find((v) => v.id === videoId);
      const filtered = recent.filter((v) => v.id !== videoId);
      filtered.unshift({
        id: videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: effectiveTitle || existing?.title,
        channelName: effectiveChannel || existing?.channelName,
        timestamp: Date.now(),
      });
      localStorage.setItem(key, JSON.stringify(filtered.slice(0, 10)));
    } catch {
      /* ignore */
    }
  }, [videoId, effectiveTitle, effectiveChannel]);

  // Voice clone hook — now channel-level
  const { voiceId, isCloning } = useVoiceClone({
    videoId: videoId || null,
    channelName: effectiveChannel,
    enabled: interactionVisible,
  });

  // Knowledge graph context (populated by batch enrichment)
  const { knowledgeContext } = useKnowledgeContext(videoId);

  // Unified interaction mode (text + voice + read aloud)
  const unified = useUnifiedMode({
    segments,
    currentTime,
    videoId: videoId || "",
    videoTitle: effectiveTitle ?? undefined,
    voiceId,
    transcriptSource: source ?? undefined,
    knowledgeContext,
  });

  // Learn mode (Opus 4.6 adaptive learning)
  const learnMode = useLearnMode({
    segments,
    currentTime,
    videoId: videoId || "",
    videoTitle: effectiveTitle ?? undefined,
  });

  // Cross-video curriculum context (loads sibling video transcripts for playlist)
  const curriculum = useCurriculumContext(playlistId, videoId);

  // Pre-generated learn options (lazy — only fetched when learn mode is first opened)
  const { options: learnOptions, isLoading: learnOptionsLoading } =
    useLearnOptions({
      segments,
      videoTitle: effectiveTitle ?? undefined,
      channelName: effectiveChannel,
      enabled: learnEverOpened,
    });

  // Load saved progress (priority: ?t= param > #t= hash > localStorage)
  useEffect(() => {
    if (!videoId) return;
    try {
      // URL ?t= param (e.g. ?t=120, ?t=2m30s)
      if (urlStartTime) {
        const parsed = parseFloat(urlStartTime);
        if (!isNaN(parsed) && parsed > 0) {
          setContinueFrom(parsed);
          return;
        }
      }
      const hash = window.location.hash;
      const hashMatch = hash.match(/^#t=(\d+(?:\.\d+)?)$/);
      if (hashMatch) {
        const seconds = parseFloat(hashMatch[1]);
        if (seconds > 0) {
          setContinueFrom(seconds);
          return;
        }
      }
      const saved = localStorage.getItem(storageKey(`progress-${videoId}`));
      if (saved) {
        const seconds = parseFloat(saved);
        if (seconds > 5) setContinueFrom(seconds);
      }
    } catch {
      /* ignore */
    }
  }, [videoId, urlStartTime]);

  // Save progress every 5s (refs avoid interval churn on every time update)
  const durationSecondsRef = useRef(durationSeconds);
  useEffect(() => { durationSecondsRef.current = durationSeconds; }, [durationSeconds]);

  useEffect(() => {
    if (!videoId) return;
    progressSaveRef.current = setInterval(() => {
      const t = currentTimeRef.current;
      if (t > 5) {
        localStorage.setItem(storageKey(`progress-${videoId}`), String(t));
        const dur = durationSecondsRef.current;
        if (dur && dur > 0) {
          localStorage.setItem(
            storageKey(`duration-${videoId}`),
            String(dur),
          );
        }
      }
    }, 5000);
    return () => clearInterval(progressSaveRef.current);
  }, [videoId]);

  // Seek to saved position once player is available
  useEffect(() => {
    if (continueFrom === null || !playerRef.current) return;
    const timer = setInterval(() => {
      try {
        if (playerRef.current && playerRef.current.duration > 0) {
          playerRef.current.currentTime = continueFrom;
          clearInterval(timer);
        }
      } catch {
        /* Vidstack $state proxy may throw during init */
      }
    }, 200);
    return () => clearInterval(timer);
  }, [continueFrom]);

  // Keyboard detection for mobile
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const handleResize = () => {
      setKeyboardOpen(vv.height < window.innerHeight * 0.75);
    };
    vv.addEventListener("resize", handleResize);
    return () => vv.removeEventListener("resize", handleResize);
  }, []);

  const handlePause = useCallback(() => {
    setIsPaused(true);
    if (hasPlayedOnce.current) {
      setInteractionVisible(true);
    }
  }, []);

  const handlePlay = useCallback(() => {
    setIsPaused(false);
    hasPlayedOnce.current = true;
  }, []);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleSeek = useCallback((seconds: number) => {
    try {
      if (playerRef.current) {
        playerRef.current.currentTime = seconds;
        playerRef.current.play();
      }
    } catch {
      /* Vidstack $state proxy may throw */
    }
  }, []);

  const toggleInteraction = useCallback(() => {
    setInteractionVisible((prev) => !prev);
  }, []);

  const startVoiceMode = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.pause();
      } catch {
        /* ignore */
      }
    }
    setInteractionVisible(true);
  }, []);

  const handleAskAbout = useCallback((_timestamp: number, _text: string) => {
    setInteractionVisible(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Side panel: open a reference video
  const handleOpenVideo = useCallback((vid: string, title: string, channelName: string, seekTo?: number) => {
    setSideStack(prev => {
      const entry: SideVideoEntry = { videoId: vid, title, channelName, seekTo };
      // Max stack depth 2
      if (prev.length >= 2) {
        return [prev[0], entry];
      }
      return [...prev, entry];
    });
  }, []);

  const handleSidePopVideo = useCallback(() => {
    setSideStack(prev => prev.slice(0, -1));
  }, []);

  const handleSideClose = useCallback(() => {
    setSideStack([]);
  }, []);

  const handleOpenLearnMode = useCallback(() => {
    setLearnEverOpened(true);
    learnMode.openActionSelector();
  }, [learnMode.openActionSelector]);

  const handleFocusInput = useCallback(() => {
    learnMode.stopLearnMode();
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [learnMode.stopLearnMode]);

  // Keyboard shortcuts — desktop only (mobile has no physical keyboard)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (window.innerWidth < 768) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      // Any alphanumeric key or space: open text mode and focus input
      if (
        /^[a-z0-9 ]$/i.test(e.key) &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !interactionVisible
      ) {
        e.preventDefault();
        setPendingKey(e.key);
        setInteractionVisible(true);
        return;
      }

      // V key: open voice mode
      if (e.key === "v" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        startVoiceMode();
      }

      // Escape: close overlay
      if (e.key === "Escape" && interactionVisible) {
        e.preventDefault();
        setInteractionVisible(false);
      }

      // F key: fullscreen
      if (e.key === "f" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const el = document.querySelector("media-player");
        if (el && document.fullscreenEnabled) {
          if (document.fullscreenElement) document.exitFullscreen();
          else el.requestFullscreen();
        }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [interactionVisible, startVoiceMode]);

  if (!videoId) {
    return (
      <div className="flex justify-center items-center h-screen bg-chalk-bg">
        <div className="text-center">
          <p className="mb-4 text-slate-400">No video specified</p>
          <a href="/" className="text-sm text-chalk-accent hover:underline">
            Go back home
          </a>
        </div>
      </div>
    );
  }

  // Blur: transparent while typing, subtle blur only when AI responses are visible
  const blurLevel: "none" | "active" =
    unified.exchanges.length > 0 ||
    unified.isTextStreaming ||
    learnMode.phase !== "idle"
      ? "active"
      : "none";

  return (
    <div className="flex h-[100dvh] bg-chalk-bg overflow-hidden animate-in fade-in duration-300 px-safe">
      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar — hidden on mobile, z-20 so speed dropdown escapes above the video area */}
        <div className="hidden md:flex flex-none items-center gap-3 px-4 py-3 border-b border-chalk-border/30 bg-chalk-bg/80 backdrop-blur-md relative z-20">
          {/* Left: chalk icon + compact search */}
          <a
            href="/"
            className="flex items-center gap-1.5 text-chalk-text hover:text-chalk-accent transition-colors shrink-0"
            title="Home"
          >
            <ChalkboardSimple size={18} />
            <span className="text-sm font-semibold">chalk</span>
          </a>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const val = navSearchValue.trim();
              if (val) {
                navRouter.push(`/?q=${encodeURIComponent(val)}`);
                setNavSearchValue("");
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] focus-within:ring-1 focus-within:ring-chalk-accent/40 focus-within:border-chalk-accent/30 transition-colors w-48"
          >
            <MagnifyingGlass size={13} className="text-slate-500 shrink-0" />
            <input
              type="text"
              value={navSearchValue}
              onChange={(e) => setNavSearchValue(e.target.value)}
              placeholder="Search videos, channels..."
              className="flex-1 bg-transparent text-xs text-chalk-text placeholder:text-slate-600 focus:outline-none min-w-0"
            />
          </form>
          <span className="text-slate-600/50">|</span>
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            {effectiveChannel && (
              <span className="text-[10px] text-slate-500 truncate">
                {effectiveChannel}
              </span>
            )}
            <span className="text-xs truncate text-slate-400">
              {effectiveTitle || videoId}
            </span>
          </div>

          {/* Centered hint — absolutely positioned so it doesn't shift the flex layout */}
          {!interactionVisible && effectiveChannel && (
            <span className="hidden absolute left-1/2 text-xs whitespace-nowrap -translate-x-1/2 pointer-events-none text-slate-500 lg:inline">
              Pause or start typing to talk to {effectiveChannel}
            </span>
          )}

          <div className="flex gap-2 items-center ml-auto">
            <button
              onClick={cycleViewSize}
              className={`px-1.5 py-1 rounded-lg text-[11px] font-mono font-medium transition-colors ${
                viewSize !== "default"
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                  : "text-slate-500 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30"
              }`}
              title={`View size: ${viewSize}`}
            >
              {viewSize === "compact"
                ? "S"
                : viewSize === "expanded"
                  ? "L"
                  : "M"}
            </button>
            <SpeedControlButton playerRef={playerRef} />

            {interactionVisible && unified.exchanges.length > 0 && (
              <button
                onClick={unified.clearHistory}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-slate-500 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30 transition-colors"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setShowTranscript((v) => !v)}
              className={`hidden md:inline-flex px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                showTranscript
                  ? "bg-chalk-accent/15 text-chalk-accent border border-chalk-accent/30"
                  : "text-slate-500 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30"
              }`}
            >
              Transcript
            </button>
          </div>
        </div>

        {/* Mobile header */}
        <div className="md:hidden flex-none flex items-center gap-2 px-2 pb-2 pt-[calc(env(safe-area-inset-top)+8px)] bg-chalk-bg/95 backdrop-blur-md border-b border-chalk-border/30">
          <a
            href="/"
            className="flex items-center p-2.5 -ml-1 text-white/60 active:text-white/90 transition-colors"
            aria-label="Back to home"
          >
            <ArrowBendUpLeft size={18} weight="bold" />
          </a>
          <ChalkboardSimple
            size={16}
            className="flex-shrink-0 text-chalk-text"
          />
          <div className="flex flex-col flex-1 min-w-0">
            {effectiveChannel && (
              <span className="text-[10px] text-slate-500 truncate leading-tight">
                {effectiveChannel}
              </span>
            )}
            <span className="text-xs leading-tight truncate text-slate-400">
              {effectiveTitle || videoId}
            </span>
          </div>
          <SpeedControlButton playerRef={playerRef} />
        </div>

        {/* Video area — on mobile: flex-none when transcript visible, flex-1 when overlay open or transcript collapsed */}
        <div
          className={`md:flex-1 flex flex-col overflow-hidden relative md:max-h-none transition-[flex,height] duration-[250ms] ease-out motion-reduce:transition-none ${
            keyboardOpen
              ? "flex-none h-0"
              : interactionVisible || transcriptCollapsed
                ? "flex-1 min-h-0"
                : "flex-none h-[28dvh]"
          }`}
        >
          <div className="overflow-hidden relative z-0 flex-1 p-0 md:flex md:flex-col md:items-center md:justify-center md:p-4">
            <div className={`w-full ${viewMaxWidth} transition-[max-width] duration-[250ms] ease-out`}>
              {/* Video — transparent border maintains sizing; visible border from persistent ring */}
              <div className="relative md:rounded-xl md:overflow-hidden md:border-[3px] md:border-transparent">
                <VideoPlayer
                  playerRef={playerRef}
                  videoId={videoId}
                  onPause={handlePause}
                  onPlay={handlePlay}
                  onTimeUpdate={handleTimeUpdate}
                />
                {/* Mobile: absolute overlay captions */}
                {hasSegments && !interactionVisible && (
                  <div className="md:hidden absolute right-0 bottom-0 left-0 z-10 px-2 pt-8 pb-2 bg-gradient-to-t to-transparent pointer-events-none from-black/60">
                    <KaraokeCaption
                      segments={segments}
                      currentTime={currentTime}
                    />
                  </div>
                )}
              </div>

              {/* Desktop caption strip — fixed height so video never shifts */}
              <div className="hidden md:flex items-center justify-center mt-3 h-[52px] overflow-hidden">
                {hasSegments && !interactionVisible && (
                  <KaraokeCaption
                    segments={segments}
                    currentTime={currentTime}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Persistent blue border ring — always visible, above overlay backdrop */}
          <div className="hidden md:flex absolute inset-0 flex-col items-center justify-center p-4 pointer-events-none z-[35]">
            <div className={`w-full ${viewMaxWidth} transition-[max-width] duration-[250ms] ease-out`}>
              <div className="aspect-video rounded-xl border-[3px] border-chalk-accent" />
              <div className="h-[52px] mt-3" />
            </div>
          </div>

          {/* Unified interaction overlay (text + voice + learn) */}
          <InteractionOverlay
            visible={interactionVisible}
            autoDismiss={!isPaused}
            viewSize={viewSize}
            segments={segments}
            currentTime={currentTime}
            videoId={videoId}
            videoTitle={effectiveTitle ?? undefined}
            transcriptSource={source ?? undefined}
            voiceId={voiceId}
            isVoiceCloning={isCloning}
            // Voice state
            voiceState={unified.voiceState}
            voiceTranscript={unified.voiceTranscript}
            voiceResponseText={unified.voiceResponseText}
            voiceError={unified.voiceError}
            recordingDuration={unified.recordingDuration}
            onStartRecording={unified.startRecording}
            onStopRecording={unified.stopRecording}
            onCancelRecording={unified.cancelRecording}
            // Text state
            isTextStreaming={unified.isTextStreaming}
            currentUserText={unified.currentUserText}
            currentAiText={unified.currentAiText}
            currentToolCalls={unified.currentToolCalls}
            textError={unified.textError}
            onTextSubmit={unified.handleTextSubmit}
            onStopTextStream={unified.stopTextStream}
            onOpenVideo={handleOpenVideo}
            // Read aloud
            autoReadAloud={unified.autoReadAloud}
            onToggleAutoReadAloud={unified.setAutoReadAloud}
            playingMessageId={unified.playingMessageId}
            onPlayMessage={unified.playMessage}
            isReadAloudLoading={unified.isReadAloudLoading}
            // Unified state
            exchanges={unified.exchanges}
            onClearHistory={unified.clearHistory}
            blurLevel={blurLevel}
            onSeek={handleSeek}
            onClose={() => setInteractionVisible(false)}
            inputRef={inputRef}
            pendingKey={pendingKey}
            onConsumePendingKey={() => setPendingKey(null)}
            // Learn mode
            learnPhase={learnMode.phase}
            learnSelectedAction={learnMode.selectedAction}
            learnQuiz={learnMode.currentQuiz}
            learnExplanation={learnMode.currentExplanation}
            learnIntroText={learnMode.introText}
            learnResponseContent={learnMode.responseContent}
            learnExportableContent={learnMode.exportableContent}
            learnAnswers={learnMode.answers}
            learnScore={learnMode.score}
            learnThinking={learnMode.thinking}
            learnThinkingDuration={learnMode.thinkingDuration}
            learnLoading={learnMode.isLoading}
            learnError={learnMode.error}
            learnOptions={learnOptions}
            learnOptionsLoading={learnOptionsLoading}
            onOpenLearnMode={handleOpenLearnMode}
            onSelectAction={learnMode.executeAction}
            onFocusInput={handleFocusInput}
            onSelectAnswer={learnMode.selectAnswer}
            onNextBatch={learnMode.requestNextBatch}
            onStopLearnMode={learnMode.stopLearnMode}
            curriculumContext={curriculum.curriculumContext}
            curriculumVideoCount={curriculum.videoCount}
          />
        </div>

        {/* Mobile transcript — collapsible; flex-1 fills remaining space, flex-none for collapsed/hidden */}
        <div
          className={`md:hidden flex flex-col border-t border-chalk-border/40 overflow-hidden transition-[flex,height] duration-[250ms] ease-out motion-reduce:transition-none ${
            keyboardOpen || interactionVisible
              ? "flex-none h-0"
              : transcriptCollapsed
                ? "flex-none h-10"
                : "flex-1 min-h-0"
          }`}
        >
          {transcriptCollapsed && !keyboardOpen ? (
            <WhisperBar
              label="Transcript"
              meta={
                status === "connecting" || status === "extracting"
                  ? "Loading..."
                  : segments.length === 0
                    ? "No transcript"
                    : formatTimestamp(currentTime)
              }
              onTap={() => setTranscriptCollapsed(false)}
            />
          ) : (
            <>
              <SectionGrip
                onTap={() => setTranscriptCollapsed(true)}
                sectionName="transcript"
              />
              <div className="overflow-hidden flex-1 min-h-0">
                <TranscriptPanel
                  segments={segments}
                  currentTime={currentTime}
                  onSeek={handleSeek}
                  status={status}
                  statusMessage={statusMessage}
                  source={source}
                  progress={progress}
                  error={error ?? undefined}
                  variant="mobile"
                  onAskAbout={handleAskAbout}
                  videoId={videoId}
                  videoTitle={effectiveTitle ?? undefined}
                />
              </div>
            </>
          )}
        </div>

        {/* Mobile chat trigger — opens full overlay */}
        {!interactionVisible && (
          <>
            <MobileChatTrigger
              onTap={() => setInteractionVisible(true)}
              channelName={effectiveChannel}
            />
            <div className="flex-none md:hidden bg-chalk-bg pb-safe" />
          </>
        )}
      </div>

      {/* Side video panel — reference video player (desktop only) */}
      <div
        className={`hidden md:flex flex-none overflow-hidden transition-[width] duration-[250ms] ease-out ${
          sideStack.length > 0 ? "border-l w-[440px] border-chalk-border/30" : "w-0"
        }`}
      >
        {sideStack.length > 0 && (
          <div className="w-[440px] flex-none h-full">
            <SideVideoPanel
              stack={sideStack}
              onPop={handleSidePopVideo}
              onClose={handleSideClose}
            />
          </div>
        )}
      </div>

      {/* Transcript sidebar — right (desktop), smooth slide */}
      <div
        className={`hidden md:flex flex-none overflow-hidden transition-[width] duration-[250ms] ease-out ${
          showTranscript && sideStack.length === 0 ? "border-l w-[360px] border-chalk-border/30" : "w-0"
        }`}
      >
        <div className="w-[360px] flex-none h-full">
          <TranscriptPanel
            segments={segments}
            currentTime={currentTime}
            onSeek={handleSeek}
            status={status}
            statusMessage={statusMessage}
            source={source}
            progress={progress}
            error={error ?? undefined}
            variant="sidebar"
            onClose={() => setShowTranscript(false)}
            onAskAbout={handleAskAbout}
            videoId={videoId}
            videoTitle={effectiveTitle ?? undefined}
          />
        </div>
      </div>
    </div>
  );
}

export default function WatchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center h-screen bg-chalk-bg">
          <div className="w-8 h-8 rounded-full border-2 animate-spin border-chalk-accent/30 border-t-chalk-accent" />
        </div>
      }
    >
      <WatchContent />
    </Suspense>
  );
}
