'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { formatTimestamp, type TranscriptSegment } from '@/lib/video-utils';
import { loadVideoNotes, saveVideoNotes } from '@/lib/video-sessions';
import type { TranscriptStatus, TranscriptMethod } from '@/hooks/useTranscriptStream';

interface Chapter {
  offset: number;
  label: string;
}

/**
 * Auto-generate chapter markers from transcript segments.
 * Groups segments into ~2-minute chunks and uses the first meaningful words as the label.
 */
function generateChapters(segments: TranscriptSegment[]): Chapter[] {
  if (segments.length < 10) return [];

  const totalDuration = segments[segments.length - 1].offset + (segments[segments.length - 1].duration || 0);
  if (totalDuration < 120) return []; // Skip for very short videos

  const chapterInterval = Math.max(120, Math.min(300, totalDuration / 8)); // 2-5 min, ~8 chapters
  const chapters: Chapter[] = [];
  let nextChapterTime = 0;

  for (const seg of segments) {
    if (seg.offset >= nextChapterTime) {
      const text = seg.text.trim();
      if (text.length > 3) {
        // Take first ~40 chars, break at word boundary
        let label = text.length > 40 ? text.slice(0, 40).replace(/\s\S*$/, '') + '...' : text;
        // Capitalize first letter
        label = label.charAt(0).toUpperCase() + label.slice(1);
        chapters.push({ offset: seg.offset, label });
        nextChapterTime = seg.offset + chapterInterval;
      }
    }
  }

  return chapters;
}

/**
 * Simple language detection from transcript text.
 * Uses common word frequency to detect the top few languages.
 */
function detectLanguage(segments: TranscriptSegment[]): string {
  if (segments.length === 0) return '';
  // Sample first ~20 segments
  const sample = segments.slice(0, 20).map((s) => s.text.toLowerCase()).join(' ');
  const words = sample.split(/\s+/);
  if (words.length < 5) return '';

  const patterns: Record<string, string[]> = {
    EN: ['the', 'and', 'is', 'to', 'of', 'that', 'it', 'in', 'for', 'you', 'this', 'with', 'are', 'was', 'have'],
    ES: ['de', 'que', 'en', 'es', 'el', 'la', 'los', 'por', 'con', 'una', 'del', 'las', 'como', 'para', 'pero'],
    FR: ['de', 'le', 'la', 'les', 'et', 'en', 'un', 'une', 'est', 'que', 'des', 'pas', 'dans', 'ce', 'pour'],
    DE: ['der', 'die', 'und', 'den', 'das', 'ist', 'ein', 'eine', 'nicht', 'ich', 'auf', 'auch', 'mit', 'sich', 'von'],
    PT: ['de', 'que', 'em', 'um', 'uma', 'para', 'com', 'por', 'mais', 'como', 'mas', 'foi', 'tem', 'sua', 'das'],
    JA: ['の', 'に', 'は', 'を', 'た', 'が', 'で', 'て', 'と', 'し', 'れ', 'さ', 'ある', 'いる', 'する'],
    KO: ['의', '이', '는', '를', '에', '한', '는', '로', '과', '도', '다', '에서', '것', '합니다'],
    ZH: ['的', '了', '在', '是', '我', '不', '人', '有', '他', '这', '中', '大', '来', '上', '个'],
  };

  let bestLang = '';
  let bestScore = 0;
  for (const [lang, keywords] of Object.entries(patterns)) {
    const score = keywords.filter((kw) => sample.includes(kw)).length;
    if (score > bestScore) { bestScore = score; bestLang = lang; }
  }

  return bestScore >= 3 ? bestLang : '';
}

interface TranscriptPanelProps {
  segments: TranscriptSegment[];
  currentTime: number;
  onSeek: (seconds: number) => void;
  status: TranscriptStatus;
  statusMessage?: string;
  method?: TranscriptMethod;
  progress?: number;
  error?: string;
  /** 'sidebar' = desktop sidebar (h-full, border-l), 'inline' = mobile below video */
  variant?: 'sidebar' | 'inline';
  onClose?: () => void;
  onRetry?: () => void;
  onAskAbout?: (timestamp: number, text: string) => void;
  videoId?: string;
  videoTitle?: string;
  onSearchMatchesChange?: (offsets: number[]) => void;
}

