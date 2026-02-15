-- Queue security & robustness fixes.
--
-- 1. Remove overpermissive RLS policy (service role already bypasses RLS)
-- 2. Increase heartbeat staleness from 60s to 180s (GPU transcription blocks for minutes)
-- 3. Fix enqueue_transcript: separate completed vs failed branches

-- ── 1. CRITICAL: Remove RLS policy that grants ALL to anonymous users ────────
-- Service role bypasses RLS automatically, so this policy only opened
-- INSERT/UPDATE/DELETE to anon/authenticated — a security hole.
DROP POLICY IF EXISTS "Service role manages queue" ON transcript_queue;

-- ── 2. Replace claim_next_job with 180s heartbeat threshold ──────────────────
CREATE OR REPLACE FUNCTION claim_next_job(p_worker_id text)
RETURNS SETOF transcript_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job transcript_queue;
BEGIN
  -- Reclaim stale jobs (heartbeat older than 180s while in active status).
  -- GPU transcription blocks for minutes — 60s caused false reclamation.
  UPDATE transcript_queue SET
    status = 'pending',
    worker_id = NULL,
    heartbeat_at = NULL,
    attempt_count = attempt_count + 1
  WHERE status IN ('downloading', 'transcribing')
    AND heartbeat_at < now() - interval '180 seconds';

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

-- ── 3. Fix enqueue_transcript: separate completed vs failed branches ─────────
-- Previously, completed jobs with attempt_count=1 couldn't be re-queued
-- because the condition `attempt_count >= max_attempts` was never true.
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
    -- Completed jobs should not be re-queued (transcript should be cached)
    IF v_existing.status = 'completed' THEN
      RETURN 'cached';
    END IF;

    -- Failed jobs: reset for retry
    IF v_existing.status = 'failed' THEN
      UPDATE transcript_queue SET
        priority = LEAST(v_existing.priority, p_priority),
        status = 'pending',
        requested_by = p_requested_by,
        attempt_count = 0,
        error_message = NULL,
        requested_at = now()
      WHERE video_id = p_video_id;
      RETURN 'enqueued';
    END IF;

    -- Active/pending job: escalate priority if new request is higher (lower number)
    IF p_priority < v_existing.priority THEN
      UPDATE transcript_queue SET
        priority = p_priority,
        requested_by = p_requested_by
      WHERE video_id = p_video_id;
      RETURN 'escalated';
    END IF;

    RETURN 'in_progress';
  END IF;

  -- Insert new job
  INSERT INTO transcript_queue (video_id, priority, requested_by)
  VALUES (p_video_id, p_priority, p_requested_by);

  RETURN 'enqueued';
END;
$$;
