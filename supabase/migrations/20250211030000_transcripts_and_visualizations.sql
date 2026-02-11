-- Transcripts cache table (L2 durable cache for transcript pipeline)
CREATE TABLE IF NOT EXISTS transcripts (
  video_id text PRIMARY KEY,
  segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL,
  segment_count integer NOT NULL DEFAULT 0,
  duration_seconds real NOT NULL DEFAULT 0,
  video_title text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS transcripts_expires_at_idx ON transcripts (expires_at);

ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;

-- Read-only for anon users, server writes via service role
CREATE POLICY "Allow read access to transcripts" ON transcripts
  FOR SELECT USING (true);

-- Visualizations table (shared viz specs)
CREATE TABLE IF NOT EXISTS visualizations (
  id text PRIMARY KEY,
  spec jsonb NOT NULL,
  prompt text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE visualizations ENABLE ROW LEVEL SECURITY;

-- Read-only for anon users, server writes via service role
CREATE POLICY "Allow read access to visualizations" ON visualizations
  FOR SELECT USING (true);
