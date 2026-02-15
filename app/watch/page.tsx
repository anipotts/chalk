"use client";

import { useState, useRef, useCallback, useEffect, Suspense, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { InteractionOverlay } from "@/components/InteractionOverlay";
import { useTranscriptStream } from "@/hooks/useTranscriptStream";
import { useVideoTitle } from "@/hooks/useVideoTitle";
import { useOverlayPhase } from "@/hooks/useOverlayPhase";
import { formatTimestamp, type IntervalSelection } from "@/lib/video-utils";
import { storageKey } from "@/lib/brand";
import { ChalkboardSimple, Play, ArrowBendUpLeft, MagnifyingGlass } from "@phosphor-icons/react";
import { KaraokeCaption } from "@/components/KaraokeCaption";
import type { MediaPlayerInstance } from "@vidstack/react";

import { useUnifiedMode } from "@/hooks/useUnifiedMode";
import { useVoiceClone } from "@/hooks/useVoiceClone";
import { useLearnMode } from "@/hooks/useLearnMode";
import { useLearnOptions } from "@/hooks/useLearnOptions";
import { useCurriculumContext } from "@/hooks/useCurriculumContext";
import { useKnowledgeContext } from "@/hooks/useKnowledgeContext";
import { SideVideoPanel, type SideVideoEntry } from "@/components/SideVideoPanel";
import { parseStoryboardSpec } from "@/lib/storyboard";
import { ChapterTimeline } from "@/components/ChapterTimeline";

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


function WatchContent() {
  const searchParams = useSearchParams();
  const videoId = searchParams.get("v") || "";
  const urlStartTime = searchParams.get("t");
  const playlistId = searchParams.get("list") || null;
  const navRouter = useRouter();
  const [navSearchValue, setNavSearchValue] = useState("");

  const { segments, status, statusMessage, error, source, progress, durationSeconds, metadata, storyboardSpec } =
    useTranscriptStream(videoId || null);

  const storyboardLevels = useMemo(
    () => (storyboardSpec ? parseStoryboardSpec(storyboardSpec) : []),
    [storyboardSpec],
  );
  const { title: videoTitle, channelName } = useVideoTitle(videoId || null);

  // Prefer hook title/channel, fall back to transcript metadata
  const effectiveTitle = videoTitle || metadata?.title || null;
  const effectiveChannel = channelName || metadata?.author || null;

  const [currentTime, setCurrentTime] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const { phase, lingerProgress, dispatch: overlayDispatch } = useOverlayPhase();
  const chatExpanded = phase === 'active' || phase === 'lingering';
  const inputVisible = phase !== 'dormant';

  const [showTranscript, setShowTranscript] = useState(false);
  const [sideStack, setSideStack] = useState<SideVideoEntry[]>([]);
  const [selectedInterval, setSelectedInterval] = useState<IntervalSelection | null>(null);
  const [continueFrom, setContinueFrom] = useState<number | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(false);
  const [viewSizeIndex, setViewSizeIndex] = useState(1); // start at 'default' (M)
  const viewSize = VIEW_SIZE_CYCLE[viewSizeIndex];

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
  const inputRef = useRef<HTMLElement>(null);
  const mobileInputRef = useRef<HTMLElement>(null);
  const lastDismissRef = useRef(0);
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
    enabled: chatExpanded,
  });

  // Knowledge graph context (populated by batch enrichment)
  const { knowledgeContext } = useKnowledgeContext(videoId);

  // Cross-video curriculum context (loads sibling video transcripts for playlist)
  const curriculum = useCurriculumContext(playlistId, videoId);

  // Unified interaction mode (text + voice + read aloud + explore)
  const unified = useUnifiedMode({
    segments,
    currentTime,
    videoId: videoId || "",
    videoTitle: effectiveTitle ?? undefined,
    voiceId,
    transcriptSource: source ?? undefined,
    knowledgeContext,
    curriculumContext: curriculum.curriculumContext,
    interval: selectedInterval,
  });

  // Learn mode (Opus 4.6 adaptive learning)
  const learnMode = useLearnMode({
    segments,
    currentTime,
    videoId: videoId || "",
    videoTitle: effectiveTitle ?? undefined,
  });

  // Pre-generated learn options (lazy — only fetched when learn mode is first opened)
  const { options: learnOptions, isLoading: learnOptionsLoading } =
    useLearnOptions({
      segments,
      videoTitle: effectiveTitle ?? undefined,
      channelName: effectiveChannel,
      enabled: unified.exploreMode,
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
    overlayDispatch({ type: 'VIDEO_PAUSE' });
  }, [overlayDispatch]);

  const handlePlay = useCallback(() => {
    setIsPaused(false);
    hasPlayedOnce.current = true;
    const hasExchanges = unified.exchanges.length > 0 || unified.isTextStreaming;
    overlayDispatch({ type: 'VIDEO_PLAY', hasExchanges });
  }, [overlayDispatch, unified.exchanges.length, unified.isTextStreaming]);

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

  const startVoiceMode = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.pause();
      } catch {
        /* ignore */
      }
    }
    overlayDispatch({ type: 'VOICE_START' });
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [overlayDispatch]);

  const handleAskAbout = useCallback((_timestamp: number, _text: string) => {
    overlayDispatch({ type: 'CONTENT_ARRIVED' });
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [overlayDispatch]);

  const handleIntervalSelect = useCallback((sel: IntervalSelection) => {
    setSelectedInterval(sel);
  }, []);

  const handleIntervalClear = useCallback(() => {
    setSelectedInterval(null);
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

  // Toggle explore mode (unified: subsumes both explore chat and learn mode)
  const toggleExploreMode = useCallback(() => {
    const entering = !unified.exploreMode;
    unified.setExploreMode(entering);

    if (entering) {
      // Entering explore mode -- expand overlay
      overlayDispatch({ type: 'CONTENT_ARRIVED' });
      unified.setExplorePills([]);
    } else {
      // Exiting explore mode -- clean up UI state only (exchanges persist in unified model)
      unified.setExplorePills([]);
      unified.stopExploreStream();
      unified.setExploreGoal(null);
      unified.setExploreError(null);
      // Also stop learn mode if active
      if (learnMode.phase !== 'idle') {
        learnMode.stopLearnMode();
      }
    }
  }, [unified.exploreMode, unified, overlayDispatch, learnMode]);

  const handleOpenLearnMode = useCallback(() => {
    learnMode.openActionSelector();
  }, [learnMode.openActionSelector]);

  const handleFocusInput = useCallback(() => {
    learnMode.stopLearnMode();
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [learnMode.stopLearnMode]);

  const handleMobileFocusInput = useCallback(() => {
    learnMode.stopLearnMode();
    setTimeout(() => mobileInputRef.current?.focus(), 100);
  }, [learnMode.stopLearnMode]);

  // Keyboard shortcuts — desktop only (mobile has no physical keyboard)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (window.innerWidth < 768) return;
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable = (e.target as HTMLElement)?.isContentEditable;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || isEditable;

      // Escape: collapse everything
      if (e.key === "Escape") {
        e.preventDefault();
        overlayDispatch({ type: 'ESCAPE' });
        inputRef.current?.blur();
        return;
      }

      // When typing in an input, don't capture shortcuts
      if (inInput) return;

      // V key: open voice mode
      if (e.key === "v" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        startVoiceMode();
        return;
      }

      // Player shortcuts — control video directly via playerRef
      try {
        const player = playerRef.current;
        if (player) {
          if (e.key === " " || e.key === "k") {
            e.preventDefault();
            if (player.paused) player.play(); else player.pause();
            return;
          }
          if (e.key === "j") {
            e.preventDefault();
            player.currentTime = Math.max(0, player.currentTime - 10);
            return;
          }
          if (e.key === "l") {
            e.preventDefault();
            player.currentTime += 10;
            return;
          }
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            player.currentTime = Math.max(0, player.currentTime - 5);
            return;
          }
          if (e.key === "ArrowRight") {
            e.preventDefault();
            player.currentTime += 5;
            return;
          }
        }
      } catch { /* Vidstack $state proxy may throw */ }
      // Other player keys — don't capture as type-to-activate
      const otherPlayerKeys = new Set(["f", ",", ".", "<", ">", "ArrowUp", "ArrowDown"]);
      if (otherPlayerKeys.has(e.key)) return;

      // Tab or / (slash): show input + focus (no character injection)
      if (e.key === "Tab" || e.key === "/") {
        e.preventDefault();
        overlayDispatch({ type: 'ACTIVATE' });
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }

      // Any other printable character (no Ctrl/Meta/Alt): type-to-activate
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        overlayDispatch({ type: 'ACTIVATE' });
        requestAnimationFrame(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            document.execCommand('insertText', false, e.key);
          }
        });
        return;
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [startVoiceMode, overlayDispatch]);

  // Click-away: zone-aware dismissal (desktop only)
  // - Input elements, input strip, message panel, scroll badges: excluded (no dismiss)
  // - Overlay backdrop (dim video area): dismiss + resume playback
  // - Everything else (outside border): dismiss only (no playback change)
  useEffect(() => {
    if (phase === 'dormant') return;
    function handleClickAway(e: PointerEvent) {
      // Skip on mobile — mobile uses flow layout, not overlay
      if (window.innerWidth < 768) return;
      const target = e.target as HTMLElement;
      if (target.closest('[contenteditable]') || target.closest('textarea') || target.closest('input[type="text"]')) return;
      if (target.closest('[data-input-strip]')) return;
      if (target.closest('[data-message-panel]')) return;
      if (target.closest('[data-scroll-badge]')) return;

      e.stopPropagation();
      const isBackdrop = !!target.closest('[data-overlay-backdrop]');
      overlayDispatch({ type: 'CLICK_AWAY' });
      lastDismissRef.current = Date.now();
      inputRef.current?.blur();

      // Backdrop click = "go back to watching" → resume playback
      if (isBackdrop) {
        try { playerRef.current?.play(); } catch {}
      }
    }
    // setTimeout(0) avoids catching the same click that opened the input
    const timer = setTimeout(() => {
      document.addEventListener('pointerdown', handleClickAway, true);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', handleClickAway, true);
    };
  }, [phase, overlayDispatch]);

  // Lingering phase auto-clears via rAF in useOverlayPhase — no setTimeout needed.
  // The VIDEO_PLAY dispatch (in handlePlay) transitions conversing→lingering,
  // and the progressive fade timer in the hook dispatches LINGER_EXPIRE after 12s.

  // Auto-expand chat when exchanges appear
  useEffect(() => {
    if (unified.exchanges.length > 0 || unified.isTextStreaming) {
      overlayDispatch({ type: 'CONTENT_ARRIVED' });
    }
  }, [unified.exchanges.length, unified.isTextStreaming, overlayDispatch]);

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

  // Single dim level drives all darkening: backdrop, grain, blue border
  const hasExchangeHistory = unified.exchanges.length > 0;
  const videoDimLevel =
    phase === 'dormant' ? 0
    : phase === 'active' ? (hasExchangeHistory ? 0.75 : 0.15)
    : 0.75 * (1 - lingerProgress); // lingering

  // Shared overlay props for both mobile and desktop InteractionOverlay instances
  const sharedOverlayProps = {
    segments,
    currentTime,
    videoId,
    videoTitle: effectiveTitle ?? undefined,
    transcriptSource: source ?? undefined,
    voiceId,
    isVoiceCloning: isCloning,
    voiceState: unified.voiceState,
    voiceTranscript: unified.voiceTranscript,
    voiceResponseText: unified.voiceResponseText,
    voiceError: unified.voiceError,
    recordingDuration: unified.recordingDuration,
    onStartRecording: unified.startRecording,
    onStopRecording: unified.stopRecording,
    onCancelRecording: unified.cancelRecording,
    isTextStreaming: unified.isTextStreaming,
    currentUserText: unified.currentUserText,
    currentAiText: unified.currentAiText,
    currentToolCalls: unified.currentToolCalls,
    currentRawAiText: unified.currentRawAiText,
    textError: unified.textError,
    onTextSubmit: unified.handleTextSubmit,
    onStopTextStream: unified.stopTextStream,
    onOpenVideo: handleOpenVideo,
    autoReadAloud: unified.autoReadAloud,
    onToggleAutoReadAloud: unified.setAutoReadAloud,
    playingMessageId: unified.playingMessageId,
    onPlayMessage: unified.playMessage,
    isReadAloudLoading: unified.isReadAloudLoading,
    exchanges: unified.exchanges,
    onClearHistory: unified.clearHistory,
    onSeek: handleSeek,
    learnPhase: learnMode.phase,
    learnSelectedAction: learnMode.selectedAction,
    learnQuiz: learnMode.currentQuiz,
    learnExplanation: learnMode.currentExplanation,
    learnIntroText: learnMode.introText,
    learnResponseContent: learnMode.responseContent,
    learnExportableContent: learnMode.exportableContent,
    learnAnswers: learnMode.answers,
    learnScore: learnMode.score,
    learnThinking: learnMode.thinking,
    learnThinkingDuration: learnMode.thinkingDuration,
    learnLoading: learnMode.isLoading,
    learnError: learnMode.error,
    learnOptions,
    learnOptionsLoading,
    onOpenLearnMode: handleOpenLearnMode,
    onSelectAction: learnMode.executeAction,
    onSelectAnswer: learnMode.selectAnswer,
    onNextBatch: learnMode.requestNextBatch,
    onStopLearnMode: learnMode.stopLearnMode,
    curriculumContext: curriculum.curriculumContext,
    curriculumVideoCount: curriculum.videoCount,
    exploreMode: unified.exploreMode,
    onToggleExploreMode: toggleExploreMode,
    onExploreSubmit: unified.handleExploreSubmit,
    onStopExploreStream: unified.stopExploreStream,
    exploreError: unified.exploreError,
    explorePills: unified.explorePills,
    isThinking: unified.isThinking,
    thinkingDuration: unified.thinkingDuration,
    storyboardLevels,
    interval: selectedInterval,
    onClearInterval: handleIntervalClear,
  } as const;

  return (
    <>
      {/* ==================== MOBILE LAYOUT ==================== */}
      {/* Simple vertical stack: header → video → chat. No overlay mechanics. */}
      <div className="md:hidden flex flex-col h-[100dvh] bg-chalk-bg animate-in fade-in duration-300">
        {/* Mobile header */}
        <div className="flex-none flex items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+8px)] pb-2 bg-chalk-bg border-b border-chalk-border/20">
          <a
            href="/"
            className="flex items-center p-2 -ml-1 text-white/60 active:text-white/90 transition-colors"
            aria-label="Back to home"
          >
            <ArrowBendUpLeft size={18} weight="bold" />
          </a>
          <div className="flex-1 min-w-0">
            {effectiveChannel && (
              <span className="text-[10px] text-slate-500 truncate block leading-tight">
                {effectiveChannel}
              </span>
            )}
            <span className="text-xs text-slate-400 truncate block leading-tight">
              {effectiveTitle || videoId}
            </span>
          </div>
          <SpeedControlButton playerRef={playerRef} />
        </div>

        {/* Video player — fixed aspect, hide when keyboard is open */}
        <div className={`flex-none relative bg-black transition-[height] duration-200 ease-out ${
          keyboardOpen ? 'h-0 overflow-hidden' : ''
        }`}>
          <VideoPlayer
            playerRef={playerRef}
            videoId={videoId}
            onPause={handlePause}
            onPlay={handlePlay}
            onTimeUpdate={handleTimeUpdate}
          />
          {/* Karaoke captions on video */}
          {hasSegments && (
            <div className="absolute bottom-0 left-0 right-0 px-3 pb-2 pt-8 bg-gradient-to-t from-black/70 to-transparent pointer-events-none z-[4]">
              <KaraokeCaption segments={segments} currentTime={currentTime} />
            </div>
          )}
        </div>

        {/* Chat area — fills remaining space */}
        <div className={`flex-1 flex flex-col min-h-0 ${keyboardOpen ? '' : 'pb-safe'}`}>
          <InteractionOverlay
            variant="mobile"
            expanded={true}
            phase={phase}
            lingerProgress={0}
            {...sharedOverlayProps}
            videoDimLevel={0}
            onClose={() => {}}
            onExpandOverlay={() => {}}
            onInteract={() => {}}
            inputRef={mobileInputRef}
            inputVisible={true}
            onInputFocus={() => overlayDispatch({ type: 'ACTIVATE' })}
            onInputBlur={() => {}}
            onFocusInput={handleMobileFocusInput}
          />
        </div>
      </div>

      {/* ==================== DESKTOP LAYOUT (unchanged) ==================== */}
      <div className="hidden md:flex h-[100dvh] bg-chalk-bg overflow-hidden animate-in fade-in duration-300 px-safe">
        {/* Main area — shrinks to 55% when side panel is open */}
        <div className={`flex flex-col min-w-0 transition-[flex,width] duration-300 ease-out ${
          sideStack.length > 0 ? "w-[55%] flex-none" : "flex-1"
        }`}>
          {/* Top bar */}
          <div className="flex flex-col flex-none bg-chalk-bg/80 backdrop-blur-md relative z-20">
            <div className="flex items-center gap-3 px-4 py-3">
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

            {/* Hint text */}
            {phase === 'dormant' && effectiveChannel && (
              <span className="hidden lg:inline text-xs whitespace-nowrap pointer-events-none text-slate-500 shrink-0">
                Start typing to talk to {effectiveChannel}
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

              {chatExpanded && unified.exchanges.length > 0 && (
                <button
                  onClick={unified.clearHistory}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-slate-500 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30 transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setShowTranscript((v) => !v)}
                className={`inline-flex px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                  showTranscript
                    ? "bg-chalk-accent/15 text-chalk-accent border border-chalk-accent/30"
                    : "text-slate-500 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30"
                }`}
              >
                Transcript
              </button>
            </div>
            </div>
            {/* Chapter timeline — replaces header border-b */}
            {hasSegments && durationSeconds && durationSeconds > 0 ? (
              <ChapterTimeline
                segments={segments}
                currentTime={currentTime}
                duration={durationSeconds}
                onSeek={handleSeek}
                keyMoments={knowledgeContext?.video?.key_moments}
                interval={selectedInterval}
                onIntervalSelect={handleIntervalSelect}
                onIntervalClear={handleIntervalClear}
              />
            ) : (
              <div className="h-px bg-chalk-border/30" />
            )}
          </div>

          {/* Video area */}
          <div
            onPointerDown={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest('button') || target.closest('textarea') || target.closest('input') || target.closest('iframe')) return;
              if (chatExpanded) return;
              if (Date.now() - lastDismissRef.current < 300) return;
              if (phase === 'dormant') {
                overlayDispatch({ type: 'ACTIVATE' });
                requestAnimationFrame(() => inputRef.current?.focus());
              }
            }}
            className="flex-1 flex flex-col overflow-hidden relative items-center justify-center"
          >
            <div className="overflow-hidden relative z-0 flex-none flex flex-col w-full px-4">
              {/* Container */}
              <div data-video-container data-playing={!isPaused || undefined} className={`w-full ${viewMaxWidth} mx-auto relative flex-none transition-[max-width] duration-[250ms] ease-out`}>
                {/* Video */}
                <div
                  className="group relative aspect-video rounded-xl overflow-hidden"
                  data-paused={isPaused || undefined}
                >
                  <VideoPlayer
                    playerRef={playerRef}
                    videoId={videoId}
                    onPause={handlePause}
                    onPlay={handlePlay}
                    onTimeUpdate={handleTimeUpdate}
                  />
                  {/* Click layer: covers video to intercept YouTube iframe clicks */}
                  {phase === 'dormant' && (
                    <div
                      className="absolute inset-0 z-[5] cursor-pointer"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        try {
                          const p = playerRef.current;
                          if (p) { p.paused ? p.play() : p.pause(); }
                        } catch {}
                      }}
                    />
                  )}
                  {/* "@ time" chip */}
                  {currentTime > 0 && phase === 'dormant' && (
                    <button
                      onClick={() => {
                        try { playerRef.current?.pause(); } catch {}
                        overlayDispatch({ type: 'ACTIVATE' });
                        requestAnimationFrame(() => {
                          if (inputRef.current) {
                            inputRef.current.focus();
                            document.execCommand('selectAll');
                            document.execCommand('insertText', false, `What's happening at [${Math.floor(currentTime / 60)}:${Math.floor(currentTime % 60).toString().padStart(2, '0')}]?`);
                          }
                        });
                      }}
                      className="inline-flex absolute right-3 bottom-3 group-focus-within:bottom-20 group-data-[paused]:bottom-20 z-10 items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-mono text-white/70 bg-black/50 backdrop-blur-sm border border-white/10 hover:bg-black/70 hover:text-white hover:border-white/20 transition-all duration-200 ease-out delay-[2000ms] group-focus-within:delay-0 group-data-[paused]:delay-0"
                    >
                      @ {formatTimestamp(Math.floor(currentTime))}
                    </button>
                  )}
                </div>

                {/* Interaction overlay */}
                <InteractionOverlay
                  expanded={chatExpanded}
                  phase={phase}
                  lingerProgress={lingerProgress}
                  {...sharedOverlayProps}
                  videoDimLevel={videoDimLevel}
                  onClose={() => overlayDispatch({ type: 'CLOSE' })}
                  onExpandOverlay={() => overlayDispatch({ type: 'CONTENT_ARRIVED' })}
                  onInteract={() => overlayDispatch({ type: 'INTERACT' })}
                  inputRef={inputRef}
                  inputVisible={inputVisible}
                  onInputFocus={() => overlayDispatch({ type: 'ACTIVATE' })}
                  onInputBlur={() => {}}
                  onFocusInput={handleFocusInput}
                />

                {/* Desktop captions */}
                {hasSegments && (
                  <div className={`flex items-center justify-center h-8 mt-2 overflow-hidden transition-opacity duration-200 ${
                    phase === 'dormant' ? 'opacity-100'
                    : phase === 'active' && !hasExchangeHistory ? 'opacity-70'
                    : 'opacity-0 pointer-events-none'
                  }`}>
                    <KaraokeCaption segments={segments} currentTime={currentTime} />
                  </div>
                )}

                {/* Video border */}
                <div
                  data-video-border
                  className={`absolute top-0 left-0 right-0 aspect-video rounded-xl border-[4px] pointer-events-none z-30 transition-colors duration-300 ease-out ${
                    isPaused ? 'border-white/[0.12]' : 'border-chalk-accent/90'
                  }`}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Side video panel — 45% split when open */}
        <div
          className={`flex flex-none overflow-hidden transition-[width] duration-300 ease-out ${
            sideStack.length > 0 ? "border-l w-[45%] border-chalk-border/30" : "w-0"
          }`}
        >
          {sideStack.length > 0 && (
            <div className="w-full h-full">
              <SideVideoPanel
                stack={sideStack}
                onPop={handleSidePopVideo}
                onClose={handleSideClose}
                onOpenVideo={handleOpenVideo}
              />
            </div>
          )}
        </div>

        {/* Transcript sidebar */}
        <div
          className={`flex flex-none overflow-hidden transition-[width] duration-[250ms] ease-out ${
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
    </>
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
