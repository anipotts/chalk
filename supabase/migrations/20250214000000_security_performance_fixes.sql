-- =============================================================================
-- Migration: Security & Performance Hardening
-- Date: 2025-02-14
-- Fixes: 32 security issues, performance index gaps
--
-- Security changes:
--   1. Enable RLS on voice_clones
--   2. Fix SECURITY DEFINER view (video_embeddings)
--   3. Fix mutable search_path on 4 functions
--   4. Move extensions (pg_trgm, vector) to extensions schema
--   5. Replace all overly-permissive RLS policies with:
--      - Public SELECT for anonymous readers
--      - Service-role-only INSERT/UPDATE/DELETE for server-side writes
--      - Exception: conversations table allows anon writes (client-side persistence)
--
-- Performance changes:
--   6. Add missing indexes based on query pattern analysis
--
-- This migration is designed to be idempotent where possible.
-- =============================================================================

-- =============================================
-- SECTION 1: Enable RLS on voice_clones
-- =============================================
-- voice_clones was created without ALTER TABLE ... ENABLE ROW LEVEL SECURITY

ALTER TABLE IF EXISTS public.voice_clones ENABLE ROW LEVEL SECURITY;


-- =============================================
-- SECTION 2: Fix SECURITY DEFINER view
-- =============================================
-- video_embeddings view defaults to SECURITY DEFINER; recreate as SECURITY INVOKER

CREATE OR REPLACE VIEW public.video_embeddings
WITH (security_invoker = true)
AS
SELECT
  id,
  video_id,
  entity_type AS chunk_type,
  chunk_index,
  start_timestamp,
  end_timestamp,
  content,
  embedding
FROM public.knowledge_embeddings
WHERE entity_type IN ('video_summary', 'transcript_chunk');


-- =============================================
-- SECTION 3: Fix mutable search_path on functions
-- =============================================
-- All 4 functions need SET search_path = '' and explicit schema qualification
-- to prevent search_path injection attacks.

-- 3a. public.nanoid — used for generating short IDs
CREATE OR REPLACE FUNCTION public.nanoid(size int DEFAULT 10)
RETURNS text AS $$
DECLARE
  id text := '';
  i int := 0;
  alphabet text := '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  idLength int := 62;
  bytes bytea;
BEGIN
  bytes := gen_random_bytes(size);
  WHILE i < size LOOP
    id := id || substr(alphabet, (get_byte(bytes, i) % idLength) + 1, 1);
    i := i + 1;
  END LOOP;
  RETURN id;
END
$$ LANGUAGE plpgsql VOLATILE
SET search_path = '';

-- 3b. public.build_context_block — pre-renders XML context for Anthropic prompt caching
CREATE OR REPLACE FUNCTION public.build_context_block(p_video_id text)
RETURNS text AS $$
DECLARE
  v record;
  result text := '';
  chapter record;
  mention record;
  moment record;
  quiz record;
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

-- 3c. public.get_prerequisite_chain — recursive prerequisite DAG traversal
CREATE OR REPLACE FUNCTION public.get_prerequisite_chain(
  p_concept_id text,
  p_max_depth integer DEFAULT 5
)
RETURNS TABLE (
  concept_id text,
  display_name text,
  depth integer,
  relation_path text[]
) AS $$
WITH RECURSIVE chain AS (
  -- Base case: direct prerequisites
  SELECT
    cr.source_id AS concept_id,
    c.display_name,
    1 AS depth,
    ARRAY[p_concept_id, cr.source_id] AS relation_path
  FROM public.concept_relations cr
  JOIN public.concepts c ON c.id = cr.source_id
  WHERE cr.target_id = p_concept_id
    AND cr.relation_type = 'prerequisite'
    AND cr.confidence >= 0.5

  UNION ALL

  -- Recursive case: prerequisites of prerequisites
  SELECT
    cr.source_id,
    c.display_name,
    chain.depth + 1,
    chain.relation_path || cr.source_id
  FROM public.concept_relations cr
  JOIN public.concepts c ON c.id = cr.source_id
  JOIN chain ON chain.concept_id = cr.target_id
  WHERE cr.relation_type = 'prerequisite'
    AND cr.confidence >= 0.5
    AND chain.depth < p_max_depth
    AND NOT cr.source_id = ANY(chain.relation_path)  -- Prevent cycles
)
SELECT DISTINCT ON (chain.concept_id)
  chain.concept_id,
  chain.display_name,
  chain.depth,
  chain.relation_path
