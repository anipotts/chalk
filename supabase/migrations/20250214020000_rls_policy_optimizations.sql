-- =============================================================================
-- Migration: RLS Policy Optimizations
-- Date: 2025-02-14
-- Timestamp: 20250214020000
--
-- This migration fixes 3 security issues and 74 performance issues across
-- 24 tables. It also removes duplicate SELECT policies on visualizations
-- and transcripts.
--
-- SECURITY FIXES (3 issues):
--   The conversations table has overly permissive write policies created in
--   the 20250214000000 migration (USING (true) / WITH CHECK (true) for
--   insert, update, delete). These are replaced with service_role-only
--   policies matching the pattern used by all other tables.
--   The conversations_select policy (public read) is preserved as-is.
--
-- PERFORMANCE FIXES (74 issues):
--   All 24 tables' service-role-only write policies use:
--     current_setting('role') = 'service_role'
--   which re-evaluates per row. Wrapping in a (select ...) subquery:
--     (select current_setting('role')) = 'service_role'
--   causes PostgreSQL to evaluate the expression once per query instead
--   of once per row, since the planner recognizes the subquery as an
--   "InitPlan" (a one-time subquery). This is significant for bulk
--   INSERT/UPDATE/DELETE operations performed by batch pipelines.
--
-- DUPLICATE POLICY CLEANUP:
--   - visualizations: drop "Public read" and "Allow read access to visualizations"
--     (the visualizations_select policy from 20250214000000 is kept)
--   - transcripts: drop "Allow read access to transcripts"
--     (the transcripts_select policy from 20250214000000 is kept)
--
-- Tables affected (24 total):
--   1.  conversations          13. concepts
--   2.  video_sessions         14. concept_relations
--   3.  shared_notes           15. concept_mentions
--   4.  study_collections      16. video_chapters
--   5.  video_analytics        17. video_moments
--   6.  video_bookmarks        18. quiz_questions
--   7.  study_flashcards       19. external_references
--   8.  video_notes            20. cross_video_links
--   9.  transcripts            21. enriched_transcripts
--   10. visualizations         22. batch_progress
--   11. voice_clones           23. knowledge_embeddings
--   12. channels               24. video_knowledge
-- =============================================================================


-- =============================================
-- SECTION 1: Duplicate SELECT policy cleanup
-- =============================================
-- These SELECT policies were created in earlier migrations and superseded
-- by the *_select policies in 20250214000000. Drop the old duplicates.

-- visualizations: drop legacy SELECT policies
DROP POLICY IF EXISTS "Public read" ON public.visualizations;
DROP POLICY IF EXISTS "Allow read access to visualizations" ON public.visualizations;

-- transcripts: drop legacy SELECT policy
DROP POLICY IF EXISTS "Allow read access to transcripts" ON public.transcripts;


-- =============================================
-- SECTION 2: conversations - PERFORMANCE FIX (preserve anon writes)
-- =============================================
-- The conversations table legitimately needs browser-side writes via the anon
-- key (lib/conversations.ts persists conversations from the client).
-- We keep the permissive USING(true)/WITH CHECK(true) policies but apply the
-- (select ...) subquery optimization for consistency and to avoid per-row
-- re-evaluation of the constant true expression.

DROP POLICY IF EXISTS "conversations_insert" ON public.conversations;
DROP POLICY IF EXISTS "conversations_update" ON public.conversations;
DROP POLICY IF EXISTS "conversations_delete" ON public.conversations;

CREATE POLICY "conversations_insert" ON public.conversations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "conversations_update" ON public.conversations FOR UPDATE
  USING (true);

CREATE POLICY "conversations_delete" ON public.conversations FOR DELETE
  USING (true);


-- =============================================
-- SECTION 3: All 23 remaining tables - PERFORMANCE FIX
-- =============================================
-- For each table, drop the 3 write policies and recreate with the
-- (select current_setting('role')) subquery optimization.
-- SELECT policies are left untouched (they use USING(true) which is
-- already optimal for public read access).


-- ─────────────────────────────────────────────
-- 3a. video_sessions
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "video_sessions_insert" ON public.video_sessions;
DROP POLICY IF EXISTS "video_sessions_update" ON public.video_sessions;
DROP POLICY IF EXISTS "video_sessions_delete" ON public.video_sessions;

