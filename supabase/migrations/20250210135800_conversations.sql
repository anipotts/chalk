-- Conversations table for persistent chat history
CREATE TABLE IF NOT EXISTS conversations (
  id text PRIMARY KEY,
  title text NOT NULL,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for ordering by most recently updated
CREATE INDEX IF NOT EXISTS conversations_updated_at_idx ON conversations (updated_at DESC);

-- Enable RLS (public access for now — no auth)
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Allow all operations (no auth required for hackathon)
CREATE POLICY "Allow all access to conversations" ON conversations
  FOR ALL USING (true) WITH CHECK (true);
