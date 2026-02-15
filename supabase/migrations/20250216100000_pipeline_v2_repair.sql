-- Repair: batch_progress constraint + metadata column
ALTER TABLE public.batch_progress DROP CONSTRAINT IF EXISTS batch_progress_status_check;
ALTER TABLE public.batch_progress ADD CONSTRAINT batch_progress_status_check
  CHECK (status IN ('pending','transcript_done','batch_queued','extraction_done',
    'normalized','connected','enriched','embedded','completed','failed'));

ALTER TABLE public.batch_progress ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
