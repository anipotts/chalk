-- Reload PostgREST schema cache after knowledge graph migration
-- This ensures new tables are immediately available via the REST API
NOTIFY pgrst, 'reload schema';

-- Add write policies to pre-existing tables that were missing them
-- (transcripts and visualizations only had SELECT policies)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'transcripts' AND cmd = 'ALL'
  ) THEN
    CREATE POLICY "write_transcripts" ON transcripts
      FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'visualizations' AND cmd = 'ALL'
  ) THEN
    CREATE POLICY "write_visualizations" ON visualizations
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