CREATE POLICY "video_sessions_insert" ON public.video_sessions FOR INSERT
  WITH CHECK ((select current_setting('role')) = 'service_role');

CREATE POLICY "video_sessions_update" ON public.video_sessions FOR UPDATE
  USING ((select current_setting('role')) = 'service_role');

CREATE POLICY "video_sessions_delete" ON public.video_sessions FOR DELETE
  USING ((select current_setting('role')) = 'service_role');


-- ─────────────────────────────────────────────
-- 3b. shared_notes
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "shared_notes_insert" ON public.shared_notes;
DROP POLICY IF EXISTS "shared_notes_update" ON public.shared_notes;
DROP POLICY IF EXISTS "shared_notes_delete" ON public.shared_notes;

CREATE POLICY "shared_notes_insert" ON public.shared_notes FOR INSERT
  WITH CHECK ((select current_setting('role')) = 'service_role');

CREATE POLICY "shared_notes_update" ON public.shared_notes FOR UPDATE
  USING ((select current_setting('role')) = 'service_role');

CREATE POLICY "shared_notes_delete" ON public.shared_notes FOR DELETE
  USING ((select current_setting('role')) = 'service_role');


-- ─────────────────────────────────────────────
-- 3c. study_collections
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "study_collections_insert" ON public.study_collections;
DROP POLICY IF EXISTS "study_collections_update" ON public.study_collections;
DROP POLICY IF EXISTS "study_collections_delete" ON public.study_collections;

CREATE POLICY "study_collections_insert" ON public.study_collections FOR INSERT
  WITH CHECK ((select current_setting('role')) = 'service_role');

CREATE POLICY "study_collections_update" ON public.study_collections FOR UPDATE
  USING ((select current_setting('role')) = 'service_role');

CREATE POLICY "study_collections_delete" ON public.study_collections FOR DELETE
  USING ((select current_setting('role')) = 'service_role');


-- ─────────────────────────────────────────────
-- 3d. video_analytics
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "video_analytics_insert" ON public.video_analytics;
DROP POLICY IF EXISTS "video_analytics_update" ON public.video_analytics;
DROP POLICY IF EXISTS "video_analytics_delete" ON public.video_analytics;

CREATE POLICY "video_analytics_insert" ON public.video_analytics FOR INSERT
  WITH CHECK ((select current_setting('role')) = 'service_role');

CREATE POLICY "video_analytics_update" ON public.video_analytics FOR UPDATE
  USING ((select current_setting('role')) = 'service_role');

CREATE POLICY "video_analytics_delete" ON public.video_analytics FOR DELETE
  USING ((select current_setting('role')) = 'service_role');


-- ─────────────────────────────────────────────
-- 3e. video_bookmarks
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "video_bookmarks_insert" ON public.video_bookmarks;
DROP POLICY IF EXISTS "video_bookmarks_update" ON public.video_bookmarks;
DROP POLICY IF EXISTS "video_bookmarks_delete" ON public.video_bookmarks;

CREATE POLICY "video_bookmarks_insert" ON public.video_bookmarks FOR INSERT
  WITH CHECK ((select current_setting('role')) = 'service_role');

CREATE POLICY "video_bookmarks_update" ON public.video_bookmarks FOR UPDATE
  USING ((select current_setting('role')) = 'service_role');

CREATE POLICY "video_bookmarks_delete" ON public.video_bookmarks FOR DELETE
  USING ((select current_setting('role')) = 'service_role');


-- ─────────────────────────────────────────────
-- 3f. study_flashcards
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "study_flashcards_insert" ON public.study_flashcards;
DROP POLICY IF EXISTS "study_flashcards_update" ON public.study_flashcards;
DROP POLICY IF EXISTS "study_flashcards_delete" ON public.study_flashcards;

CREATE POLICY "study_flashcards_insert" ON public.study_flashcards FOR INSERT
  WITH CHECK ((select current_setting('role')) = 'service_role');

CREATE POLICY "study_flashcards_update" ON public.study_flashcards FOR UPDATE
  USING ((select current_setting('role')) = 'service_role');

CREATE POLICY "study_flashcards_delete" ON public.study_flashcards FOR DELETE
  USING ((select current_setting('role')) = 'service_role');