FROM chain
ORDER BY chain.concept_id, chain.depth;
$$ LANGUAGE SQL STABLE
SET search_path = '';

-- 3d. public.get_learning_path — BFS shortest path between concepts
CREATE OR REPLACE FUNCTION public.get_learning_path(
  p_from_concept text,
  p_to_concept text,
  p_max_depth integer DEFAULT 8
)
RETURNS TABLE (
  step integer,
  concept_id text,
  display_name text,
  best_video_id text,
  best_video_title text
) AS $$
WITH RECURSIVE path AS (
  -- Start from source
  SELECT
    p_from_concept AS concept_id,
    0 AS step,
    ARRAY[p_from_concept] AS visited
  WHERE EXISTS (SELECT 1 FROM public.concepts WHERE id = p_from_concept)

  UNION ALL

  SELECT
    cr.target_id,
    path.step + 1,
    path.visited || cr.target_id
  FROM public.concept_relations cr
  JOIN path ON path.concept_id = cr.source_id
  WHERE cr.relation_type IN ('prerequisite', 'enables', 'part_of')
    AND cr.confidence >= 0.4
    AND NOT cr.target_id = ANY(path.visited)
    AND path.step < p_max_depth
),
-- Find the shortest path that reaches the target
shortest AS (
  SELECT * FROM path
  WHERE concept_id = p_to_concept
  ORDER BY step
  LIMIT 1
),
-- Expand the path with display names and best videos
path_expanded AS (
  SELECT
    generate_series(0, (SELECT step FROM shortest)) AS step,
    unnest((SELECT visited || p_to_concept FROM shortest)) AS cid
)
SELECT
  pe.step,
  pe.cid AS concept_id,
  c.display_name,
  best_vid.video_id AS best_video_id,
  best_vid.title AS best_video_title
FROM path_expanded pe
JOIN public.concepts c ON c.id = pe.cid
LEFT JOIN LATERAL (
  SELECT cm.video_id, vk.title
  FROM public.concept_mentions cm
  JOIN public.video_knowledge vk ON vk.video_id = cm.video_id
  WHERE cm.concept_id = pe.cid
    AND cm.mention_type IN ('defines', 'explains')
  ORDER BY cm.explanation_quality DESC NULLS LAST, cm.confidence DESC
  LIMIT 1
) best_vid ON true
ORDER BY pe.step;
$$ LANGUAGE SQL STABLE
SET search_path = '';


-- =============================================
-- SECTION 4: Move extensions to extensions schema
-- =============================================
-- Supabase best practice: extensions belong in the `extensions` schema.
-- The config.toml already has extra_search_path = ["public", "extensions"]
-- so operator/function lookups will still resolve.
--
-- IMPORTANT: We cannot simply DROP and CREATE extensions in a different schema
-- because that would destroy all indexes and columns that depend on them.
-- Instead, we use ALTER EXTENSION ... SET SCHEMA which safely moves the
-- extension's objects (operators, functions, types) without rebuilding indexes.
--
-- If the extensions are already in the target schema, these are no-ops.

-- Ensure the extensions schema exists
CREATE SCHEMA IF NOT EXISTS extensions;

-- Grant usage so PostgREST and application roles can use extension operators
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

-- Move pg_trgm to extensions schema (safe — moves operators + functions)
DO $$
BEGIN
  -- Only move if currently in public schema
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_trgm' AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not move pg_trgm to extensions schema: %', SQLERRM;
END $$;

-- Move vector to extensions schema (safe — moves operators + functions + types)
DO $$
BEGIN
  -- Only move if currently in public schema
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'vector' AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION vector SET SCHEMA extensions;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not move vector to extensions schema: %', SQLERRM;
END $$;


