-- Voice clones table: caches ElevenLabs cloned voice IDs per YouTube video
CREATE TABLE IF NOT EXISTS voice_clones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id TEXT NOT NULL UNIQUE,
  voice_id TEXT NOT NULL,
  voice_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_clones_video_id ON voice_clones(video_id);
