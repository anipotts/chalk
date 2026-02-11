import { supabase } from './supabase';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  thinkingDuration?: number;
}

interface VideoSession {
  id: string;
  video_id: string;
  video_title: string | null;
  messages: ChatMessage[];
  model_preference: string;
  created_at: string;
  updated_at: string;
}

/**
 * Load a video session from Supabase by video ID.
 * Returns null if no session exists.
 */
export async function loadVideoSession(videoId: string): Promise<VideoSession | null> {
  try {
    const { data, error } = await supabase
      .from('video_sessions')
      .select('*')
      .eq('video_id', videoId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;
    return data as VideoSession;
  } catch {
    return null;
  }
}

/**
 * Save or update a video session in Supabase.
 * Uses upsert based on video_id — one session per video.
 */
export async function saveVideoSession(
  videoId: string,
  messages: ChatMessage[],
  videoTitle?: string,
  modelPreference?: string,
): Promise<string | null> {
  try {
    // Try to find existing session first
    const existing = await loadVideoSession(videoId);

    if (existing) {
      // Update existing session
      const { error } = await supabase
        .from('video_sessions')
        .update({
          messages: JSON.parse(JSON.stringify(messages)),
          video_title: videoTitle || existing.video_title,
          model_preference: modelPreference || existing.model_preference,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (error) throw error;
      return existing.id;
    } else {
      // Create new session
      const { data, error } = await supabase
        .from('video_sessions')
        .insert({
          video_id: videoId,
          video_title: videoTitle || null,
          messages: JSON.parse(JSON.stringify(messages)),
          model_preference: modelPreference || 'auto',
        })
        .select('id')
        .single();

      if (error) throw error;
      return data?.id || null;
    }
  } catch (e) {
    console.warn('[video-sessions] Failed to save:', e);
    return null;
  }
}

/**
 * Create a shared note from a video session.
 * Returns the share ID for the URL.
 */
export async function createSharedNote(
  videoId: string,
  messages: ChatMessage[],
  videoTitle?: string,
  transcriptSummary?: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('shared_notes')
      .insert({
        video_id: videoId,
        video_title: videoTitle || null,
        messages: JSON.parse(JSON.stringify(messages)),
        transcript_summary: transcriptSummary || null,
      })
      .select('id')
      .single();

    if (error) throw error;
    return data?.id || null;
  } catch (e) {
    console.warn('[shared-notes] Failed to create:', e);
    return null;
  }
}

/**
 * Load a shared note by ID.
 */
export async function loadSharedNote(noteId: string): Promise<{
  video_id: string;
  video_title: string | null;
  messages: ChatMessage[];
  transcript_summary: string | null;
  view_count: number;
  created_at: string;
} | null> {
  try {
    const { data, error } = await supabase
      .from('shared_notes')
      .select('*')
      .eq('id', noteId)
      .single();

    if (error || !data) return null;

    // Increment view count in background
    supabase
      .from('shared_notes')
      .update({ view_count: (data.view_count || 0) + 1 })
      .eq('id', noteId)
      .then(() => {});

    return data;
  } catch {
    return null;
  }
}

/**
 * Track a video analytics event.
 */
export async function trackVideoEvent(
  videoId: string,
  eventType: 'watch' | 'chat' | 'share' | 'bookmark',
  metadata?: Record<string, unknown>,
  videoTitle?: string,
): Promise<void> {
  try {
    await supabase.from('video_analytics').insert({
      video_id: videoId,
      video_title: videoTitle || null,
      event_type: eventType,
      metadata: metadata || {},
    });
  } catch {
    // Silent fail for analytics
  }
}

/**
 * Get recent video sessions for the sessions list.
 */
export async function getRecentSessions(limit: number = 10): Promise<VideoSession[]> {
  try {
    const { data, error } = await supabase
      .from('video_sessions')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data as VideoSession[]) || [];
  } catch {
    return [];
  }
}

// ─── Study Collections ──────────────────────────────────────────────────────

interface CollectionVideo {
  id: string;
  title?: string;
  addedAt: string;
}

export interface StudyCollection {
  id: string;
  name: string;
  description: string | null;
  videos: CollectionVideo[];
  created_at: string;
  updated_at: string;
}

/**
 * List all study collections.
 */
export async function listCollections(): Promise<StudyCollection[]> {
  try {
    const { data, error } = await supabase
      .from('study_collections')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return (data as StudyCollection[]) || [];
  } catch {
    return [];
  }
}

/**
 * Create a new study collection.
 */
export async function createCollection(name: string, description?: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('study_collections')
      .insert({
        name,
        description: description || null,
        videos: [],
      })
      .select('id')
      .single();

    if (error) throw error;
    return data?.id || null;
  } catch {
    return null;
  }
}