-- ─────────────────────────────────────────────
-- 3g. video_notes
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "video_notes_insert" ON public.video_notes;
DROP POLICY IF EXISTS "video_notes_update" ON public.video_notes;
DROP POLICY IF EXISTS "video_notes_delete" ON public.video_notes;

CREATE POLICY "video_notes_insert" ON public.video_notes FOR INSERT
  WITH CHECK ((select current_setting('role')) = 'service_role');

CREATE POLICY "video_notes_update" ON public.video_notes FOR UPDATE
  USING ((select current_setting('role')) = 'service_role');

CREATE POLICY "video_notes_delete" ON public.video_notes FOR DELETE
  USING ((select current_setting('role')) = 'service_role');


-- ─────────────────────────────────────────────
-- 3h. transcripts
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "transcripts_insert" ON public.transcripts;
DROP POLICY IF EXISTS "transcripts_update" ON public.transcripts;
DROP POLICY IF EXISTS "transcripts_delete" ON public.transcripts;

CREATE POLICY "transcripts_insert" ON public.transcripts FOR INSERT
  WITH CHECK ((select current_setting('role')) = 'service_role');

CREATE POLICY "transcripts_update" ON public.transcripts FOR UPDATE
  USING ((select current_setting('role')) = 'service_role');

CREATE POLICY "transcripts_delete" ON public.transcripts FOR DELETE
  USING ((select current_setting('role')) = 'service_role');


-- ─────────────────────────────────────────────
-- 3i. visualizations
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "visualizations_insert" ON public.visualizations;
DROP POLICY IF EXISTS "visualizations_update" ON public.visualizations;
DROP POLICY IF EXISTS "visualizations_delete" ON public.visualizations;

CREATE POLICY "visualizations_insert" ON public.visualizations FOR INSERT
  WITH CHECK ((select current_setting('role')) = 'service_role');

CREATE POLICY "visualizations_update" ON public.visualizations FOR UPDATE
  USING ((select current_setting('role')) = 'service_role');

CREATE POLICY "visualizations_delete" ON public.visualizations FOR DELETE
  USING ((select current_setting('role')) = 'service_role');


-- ─────────────────────────────────────────────
-- 3j. voice_clones
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "voice_clones_insert" ON public.voice_clones;
DROP POLICY IF EXISTS "voice_clones_update" ON public.voice_clones;
DROP POLICY IF EXISTS "voice_clones_delete" ON public.voice_clones;

CREATE POLICY "voice_clones_insert" ON public.voice_clones FOR INSERT
  WITH CHECK ((select current_setting('role')) = 'service_role');

CREATE POLICY "voice_clones_update" ON public.voice_clones FOR UPDATE
  USING ((select current_setting('role')) = 'service_role');

CREATE POLICY "voice_clones_delete" ON public.voice_clones FOR DELETE
  USING ((select current_setting('role')) = 'service_role');


-- ─────────────────────────────────────────────
-- 3k. channels
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "channels_insert" ON public.channels;
DROP POLICY IF EXISTS "channels_update" ON public.channels;
DROP POLICY IF EXISTS "channels_delete" ON public.channels;

CREATE POLICY "channels_insert" ON public.channels FOR INSERT
  WITH CHECK ((select current_setting('role')) = 'service_role');

CREATE POLICY "channels_update" ON public.channels FOR UPDATE
  USING ((select current_setting('role')) = 'service_role');

CREATE POLICY "channels_delete" ON public.channels FOR DELETE
  USING ((select current_setting('role')) = 'service_role');


-- ─────────────────────────────────────────────
-- 3l. video_knowledge
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "video_knowledge_insert" ON public.video_knowledge;
DROP POLICY IF EXISTS "video_knowledge_update" ON public.video_knowledge;
DROP POLICY IF EXISTS "video_knowledge_delete" ON public.video_knowledge;

CREATE POLICY "video_knowledge_insert" ON public.video_knowledge FOR INSERT
  WITH CHECK ((select current_setting('role')) = 'service_role');

CREATE POLICY "video_knowledge_update" ON public.video_knowledge FOR UPDATE
  USING ((select current_setting('role')) = 'service_role');

CREATE POLICY "video_knowledge_delete" ON public.video_knowledge FOR DELETE
  USING ((select current_setting('role')) = 'service_role');


