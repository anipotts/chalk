-- Service registry for dynamic URL discovery (e.g. WhisperX on Courant cuda5)
CREATE TABLE IF NOT EXISTS service_registry (
  service_name text PRIMARY KEY,
  url text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE service_registry ENABLE ROW LEVEL SECURITY;

-- Anyone can read service URLs (needed by transcript pipeline)
CREATE POLICY "Anyone can read service URLs"
  ON service_registry FOR SELECT USING (true);

-- Only service role can write (heartbeat updates from GPU nodes)
CREATE POLICY "Service role can write"
  ON service_registry FOR ALL USING (true) WITH CHECK (true);
