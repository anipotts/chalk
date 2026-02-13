/**
 * Curriculum Context API Route
 *
 * Fetches transcripts from multiple videos in a playlist to enable
 * cross-video references using Opus 4.6's 1M token context window.
 *
 * GET /api/curriculum-context?playlistId=PLxxx&currentVideoId=yyy
 */

import { fetchTranscript, deduplicateSegments, cleanSegments, mergeIntoSentences } from '@/lib/transcript';
import { getCachedTranscript, setCachedTranscript } from '@/lib/transcript-cache';
import { formatTimestamp } from '@/lib/video-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// In-memory cache for curriculum context (keyed by playlistId)
const curriculumCache = new Map<string, { context: string; videos: CurriculumVideo[]; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

interface CurriculumVideo {
  videoId: string;
  title: string;
  index: number;
  segmentCount: number;
}

async function fetchVideoTranscript(videoId: string): Promise<{ text: string; segmentCount: number } | null> {
  try {
    // Check cache first
    const cached = await getCachedTranscript(videoId);
    if (cached && cached.segments.length > 0) {
      const text = cached.segments
        .map((s: { offset: number; text: string }) => `[${formatTimestamp(s.offset)}] ${s.text}`)
        .join('\n');
      return { text, segmentCount: cached.segments.length };
    }

    // Fetch fresh
    const result = await fetchTranscript(videoId);
    const segments = mergeIntoSentences(cleanSegments(deduplicateSegments(result.segments)));

    if (segments.length === 0) return null;

    // Cache for future use
    await setCachedTranscript(videoId, segments, result.source);

    const text = segments
      .map((s: { offset: number; text: string }) => `[${formatTimestamp(s.offset)}] ${s.text}`)
      .join('\n');
    return { text, segmentCount: segments.length };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const playlistId = searchParams.get('playlistId');
  const currentVideoId = searchParams.get('currentVideoId');

  if (!playlistId || !currentVideoId) {
    return Response.json({ error: 'playlistId and currentVideoId required' }, { status: 400 });
  }

  // Check cache
  const cacheKey = `${playlistId}:${currentVideoId}`;
  const cached = curriculumCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return Response.json({
      context: cached.context,
      videos: cached.videos,
      videoCount: cached.videos.length,
    });
  }

  try {
    // Fetch playlist metadata using internal API
    const playlistUrl = new URL('/api/youtube/playlist', req.url);
    playlistUrl.searchParams.set('id', playlistId);
    const playlistRes = await fetch(playlistUrl.toString());

    if (!playlistRes.ok) {
      return Response.json({ error: 'Failed to fetch playlist' }, { status: 502 });
    }

    const playlistData = await playlistRes.json();
    const allVideos: Array<{ videoId: string; title: string; index: number }> = playlistData.videos || [];

    // Find current video position in playlist
    const currentIndex = allVideos.findIndex((v) => v.videoId === currentVideoId);

    // Select window of videos: current + 2 before + 2 after
    const windowSize = 2;
    const startIdx = Math.max(0, currentIndex - windowSize);
    const endIdx = Math.min(allVideos.length, currentIndex + windowSize + 1);
    const selectedVideos = allVideos.slice(startIdx, endIdx).filter(
      (v) => v.videoId !== currentVideoId // exclude current video (it's already in the main context)
    );

    // Fetch transcripts in parallel (limit to 4 concurrent)
    const transcriptResults = await Promise.allSettled(
      selectedVideos.map((v) => fetchVideoTranscript(v.videoId))
    );

    // Build curriculum context string
    let context = '';
    const curriculumVideos: CurriculumVideo[] = [];

    for (let i = 0; i < selectedVideos.length; i++) {
      const video = selectedVideos[i];
      const result = transcriptResults[i];

      if (result.status === 'fulfilled' && result.value) {
        context += `<curriculum_video index="${video.index}" title="${video.title}" video_id="${video.videoId}">\n`;
        context += result.value.text;
        context += `\n</curriculum_video>\n\n`;

        curriculumVideos.push({
          videoId: video.videoId,
          title: video.title,
          index: video.index,
          segmentCount: result.value.segmentCount,
        });
      }
    }

    // Cache the result
    curriculumCache.set(cacheKey, {
      context,
      videos: curriculumVideos,
      timestamp: Date.now(),
    });

    return Response.json({
      context,
      videos: curriculumVideos,
      videoCount: curriculumVideos.length,
    });
  } catch (error) {
    console.error('Curriculum context error:', error);
    return Response.json({ error: 'Failed to build curriculum context' }, { status: 500 });
  }
}
