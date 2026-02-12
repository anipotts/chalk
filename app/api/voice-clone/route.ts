import { cloneVoice, isElevenLabsAvailable } from '@/lib/tts/elevenlabs';
import { downloadAudioHTTP, downloadAudioWebScrape } from '@/lib/transcript';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceKey || anonKey;
  if (url && key) return createClient(url, key);
  return null;
}

export async function POST(req: Request) {
  if (!isElevenLabsAvailable()) {
    return Response.json(
      { error: 'ElevenLabs is not configured. Set ELEVENLABS_API_KEY.' },
      { status: 503 },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { videoId } = body;
  if (!videoId || typeof videoId !== 'string' || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return Response.json({ error: 'Invalid video ID' }, { status: 400 });
  }

  // Check Supabase cache first
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data } = await supabase
        .from('voice_clones')
        .select('voice_id, voice_name')
        .eq('video_id', videoId)
        .single();

      if (data?.voice_id) {
        // Update last_used_at
        supabase
          .from('voice_clones')
          .update({ last_used_at: new Date().toISOString() })
          .eq('video_id', videoId)
          .then(() => {});

        return Response.json({
          voiceId: data.voice_id,
          name: data.voice_name,
          cached: true,
        });
      }
    } catch {
      // Cache miss — continue to clone
    }
  }

  // Download audio from YouTube (try innertube first, then web scrape)
  let audioBuffer: Buffer;
  try {
    audioBuffer = await downloadAudioHTTP(videoId);
  } catch (err) {
    console.error('[voice-clone] Innertube audio failed, trying web scrape:', err instanceof Error ? err.message : err);
    try {
      audioBuffer = await downloadAudioWebScrape(videoId);
    } catch (err2) {
      console.error('[voice-clone] Web scrape audio also failed:', err2 instanceof Error ? err2.message : err2);
      return Response.json(
        { error: 'Could not extract audio from video' },
        { status: 404 },
      );
    }
  }

  // Clone the voice via ElevenLabs
  const voiceName = `chalk-${videoId}`;
  let voiceId: string;
  try {
    voiceId = await cloneVoice(audioBuffer, voiceName);
  } catch (err) {
    console.error('[voice-clone] Clone failed:', err instanceof Error ? err.message : err);
    return Response.json(
      { error: 'Voice cloning failed' },
      { status: 500 },
    );
  }

  // Cache in Supabase (fire-and-forget)
  if (supabase) {
    supabase
      .from('voice_clones')
      .upsert({
        video_id: videoId,
        voice_id: voiceId,
        voice_name: voiceName,
        created_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
      })
      .then(({ error }) => {
        if (error) console.error('[voice-clone] Supabase cache error:', error.message);
      });
  }

  return Response.json({
    voiceId,
    name: voiceName,
    cached: false,
  });
}
