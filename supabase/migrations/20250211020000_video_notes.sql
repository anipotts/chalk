-- Video notes: persistent markdown notes per video
CREATE TABLE IF NOT EXISTS video_notes (
  id TEXT PRIMARY KEY DEFAULT nanoid(),
  video_id TEXT NOT NULL UNIQUE,
  video_title TEXT,
  content TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notes_video ON video_notes(video_id);

ALTER TABLE video_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to video_notes" ON video_notes FOR ALL USING (true) WITH CHECK (true);
