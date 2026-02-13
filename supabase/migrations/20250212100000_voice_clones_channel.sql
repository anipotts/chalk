-- Add channel_name to voice_clones for per-channel voice caching
ALTER TABLE voice_clones ADD COLUMN IF NOT EXISTS channel_name TEXT;

-- Partial unique index: one clone per channel (NULL channel_names are excluded)
CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_clones_channel_name
  ON voice_clones(channel_name) WHERE channel_name IS NOT NULL;
