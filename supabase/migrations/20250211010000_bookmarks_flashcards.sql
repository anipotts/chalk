-- Video bookmarks: save specific moments with notes
CREATE TABLE IF NOT EXISTS video_bookmarks (
  id TEXT PRIMARY KEY DEFAULT nanoid(),
  video_id TEXT NOT NULL,
  video_title TEXT,
  timestamp_seconds REAL NOT NULL,
  note TEXT DEFAULT '',
  color TEXT DEFAULT 'blue',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bookmarks_video ON video_bookmarks(video_id);

ALTER TABLE video_bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to video_bookmarks" ON video_bookmarks FOR ALL USING (true) WITH CHECK (true);

-- Flashcards: extracted from video conversations
CREATE TABLE IF NOT EXISTS study_flashcards (
  id TEXT PRIMARY KEY DEFAULT nanoid(),
  video_id TEXT NOT NULL,
  video_title TEXT,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  timestamp_seconds REAL,
  ease_factor REAL DEFAULT 2.5,
  interval_days INTEGER DEFAULT 0,
  repetitions INTEGER DEFAULT 0,
  next_review TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_flashcards_video ON study_flashcards(video_id);
CREATE INDEX idx_flashcards_review ON study_flashcards(next_review);

ALTER TABLE study_flashcards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to study_flashcards" ON study_flashcards FOR ALL USING (true) WITH CHECK (true);
