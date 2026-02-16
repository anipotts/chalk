-- Fix race condition in enqueue_transcript where concurrent requests
-- both see "no existing job" and both try to INSERT, with the second
-- hitting the unique constraint violation.
--
-- Solution: wrap INSERT in exception handler for unique_violation,
-- then re-check the existing job and return appropriate status.

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

  -- Insert new job (with race condition protection)
  BEGIN
    INSERT INTO transcript_queue (video_id, priority, requested_by)
    VALUES (p_video_id, p_priority, p_requested_by);
    RETURN 'enqueued';
  EXCEPTION WHEN unique_violation THEN
    -- Concurrent insert won the race — treat as in_progress
    RETURN 'in_progress';
  END;
END;
$$;