/**
 * Add a video to a collection.
 */
export async function addVideoToCollection(
  collectionId: string,
  videoId: string,
  videoTitle?: string,
): Promise<boolean> {
  try {
    // Get current collection
    const { data, error } = await supabase
      .from('study_collections')
      .select('videos')
      .eq('id', collectionId)
      .single();

    if (error || !data) return false;

    const videos = (data.videos as CollectionVideo[]) || [];
    // Don't add duplicates
    if (videos.some((v) => v.id === videoId)) return true;

    videos.push({ id: videoId, title: videoTitle, addedAt: new Date().toISOString() });

    const { error: updateError } = await supabase
      .from('study_collections')
      .update({
        videos: JSON.parse(JSON.stringify(videos)),
        updated_at: new Date().toISOString(),
      })
      .eq('id', collectionId);

    return !updateError;
  } catch {
    return false;
  }
}

/**
 * Remove a video from a collection.
 */
export async function removeVideoFromCollection(
  collectionId: string,
  videoId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('study_collections')
      .select('videos')
      .eq('id', collectionId)
      .single();

    if (error || !data) return false;

    const videos = ((data.videos as CollectionVideo[]) || []).filter((v) => v.id !== videoId);

    const { error: updateError } = await supabase
      .from('study_collections')
      .update({
        videos: JSON.parse(JSON.stringify(videos)),
        updated_at: new Date().toISOString(),
      })
      .eq('id', collectionId);

    return !updateError;
  } catch {
    return false;
  }
}

/**
 * Delete a collection.
 */
export async function deleteCollection(collectionId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('study_collections')
      .delete()
      .eq('id', collectionId);
    return !error;
  } catch {
    return false;
  }
}

// ─── Video Bookmarks ──────────────────────────────────────────────────────

export interface VideoBookmark {
  id: string;
  video_id: string;
  video_title: string | null;
  timestamp_seconds: number;
  note: string;
  color: string;
  created_at: string;
}

export async function listBookmarks(videoId: string): Promise<VideoBookmark[]> {
  try {
    const { data, error } = await supabase
      .from('video_bookmarks')
      .select('*')
      .eq('video_id', videoId)
      .order('timestamp_seconds', { ascending: true });
    if (error) throw error;
    return (data as VideoBookmark[]) || [];
  } catch {
    return [];
  }
}

export async function createBookmark(
  videoId: string,
  timestampSeconds: number,
  note?: string,
  videoTitle?: string,
  color?: string,
): Promise<VideoBookmark | null> {
  try {
    const { data, error } = await supabase
      .from('video_bookmarks')
      .insert({
        video_id: videoId,
        video_title: videoTitle || null,
        timestamp_seconds: timestampSeconds,
        note: note || '',
        color: color || 'blue',
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as VideoBookmark;
  } catch {
    return null;
  }
}

export async function deleteBookmark(bookmarkId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('video_bookmarks')
      .delete()
      .eq('id', bookmarkId);
    return !error;
  } catch {
    return false;
  }
}

export async function updateBookmarkNote(bookmarkId: string, note: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('video_bookmarks')
      .update({ note })
      .eq('id', bookmarkId);
    return !error;
  } catch {
    return false;
  }
}

