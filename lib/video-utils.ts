/**
 * Client-safe video utility functions.
 * No Node.js dependencies — safe for browser bundles.
 */

export interface TranscriptSegment {
  text: string;
  offset: number; // seconds
  duration: number; // seconds
}

export type TranscriptSource =
  | 'innertube'
  | 'web-scrape'
  | 'yt-dlp'
  | 'caption-extractor'
  | 'groq-whisper'
  | 'local-whisper'
  | 'deepgram';

export interface TranscriptResult {
  segments: TranscriptSegment[];
  source: TranscriptSource;
}

/**
 * Extract YouTube video ID from various URL formats.
 */
export function extractVideoId(input: string): string | null {
  // Already a plain video ID (11 chars)
  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) {
    return input.trim();
  }

  try {
    const url = new URL(input);
    if (url.hostname.includes('youtube.com')) {
      // youtube.com/watch?v=ID
      const v = url.searchParams.get('v');
      if (v) return v;
      // youtube.com/shorts/ID or youtube.com/embed/ID or youtube.com/v/ID
      const pathMatch = url.pathname.match(/^\/(shorts|embed|v)\/([a-zA-Z0-9_-]{11})/);
      if (pathMatch) return pathMatch[2];
      return null;
    }
    // youtu.be/ID
    if (url.hostname === 'youtu.be') {
      return url.pathname.slice(1) || null;
    }
  } catch {
    // Not a URL
  }

  return null;
}

/**
 * Parse [M:SS] or [H:MM:SS] timestamp citations from AI response text.
 */
export function parseTimestampLinks(text: string): Array<{ match: string; seconds: number; index: number }> {
  const regex = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g;
  const results: Array<{ match: string; seconds: number; index: number }> = [];
  let m;

  while ((m = regex.exec(text)) !== null) {
    let seconds: number;
    if (m[3] !== undefined) {
      // H:MM:SS
      seconds = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]);
    } else {
      // M:SS
      seconds = parseInt(m[1]) * 60 + parseInt(m[2]);
    }
    results.push({ match: m[0], seconds, index: m.index });
  }

  return results;
}

/**
 * Format seconds as M:SS or H:MM:SS.
 */
export function formatTimestamp(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

