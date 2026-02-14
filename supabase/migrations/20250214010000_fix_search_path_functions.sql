-- =============================================================================
-- Migration: Fix search_path-qualified function references
-- Date: 2025-02-14
-- Fixes:
--   1. nanoid() — qualify gen_random_bytes with extensions schema (pgcrypto)
--   2. build_context_block() — remove unused 'quiz' variable
-- =============================================================================

-- 1. Fix nanoid: gen_random_bytes lives in extensions schema (pgcrypto extension)
CREATE OR REPLACE FUNCTION public.nanoid(size int DEFAULT 10)
RETURNS text AS $$
DECLARE
  id text := '';
  i int := 0;
  alphabet text := '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  idLength int := 62;
  bytes bytea;
BEGIN
  bytes := extensions.gen_random_bytes(size);
  WHILE i < size LOOP
    id := id || substr(alphabet, (get_byte(bytes, i) % idLength) + 1, 1);
    i := i + 1;
  END LOOP;
  RETURN id;
END
$$ LANGUAGE plpgsql VOLATILE
SET search_path = '';

-- 2. Fix build_context_block: remove unused 'quiz' variable
CREATE OR REPLACE FUNCTION public.build_context_block(p_video_id text)
RETURNS text AS $$
DECLARE
  v record;
  result text := '';
  chapter record;
  mention record;
  moment record;
BEGIN
  -- Fetch video metadata
  SELECT * INTO v FROM public.video_knowledge WHERE video_id = p_video_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  result := '<video_context video_id="' || p_video_id || '">' || chr(10);

  -- Core metadata
  result := result || '<title>' || coalesce(v.title, '') || '</title>' || chr(10);
  IF v.summary IS NOT NULL THEN
    result := result || '<summary>' || v.summary || '</summary>' || chr(10);
  END IF;
  IF v.difficulty IS NOT NULL THEN
    result := result || '<difficulty>' || v.difficulty || '</difficulty>' || chr(10);
  END IF;
  IF array_length(v.topics, 1) > 0 THEN
    result := result || '<topics>' || array_to_string(v.topics, ', ') || '</topics>' || chr(10);
  END IF;
  IF array_length(v.learning_objectives, 1) > 0 THEN
    result := result || '<objectives>' || chr(10);
    FOR i IN 1..array_length(v.learning_objectives, 1) LOOP
      result := result || '- ' || v.learning_objectives[i] || chr(10);
    END LOOP;
    result := result || '</objectives>' || chr(10);
  END IF;
  IF array_length(v.prerequisites, 1) > 0 THEN
    result := result || '<prerequisites>' || array_to_string(v.prerequisites, ', ') || '</prerequisites>' || chr(10);
  END IF;

  -- Chapters (from video_chapters table)
  result := result || '<chapters>' || chr(10);
  FOR chapter IN
    SELECT * FROM public.video_chapters WHERE video_id = p_video_id ORDER BY chapter_index
  LOOP
    result := result || '- [' ||
      floor(chapter.start_seconds / 60)::text || ':' ||
      lpad(floor(chapter.start_seconds::integer % 60)::text, 2, '0') ||
      '] ' || chapter.title;
    IF chapter.summary IS NOT NULL THEN
      result := result || ' -- ' || left(chapter.summary, 120);
    END IF;
    result := result || chr(10);
  END LOOP;
  result := result || '</chapters>' || chr(10);

  -- Key concepts mentioned in this video (with pedagogy)
  result := result || '<concepts>' || chr(10);
  FOR mention IN
    SELECT cm.concept_id, c.display_name, cm.mention_type, cm.pedagogical_approach,
           cm.timestamp_seconds, cm.context_snippet
    FROM public.concept_mentions cm
    JOIN public.concepts c ON c.id = cm.concept_id
    WHERE cm.video_id = p_video_id
    ORDER BY cm.timestamp_seconds
  LOOP
    result := result || '- ' || mention.display_name || ' [' || mention.mention_type || ']';
    IF mention.pedagogical_approach IS NOT NULL THEN
      result := result || ' (' || mention.pedagogical_approach || ')';
    END IF;
    IF mention.timestamp_seconds > 0 THEN
      result := result || ' at ' ||
        floor(mention.timestamp_seconds / 60)::text || ':' ||
        lpad(floor(mention.timestamp_seconds::integer % 60)::text, 2, '0');
    END IF;
    result := result || chr(10);
  END LOOP;
  result := result || '</concepts>' || chr(10);

  -- Notable moments (top 10 by importance)
  result := result || '<moments>' || chr(10);
  FOR moment IN
    SELECT moment_type, timestamp_seconds, content
    FROM public.video_moments
    WHERE video_id = p_video_id
    ORDER BY importance DESC
    LIMIT 10
  LOOP
    result := result || '- [' || moment.moment_type || ' at ' ||
      floor(moment.timestamp_seconds / 60)::text || ':' ||
      lpad(floor(moment.timestamp_seconds::integer % 60)::text, 2, '0') ||
      '] ' || left(moment.content, 150) || chr(10);
  END LOOP;
  result := result || '</moments>' || chr(10);

  result := result || '</video_context>';

  -- Update the video_knowledge row with the rendered block
  UPDATE public.video_knowledge
  SET context_block = result,
      context_block_tokens = (length(result) / 4)::integer,
      context_block_version = coalesce(context_block_version, 0) + 1
  WHERE video_id = p_video_id;

  RETURN result;
END;
$$ LANGUAGE plpgsql
SET search_path = '';