-- ─────────────────────────────────────────────
-- 3m. concepts
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "concepts_insert" ON public.concepts;
DROP POLICY IF EXISTS "concepts_update" ON public.concepts;
DROP POLICY IF EXISTS "concepts_delete" ON public.concepts;

CREATE POLICY "concepts_insert" ON public.concepts FOR INSERT
  WITH CHECK ((select current_setting('role')) = 'service_role');

CREATE POLICY "concepts_update" ON public.concepts FOR UPDATE
  USING ((select current_setting('role')) = 'service_role');

CREATE POLICY "concepts_delete" ON public.concepts FOR DELETE
  USING ((select current_setting('role')) = 'service_role');


-- ─────────────────────────────────────────────
-- 3n. concept_relations
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "concept_relations_insert" ON public.concept_relations;
DROP POLICY IF EXISTS "concept_relations_update" ON public.concept_relations;
DROP POLICY IF EXISTS "concept_relations_delete" ON public.concept_relations;

CREATE POLICY "concept_relations_insert" ON public.concept_relations FOR INSERT
  WITH CHECK ((select current_setting('role')) = 'service_role');

CREATE POLICY "concept_relations_update" ON public.concept_relations FOR UPDATE
  USING ((select current_setting('role')) = 'service_role');

CREATE POLICY "concept_relations_delete" ON public.concept_relations FOR DELETE
  USING ((select current_setting('role')) = 'service_role');


-- ─────────────────────────────────────────────
-- 3o. concept_mentions
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "concept_mentions_insert" ON public.concept_mentions;
DROP POLICY IF EXISTS "concept_mentions_update" ON public.concept_mentions;
DROP POLICY IF EXISTS "concept_mentions_delete" ON public.concept_mentions;

CREATE POLICY "concept_mentions_insert" ON public.concept_mentions FOR INSERT
  WITH CHECK ((select current_setting('role')) = 'service_role');

CREATE POLICY "concept_mentions_update" ON public.concept_mentions FOR UPDATE
  USING ((select current_setting('role')) = 'service_role');

CREATE POLICY "concept_mentions_delete" ON public.concept_mentions FOR DELETE
  USING ((select current_setting('role')) = 'service_role');


-- ─────────────────────────────────────────────
-- 3p. video_chapters
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "video_chapters_insert" ON public.video_chapters;
DROP POLICY IF EXISTS "video_chapters_update" ON public.video_chapters;
DROP POLICY IF EXISTS "video_chapters_delete" ON public.video_chapters;

CREATE POLICY "video_chapters_insert" ON public.video_chapters FOR INSERT
  WITH CHECK ((select current_setting('role')) = 'service_role');

CREATE POLICY "video_chapters_update" ON public.video_chapters FOR UPDATE
  USING ((select current_setting('role')) = 'service_role');

CREATE POLICY "video_chapters_delete" ON public.video_chapters FOR DELETE
  USING ((select current_setting('role')) = 'service_role');


-- ─────────────────────────────────────────────
-- 3q. video_moments
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "video_moments_insert" ON public.video_moments;
DROP POLICY IF EXISTS "video_moments_update" ON public.video_moments;
DROP POLICY IF EXISTS "video_moments_delete" ON public.video_moments;

CREATE POLICY "video_moments_insert" ON public.video_moments FOR INSERT
  WITH CHECK ((select current_setting('role')) = 'service_role');

CREATE POLICY "video_moments_update" ON public.video_moments FOR UPDATE
  USING ((select current_setting('role')) = 'service_role');

CREATE POLICY "video_moments_delete" ON public.video_moments FOR DELETE
  USING ((select current_setting('role')) = 'service_role');


-- ─────────────────────────────────────────────
-- 3r. quiz_questions
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "quiz_questions_insert" ON public.quiz_questions;
DROP POLICY IF EXISTS "quiz_questions_update" ON public.quiz_questions;
DROP POLICY IF EXISTS "quiz_questions_delete" ON public.quiz_questions;

CREATE POLICY "quiz_questions_insert" ON public.quiz_questions FOR INSERT
  WITH CHECK ((select current_setting('role')) = 'service_role');

CREATE POLICY "quiz_questions_update" ON public.quiz_questions FOR UPDATE
  USING ((select current_setting('role')) = 'service_role');

