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

function sanitizeChannelName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
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

  const { videoId, channelName } = body;
  if (!videoId || typeof videoId !== 'string' || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return Response.json({ error: 'Invalid video ID' }, { status: 400 });
  }

  const safeChannelName = typeof channelName === 'string' && channelName.trim()
    ? channelName.trim().slice(0, 200)
    : null;

  // Check Supabase cache first — channel-level then video-level fallback
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      // Try channel-level cache first
      if (safeChannelName) {
        const { data } = await supabase
          .from('voice_clones')
          .select('voice_id, voice_name')
          .eq('channel_name', safeChannelName)
          .single();

        if (data?.voice_id) {
          supabase
            .from('voice_clones')
            .update({ last_used_at: new Date().toISOString() })
            .eq('channel_name', safeChannelName)
            .then(() => {});

          return Response.json({
            voiceId: data.voice_id,
            name: data.voice_name,
            cached: true,
          });
        }
      }

      // Fallback: video-level cache (legacy)
      const { data } = await supabase
        .from('voice_clones')
        .select('voice_id, voice_name')
        .eq('video_id', videoId)
        .single();

      if (data?.voice_id) {
        // Upgrade legacy entry with channel_name if available
        if (safeChannelName) {
          supabase
            .from('voice_clones')
            .update({ channel_name: safeChannelName, last_used_at: new Date().toISOString() })
            .eq('video_id', videoId)
            .then(() => {});
        } else {
          supabase
            .from('voice_clones')
            .update({ last_used_at: new Date().toISOString() })
            .eq('video_id', videoId)
            .then(() => {});
        }

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
  const voiceName = safeChannelName
    ? `chalk-${sanitizeChannelName(safeChannelName)}`
    : `chalk-${videoId}`;
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
        channel_name: safeChannelName,
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
