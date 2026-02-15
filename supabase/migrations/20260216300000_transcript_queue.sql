-- Priority queue for GPU transcription jobs.
-- Supabase acts as the message bus between Vercel (producer) and cuda5 (consumer).

CREATE TABLE IF NOT EXISTS transcript_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id text NOT NULL UNIQUE,
  priority smallint NOT NULL DEFAULT 2,       -- 0 = user watching (P0), 2 = batch (P2)
  status text NOT NULL DEFAULT 'pending',     -- pending -> downloading -> transcribing -> finalizing -> completed / failed
  requested_by text NOT NULL DEFAULT 'batch', -- 'user' or 'batch'
  worker_id text,
  heartbeat_at timestamptz,
  segments_written int NOT NULL DEFAULT 0,
  progress_pct smallint NOT NULL DEFAULT 0,   -- 0-100
  attempt_count int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  error_message text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

ALTER TABLE transcript_queue ENABLE ROW LEVEL SECURITY;

-- Anon can SELECT (client polls job status + segment counts)
CREATE POLICY "Anyone can read queue status"
  ON transcript_queue FOR SELECT USING (true);

-- Service role can do everything
CREATE POLICY "Service role manages queue"
  ON transcript_queue FOR ALL USING (true) WITH CHECK (true);

-- Fast job claiming index
CREATE INDEX idx_transcript_queue_claim
  ON transcript_queue (status, priority, requested_at)
  WHERE status = 'pending';

-- Fast lookup by video_id (already UNIQUE but explicit for clarity)
CREATE INDEX idx_transcript_queue_video
  ON transcript_queue (video_id);

-- ─── RPC: enqueue_transcript ────────────────────────────────────────────────
-- Returns: 'cached' | 'escalated' | 'enqueued' | 'in_progress'
CREATE OR REPLACE FUNCTION enqueue_transcript(
  p_video_id text,
  p_priority smallint DEFAULT 0,
  p_requested_by text DEFAULT 'user'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing record;
BEGIN
  -- Check if transcript already cached
  IF EXISTS (
    SELECT 1 FROM transcripts
    WHERE video_id = p_video_id
      AND segments IS NOT NULL
      AND jsonb_array_length(segments::jsonb) > 0
  ) THEN
    RETURN 'cached';
  END IF;

  -- Check if job already exists
  SELECT * INTO v_existing
  FROM transcript_queue
  WHERE video_id = p_video_id;

  IF v_existing IS NOT NULL THEN
    -- Job exists — escalate priority if new request is higher (lower number)
    IF v_existing.status IN ('completed', 'failed') AND v_existing.attempt_count >= v_existing.max_attempts THEN
      -- Reset failed job for retry with new priority
      UPDATE transcript_queue SET
        priority = LEAST(v_existing.priority, p_priority),
        status = 'pending',
        requested_by = p_requested_by,
        attempt_count = 0,
        error_message = NULL,
        requested_at = now()
      WHERE video_id = p_video_id;
      RETURN 'enqueued';
    ELSIF p_priority < v_existing.priority THEN
      UPDATE transcript_queue SET
        priority = p_priority,
        requested_by = p_requested_by
      WHERE video_id = p_video_id;
      RETURN 'escalated';
    ELSE
      RETURN 'in_progress';
    END IF;
  END IF;

  -- Insert new job
  INSERT INTO transcript_queue (video_id, priority, requested_by)
  VALUES (p_video_id, p_priority, p_requested_by);

  RETURN 'enqueued';
END;
$$;

-- ─── RPC: claim_next_job ────────────────────────────────────────────────────
-- Returns the claimed job row, or NULL if no jobs available.
CREATE OR REPLACE FUNCTION claim_next_job(p_worker_id text)
RETURNS SETOF transcript_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job transcript_queue;
BEGIN
  -- Reclaim stale jobs (heartbeat older than 60s while in active status)
  UPDATE transcript_queue SET
    status = 'pending',
    worker_id = NULL,
    heartbeat_at = NULL,
    attempt_count = attempt_count + 1
  WHERE status IN ('downloading', 'transcribing')
    AND heartbeat_at < now() - interval '60 seconds';

  -- Mark jobs that exceeded max attempts as failed
  UPDATE transcript_queue SET
    status = 'failed',
    error_message = COALESCE(error_message, 'Max attempts exceeded')
  WHERE status = 'pending'
    AND attempt_count >= max_attempts;

  -- Claim next pending job (priority ASC = P0 first, then by request time)
  SELECT * INTO v_job
  FROM transcript_queue
  WHERE status = 'pending'
    AND attempt_count < max_attempts
  ORDER BY priority ASC, requested_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_job IS NULL THEN
    RETURN;
  END IF;

  -- Update the claimed job
  UPDATE transcript_queue SET
    status = 'downloading',
    worker_id = p_worker_id,
    heartbeat_at = now(),
    started_at = COALESCE(started_at, now()),
    attempt_count = attempt_count + 1
  WHERE id = v_job.id;

  -- Return updated row
  v_job.status := 'downloading';
  v_job.worker_id := p_worker_id;
  v_job.heartbeat_at := now();
  v_job.attempt_count := v_job.attempt_count + 1;
  RETURN NEXT v_job;
END;
$$;

-- ─── RPC: heartbeat_job ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION heartbeat_job(
  p_job_id uuid,
  p_worker_id text,
  p_status text DEFAULT NULL,
  p_progress_pct smallint DEFAULT NULL,
  p_segments_written int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE transcript_queue SET
    heartbeat_at = now(),
    status = COALESCE(p_status, status),
    progress_pct = COALESCE(p_progress_pct, progress_pct),
    segments_written = COALESCE(p_segments_written, segments_written)
  WHERE id = p_job_id
    AND worker_id = p_worker_id;
END;
$$;

-- ─── RPC: complete_job ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION complete_job(
  p_job_id uuid,
  p_worker_id text,
  p_segments_written int DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE transcript_queue SET
    status = 'completed',
    completed_at = now(),
    heartbeat_at = now(),
    progress_pct = 100,
    segments_written = p_segments_written
  WHERE id = p_job_id
    AND worker_id = p_worker_id;
END;
$$;

-- ─── RPC: fail_job ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fail_job(
  p_job_id uuid,
  p_worker_id text,
  p_error text DEFAULT 'Unknown error'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt_count int;
  v_max_attempts int;
BEGIN
  SELECT attempt_count, max_attempts INTO v_attempt_count, v_max_attempts
  FROM transcript_queue
  WHERE id = p_job_id AND worker_id = p_worker_id;

  IF v_attempt_count < v_max_attempts THEN
    -- Auto-retry: reset to pending
    UPDATE transcript_queue SET
      status = 'pending',
      error_message = p_error,
      worker_id = NULL,
      heartbeat_at = NULL
    WHERE id = p_job_id AND worker_id = p_worker_id;
  ELSE
    -- Max retries exhausted
    UPDATE transcript_queue SET
      status = 'failed',
      error_message = p_error,
      heartbeat_at = now()
    WHERE id = p_job_id AND worker_id = p_worker_id;
  END IF;
END;
$$;

-- ─── RPC: should_preempt ────────────────────────────────────────────────────
-- Check if a higher-priority job is waiting (for batch preemption).
CREATE OR REPLACE FUNCTION should_preempt(p_current_priority smallint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS(
    SELECT 1 FROM transcript_queue
    WHERE status = 'pending'
      AND priority < p_current_priority
  );
$$;