export function TranscriptPanel({
  segments,
  currentTime,
  onSeek,
  status,
  statusMessage,
  method,
  progress,
  error,
  variant = 'sidebar',
  onClose,
  onRetry,
  onAskAbout,
  videoId,
  videoTitle,
  onSearchMatchesChange,
}: TranscriptPanelProps) {
  const [search, setSearch] = useState('');
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('chalk-transcript-search-history') || '[]'); } catch { return []; }
  });
  const [showSearchHistory, setShowSearchHistory] = useState(false);
  const [userScrolled, setUserScrolled] = useState(false);
  const [followAlong, setFollowAlong] = useState(false);
  const [viewMode, setViewMode] = useState<'transcript' | 'chapters' | 'notes' | 'cloud'>('transcript');
  const [starred, setStarred] = useState<Set<number>>(new Set());
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [paragraphMode, setParagraphMode] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(false);
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg'>(() => {
    if (typeof window === 'undefined') return 'sm';
    return (localStorage.getItem('chalk-transcript-font') as 'sm' | 'md' | 'lg') || 'sm';
  });
  const fontSizeClass = fontSize === 'lg' ? 'text-sm' : fontSize === 'md' ? 'text-xs' : 'text-[11px]';
  const [highlightColor, setHighlightColor] = useState<'blue' | 'green' | 'purple'>('blue');
  const [questionPulse, setQuestionPulse] = useState(false);
  const lastQuestionOffset = useRef<number>(-1);
  const hlActive = highlightColor === 'blue' ? 'bg-blue-500/10 border-l-blue-400' : highlightColor === 'green' ? 'bg-emerald-500/10 border-l-emerald-400' : 'bg-purple-500/10 border-l-purple-400';
  const hlMatch = highlightColor === 'blue' ? 'bg-blue-500/20 border-l-blue-400 ring-1 ring-blue-400/30' : highlightColor === 'green' ? 'bg-emerald-500/20 border-l-emerald-400 ring-1 ring-emerald-400/30' : 'bg-purple-500/20 border-l-purple-400 ring-1 ring-purple-400/30';
  const [compactMode, setCompactMode] = useState(false);

  // Load starred segments from localStorage
  useEffect(() => {
    if (!videoId) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`chalk-stars-${videoId}`) || '[]');
      if (Array.isArray(saved)) setStarred(new Set(saved));
    } catch { /* ignore */ }
  }, [videoId]);

  const toggleStar = useCallback((offset: number) => {
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(offset)) next.delete(offset);
      else next.add(offset);
      if (videoId) localStorage.setItem(`chalk-stars-${videoId}`, JSON.stringify([...next]));
      return next;
    });
  }, [videoId]);
  // Per-segment bookmark notes
  const [segNotes, setSegNotes] = useState<Record<number, string>>(() => {
    if (!videoId || typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem(`chalk-seg-notes-${videoId}`) || '{}'); } catch { return {}; }
  });
  const [editingSegNote, setEditingSegNote] = useState<number | null>(null);
  const saveSegNote = useCallback((offset: number, note: string) => {
    setSegNotes((prev) => {
      const next = { ...prev };
      if (note.trim()) next[offset] = note.trim().slice(0, 50);
      else delete next[offset];
      if (videoId) localStorage.setItem(`chalk-seg-notes-${videoId}`, JSON.stringify(next));
      return next;
    });
    setEditingSegNote(null);
  }, [videoId]);
  const [notes, setNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const notesSaveTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const matchRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selCopied, setSelCopied] = useState(false);

  // Auto-generate chapters from segments
  const chapters = useMemo(() => generateChapters(segments), [segments]);

  // Language detection
  const lang = useMemo(() => detectLanguage(segments), [segments]);

  // Word cloud data
  const wordCloud = useMemo(() => {
    if (segments.length === 0) return [];
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'it', 'that', 'this', 'was', 'are', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'not', 'no', 'so', 'if', 'then', 'than', 'as', 'from', 'up', 'out', 'about', 'into', 'over', 'after', 'before', 'between', 'under', 'again', 'there', 'here', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same', 'too', 'very', 'just', 'because', 'through', 'during', 'also', 'its', 'they', 'them', 'their', 'we', 'our', 'you', 'your', 'he', 'she', 'him', 'her', 'his', 'my', 'me', 'i', 'what', 'which', 'who', 'whom', 'these', 'those', 'am', 'been', 'being', 'were', 'going', 'get', 'got', 'like', 'know', 'think', 'see', 'say', 'said', 'one', 'two', 'well', 'way', 'use', 'make', 'go', 'come', 'take', 'thing', 'things', 'kind', 'really', 'actually', 'right', 'something', 'even', 'much', 'still']);
    const freq = new Map<string, number>();
    for (const seg of segments) {
      const words = seg.text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
      for (const w of words) {
        if (w.length < 3 || stopWords.has(w)) continue;
        freq.set(w, (freq.get(w) || 0) + 1);
      }
    }
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 35)
      .map(([word, count]) => ({ word, count }));
  }, [segments]);

  // Word timeline data: for each cloud word, compute an 8-bucket distribution across video
  const wordTimelines = useMemo(() => {
    if (wordCloud.length === 0 || segments.length === 0) return new Map<string, number[]>();
    const totalDur = segments[segments.length - 1].offset + (segments[segments.length - 1].duration || 0);
    if (totalDur <= 0) return new Map<string, number[]>();
    const buckets = 8;
    const bucketDur = totalDur / buckets;
    const result = new Map<string, number[]>();
    for (const { word } of wordCloud) {
      const timeline = Array(buckets).fill(0) as number[];
      for (const seg of segments) {
        if (seg.text.toLowerCase().includes(word)) {
          const b = Math.min(buckets - 1, Math.floor(seg.offset / bucketDur));
          timeline[b]++;
        }
      }
      result.set(word, timeline);
    }
    return result;
  }, [wordCloud, segments]);

  // Key terms for auto-highlighting (top 12 meaningful words) with metadata
  const keyTerms = useMemo(() => {
    if (wordCloud.length === 0) return new Set<string>();
    return new Set(wordCloud.slice(0, 12).map((w) => w.word));
  }, [wordCloud]);

  // Word density sparkline data (10 buckets)
  const sparklinePoints = useMemo(() => {
    if (segments.length < 10) return '';
    const buckets = 10;
    const perBucket = Math.ceil(segments.length / buckets);
    const densities: number[] = [];
    for (let b = 0; b < buckets; b++) {
      const slice = segments.slice(b * perBucket, (b + 1) * perBucket);
      const words = slice.reduce((acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length, 0);
      densities.push(words / Math.max(1, slice.length));
    }
    const max = Math.max(...densities, 1);
    const h = 14;
    const w = 50;
    return densities.map((d, i) => `${(i / (buckets - 1)) * w},${h - (d / max) * h}`).join(' ');
  }, [segments]);

  // Term metadata: count + first appearance timestamp
  const termMeta = useMemo(() => {
    const meta = new Map<string, { count: number; firstAt: number }>();
    for (const { word, count } of wordCloud.slice(0, 12)) {
      const seg = segments.find((s) => s.text.toLowerCase().includes(word));
      meta.set(word, { count, firstAt: seg?.offset || 0 });
    }
    return meta;
  }, [wordCloud, segments]);

  // Speaker change detection (heuristic: gaps > 2s or question→answer patterns)
  const speakerChanges = useMemo(() => {
    if (segments.length < 5) return new Set<number>();
    const changes = new Set<number>();
    for (let i = 1; i < segments.length; i++) {
      const prev = segments[i - 1];
      const curr = segments[i];
      const gap = curr.offset - (prev.offset + (prev.duration || 0));
      const prevEndsQuestion = prev.text.trim().endsWith('?');
      const prevIsShort = prev.text.split(/\s+/).length < 6;
      // Detect speaker change on significant pause or question→answer transition
      if (gap > 2 || (prevEndsQuestion && !curr.text.trim().endsWith('?')) || (prevIsShort && gap > 1.2)) {
        changes.add(i);
      }
    }
    return changes;
  }, [segments]);

  // Transcript stats
  const stats = useMemo(() => {
    if (segments.length === 0) return null;
    const totalWords = segments.reduce((acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length, 0);
    const readMinutes = Math.max(1, Math.round(totalWords / 200));
    const lastSeg = segments[segments.length - 1];
    const totalDuration = lastSeg.offset + (lastSeg.duration || 0);
    const speakingWPM = totalDuration > 0 ? Math.round(totalWords / (totalDuration / 60)) : 0;
    const avgSegDuration = segments.reduce((a, s) => a + (s.duration || 0), 0) / segments.length;
    const allWords = segments.flatMap((s) => s.text.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
    const uniqueWords = new Set(allWords).size;
    const totalSentences = segments.reduce((c, s) => c + (s.text.match(/[.!?]+/g) || []).length, 0);
    const avgSentenceLength = totalSentences > 0 ? Math.round(totalWords / totalSentences) : 0;
    return { totalWords, readMinutes, speakingWPM, avgSegDuration, uniqueWords, avgSentenceLength };
  }, [segments]);

  // Per-segment word density (normalized 0-1 relative to max)
  const segDensities = useMemo(() => {
    if (segments.length < 5) return new Map<number, number>();
    const wordCounts = segments.map((s) => s.text.split(/\s+/).filter(Boolean).length);
    const maxWords = Math.max(...wordCounts, 1);
    const densities = new Map<number, number>();
    for (let i = 0; i < segments.length; i++) {
      densities.set(i, wordCounts[i] / maxWords);
    }
    return densities;
  }, [segments]);

  // Topic boundary detection: vocabulary overlap between windows of segments
  const topicBoundaries = useMemo(() => {
    if (segments.length < 20) return new Map<number, string>();
    const windowSize = 5;
    const boundaries = new Map<number, string>();
    for (let i = windowSize; i < segments.length - windowSize; i++) {
      const before = segments.slice(i - windowSize, i).map((s) => s.text.toLowerCase()).join(' ');
      const after = segments.slice(i, i + windowSize).map((s) => s.text.toLowerCase()).join(' ');
      const beforeWords = new Set(before.replace(/[^a-z\s]/g, '').split(/\s+/).filter((w) => w.length > 4));
      const afterWords = new Set(after.replace(/[^a-z\s]/g, '').split(/\s+/).filter((w) => w.length > 4));
      if (beforeWords.size < 3 || afterWords.size < 3) continue;
      const overlap = [...beforeWords].filter((w) => afterWords.has(w)).length;
      const similarity = overlap / Math.min(beforeWords.size, afterWords.size);
      if (similarity < 0.15) {
        // Low overlap = topic shift. Extract top keyword from upcoming window.
        const freq = new Map<string, number>();
        for (const w of afterWords) freq.set(w, (freq.get(w) || 0) + 1);
        const topWord = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
        boundaries.set(i, topWord);
        // Skip ahead to avoid multiple boundaries in a row
        i += windowSize;
      }
    }
    return boundaries;
  }, [segments]);

  // Load notes from Supabase
  useEffect(() => {
    if (videoId) {
      loadVideoNotes(videoId).then(setNotes);
    }
  }, [videoId]);

  // Auto-save notes with debounce
  const handleNotesChange = useCallback((value: string) => {
    setNotes(value);
    if (notesSaveTimeout.current) clearTimeout(notesSaveTimeout.current);
    if (!videoId) return;
    setNotesSaving(true);
    notesSaveTimeout.current = setTimeout(() => {
      saveVideoNotes(videoId, value, videoTitle).then(() => setNotesSaving(false));
    }, 1000);
  }, [videoId, videoTitle]);

  // Insert timestamp at cursor
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const insertTimestamp = useCallback(() => {
    if (!notesRef.current) return;
    const ts = formatTimestamp(currentTime);
    const { selectionStart, selectionEnd } = notesRef.current;
    const before = notes.slice(0, selectionStart);
    const after = notes.slice(selectionEnd);
    const newVal = `${before}[${ts}] ${after}`;
    handleNotesChange(newVal);
    setTimeout(() => {
      if (notesRef.current) {
        const pos = selectionStart + ts.length + 3;
        notesRef.current.selectionStart = pos;
        notesRef.current.selectionEnd = pos;
        notesRef.current.focus();
      }
    }, 0);
  }, [currentTime, notes, handleNotesChange]);

  // Text selection actions
  const [selectionToolbar, setSelectionToolbar] = useState<{ text: string; x: number; y: number; segOffset?: number } | null>(null);

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (text && text.length > 5 && scrollRef.current) {
      const range = sel!.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const containerRect = scrollRef.current.getBoundingClientRect();
      const segEl = range.startContainer.parentElement?.closest('[data-seg-offset]') as HTMLElement | null;
      const segOffset = segEl ? parseFloat(segEl.dataset.segOffset || '0') : undefined;
      setSelectionToolbar({
        text,
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.top - containerRect.top - 8,
        segOffset,
      });
      setSelCopied(false);
    } else {
      setSelectionToolbar(null);
    }
  }, []);

  // Clear selection toolbar when clicking elsewhere
  useEffect(() => {
    function handleDown() {
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel?.toString().trim()) setSelectionToolbar(null);
      }, 100);
    }
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, []);

  const isInline = variant === 'inline';
  const isLoading = status === 'connecting' || status === 'extracting' || status === 'downloading';
  const isTranscribing = status === 'transcribing';
  const isStreaming = status === 'streaming';
  const isComplete = status === 'complete';
  const isSTT = method === 'deepgram' || method === 'whisper';

  // Wrapper class differs between sidebar and inline
  const wrapperClass = isInline
    ? 'flex flex-col h-full bg-chalk-surface/20 border-t border-chalk-border/30'
    : 'flex flex-col h-full bg-chalk-surface/30 border-l border-chalk-border/30';

  // Find the active segment index
  const activeIndex = segments.findIndex((seg, i) => {
    const next = segments[i + 1];
    return currentTime >= seg.offset && (!next || currentTime < next.offset);
  });

  // Auto-scroll to active segment (unless user has manually scrolled, or followAlong overrides)
  useEffect(() => {
    if ((followAlong || !userScrolled) && activeRef.current && scrollRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex, userScrolled, followAlong]);

  // Detect question segments becoming active in followAlong mode
  useEffect(() => {
    if (!followAlong || activeIndex < 0 || activeIndex >= segments.length) return;
    const seg = segments[activeIndex];
    if (seg.text.trim().endsWith('?') && lastQuestionOffset.current !== seg.offset) {
      lastQuestionOffset.current = seg.offset;
      setQuestionPulse(true);
      const t = setTimeout(() => setQuestionPulse(false), 3000);
      return () => clearTimeout(t);
    }
  }, [activeIndex, followAlong, segments]);

  // Restore scroll position from localStorage on mount
  useEffect(() => {
    if (!videoId || !scrollRef.current) return;
    try {
      const saved = localStorage.getItem(`chalk-transcript-scroll-${videoId}`);
      if (saved) scrollRef.current.scrollTop = parseFloat(saved);
    } catch { /* ignore */ }
  }, [videoId]);

  // Detect manual scroll → pause auto-scroll for 5 seconds + save position
  const scrollSaveTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleScroll = useCallback(() => {
    setUserScrolled(true);
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => setUserScrolled(false), 5000);
    // Debounced save of scroll position
    if (videoId && scrollRef.current) {
      if (scrollSaveTimeout.current) clearTimeout(scrollSaveTimeout.current);
      scrollSaveTimeout.current = setTimeout(() => {
        try { localStorage.setItem(`chalk-transcript-scroll-${videoId}`, String(scrollRef.current?.scrollTop || 0)); } catch { /* ignore */ }
      }, 500);
    }
  }, [videoId]);

  // Filter segments by search and starred filter (memoized)
  const filtered = useMemo(() => {
    let result = segments;
    if (showStarredOnly) {
      result = result.filter((s) => starred.has(s.offset));
    }
    if (search.trim()) {
      result = result.filter((s) => s.text.toLowerCase().includes(search.toLowerCase()));
    }
    return result;
  }, [search, segments, showStarredOnly, starred]);

  const matchCount = search.trim() ? filtered.length : 0;

  // Report search match offsets to parent (for timeline markers)
  useEffect(() => {
    if (onSearchMatchesChange) {
      onSearchMatchesChange(search.trim() ? filtered.map((s) => s.offset) : []);
    }
  }, [filtered, search, onSearchMatchesChange]);

  // Reset match index when search changes
  useEffect(() => {
    setSearchMatchIndex(0);
    matchRefs.current.clear();
  }, [search]);

  // Scroll to current match
  useEffect(() => {
    if (matchCount > 0 && matchRefs.current.has(searchMatchIndex)) {
      matchRefs.current.get(searchMatchIndex)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [searchMatchIndex, matchCount]);

  const goToNextMatch = useCallback(() => {
    setSearchMatchIndex((prev) => (prev + 1) % matchCount);
  }, [matchCount]);

  const goToPrevMatch = useCallback(() => {
    setSearchMatchIndex((prev) => (prev - 1 + matchCount) % matchCount);
  }, [matchCount]);

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setViewMode('transcript');
        searchInputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  // Loading state (before any segments arrive)
  if ((isLoading || isTranscribing) && segments.length === 0) {
    const label = isTranscribing
      ? (statusMessage || 'Transcribing')
      : status === 'connecting' ? 'Connecting' : (statusMessage || 'Fetching captions');
    return (
      <div className={wrapperClass}>
        <div className="p-4 border-b border-chalk-border/30">
          <h3 className="text-sm font-medium text-chalk-text">Transcript</h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 px-6 w-full max-w-[200px]">
            <span className="text-slate-400 text-sm text-center animate-pulse">
              {label}<span className="inline-flex w-[1.5ch]"><PulsingEllipsis /></span>
            </span>
            {isTranscribing && typeof progress === 'number' && progress > 0 && (
              <div className="w-full bg-chalk-border/30 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-chalk-accent/60 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'error' && segments.length === 0) {
    return (
      <div className={wrapperClass}>
        <div className="p-4 border-b border-chalk-border/30">
          <h3 className="text-sm font-medium text-chalk-text">Transcript</h3>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center space-y-3">
            <p className="text-sm text-slate-400">{error || 'Failed to load transcript'}</p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-3 py-1.5 rounded-lg text-xs bg-chalk-surface/60 border border-chalk-border/30 text-slate-300 hover:bg-chalk-surface hover:text-chalk-text transition-colors"
              >
                Try again
              </button>
            )}
            <p className="text-[10px] text-slate-500">You can still use the chat — it will work without transcript context</p>
          </div>
        </div>
      </div>
    );
  }

  // Reading position (currentTime / totalDuration)
  const readingProgress = useMemo(() => {
    if (segments.length === 0) return 0;
    const last = segments[segments.length - 1];
    const total = last.offset + (last.duration || 0);
    return total > 0 ? Math.min(currentTime / total, 1) : 0;
  }, [segments, currentTime]);

  return (
    <div className={wrapperClass}>
      {/* Reading position indicator */}
      {segments.length > 0 && (
        <div className="relative">
          <div className="h-0.5 bg-chalk-border/10 w-full">
            <div
              className="h-full bg-chalk-accent/40 transition-[width] duration-500 ease-linear"
              style={{ width: `${readingProgress * 100}%` }}
            />
          </div>
          {currentTime > 0 && (() => {
            const totalDur = segments[segments.length - 1].offset + (segments[segments.length - 1].duration || 0);
            const remaining = Math.max(0, totalDur - currentTime);
            if (remaining < 1) return null;
            const m = Math.floor(remaining / 60);
            const s = Math.round(remaining % 60);
            return <span className="absolute right-1 -top-3.5 text-[8px] text-slate-600 tabular-nums">-{m}:{s.toString().padStart(2, '0')}</span>;
          })()}
        </div>
      )}
      {/* Transcript density heatmap bar */}
      {viewMode === 'transcript' && segments.length > 10 && (() => {
        const totalDur = segments[segments.length - 1].offset + (segments[segments.length - 1].duration || 0);
        if (totalDur <= 0) return null;
        const bars = 40;
        const barDur = totalDur / bars;
        const data = Array.from({ length: bars }, (_, i) => {
          const t0 = i * barDur;
          const segs = segments.filter((s) => s.offset >= t0 && s.offset < t0 + barDur);
          return segs.reduce((a, s) => a + s.text.split(/\s+/).filter(Boolean).length, 0);
        });
        const max = Math.max(...data, 1);
        const curBar = Math.min(bars - 1, Math.floor(currentTime / barDur));
        return (
          <div className="flex h-1.5 w-full cursor-pointer" title="Transcript density — click to seek">
            {data.map((d, i) => (
              <div
                key={i}
                className={`flex-1 transition-colors ${i === curBar ? 'ring-1 ring-chalk-accent/60' : ''}`}
                style={{ backgroundColor: `rgba(139,92,246,${0.1 + (d / max) * 0.5})` }}
                onClick={() => onSeek(i * barDur)}
              />
            ))}
          </div>
        );
      })()}
      {/* Header + search */}
      <div className="p-3 border-b border-chalk-border/30 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode('transcript')}
              className={`text-sm font-medium px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 ${
                viewMode === 'transcript' ? 'text-chalk-text' : 'text-slate-500 hover:text-slate-400'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path d="M2 4.5A2.5 2.5 0 0 1 4.5 2h7A2.5 2.5 0 0 1 14 4.5v7a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 2 11.5v-7ZM4.5 5a.5.5 0 0 0 0 1h7a.5.5 0 0 0 0-1h-7ZM4 8.5a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5ZM4.5 10a.5.5 0 0 0 0 1h4a.5.5 0 0 0 0-1h-4Z"/></svg>
              Transcript
              {segments.length > 0 && <span className="text-[8px] text-slate-600 tabular-nums">{segments.length}</span>}
            </button>
            {chapters.length > 0 && (
              <button
                onClick={() => setViewMode('chapters')}
                className={`text-sm font-medium px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 ${
                  viewMode === 'chapters' ? 'text-chalk-text' : 'text-slate-500 hover:text-slate-400'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M2.5 3.5A.5.5 0 0 1 3 3h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5ZM2.5 8A.5.5 0 0 1 3 7.5h10a.5.5 0 0 1 0 1H3A.5.5 0 0 1 2.5 8Zm0 4.5A.5.5 0 0 1 3 12h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5Z" clipRule="evenodd"/></svg>
                Chapters
                <span className="text-[8px] text-slate-600 tabular-nums">{chapters.length}</span>
              </button>
            )}
            {videoId && (
              <button
                onClick={() => setViewMode('notes')}
                className={`text-sm font-medium px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 ${
                  viewMode === 'notes' ? 'text-chalk-text' : 'text-slate-500 hover:text-slate-400'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.262a1.75 1.75 0 0 0 0-2.474Z"/><path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9A.75.75 0 0 1 14 9v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z"/></svg>
                Notes
                {notes.trim() && <span className="w-1.5 h-1.5 rounded-full bg-chalk-accent/50" />}
              </button>
            )}
            {segments.length > 20 && (
              <button
                onClick={() => setViewMode('cloud')}
                className={`text-sm font-medium px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 ${
                  viewMode === 'cloud' ? 'text-chalk-text' : 'text-slate-500 hover:text-slate-400'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path d="M4 11.5a3.5 3.5 0 0 1-.146-6.993A5.002 5.002 0 0 1 13.5 6a3 3 0 0 1-.687 5.458.75.75 0 1 1-.626-1.364A1.5 1.5 0 0 0 12.5 7.5v-.246a.75.75 0 0 1 .688-.747A3.501 3.501 0 0 0 4 11.5Z"/></svg>
                Cloud
              </button>
            )}
            {currentTime > 0 && (
              <span className="text-[10px] font-mono text-slate-600 tabular-nums">
                {formatTimestamp(currentTime)}
                {viewMode === 'transcript' && activeIndex >= 0 && <span className="text-slate-700"> {activeIndex + 1}/{segments.length}</span>}
                {viewMode === 'chapters' && chapters.length > 0 && <span className="text-slate-700"> {chapters.length} ch</span>}
              </span>
            )}
            {viewMode === 'transcript' && activeIndex >= 0 && activeIndex < segments.length && (
              <span className="hidden sm:block text-[9px] text-slate-600 truncate max-w-[180px]" title={segments[activeIndex].text}>
                {segments[activeIndex].text.length > 40 ? segments[activeIndex].text.slice(0, 40).trim() + '\u2026' : segments[activeIndex].text}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {viewMode === 'transcript' && segments.length > 10 && (
              <button
                onClick={() => setParagraphMode((v) => !v)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${paragraphMode ? 'text-chalk-accent bg-chalk-accent/15' : 'text-slate-500 hover:text-slate-400'}`}
                title={paragraphMode ? 'Switch to segment view' : 'Switch to paragraph view'}
              >
                {paragraphMode ? 'Segments' : 'Paragraphs'}
              </button>
            )}
            {viewMode === 'transcript' && !paragraphMode && segments.length > 5 && (
              <button
                onClick={() => setShowLineNumbers((v) => !v)}
                className={`px-1 py-0.5 rounded text-[10px] font-mono font-medium transition-colors ${showLineNumbers ? 'text-chalk-accent bg-chalk-accent/15' : 'text-slate-500 hover:text-slate-400'}`}
                title={showLineNumbers ? 'Hide line numbers' : 'Show line numbers'}
              >
                #
              </button>
            )}
            {viewMode === 'transcript' && (
              <button
                onClick={() => {
                  const next = fontSize === 'sm' ? 'md' : fontSize === 'md' ? 'lg' : 'sm';
                  setFontSize(next);
                  localStorage.setItem('chalk-transcript-font', next);
                }}
                className="px-1 py-0.5 rounded text-[10px] font-medium text-slate-500 hover:text-slate-400 transition-colors"
                title={`Font size: ${fontSize === 'sm' ? 'Small' : fontSize === 'md' ? 'Medium' : 'Large'}`}
              >
                A{fontSize === 'sm' ? '-' : fontSize === 'md' ? '' : '+'}
              </button>
            )}
            {viewMode === 'transcript' && !paragraphMode && (
              <button
                onClick={() => setCompactMode((v) => !v)}
                className={`px-1 py-0.5 rounded text-[10px] font-medium transition-colors ${compactMode ? 'text-chalk-accent bg-chalk-accent/15' : 'text-slate-500 hover:text-slate-400'}`}
                title={compactMode ? 'Normal spacing' : 'Compact mode'}
              >
                {compactMode ? '|||' : '| |'}
              </button>
            )}
            {viewMode === 'transcript' && (
              <button
                onClick={() => setHighlightColor((c) => c === 'blue' ? 'green' : c === 'green' ? 'purple' : 'blue')}
                className={`w-3 h-3 rounded-full border transition-colors ${
                  highlightColor === 'blue' ? 'bg-blue-400/60 border-blue-400/40' : highlightColor === 'green' ? 'bg-emerald-400/60 border-emerald-400/40' : 'bg-purple-400/60 border-purple-400/40'
                }`}
                title={`Highlight: ${highlightColor}`}
              />
            )}
            {lang && isComplete && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-500/15 text-slate-400 border border-slate-500/20">
                {lang}
              </span>
            )}
            {isSTT && isComplete && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20">
                AI Transcribed
              </span>
            )}
            {method === 'captions' && isComplete && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                Captions
              </span>
            )}
            {(isStreaming || isTranscribing) && (
              <span className="text-[10px] text-chalk-accent animate-pulse">loading</span>
            )}
            {isComplete && segments.length > 0 && (
              <button
                onClick={() => {
                  const header = videoTitle ? `# ${videoTitle}\n\n` : '# Video Transcript\n\n';
                  const md = segments.map((s) => `[${formatTimestamp(s.offset)}] ${s.text}`).join('\n');
                  const blob = new Blob([header + md], { type: 'text/markdown' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `transcript${videoId ? `-${videoId}` : ''}.md`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                aria-label="Export transcript"
                title="Download transcript"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h2.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 1 .439 1.061V12.5A1.5 1.5 0 0 1 8.5 14h-5A1.5 1.5 0 0 1 2 12.5v-9Zm6.5 3.75a.75.75 0 0 0-1.5 0v2.69l-.72-.72a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l2-2a.75.75 0 1 0-1.06-1.06l-.72.72V7.25Z" />
                </svg>
              </button>
            )}
            {isComplete && segments.length > 0 && (
              <button
                onClick={() => {
                  const json = JSON.stringify(segments.map((s) => ({ offset: s.offset, duration: s.duration, text: s.text })), null, 2);
                  const blob = new Blob([json], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `transcript${videoId ? `-${videoId}` : ''}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                aria-label="Export transcript as JSON"
                title="Download as JSON"
              >
                <span className="text-[8px] font-mono font-bold">{'{}'}</span>
              </button>
            )}
            {isComplete && segments.length > 0 && (
              <button
                onClick={() => {
                  const text = segments.map((s) => `[${formatTimestamp(s.offset)}] ${s.text}`).join('\n');
                  navigator.clipboard.writeText(text);
                }}
                className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                aria-label="Copy all timestamps"
                title="Copy timestamps to clipboard"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h2.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 1 .439 1.061V9.5A1.5 1.5 0 0 1 12 11V3.5A1.5 1.5 0 0 0 10.5 2H7a1.5 1.5 0 0 0-1.5 1.5Z" />
                  <path d="M3.5 6A1.5 1.5 0 0 1 5 4.5h4.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 1 .439 1.061V12.5A1.5 1.5 0 0 1 12 14H5a1.5 1.5 0 0 1-1.5-1.5V6Z" />
                </svg>
              </button>
            )}
            {isInline && onClose && (
              <button
                onClick={onClose}
                className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                aria-label="Hide transcript"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M14.77 12.79a.75.75 0 0 1-1.06-.02L10 8.832 6.29 12.77a.75.75 0 1 1-1.08-1.04l4.25-4.5a.75.75 0 0 1 1.08 0l4.25 4.5a.75.75 0 0 1-.02 1.06Z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {/* Current chapter label when following along */}
        {followAlong && chapters.length > 0 && (() => {
          const cur = [...chapters].reverse().find((c) => currentTime >= c.offset);
          if (!cur) return null;
          return (
            <p className="text-[10px] text-slate-500 truncate px-1" title={cur.label}>
              {cur.label}
            </p>
          );
        })()}
        <div className="flex items-center gap-1.5 relative">
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearch('');
                setShowSearchHistory(false);
                searchInputRef.current?.blur();
              } else if (e.key === 'Enter') {
                setShowSearchHistory(false);
                if (search.trim()) {
                  const updated = [search.trim(), ...searchHistory.filter((h) => h !== search.trim())].slice(0, 5);
                  setSearchHistory(updated);
                  try { localStorage.setItem('chalk-transcript-search-history', JSON.stringify(updated)); } catch {}
                }
                if (matchCount > 0) {
                  if (e.shiftKey) goToPrevMatch();
                  else goToNextMatch();
                }
              }
            }}
            onFocus={() => { if (!search.trim() && searchHistory.length > 0) setShowSearchHistory(true); }}
            onBlur={() => setTimeout(() => setShowSearchHistory(false), 150)}
            placeholder="Search transcript (/)..."
            className="flex-1 px-3 py-1.5 rounded-lg bg-chalk-bg/60 border border-chalk-border/30 text-xs text-chalk-text placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-chalk-accent/50"
          />
          {showSearchHistory && searchHistory.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg bg-chalk-surface border border-chalk-border/30 shadow-xl overflow-hidden">
              {searchHistory.map((term) => (
                <button key={term} type="button" onMouseDown={() => { setSearch(term); setShowSearchHistory(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-slate-400 hover:bg-white/[0.06] hover:text-slate-300 transition-colors truncate">{term}</button>
              ))}
            </div>
          )}
          {matchCount > 0 && (
            <>
              <span className="text-[10px] text-slate-500 shrink-0 tabular-nums">
                {searchMatchIndex + 1}/{matchCount} match{matchCount !== 1 ? 'es' : ''}
              </span>
              <button
                onClick={goToPrevMatch}
                className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                aria-label="Previous match"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path fillRule="evenodd" d="M11.78 9.78a.75.75 0 0 1-1.06 0L8 7.06 5.28 9.78a.75.75 0 0 1-1.06-1.06l3.25-3.25a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06Z" clipRule="evenodd" />
                </svg>
              </button>
              <button
                onClick={goToNextMatch}
                className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                aria-label="Next match"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </button>
            </>
          )}
          {search && !matchCount && (
            <span className="text-[10px] text-slate-500 shrink-0">0 of {segments.length}</span>
          )}
          {starred.size > 0 && (
            <>
            <button
              onClick={() => { setShowStarredOnly((v) => !v); setViewMode('transcript'); }}
              className={`shrink-0 p-1 rounded-md transition-colors ${
                showStarredOnly
                  ? 'text-yellow-400 bg-yellow-500/15'
                  : 'text-slate-500 hover:text-yellow-400 hover:bg-yellow-500/10'
              }`}
              aria-label={showStarredOnly ? 'Show all segments' : 'Show starred only'}
              title={showStarredOnly ? 'Show all' : `Show ${starred.size} starred`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path fillRule="evenodd" d="M8 1.75a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 13.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 7.874a.75.75 0 0 1 .416-1.28l4.21-.611L7.327 2.17A.75.75 0 0 1 8 1.75Z" clipRule="evenodd" />
              </svg>
              <span className="text-[8px] tabular-nums">{starred.size}</span>
            </button>
            {starred.size > 1 && (() => {
              const starredArr = [...starred].sort((a, b) => a - b);
              const prevStar = starredArr.filter((i) => i < activeIndex).pop();
              const nextStar = starredArr.find((i) => i > activeIndex);
              return (
                <span className="hidden sm:inline-flex items-center gap-0.5">
                  <button onClick={() => prevStar !== undefined && onSeek(segments[prevStar].offset)} disabled={prevStar === undefined} className="p-0.5 rounded text-slate-600 hover:text-yellow-400 disabled:opacity-30 disabled:hover:text-slate-600 transition-colors" title="Previous starred" aria-label="Previous starred segment">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5"><path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" /></svg>
                  </button>
                  <button onClick={() => nextStar !== undefined && onSeek(segments[nextStar].offset)} disabled={nextStar === undefined} className="p-0.5 rounded text-slate-600 hover:text-yellow-400 disabled:opacity-30 disabled:hover:text-slate-600 transition-colors" title="Next starred" aria-label="Next starred segment">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5"><path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" /></svg>
                  </button>
                </span>
              );
            })()}
            </>
          )}
          <button
            onClick={() => setFollowAlong((v) => !v)}
            className={`shrink-0 p-1 rounded-md text-[9px] font-bold transition-colors ${
              followAlong
                ? 'text-cyan-400 bg-cyan-500/15'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
            }`}
            aria-label={followAlong ? 'Disable follow along' : 'Follow along (auto-scroll)'}
            title={followAlong ? 'Follow Along ON' : 'Follow along — auto-scroll to current'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path fillRule="evenodd" d="M8 1a.75.75 0 0 1 .75.75v6.5a.75.75 0 0 1-1.5 0v-6.5A.75.75 0 0 1 8 1ZM4.11 3.05a.75.75 0 0 1 0 1.06 5.5 5.5 0 1 0 7.78 0 .75.75 0 0 1 1.06-1.06 7 7 0 1 1-9.9 0 .75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
            </svg>
          </button>
          {followAlong && (
            <span className="text-[8px] font-bold text-cyan-400 uppercase tracking-wider animate-pulse">LIVE</span>
          )}
        </div>
        {stats && isComplete && (
          <div className="flex items-center gap-2">
            <p className="text-[10px] text-slate-500 flex-1">
              ~{stats.totalWords.toLocaleString()} words · {(() => {
                const sentences = segments.reduce((count, s) => count + (s.text.match(/[.!?]+/g) || []).length, 0);
                return sentences > 0 ? `${sentences} sentences · ` : '';
              })()}~{stats.readMinutes} min read
              {stats.speakingWPM > 0 && (
                <span className="hidden sm:inline" title={`Average segment: ${stats.avgSegDuration.toFixed(1)}s`}> · {stats.speakingWPM} wpm</span>
              )}
              {stats.uniqueWords > 0 && (
                <span className="hidden sm:inline" title={`${stats.uniqueWords} unique words out of ${stats.totalWords}`}> · {stats.uniqueWords} unique</span>
              )}
              {stats.avgSentenceLength > 0 && (
                <span className="hidden sm:inline" title={`Average ${stats.avgSentenceLength} words per sentence`}> · ~{stats.avgSentenceLength} w/s</span>
              )}
              {(() => {
                const lastSeg = segments[segments.length - 1];
                const dur = lastSeg.offset + (lastSeg.duration || 0);
                if (dur < 10) return null;
                return <span className="hidden sm:inline"> · {formatTimestamp(dur)}</span>;
              })()}
            </p>
            {sparklinePoints && (
              <svg width="50" height="14" viewBox="0 0 50 14" className="shrink-0 hidden sm:block" aria-label="Word density across video">
                <polyline
                  points={sparklinePoints}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-chalk-accent/40"
                />
              </svg>
            )}
          </div>
        )}
      </div>

      {/* AI transcript disclaimer */}
      {isSTT && isComplete && (
        <div className="px-3 py-1.5 bg-amber-500/5 border-b border-amber-500/10">
          <p className="text-[10px] text-amber-400/70">AI-generated transcript — may contain errors</p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 relative min-h-0">
      {/* Top fade gradient */}
      <div className="absolute top-0 inset-x-0 h-4 bg-gradient-to-b from-chalk-surface/30 to-transparent z-10 pointer-events-none" />
      {/* Bottom fade gradient */}
      <div className="absolute bottom-0 inset-x-0 h-6 bg-gradient-to-t from-chalk-surface/30 to-transparent z-10 pointer-events-none" />
      {/* Selection toolbar */}
      {selectionToolbar && onAskAbout && (
        <div
          className="absolute z-20 flex items-center gap-1 px-1.5 py-1 rounded-lg bg-chalk-surface border border-chalk-border/40 shadow-xl backdrop-blur-sm animate-in fade-in zoom-in-95 duration-100"
          style={{
            left: Math.max(8, Math.min(selectionToolbar.x - 60, 200)),
            top: Math.max(4, selectionToolbar.y - 32),
          }}
        >
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              onAskAbout(currentTime, `Summarize this: "${selectionToolbar.text}"`);
              setSelectionToolbar(null);
              window.getSelection()?.removeAllRanges();
            }}
            className="px-2 py-1 rounded-md text-[10px] font-medium text-slate-300 hover:text-chalk-text hover:bg-chalk-accent/15 transition-colors"
          >
            Summarize
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              onAskAbout(currentTime, `Explain this in detail: "${selectionToolbar.text}"`);
              setSelectionToolbar(null);
              window.getSelection()?.removeAllRanges();
            }}
            className="px-2 py-1 rounded-md text-[10px] font-medium text-slate-300 hover:text-chalk-text hover:bg-chalk-accent/15 transition-colors"
          >
            Explain
          </button>
          <div className="w-px h-3 bg-chalk-border/30" />
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              const ts = selectionToolbar.segOffset != null ? formatTimestamp(selectionToolbar.segOffset) : '';
              const prefix = ts ? `[${ts}] ` : '';
              navigator.clipboard.writeText(`${prefix}${selectionToolbar.text}`);
              setSelCopied(true);
              setTimeout(() => { setSelectionToolbar(null); setSelCopied(false); }, 800);
              window.getSelection()?.removeAllRanges();
            }}
            className="px-2 py-1 rounded-md text-[10px] font-medium text-slate-300 hover:text-chalk-text hover:bg-chalk-accent/15 transition-colors"
          >
            {selCopied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}
      <div className="relative h-full">
      {/* Transcript minimap */}
      {viewMode === 'transcript' && filtered.length > 20 && (() => {
        const totalDur = segments.length > 0 ? segments[segments.length - 1].offset + (segments[segments.length - 1].duration || 0) : 0;
        if (totalDur <= 0) return null;
        const rows = 60;
        const rowDur = totalDur / rows;
        const miniData = Array.from({ length: rows }, (_, i) => {
          const t0 = i * rowDur;
          const t1 = t0 + rowDur;
          const segs = segments.filter((s) => s.offset >= t0 && s.offset < t1);
          const words = segs.reduce((a, s) => a + s.text.split(/\s+/).filter(Boolean).length, 0);
          return words;
        });
        const maxWords = Math.max(...miniData, 1);
        const viewportPct = totalDur > 0 ? Math.min(1, 30 / totalDur) : 0.1; // ~30s visible
        const viewportTop = totalDur > 0 ? Math.min(1 - viewportPct, currentTime / totalDur) : 0;
        return (
          <div
            className="absolute right-0 top-0 bottom-0 w-3 z-10 opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientY - rect.top) / rect.height;
              onSeek(pct * totalDur);
            }}
          >
            <div className="w-full h-full flex flex-col bg-chalk-bg/60 backdrop-blur-sm">
              {miniData.map((w, i) => (
                <div
                  key={i}
                  className="flex-1"
                  style={{ backgroundColor: `rgba(99,102,241,${(w / maxWords) * 0.5})` }}
                />
              ))}
            </div>
            {/* Viewport indicator */}
            <div
              className="absolute right-0 w-full border border-chalk-accent/50 bg-chalk-accent/10 rounded-sm pointer-events-none"
              style={{ top: `${viewportTop * 100}%`, height: `${viewportPct * 100}%` }}
            />
          </div>
        );
      })()}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onMouseUp={handleMouseUp}
        className="h-full overflow-y-auto"
      >
        {viewMode === 'cloud' && wordCloud.length > 0 ? (
          /* Word cloud view with sparklines */
          <div className="h-full flex flex-wrap items-center justify-center gap-2 p-4 content-center">
            {wordCloud.map(({ word, count }, i) => {
              const maxCount = wordCloud[0]?.count || 1;
              const size = 0.6 + (count / maxCount) * 1.2; // 0.6rem to 1.8rem
              const opacity = 0.4 + (count / maxCount) * 0.6;
              const colors = ['text-blue-400', 'text-purple-400', 'text-emerald-400', 'text-amber-400', 'text-rose-400', 'text-cyan-400'];
              const strokeColors = ['#60a5fa', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#22d3ee'];
              const timeline = wordTimelines.get(word);
              const timelineMax = timeline ? Math.max(...timeline, 1) : 1;
              return (
                <button
                  key={word}
                  onClick={() => { setSearch(word); setViewMode('transcript'); }}
                  className={`${colors[i % colors.length]} hover:opacity-100 transition-all cursor-pointer hover:scale-110 group/word relative`}
                  style={{ fontSize: `${size}rem`, opacity, lineHeight: 1.2 }}
                  title={`"${word}" appears ${count} times`}
                >
                  {word}
                  {timeline && (
                    <svg
                      width="32" height="8"
                      viewBox="0 0 32 8"
                      className="absolute -bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover/word:opacity-80 transition-opacity"
                    >
                      <polyline
                        points={timeline.map((v, j) => `${(j / 7) * 32},${8 - (v / timelineMax) * 7}`).join(' ')}
                        fill="none"
                        stroke={strokeColors[i % strokeColors.length]}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.7"
                      />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        ) : viewMode === 'notes' && videoId ? (
          /* Notes view */
          <div className="h-full flex flex-col p-3 gap-2">
            <div className="flex items-center justify-between">
              <button
                onClick={insertTimestamp}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-slate-500 hover:text-slate-300 bg-chalk-bg/40 border border-chalk-border/20 hover:border-chalk-border/40 transition-colors"
                title="Insert current timestamp"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path fillRule="evenodd" d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h3.25a.75.75 0 0 0 0-1.5h-2.5v-3.5Z" clipRule="evenodd" />
                </svg>
                Timestamp
              </button>
              {notesSaving && (
                <span className="text-[10px] text-slate-500 animate-pulse">Saving...</span>
              )}
              {!notesSaving && notes.length > 0 && (
                <span className="text-[10px] text-slate-600">Saved</span>
              )}
            </div>
            <textarea
              ref={notesRef}
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Take notes while watching...&#10;&#10;Click 'Timestamp' to insert the current time."
              className="flex-1 w-full resize-none bg-chalk-bg/40 border border-chalk-border/20 rounded-lg px-3 py-2 text-xs text-chalk-text placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-chalk-accent/30 focus:border-transparent leading-relaxed"
            />
            {notes.trim() && (
              <p className="text-[9px] text-slate-700 text-right tabular-nums">{notes.split(/\s+/).filter(Boolean).length} words · {notes.length} chars</p>
            )}
          </div>
        ) : viewMode === 'chapters' && chapters.length > 0 ? (
          /* Chapters outline view */
          <div className="py-1">
            {chapters.map((ch, i) => {
              const nextOffset = chapters[i + 1]?.offset ?? Infinity;
              const isActive = currentTime >= ch.offset && currentTime < nextOffset;
              // Extract subtopics: key terms from this chapter's segments
              const chapterSegs = segments.filter((s) => s.offset >= ch.offset && s.offset < nextOffset);
              const chapterText = chapterSegs.map((s) => s.text.toLowerCase()).join(' ');
              const chapterWords = chapterText.replace(/[^a-z\s]/g, '').split(/\s+/).filter((w) => w.length > 5);
              const wordFreq = new Map<string, number>();
              for (const w of chapterWords) {
                if (!['really', 'actually', 'basically', 'something', 'things', 'people', 'because', 'through', 'should', 'would', 'could'].includes(w)) {
                  wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
                }
              }
              const subtopics = [...wordFreq.entries()]
                .filter(([, c]) => c >= 2)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([w]) => w);
              const segCount = chapterSegs.length;
              const durSec = nextOffset === Infinity
                ? (segments.length > 0 ? segments[segments.length - 1].offset + (segments[segments.length - 1].duration || 0) : 0) - ch.offset
                : nextOffset - ch.offset;
              return (
                <div key={ch.offset} className={`border-l-2 transition-all ${isActive ? 'border-l-chalk-accent bg-chalk-accent/5' : 'border-l-transparent'}`}>
                  <button
                    onClick={() => onSeek(ch.offset)}
                    className="w-full text-left px-3 py-2.5 flex gap-3 items-start hover:bg-chalk-surface/60 transition-colors"
                  >
                    <span className={`text-[10px] font-mono shrink-0 pt-0.5 ${isActive ? 'text-chalk-accent' : 'text-slate-500'}`}>
                      {formatTimestamp(ch.offset)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs leading-relaxed block ${isActive ? 'text-chalk-text font-medium' : 'text-slate-400'}`}>
                        {ch.label}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-slate-600">
                          {Math.round(durSec / 60)}m · {segCount} seg
                          {(() => {
                            const uniqueWords = new Set(chapterText.replace(/[^a-z\s]/g, '').split(/\s+/).filter((w) => w.length > 4));
                            return uniqueWords.size > 5 ? ` · ${uniqueWords.size} terms` : '';
                          })()}
                          {(() => {
                            const questionCount = chapterSegs.filter((s) => s.text.trim().endsWith('?')).length;
                            return questionCount > 0 ? ` · ${questionCount}?` : '';
                          })()}
                          {search && (() => {
                            const q = search.toLowerCase();
                            const hitCount = chapterSegs.filter((s) => s.text.toLowerCase().includes(q)).length;
                            return hitCount > 0 ? <span className="text-chalk-accent"> · {hitCount} match{hitCount !== 1 ? 'es' : ''}</span> : null;
                          })()}
                        </span>
                      </div>
                      {subtopics.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {subtopics.map((t) => (
                            <span key={t} className="text-[8px] px-1 py-0 rounded bg-white/[0.04] text-slate-500 border border-white/[0.06]">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                  {/* Chapter watch progress */}
                  {durSec > 0 && (() => {
                    const chEnd = ch.offset + durSec;
                    const pct = currentTime <= ch.offset ? 0 : currentTime >= chEnd ? 1 : (currentTime - ch.offset) / durSec;
                    if (pct <= 0) return null;
                    return <div className="h-0.5 mx-3"><div className="h-full bg-chalk-accent/30 rounded-full transition-[width] duration-500" style={{ width: `${Math.round(pct * 100)}%` }} /></div>;
                  })()}
                </div>
              );
            })}
          </div>
        ) : (
          /* Transcript view */
          <>
            {filtered.length === 0 && (
              <p className="p-4 text-xs text-slate-500 text-center">
                {search ? 'No matches found' : 'No transcript available'}
              </p>
            )}
            {/* Paragraph mode */}
            {paragraphMode && filtered.length > 0 && (() => {
              const paragraphs: { startOffset: number; segs: TranscriptSegment[] }[] = [];
              let current: TranscriptSegment[] = [];
              for (let i = 0; i < filtered.length; i++) {
                if (i > 0) {
                  const gap = filtered[i].offset - (filtered[i - 1].offset + (filtered[i - 1].duration || 0));
                  if (gap > 2) {
                    if (current.length > 0) paragraphs.push({ startOffset: current[0].offset, segs: current });
                    current = [];
                  }
                }
                current.push(filtered[i]);
              }
              if (current.length > 0) paragraphs.push({ startOffset: current[0].offset, segs: current });
              return (
                <div className="px-3 py-2 space-y-3">
                  <p className="text-[9px] text-slate-600 text-center">{paragraphs.length} paragraph{paragraphs.length !== 1 ? 's' : ''}</p>
                  {paragraphs.map((para) => {
                    const isParaActive = para.segs.some((s) => segments.indexOf(s) === activeIndex);
                    return (
                      <div
                        key={para.startOffset}
                        className={`text-xs leading-relaxed rounded-lg px-2 py-1.5 transition-colors ${isParaActive ? 'bg-chalk-accent/10 border-l-2 border-l-chalk-accent' : 'border-l-2 border-l-transparent hover:bg-chalk-surface/40'}`}
                      >
                        <button
                          onClick={() => onSeek(para.startOffset)}
                          className="text-[9px] text-slate-600 font-mono mr-1.5 hover:text-chalk-accent tabular-nums"
                        >
                          {formatTimestamp(para.startOffset)}
                        </button>
                        <span className={isParaActive ? 'text-chalk-text' : 'text-slate-400'}>
                          {para.segs.map((s) => s.text).join(' ')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            {!paragraphMode && filtered.map((seg, i) => {
              const segIndex = segments.indexOf(seg);
              const isActive = segIndex === activeIndex;
              const isCurrentMatch = search.trim() && i === searchMatchIndex;
              const highlightedText = search.trim() ? highlightMatch(seg.text, search) : highlightKeyTerms(seg.text, keyTerms, termMeta);
              const showSpeakerDivider = !search.trim() && speakerChanges.has(segIndex) && i > 0;
              const topicLabel = !search.trim() && topicBoundaries.get(segIndex);

              // Chapter boundary inline summary card
              const chapterAtSeg = !search.trim() && chapters.find((ch) => ch.offset === seg.offset);

              // Difficulty heat coloring + complexity label
              const segWords = seg.text.split(/\s+/).filter(Boolean);
              const longWordCount = segWords.filter((w) => w.length > 7).length;
              const longWordRatio = segWords.length > 0 ? longWordCount / segWords.length : 0;
              const difficultyHeat = longWordRatio > 0.3 ? 'bg-rose-500/[0.03]' : longWordRatio > 0.15 ? 'bg-amber-500/[0.02]' : '';
              const complexityLabel = longWordRatio > 0.3 && segWords.length > 6 ? 'complex' : longWordRatio > 0.2 && segWords.length > 8 ? 'technical' : null;

              // Karaoke-style progress within active segment
              let segProgress = 0;
              if (isActive && seg.duration && seg.duration > 0) {
                segProgress = Math.min(1, Math.max(0, (currentTime - seg.offset) / seg.duration));
              }

              return (
                <div key={`wrap-${seg.offset}-${i}`}>
                {chapterAtSeg && i > 0 && (
                  <div className="mx-3 my-2 px-2.5 py-1.5 rounded-lg bg-chalk-surface/30 border border-chalk-border/15">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1 h-1 rounded-full bg-chalk-accent/50" />
                      <span className="text-[9px] font-medium text-chalk-accent/70 uppercase tracking-wider">Chapter</span>
                      <span className="text-[9px] text-slate-600 font-mono">{formatTimestamp(chapterAtSeg.offset)}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{chapterAtSeg.label}</p>
                  </div>
                )}
                {topicLabel && !showSpeakerDivider && i > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1 my-0.5">
                    <div className="flex-1 h-px bg-sky-500/15" />
                    <span className="text-[8px] font-medium text-sky-400/50 uppercase tracking-wider">{topicLabel}</span>
                    <div className="flex-1 h-px bg-sky-500/15" />
                  </div>
                )}
                {showSpeakerDivider && (() => {
                  // Detect if it's a topic shift or just a pause
                  const prevSeg = i > 0 ? filtered[i - 1] : null;
                  const prevWords = new Set((prevSeg?.text || '').toLowerCase().split(/\s+/));
                  const curWords = seg.text.toLowerCase().split(/\s+/).filter(Boolean);
                  const overlap = curWords.filter((w) => prevWords.has(w) && w.length > 3).length;
                  const isTopicShift = curWords.length > 3 && overlap < 2;
                  const label = isTopicShift ? 'new topic' : 'speaker change';
                  return (
                    <div className="flex items-center gap-2 px-3 py-1">
                      <div className={`flex-1 h-px ${isTopicShift ? 'bg-violet-500/20' : 'bg-chalk-border/20'}`} />
                      <span className={`text-[9px] font-medium ${isTopicShift ? 'text-violet-400/60' : 'text-slate-600'}`}>{label}</span>
                      <div className={`flex-1 h-px ${isTopicShift ? 'bg-violet-500/20' : 'bg-chalk-border/20'}`} />
                    </div>
                  );
                })()}
                {/* Silence marker for gaps >= 3 seconds */}
                {i > 0 && !showSpeakerDivider && !search.trim() && (() => {
                  const prevSeg = filtered[i - 1];
                  const gap = seg.offset - (prevSeg.offset + (prevSeg.duration || 0));
                  if (gap < 3) return null;
                  return (
                    <div className="flex items-center gap-2 px-3 py-0.5 my-0.5">
                      <div className="flex-1 border-t border-dashed border-slate-700/30" />
                      <span className="text-[8px] text-slate-700 tabular-nums">{gap.toFixed(0)}s pause</span>
                      <div className="flex-1 border-t border-dashed border-slate-700/30" />
                    </div>
                  );
                })()}
                <div
                  key={`${seg.offset}-${i}`}
                  data-seg-offset={seg.offset}
                  ref={(el) => {
                    if (isActive) (activeRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                    if (search.trim() && el) matchRefs.current.set(i, el);
                  }}
                  className={`group/seg w-full flex items-start ${compactMode ? 'gap-1 px-2 py-0.5' : 'gap-2 px-3 py-2'} transition-all hover:bg-chalk-surface/60 animate-in fade-in duration-300 ${difficultyHeat} ${
                    isCurrentMatch
                      ? `${hlMatch} border-l-2`
                      : isActive
                        ? `${hlActive} border-l-2`
                        : starred.has(seg.offset)
                          ? 'border-l-2 border-l-yellow-500/60'
                          : 'border-l-2 border-l-transparent'
                  }`}
                >
                  {/* Key moment indicator dot */}
                  {!compactMode && (() => {
                    const words = seg.text.split(/\s+/).length;
                    const hasQuestion = seg.text.includes('?');
                    const hasCue = /\b(important|key|remember|note|crucial|essential|main|summary|conclusion|therefore|however|but)\b/i.test(seg.text);
                    const isKeyMoment = words > 20 || hasQuestion || hasCue;
                    return isKeyMoment ? (
                      <div
                        className={`shrink-0 w-1 h-1 rounded-full mt-2 ${
                          hasCue ? 'bg-amber-400/60' : hasQuestion ? 'bg-purple-400/50' : 'bg-blue-400/30'
                        }`}
                        title={hasCue ? 'Key concept' : hasQuestion ? 'Question' : 'Dense content'}
                      />
                    ) : <div className="shrink-0 w-1" />;
                  })()}
                  {showLineNumbers && (
                    <span className="shrink-0 w-5 text-[8px] text-slate-700 tabular-nums text-right pt-0.5 select-none">{segIndex + 1}</span>
                  )}
                  <div className="shrink-0 flex flex-col items-center gap-0.5">
                    <button
                      onClick={() => { onSeek(seg.offset); try { window.history.replaceState(null, '', `#t=${Math.round(seg.offset)}`); } catch {} }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        const ts = formatTimestamp(seg.offset);
                        navigator.clipboard.writeText(ts).then(() => {
                          const btn = e.currentTarget;
                          btn.dataset.copied = 'true';
                          setTimeout(() => { btn.dataset.copied = ''; }, 1200);
                        });
                      }}
                      className={`text-[10px] font-mono pt-0.5 hover:underline data-[copied=true]:text-emerald-400 ${isActive ? 'text-chalk-accent' : 'text-slate-500'}`}
                      title={`Jump to ${formatTimestamp(seg.offset)} · Double-click to copy · ${seg.text.split(/\s+/).length} words`}
                    >
                      {formatTimestamp(seg.offset)}
                    </button>
                    {!compactMode && seg.duration && seg.duration > 0 && (
                      <span className="text-[8px] text-slate-700 opacity-0 group-hover/seg:opacity-100 transition-opacity tabular-nums">({Math.round(seg.duration)}s)</span>
                    )}
                    {!compactMode && <span className="text-[7px] text-slate-700 opacity-0 group-hover/seg:opacity-100 transition-opacity tabular-nums">{seg.text.split(/\s+/).filter(Boolean).length}w</span>}
                    {!compactMode && segDensities.size > 0 && (() => {
                      const d = segDensities.get(segIndex) || 0;
                      if (d < 0.15) return null;
                      return (
                        <div className="w-6 h-0.5 rounded-full bg-white/[0.04] overflow-hidden">
                          <div className="h-full rounded-full bg-indigo-400/30" style={{ width: `${d * 100}%` }} />
                        </div>
                      );
                    })()}
                  </div>
                  {!compactMode && seg.text.trim().endsWith('?') && (
                    <span className={`shrink-0 text-[8px] font-bold w-3 text-center ${isActive && questionPulse ? 'text-purple-300 animate-pulse' : 'text-purple-400/50'}`} title={isActive && questionPulse ? 'Consider this question!' : 'Question asked'}>?</span>
                  )}
                  {!compactMode && complexityLabel && (
                    <span className={`shrink-0 text-[7px] font-bold uppercase tracking-wider px-1 py-0 rounded ${
                      complexityLabel === 'complex' ? 'bg-rose-500/10 text-rose-400/60' : 'bg-amber-500/10 text-amber-400/50'
                    }`} title={`${longWordCount} long words (${Math.round(longWordRatio * 100)}%)`}>
                      {complexityLabel === 'complex' ? '!' : '~'}
                    </span>
                  )}
                  <button
                    onClick={() => onSeek(seg.offset)}
                    onDoubleClick={(e) => { e.preventDefault(); if (onAskAbout) onAskAbout(seg.offset, seg.text); }}
                    onMouseDown={(e) => {
                      const btn = e.currentTarget;
                      const timer = setTimeout(() => {
                        const ts = formatTimestamp(seg.offset);
                        navigator.clipboard.writeText(`[${ts}] ${seg.text}`).then(() => {
                          btn.dataset.longCopied = 'true';
                          setTimeout(() => { btn.dataset.longCopied = ''; }, 1200);
                        });
                      }, 500);
                      btn.dataset.longTimer = String(timer);
                    }}
                    onMouseUp={(e) => { clearTimeout(Number(e.currentTarget.dataset.longTimer)); }}
                    onMouseLeave={(e) => { clearTimeout(Number(e.currentTarget.dataset.longTimer)); }}
                    className={`${fontSizeClass} leading-relaxed text-left flex-1 data-[long-copied=true]:text-emerald-400 ${isActive ? 'text-chalk-text' : 'text-slate-400'}`}
                    style={isActive && segProgress > 0 && !search.trim() ? {
                      background: `linear-gradient(90deg, rgba(59,130,246,0.15) ${segProgress * 100}%, transparent ${segProgress * 100}%)`,
                      borderRadius: '2px',
                    } : undefined}
                    title={`${seg.offset < 60 ? `${Math.round(seg.offset)}s` : `${Math.floor(seg.offset / 60)}m ${Math.round(seg.offset % 60)}s`} into video · Click to seek · Hold to copy`}
                  >
                    {typeof highlightedText === 'string' ? highlightedText : highlightedText}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleStar(seg.offset); }}
                    onDoubleClick={(e) => { e.stopPropagation(); if (starred.has(seg.offset)) setEditingSegNote(seg.offset); }}
                    className={`shrink-0 p-1 rounded-md transition-all ${
                      starred.has(seg.offset)
                        ? 'text-yellow-400 opacity-100'
                        : 'opacity-0 group-hover/seg:opacity-100 text-slate-600 hover:text-yellow-400'
                    }`}
                    title={starred.has(seg.offset) ? (segNotes[seg.offset] ? `★ ${segNotes[seg.offset]} (dbl-click to edit)` : 'Unstar (dbl-click to add note)') : 'Star this segment'}
                    aria-label={`${starred.has(seg.offset) ? 'Unstar' : 'Star'} segment at ${formatTimestamp(seg.offset)}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5">
                      <path fillRule="evenodd" d="M8 1.75a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 13.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 7.874a.75.75 0 0 1 .416-1.28l4.21-.611L7.327 2.17A.75.75 0 0 1 8 1.75Z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {starred.has(seg.offset) && segNotes[seg.offset] && editingSegNote !== seg.offset && (
                    <span className="text-[8px] text-yellow-400/50 truncate max-w-[60px] shrink-0">{segNotes[seg.offset]}</span>
                  )}
                  {editingSegNote === seg.offset && (
                    <input
                      type="text"
                      autoFocus
                      defaultValue={segNotes[seg.offset] || ''}
                      maxLength={50}
                      placeholder="Add note..."
                      onBlur={(e) => saveSegNote(seg.offset, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveSegNote(seg.offset, (e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingSegNote(null); }}
                      className="shrink-0 w-20 px-1 py-0 text-[9px] bg-yellow-500/10 border border-yellow-500/30 rounded text-yellow-300 placeholder:text-yellow-500/30 outline-none"
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  {onAskAbout && (
                    <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const preview = seg.text.length > 80 ? seg.text.slice(0, 80) + '...' : seg.text;
                        onAskAbout(seg.offset, `Explain this in simple terms: "${preview}"`);
                      }}
                      className="opacity-0 group-hover/seg:opacity-100 shrink-0 p-1 rounded-md text-slate-500 hover:text-amber-400 hover:bg-amber-400/10 transition-all"
                      title="Explain this section"
                      aria-label={`Explain section at ${formatTimestamp(seg.offset)}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                        <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm.75-10.25a.75.75 0 0 0-1.5 0v4.5a.75.75 0 0 0 1.5 0v-4.5ZM8 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAskAbout(seg.offset, seg.text);
                      }}
                      className="opacity-0 group-hover/seg:opacity-100 shrink-0 p-1 rounded-md text-slate-500 hover:text-chalk-accent hover:bg-chalk-accent/10 transition-all"
                      title="Ask about this moment"
                      aria-label={`Ask about moment at ${formatTimestamp(seg.offset)}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                        <path d="M1 8.74c0 1.36.49 2.6 1.3 3.56-.13.77-.45 1.48-.91 2.08a.38.38 0 0 0 .3.62c1.07 0 2-.37 2.74-.93A6.47 6.47 0 0 0 7.5 15.5c3.59 0 6.5-2.98 6.5-6.76S11.09 2 7.5 2 1 4.96 1 8.74Z" />
                      </svg>
                    </button>
                    </>
                  )}
                </div>
                </div>
              );
            })}
          </>
        )}
      </div>
      </div>

      {/* "Coming next" preview when following along */}
      {followAlong && activeIndex >= 0 && activeIndex < segments.length - 1 && viewMode === 'transcript' && (
        <div className="px-3 py-2 border-t border-chalk-border/10 bg-chalk-surface/10">
          <span className="text-[9px] text-slate-600 font-medium uppercase tracking-wider">Coming up</span>
          <p className="text-[11px] text-slate-500/60 mt-0.5 line-clamp-2 leading-relaxed">
            {segments.slice(activeIndex + 1, activeIndex + 3).map((s) => s.text).join(' ').slice(0, 120)}
            {segments.slice(activeIndex + 1, activeIndex + 3).map((s) => s.text).join(' ').length > 120 ? '...' : ''}
          </p>
        </div>
      )}

      {/* Reading progress percentage footer */}
      {segments.length > 0 && readingProgress > 0 && viewMode === 'transcript' && (
        <div className="px-3 py-1.5 border-t border-chalk-border/10 flex items-center justify-between">
          <span className="text-[9px] text-slate-600 tabular-nums">
            {Math.round(readingProgress * 100)}% covered
            {readingProgress > 0.01 && readingProgress < 0.95 && stats && stats.speakingWPM > 0 && (() => {
              const remainingWords = Math.round(stats.totalWords * (1 - readingProgress));
              const remainingMin = Math.max(1, Math.round(remainingWords / stats.speakingWPM));
              return <span className="text-slate-700"> · ~{remainingMin}m left</span>;
            })()}
          </span>
          <div className="flex-1 mx-2 h-px bg-chalk-border/10 relative">
            <div className="absolute inset-y-0 left-0 bg-chalk-accent/30" style={{ width: `${readingProgress * 100}%` }} />
          </div>
          <span className="text-[9px] text-slate-600 tabular-nums">{formatTimestamp(currentTime)}</span>
        </div>
      )}

      {/* Quick jump to percentage */}
      {segments.length > 20 && viewMode === 'transcript' && (() => {
        const totalDur = segments[segments.length - 1].offset + (segments[segments.length - 1].duration || 0);
        if (totalDur < 60) return null;
        return (
          <div className="px-3 py-0.5 flex items-center justify-center gap-1">
            {[25, 50, 75].map((pct) => (
              <button
                key={pct}
                onClick={() => onSeek((pct / 100) * totalDur)}
                className="px-1.5 py-0.5 rounded text-[8px] text-slate-600 hover:text-chalk-accent hover:bg-chalk-accent/10 transition-colors tabular-nums"
                title={`Jump to ${pct}% (${formatTimestamp((pct / 100) * totalDur)})`}
              >
                {pct}%
              </button>
            ))}
          </div>
        );
      })()}

      {/* WPM sparkline */}
      {segments.length > 20 && viewMode === 'transcript' && (() => {
        const windowSec = 30;
        const totalDur = segments[segments.length - 1].offset + (segments[segments.length - 1].duration || 0);
        if (totalDur < 60) return null;
        const buckets: number[] = [];
        for (let t = 0; t < totalDur; t += windowSec) {
          const words = segments
            .filter((s) => s.offset >= t && s.offset < t + windowSec)
            .reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
          buckets.push(Math.round((words / windowSec) * 60));
        }
        if (buckets.length < 3) return null;
        const max = Math.max(...buckets, 1);
        const w = 200;
        const h = 16;
        const points = buckets.map((v, i) => `${(i / (buckets.length - 1)) * w},${h - (v / max) * h}`).join(' ');
        const currentBucket = Math.min(Math.floor(currentTime / windowSec), buckets.length - 1);
        const curX = (currentBucket / (buckets.length - 1)) * w;
        return (
          <div className="px-3 py-1 border-t border-chalk-border/10 flex items-center gap-2">
            <span className="text-[8px] text-slate-700 shrink-0">WPM</span>
            <svg viewBox={`0 0 ${w} ${h}`} className="flex-1 h-4" preserveAspectRatio="none">
              <polyline points={points} fill="none" stroke="rgba(99,102,241,0.3)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              <line x1={curX} y1={0} x2={curX} y2={h} stroke="rgba(99,102,241,0.5)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            </svg>
            <span className="text-[8px] text-slate-700 tabular-nums shrink-0">{buckets[currentBucket] ?? 0}</span>
          </div>
        );
      })()}

      {/* Speaker time breakdown */}
      {speakerChanges.size >= 2 && viewMode === 'transcript' && (() => {
        // Group segments by speaker turns
        const turns: { start: number; dur: number }[] = [];
        let tStart = 0;
        for (let i = 1; i <= segments.length; i++) {
          if (i === segments.length || speakerChanges.has(i)) {
            const first = segments[tStart];
            const last = segments[i - 1];
            const dur = (last.offset + (last.duration || 0)) - first.offset;
            turns.push({ start: tStart, dur });
            tStart = i;
          }
        }
        // Alternate speakers A/B
        const speakerTime: Record<string, number> = {};
        turns.forEach((t, i) => {
          const label = i % 2 === 0 ? 'Speaker A' : 'Speaker B';
          speakerTime[label] = (speakerTime[label] || 0) + t.dur;
        });
        const total = Object.values(speakerTime).reduce((a, b) => a + b, 0);
        if (total < 30) return null;
        return (
          <div className="px-3 py-1 border-t border-chalk-border/10">
            <div className="flex items-center gap-2 h-2">
              {Object.entries(speakerTime).map(([name, dur]) => (
                <div key={name} className="flex items-center gap-1 flex-1 min-w-0">
                  <div
                    className={`h-1.5 rounded-full ${name === 'Speaker A' ? 'bg-indigo-500/40' : 'bg-emerald-500/40'}`}
                    style={{ width: `${Math.round((dur / total) * 100)}%` }}
                  />
                  <span className="text-[8px] text-slate-700 shrink-0 tabular-nums">{name.split(' ')[1]} {Math.round((dur / total) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* "Jump to current" pill when user scrolls away */}
      {userScrolled && activeIndex >= 0 && viewMode === 'transcript' && (
        <div className="absolute bottom-2 inset-x-0 flex justify-center pointer-events-none">
          <button
            onClick={() => {
              setUserScrolled(false);
              activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
            className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium bg-chalk-surface/95 text-slate-300 border border-chalk-border/40 shadow-lg backdrop-blur-sm hover:bg-chalk-surface hover:text-chalk-text transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path d="M8 1a.75.75 0 0 1 .75.75v6.999l2.47-2.47a.75.75 0 1 1 1.06 1.061l-3.75 3.75a.75.75 0 0 1-1.06 0L3.72 7.34a.75.75 0 0 1 1.06-1.06l2.47 2.47V1.75A.75.75 0 0 1 8 1Z" />
              <path d="M2.75 13a.75.75 0 0 0 0 1.5h10.5a.75.75 0 0 0 0-1.5H2.75Z" />
            </svg>
            Jump to current
          </button>
        </div>
      )}
      </div>
    </div>
  );
}

function PulsingEllipsis() {
  return (
    <span className="inline-flex gap-[1px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block animate-pulse"
          style={{ animationDelay: `${i * 300}ms`, animationDuration: '1.2s' }}
        >
          .
        </span>
      ))}
    </span>
  );
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  if (parts.length === 1) return text;

  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-chalk-accent/30 text-chalk-text rounded-sm px-0.5">{part}</mark>
    ) : (
      part
    )
  );
}

function highlightKeyTerms(text: string, keyTerms: Set<string>, termMeta?: Map<string, { count: number; firstAt: number }>): React.ReactNode {
  if (keyTerms.size === 0) return text;
  const pattern = [...keyTerms].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const regex = new RegExp(`\\b(${pattern})\\b`, 'gi');
  const parts = text.split(regex);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    const lower = part.toLowerCase();
    if (keyTerms.has(lower)) {
      const meta = termMeta?.get(lower);
      const tip = meta ? `"${lower}" — appears ${meta.count}x` : undefined;
      return <span key={i} className="font-medium text-slate-300 cursor-help" title={tip}>{part}</span>;
    }
    return part;
  });
}