-- =============================================
-- SECTION 5: Replace overly-permissive RLS policies
-- =============================================
-- Strategy: For a public learning tool with NO user authentication:
--   - anon/authenticated can SELECT (read freely)
--   - Only service_role can INSERT/UPDATE/DELETE (server-side API routes)
-- This prevents direct manipulation from the client while keeping reads open.
--
-- We drop all existing permissive policies first, then create the new ones.
-- Using DO blocks for idempotency (skip if policy doesn't exist).

-- ─────────────────────────────────────────────
-- Helper: Drop policy if it exists
-- (Postgres doesn't have DROP POLICY IF EXISTS before v15;
--  Supabase uses v15+/v17, but we wrap in DO blocks for safety)
-- ─────────────────────────────────────────────

-- ========================
-- 5a. conversations
-- ========================
-- NOTE: conversations is written from the browser client using the anon key
-- (lib/conversations.ts). Until this is refactored to use a server-side API
-- route, anon must be allowed to write. This is acceptable because
-- conversations contain no sensitive data and have no auth context.
DROP POLICY IF EXISTS "Allow all access to conversations" ON public.conversations;

CREATE POLICY "conversations_select"
  ON public.conversations FOR SELECT
  USING (true);

CREATE POLICY "conversations_insert"
  ON public.conversations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "conversations_update"
  ON public.conversations FOR UPDATE
  USING (true);

CREATE POLICY "conversations_delete"
  ON public.conversations FOR DELETE
  USING (true);

-- ========================
-- 5b. video_sessions
-- ========================
DROP POLICY IF EXISTS "Allow all access to video_sessions" ON public.video_sessions;

CREATE POLICY "video_sessions_select"
  ON public.video_sessions FOR SELECT
  USING (true);

CREATE POLICY "video_sessions_insert"
  ON public.video_sessions FOR INSERT
  WITH CHECK ((current_setting('role') = 'service_role'));

CREATE POLICY "video_sessions_update"
  ON public.video_sessions FOR UPDATE
  USING ((current_setting('role') = 'service_role'));

CREATE POLICY "video_sessions_delete"
  ON public.video_sessions FOR DELETE
  USING ((current_setting('role') = 'service_role'));

-- ========================
-- 5c. shared_notes
-- ========================
DROP POLICY IF EXISTS "Allow all access to shared_notes" ON public.shared_notes;

CREATE POLICY "shared_notes_select"
  ON public.shared_notes FOR SELECT
  USING (true);

CREATE POLICY "shared_notes_insert"
  ON public.shared_notes FOR INSERT
  WITH CHECK ((current_setting('role') = 'service_role'));

CREATE POLICY "shared_notes_update"
  ON public.shared_notes FOR UPDATE
  USING ((current_setting('role') = 'service_role'));

CREATE POLICY "shared_notes_delete"
  ON public.shared_notes FOR DELETE
  USING ((current_setting('role') = 'service_role'));

-- ========================
-- 5d. study_collections
-- ========================
DROP POLICY IF EXISTS "Allow all access to study_collections" ON public.study_collections;

CREATE POLICY "study_collections_select"
  ON public.study_collections FOR SELECT
  USING (true);

CREATE POLICY "study_collections_insert"
  ON public.study_collections FOR INSERT
  WITH CHECK ((current_setting('role') = 'service_role'));

CREATE POLICY "study_collections_update"
  ON public.study_collections FOR UPDATE
  USING ((current_setting('role') = 'service_role'));

CREATE POLICY "study_collections_delete"
  ON public.study_collections FOR DELETE
  USING ((current_setting('role') = 'service_role'));

-- ========================
-- 5e. video_analytics
-- ========================
DROP POLICY IF EXISTS "Allow all access to video_analytics" ON public.video_analytics;

CREATE POLICY "video_analytics_select"
  ON public.video_analytics FOR SELECT
  USING (true);

CREATE POLICY "video_analytics_insert"
  ON public.video_analytics FOR INSERT
  WITH CHECK ((current_setting('role') = 'service_role'));

CREATE POLICY "video_analytics_update"
  ON public.video_analytics FOR UPDATE
  USING ((current_setting('role') = 'service_role'));

CREATE POLICY "video_analytics_delete"
  ON public.video_analytics FOR DELETE
  USING ((current_setting('role') = 'service_role'));

-- ========================
-- 5f. video_bookmarks
-- ========================
DROP POLICY IF EXISTS "Allow all access to video_bookmarks" ON public.video_bookmarks;

CREATE POLICY "video_bookmarks_select"
  ON public.video_bookmarks FOR SELECT
  USING (true);

CREATE POLICY "video_bookmarks_insert"
  ON public.video_bookmarks FOR INSERT
  WITH CHECK ((current_setting('role') = 'service_role'));

CREATE POLICY "video_bookmarks_update"
  ON public.video_bookmarks FOR UPDATE
  USING ((current_setting('role') = 'service_role'));

CREATE POLICY "video_bookmarks_delete"
  ON public.video_bookmarks FOR DELETE
  USING ((current_setting('role') = 'service_role'));

-- ========================
-- 5g. study_flashcards
-- ========================
DROP POLICY IF EXISTS "Allow all access to study_flashcards" ON public.study_flashcards;

CREATE POLICY "study_flashcards_select"
  ON public.study_flashcards FOR SELECT
  USING (true);

CREATE POLICY "study_flashcards_insert"
  ON public.study_flashcards FOR INSERT
  WITH CHECK ((current_setting('role') = 'service_role'));

CREATE POLICY "study_flashcards_update"
  ON public.study_flashcards FOR UPDATE
  USING ((current_setting('role') = 'service_role'));

CREATE POLICY "study_flashcards_delete"
  ON public.study_flashcards FOR DELETE
  USING ((current_setting('role') = 'service_role'));

-- ========================
-- 5h. video_notes
-- ========================
DROP POLICY IF EXISTS "Allow all access to video_notes" ON public.video_notes;

CREATE POLICY "video_notes_select"
  ON public.video_notes FOR SELECT
  USING (true);

CREATE POLICY "video_notes_insert"
  ON public.video_notes FOR INSERT
  WITH CHECK ((current_setting('role') = 'service_role'));

CREATE POLICY "video_notes_update"
  ON public.video_notes FOR UPDATE
  USING ((current_setting('role') = 'service_role'));

CREATE POLICY "video_notes_delete"
  ON public.video_notes FOR DELETE
  USING ((current_setting('role') = 'service_role'));

-- ========================
-- 5i. transcripts (had SELECT-only + a later "write_transcripts" ALL policy)
-- ========================
DROP POLICY IF EXISTS "Allow read access to transcripts" ON public.transcripts;
DROP POLICY IF EXISTS "write_transcripts" ON public.transcripts;

CREATE POLICY "transcripts_select"
  ON public.transcripts FOR SELECT
  USING (true);

CREATE POLICY "transcripts_insert"
  ON public.transcripts FOR INSERT
  WITH CHECK ((current_setting('role') = 'service_role'));

CREATE POLICY "transcripts_update"
  ON public.transcripts FOR UPDATE
  USING ((current_setting('role') = 'service_role'));

CREATE POLICY "transcripts_delete"
  ON public.transcripts FOR DELETE
  USING ((current_setting('role') = 'service_role'));

-- ========================
-- 5j. visualizations (had SELECT-only + "write_visualizations" ALL + "Insert via API" INSERT)
-- ========================
DROP POLICY IF EXISTS "Allow read access to visualizations" ON public.visualizations;
DROP POLICY IF EXISTS "write_visualizations" ON public.visualizations;
DROP POLICY IF EXISTS "Insert via API" ON public.visualizations;

CREATE POLICY "visualizations_select"
  ON public.visualizations FOR SELECT
  USING (true);

CREATE POLICY "visualizations_insert"
  ON public.visualizations FOR INSERT
  WITH CHECK ((current_setting('role') = 'service_role'));

CREATE POLICY "visualizations_update"
  ON public.visualizations FOR UPDATE
  USING ((current_setting('role') = 'service_role'));

CREATE POLICY "visualizations_delete"
  ON public.visualizations FOR DELETE
  USING ((current_setting('role') = 'service_role'));

-- ========================
-- 5k. voice_clones (had NO RLS until Section 1 above; now add policies)
-- ========================
-- No existing policies to drop since RLS was just enabled above

CREATE POLICY "voice_clones_select"
  ON public.voice_clones FOR SELECT
  USING (true);

CREATE POLICY "voice_clones_insert"
  ON public.voice_clones FOR INSERT
  WITH CHECK ((current_setting('role') = 'service_role'));

CREATE POLICY "voice_clones_update"
  ON public.voice_clones FOR UPDATE
  USING ((current_setting('role') = 'service_role'));

CREATE POLICY "voice_clones_delete"
  ON public.voice_clones FOR DELETE
  USING ((current_setting('role') = 'service_role'));

-- ========================
-- 5l. channels
-- ========================
DROP POLICY IF EXISTS "read_ch" ON public.channels;
DROP POLICY IF EXISTS "write_ch" ON public.channels;

CREATE POLICY "channels_select"
  ON public.channels FOR SELECT
  USING (true);

CREATE POLICY "channels_insert"
  ON public.channels FOR INSERT
  WITH CHECK ((current_setting('role') = 'service_role'));

CREATE POLICY "channels_update"
  ON public.channels FOR UPDATE
  USING ((current_setting('role') = 'service_role'));

CREATE POLICY "channels_delete"
  ON public.channels FOR DELETE
  USING ((current_setting('role') = 'service_role'));

-- ========================
-- 5m. video_knowledge
-- ========================
DROP POLICY IF EXISTS "read_vk" ON public.video_knowledge;
DROP POLICY IF EXISTS "write_vk" ON public.video_knowledge;

CREATE POLICY "video_knowledge_select"
  ON public.video_knowledge FOR SELECT
  USING (true);

CREATE POLICY "video_knowledge_insert"
  ON public.video_knowledge FOR INSERT
  WITH CHECK ((current_setting('role') = 'service_role'));

CREATE POLICY "video_knowledge_update"
  ON public.video_knowledge FOR UPDATE
  USING ((current_setting('role') = 'service_role'));

CREATE POLICY "video_knowledge_delete"
  ON public.video_knowledge FOR DELETE
  USING ((current_setting('role') = 'service_role'));

-- ========================
-- 5n. concepts
-- ========================
DROP POLICY IF EXISTS "read_concepts" ON public.concepts;
DROP POLICY IF EXISTS "write_concepts" ON public.concepts;

CREATE POLICY "concepts_select"
  ON public.concepts FOR SELECT
  USING (true);

CREATE POLICY "concepts_insert"
  ON public.concepts FOR INSERT
  WITH CHECK ((current_setting('role') = 'service_role'));

CREATE POLICY "concepts_update"
  ON public.concepts FOR UPDATE
  USING ((current_setting('role') = 'service_role'));

CREATE POLICY "concepts_delete"
  ON public.concepts FOR DELETE
  USING ((current_setting('role') = 'service_role'));

-- ========================
-- 5o. concept_relations
-- ========================
DROP POLICY IF EXISTS "read_cr" ON public.concept_relations;
DROP POLICY IF EXISTS "write_cr" ON public.concept_relations;

CREATE POLICY "concept_relations_select"
  ON public.concept_relations FOR SELECT
  USING (true);

CREATE POLICY "concept_relations_insert"
  ON public.concept_relations FOR INSERT
  WITH CHECK ((current_setting('role') = 'service_role'));

CREATE POLICY "concept_relations_update"
  ON public.concept_relations FOR UPDATE
  USING ((current_setting('role') = 'service_role'));

CREATE POLICY "concept_relations_delete"
  ON public.concept_relations FOR DELETE
  USING ((current_setting('role') = 'service_role'));

-- ========================
-- 5p. concept_mentions
-- ========================
DROP POLICY IF EXISTS "read_cm" ON public.concept_mentions;
DROP POLICY IF EXISTS "write_cm" ON public.concept_mentions;

CREATE POLICY "concept_mentions_select"
  ON public.concept_mentions FOR SELECT
  USING (true);

CREATE POLICY "concept_mentions_insert"
  ON public.concept_mentions FOR INSERT
  WITH CHECK ((current_setting('role') = 'service_role'));

CREATE POLICY "concept_mentions_update"
  ON public.concept_mentions FOR UPDATE
  USING ((current_setting('role') = 'service_role'));

CREATE POLICY "concept_mentions_delete"
  ON public.concept_mentions FOR DELETE
  USING ((current_setting('role') = 'service_role'));

-- ========================
-- 5q. video_chapters
-- ========================
DROP POLICY IF EXISTS "read_vc" ON public.video_chapters;
DROP POLICY IF EXISTS "write_vc" ON public.video_chapters;

CREATE POLICY "video_chapters_select"
  ON public.video_chapters FOR SELECT
  USING (true);

CREATE POLICY "video_chapters_insert"
  ON public.video_chapters FOR INSERT
  WITH CHECK ((current_setting('role') = 'service_role'));

CREATE POLICY "video_chapters_update"
  ON public.video_chapters FOR UPDATE
  USING ((current_setting('role') = 'service_role'));

CREATE POLICY "video_chapters_delete"
  ON public.video_chapters FOR DELETE
  USING ((current_setting('role') = 'service_role'));

-- ========================
-- 5r. video_moments
-- ========================
DROP POLICY IF EXISTS "read_vm" ON public.video_moments;
DROP POLICY IF EXISTS "write_vm" ON public.video_moments;

CREATE POLICY "video_moments_select"
  ON public.video_moments FOR SELECT
  USING (true);

CREATE POLICY "video_moments_insert"
  ON public.video_moments FOR INSERT
  WITH CHECK ((current_setting('role') = 'service_role'));

CREATE POLICY "video_moments_update"
  ON public.video_moments FOR UPDATE
  USING ((current_setting('role') = 'service_role'));

CREATE POLICY "video_moments_delete"
  ON public.video_moments FOR DELETE
  USING ((current_setting('role') = 'service_role'));

-- ========================
-- 5s. quiz_questions
-- ========================
DROP POLICY IF EXISTS "read_qq" ON public.quiz_questions;
DROP POLICY IF EXISTS "write_qq" ON public.quiz_questions;

CREATE POLICY "quiz_questions_select"
  ON public.quiz_questions FOR SELECT
  USING (true);

CREATE POLICY "quiz_questions_insert"
  ON public.quiz_questions FOR INSERT
  WITH CHECK ((current_setting('role') = 'service_role'));

CREATE POLICY "quiz_questions_update"
  ON public.quiz_questions FOR UPDATE
  USING ((current_setting('role') = 'service_role'));

CREATE POLICY "quiz_questions_delete"
  ON public.quiz_questions FOR DELETE
  USING ((current_setting('role') = 'service_role'));

-- ========================
-- 5t. external_references
-- ========================
DROP POLICY IF EXISTS "read_er" ON public.external_references;
DROP POLICY IF EXISTS "write_er" ON public.external_references;

CREATE POLICY "external_references_select"
  ON public.external_references FOR SELECT
  USING (true);

CREATE POLICY "external_references_insert"
  ON public.external_references FOR INSERT
  WITH CHECK ((current_setting('role') = 'service_role'));

CREATE POLICY "external_references_update"
  ON public.external_references FOR UPDATE
  USING ((current_setting('role') = 'service_role'));

CREATE POLICY "external_references_delete"
  ON public.external_references FOR DELETE
  USING ((current_setting('role') = 'service_role'));

-- ========================
-- 5u. cross_video_links
-- ========================
DROP POLICY IF EXISTS "read_cvl" ON public.cross_video_links;
DROP POLICY IF EXISTS "write_cvl" ON public.cross_video_links;

CREATE POLICY "cross_video_links_select"
  ON public.cross_video_links FOR SELECT
  USING (true);

CREATE POLICY "cross_video_links_insert"
  ON public.cross_video_links FOR INSERT
  WITH CHECK ((current_setting('role') = 'service_role'));

CREATE POLICY "cross_video_links_update"
  ON public.cross_video_links FOR UPDATE
  USING ((current_setting('role') = 'service_role'));

CREATE POLICY "cross_video_links_delete"
  ON public.cross_video_links FOR DELETE
  USING ((current_setting('role') = 'service_role'));

-- ========================
-- 5v. enriched_transcripts
-- ========================
DROP POLICY IF EXISTS "read_et" ON public.enriched_transcripts;
DROP POLICY IF EXISTS "write_et" ON public.enriched_transcripts;

CREATE POLICY "enriched_transcripts_select"
  ON public.enriched_transcripts FOR SELECT
  USING (true);

CREATE POLICY "enriched_transcripts_insert"
  ON public.enriched_transcripts FOR INSERT
  WITH CHECK ((current_setting('role') = 'service_role'));

CREATE POLICY "enriched_transcripts_update"
  ON public.enriched_transcripts FOR UPDATE
  USING ((current_setting('role') = 'service_role'));

CREATE POLICY "enriched_transcripts_delete"
  ON public.enriched_transcripts FOR DELETE
  USING ((current_setting('role') = 'service_role'));

-- ========================
-- 5w. batch_progress
-- ========================
DROP POLICY IF EXISTS "read_bp" ON public.batch_progress;
DROP POLICY IF EXISTS "write_bp" ON public.batch_progress;

CREATE POLICY "batch_progress_select"
  ON public.batch_progress FOR SELECT
  USING (true);

CREATE POLICY "batch_progress_insert"
  ON public.batch_progress FOR INSERT
  WITH CHECK ((current_setting('role') = 'service_role'));

CREATE POLICY "batch_progress_update"
  ON public.batch_progress FOR UPDATE
  USING ((current_setting('role') = 'service_role'));

CREATE POLICY "batch_progress_delete"
  ON public.batch_progress FOR DELETE
  USING ((current_setting('role') = 'service_role'));

-- ========================
-- 5x. knowledge_embeddings
-- ========================
DROP POLICY IF EXISTS "read_ke" ON public.knowledge_embeddings;
DROP POLICY IF EXISTS "write_ke" ON public.knowledge_embeddings;

CREATE POLICY "knowledge_embeddings_select"
  ON public.knowledge_embeddings FOR SELECT
  USING (true);

CREATE POLICY "knowledge_embeddings_insert"
  ON public.knowledge_embeddings FOR INSERT
  WITH CHECK ((current_setting('role') = 'service_role'));

CREATE POLICY "knowledge_embeddings_update"
  ON public.knowledge_embeddings FOR UPDATE
  USING ((current_setting('role') = 'service_role'));

CREATE POLICY "knowledge_embeddings_delete"
  ON public.knowledge_embeddings FOR DELETE
  USING ((current_setting('role') = 'service_role'));


-- =============================================
-- SECTION 6: Performance — Missing Indexes
-- =============================================
-- Analysis based on query patterns in:
--   - app/api/knowledge-context/route.ts
--   - lib/tools/video-tools.ts
--   - lib/transcript-cache.ts
--   - lib/conversations.ts
--   - scripts/extract-knowledge.ts
--   - scripts/extract-batch.ts
--   - app/api/voice-clone/route.ts

-- 6a. concept_mentions: queries filter by (concept_id, video_id) together;
-- the existing single-column indexes are suboptimal for the IN + neq pattern.
-- Also filtered by mention_type + ordered by explanation_quality.
CREATE INDEX IF NOT EXISTS idx_cm_concept_video
  ON public.concept_mentions(concept_id, video_id);

CREATE INDEX IF NOT EXISTS idx_cm_mention_type_quality
  ON public.concept_mentions(concept_id, mention_type, explanation_quality DESC NULLS LAST);

-- 6b. cross_video_links: queried by source_video_id + ordered by confidence DESC
CREATE INDEX IF NOT EXISTS idx_cvl_source_confidence
  ON public.cross_video_links(source_video_id, confidence DESC);

-- 6c. video_moments: queried by video_id + timestamp range + ordered by importance
CREATE INDEX IF NOT EXISTS idx_vm_video_timestamp
  ON public.video_moments(video_id, timestamp_seconds);

CREATE INDEX IF NOT EXISTS idx_vm_video_importance
  ON public.video_moments(video_id, importance DESC);

-- 6d. video_chapters: queried by video_id + start_seconds for range lookups
CREATE INDEX IF NOT EXISTS idx_vc_video_start
  ON public.video_chapters(video_id, start_seconds);

-- 6e. quiz_questions: queried by video_id + difficulty + bloom_level + concept_id
CREATE INDEX IF NOT EXISTS idx_qq_video_difficulty
  ON public.quiz_questions(video_id, difficulty);

CREATE INDEX IF NOT EXISTS idx_qq_video_bloom
  ON public.quiz_questions(video_id, bloom_level);

-- 6f. batch_progress: queried by status for batch processing
CREATE INDEX IF NOT EXISTS idx_bp_status
  ON public.batch_progress(status);

-- 6g. voice_clones: queried by channel_name (already has partial unique index)
-- and video_id (already has unique index). No additional needed.

-- 6h. concepts: queried by id with IN clause (PK covers it).
-- Also ilike on display_name (trigram index already exists).
-- Add domain index for filtering by domain.
CREATE INDEX IF NOT EXISTS idx_concepts_domain
  ON public.concepts USING GIN(domain);

-- 6i. knowledge_embeddings: already has (entity_type, entity_id) and video_id.
-- The ivfflat index on embedding is already present. No additional needed.

-- 6j. video_knowledge: text search on title for ilike queries
-- After Section 4 moved pg_trgm to extensions schema, operator class must be qualified
CREATE INDEX IF NOT EXISTS idx_vk_title_trgm
  ON public.video_knowledge USING gin(title extensions.gin_trgm_ops);

-- 6k. transcripts: primary key on video_id covers the upsert.
-- The expires_at index already exists for TTL cleanup. No additional needed.

-- 6l. conversations: primary key + updated_at index already exist. No additional needed.


-- =============================================
-- SECTION 7: Reload PostgREST schema cache
-- =============================================
-- Required after policy changes so PostgREST picks up new permissions
NOTIFY pgrst, 'reload schema';
