-- nanoid function for generating short IDs
CREATE OR REPLACE FUNCTION nanoid(size int DEFAULT 10)
RETURNS text AS $$
DECLARE
  id text := '';
  i int := 0;
  alphabet text := '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  idLength int := 62;
  bytes bytea;
BEGIN
  bytes := gen_random_bytes(size);
  WHILE i < size LOOP
    id := id || substr(alphabet, (get_byte(bytes, i) % idLength) + 1, 1);
    i := i + 1;
  END LOOP;
  RETURN id;
END
$$ LANGUAGE plpgsql VOLATILE;

-- Video study sessions: persistent chat per video
CREATE TABLE IF NOT EXISTS video_sessions (
  id text PRIMARY KEY DEFAULT nanoid(),
  video_id text NOT NULL,
  video_title text,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_preference text DEFAULT 'auto',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS video_sessions_video_id_idx ON video_sessions (video_id);
CREATE INDEX IF NOT EXISTS video_sessions_updated_at_idx ON video_sessions (updated_at DESC);

-- Shared study notes: shareable links for video conversations
CREATE TABLE IF NOT EXISTS shared_notes (
  id text PRIMARY KEY DEFAULT nanoid(),
  video_id text NOT NULL,
  video_title text,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  transcript_summary text,
  view_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shared_notes_video_id_idx ON shared_notes (video_id);

-- Study collections: organize videos into playlists
CREATE TABLE IF NOT EXISTS study_collections (
  id text PRIMARY KEY DEFAULT nanoid(),
  name text NOT NULL,
  description text,
  videos jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS study_collections_updated_at_idx ON study_collections (updated_at DESC);

-- Video analytics: track learning patterns
CREATE TABLE IF NOT EXISTS video_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id text NOT NULL,
  video_title text,
  event_type text NOT NULL CHECK (event_type IN ('watch', 'chat', 'share', 'bookmark')),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS video_analytics_video_id_idx ON video_analytics (video_id);
CREATE INDEX IF NOT EXISTS video_analytics_created_at_idx ON video_analytics (created_at DESC);
CREATE INDEX IF NOT EXISTS video_analytics_event_type_idx ON video_analytics (event_type);

-- Enable RLS on all tables (public access for hackathon)
ALTER TABLE video_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to video_sessions" ON video_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to shared_notes" ON shared_notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to study_collections" ON study_collections FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to video_analytics" ON video_analytics FOR ALL USING (true) WITH CHECK (true);