// ─── Flashcards ──────────────────────────────────────────────────────

export interface StudyFlashcard {
  id: string;
  video_id: string;
  video_title: string | null;
  front: string;
  back: string;
  timestamp_seconds: number | null;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review: string;
  created_at: string;
}

export async function listFlashcards(videoId?: string): Promise<StudyFlashcard[]> {
  try {
    let query = supabase
      .from('study_flashcards')
      .select('*')
      .order('next_review', { ascending: true });
    if (videoId) query = query.eq('video_id', videoId);
    const { data, error } = await query;
    if (error) throw error;
    return (data as StudyFlashcard[]) || [];
  } catch {
    return [];
  }
}

export async function getDueFlashcards(limit: number = 20): Promise<StudyFlashcard[]> {
  try {
    const { data, error } = await supabase
      .from('study_flashcards')
      .select('*')
      .lte('next_review', new Date().toISOString())
      .order('next_review', { ascending: true })
      .limit(limit);
    if (error) throw error;
    return (data as StudyFlashcard[]) || [];
  } catch {
    return [];
  }
}

export async function createFlashcard(
  videoId: string,
  front: string,
  back: string,
  videoTitle?: string,
  timestampSeconds?: number,
): Promise<StudyFlashcard | null> {
  try {
    const { data, error } = await supabase
      .from('study_flashcards')
      .insert({
        video_id: videoId,
        video_title: videoTitle || null,
        front,
        back,
        timestamp_seconds: timestampSeconds ?? null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as StudyFlashcard;
  } catch {
    return null;
  }
}

export async function reviewFlashcard(
  cardId: string,
  quality: 'again' | 'hard' | 'easy',
): Promise<boolean> {
  try {
    // Fetch current card
    const { data: card, error: fetchError } = await supabase
      .from('study_flashcards')
      .select('*')
      .eq('id', cardId)
      .single();
    if (fetchError || !card) return false;

    // SM-2 inspired algorithm
    let { ease_factor, interval_days, repetitions } = card;
    const now = new Date();

    if (quality === 'again') {
      repetitions = 0;
      interval_days = 0;
    } else if (quality === 'hard') {
      ease_factor = Math.max(1.3, ease_factor - 0.15);
      if (repetitions === 0) interval_days = 1;
      else interval_days = Math.ceil(interval_days * 1.2);
      repetitions += 1;
    } else {
      ease_factor = Math.min(3.0, ease_factor + 0.15);
      if (repetitions === 0) interval_days = 1;
      else if (repetitions === 1) interval_days = 3;
      else interval_days = Math.ceil(interval_days * ease_factor);
      repetitions += 1;
    }

    const nextReview = new Date(now.getTime() + interval_days * 86400000);

    const { error } = await supabase
      .from('study_flashcards')
      .update({
        ease_factor,
        interval_days,
        repetitions,
        next_review: nextReview.toISOString(),
      })
      .eq('id', cardId);

    return !error;
  } catch {
    return false;
  }
}

export async function deleteFlashcard(cardId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('study_flashcards')
      .delete()
      .eq('id', cardId);
    return !error;
  } catch {
    return false;
  }
}

// ─── Video Notes ──────────────────────────────────────────────────────

export async function loadVideoNotes(videoId: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('video_notes')
      .select('content')
      .eq('video_id', videoId)
      .single();
    if (error || !data) return '';
    return data.content || '';
  } catch {
    return '';
  }
}

export async function saveVideoNotes(
  videoId: string,
  content: string,
  videoTitle?: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('video_notes')
      .upsert({
        video_id: videoId,
        content,
        video_title: videoTitle || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'video_id' });
    return !error;
  } catch {
    return false;
  }
}