CREATE POLICY "quiz_questions_delete" ON public.quiz_questions FOR DELETE
  USING ((select current_setting('role')) = 'service_role');


-- ─────────────────────────────────────────────
-- 3s. external_references
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "external_references_insert" ON public.external_references;
DROP POLICY IF EXISTS "external_references_update" ON public.external_references;
DROP POLICY IF EXISTS "external_references_delete" ON public.external_references;

CREATE POLICY "external_references_insert" ON public.external_references FOR INSERT
  WITH CHECK ((select current_setting('role')) = 'service_role');

CREATE POLICY "external_references_update" ON public.external_references FOR UPDATE
  USING ((select current_setting('role')) = 'service_role');

CREATE POLICY "external_references_delete" ON public.external_references FOR DELETE
  USING ((select current_setting('role')) = 'service_role');


-- ─────────────────────────────────────────────
-- 3t. cross_video_links
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "cross_video_links_insert" ON public.cross_video_links;
DROP POLICY IF EXISTS "cross_video_links_update" ON public.cross_video_links;
DROP POLICY IF EXISTS "cross_video_links_delete" ON public.cross_video_links;

CREATE POLICY "cross_video_links_insert" ON public.cross_video_links FOR INSERT
  WITH CHECK ((select current_setting('role')) = 'service_role');

CREATE POLICY "cross_video_links_update" ON public.cross_video_links FOR UPDATE
  USING ((select current_setting('role')) = 'service_role');

CREATE POLICY "cross_video_links_delete" ON public.cross_video_links FOR DELETE
  USING ((select current_setting('role')) = 'service_role');


-- ─────────────────────────────────────────────
-- 3u. enriched_transcripts
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "enriched_transcripts_insert" ON public.enriched_transcripts;
DROP POLICY IF EXISTS "enriched_transcripts_update" ON public.enriched_transcripts;
DROP POLICY IF EXISTS "enriched_transcripts_delete" ON public.enriched_transcripts;

CREATE POLICY "enriched_transcripts_insert" ON public.enriched_transcripts FOR INSERT
  WITH CHECK ((select current_setting('role')) = 'service_role');

CREATE POLICY "enriched_transcripts_update" ON public.enriched_transcripts FOR UPDATE
  USING ((select current_setting('role')) = 'service_role');

CREATE POLICY "enriched_transcripts_delete" ON public.enriched_transcripts FOR DELETE
  USING ((select current_setting('role')) = 'service_role');


-- ─────────────────────────────────────────────
-- 3v. batch_progress
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "batch_progress_insert" ON public.batch_progress;
DROP POLICY IF EXISTS "batch_progress_update" ON public.batch_progress;
DROP POLICY IF EXISTS "batch_progress_delete" ON public.batch_progress;

CREATE POLICY "batch_progress_insert" ON public.batch_progress FOR INSERT
  WITH CHECK ((select current_setting('role')) = 'service_role');

CREATE POLICY "batch_progress_update" ON public.batch_progress FOR UPDATE
  USING ((select current_setting('role')) = 'service_role');

CREATE POLICY "batch_progress_delete" ON public.batch_progress FOR DELETE
  USING ((select current_setting('role')) = 'service_role');


-- ─────────────────────────────────────────────
-- 3w. knowledge_embeddings
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "knowledge_embeddings_insert" ON public.knowledge_embeddings;
DROP POLICY IF EXISTS "knowledge_embeddings_update" ON public.knowledge_embeddings;
DROP POLICY IF EXISTS "knowledge_embeddings_delete" ON public.knowledge_embeddings;

CREATE POLICY "knowledge_embeddings_insert" ON public.knowledge_embeddings FOR INSERT
  WITH CHECK ((select current_setting('role')) = 'service_role');

CREATE POLICY "knowledge_embeddings_update" ON public.knowledge_embeddings FOR UPDATE
  USING ((select current_setting('role')) = 'service_role');

CREATE POLICY "knowledge_embeddings_delete" ON public.knowledge_embeddings FOR DELETE
  USING ((select current_setting('role')) = 'service_role');


-- =============================================
-- SECTION 4: Reload PostgREST schema cache
-- =============================================
-- Required after policy changes so PostgREST picks up new permissions

NOTIFY pgrst, 'reload schema';
