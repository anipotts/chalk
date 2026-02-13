-- Knowledge graph v2: Concept-first design with pre-rendered context blocks
-- Inspired by MOOCCubeX, ACE, KnowEdu ontologies
-- Backward-compatible with v1 runtime queries (no column renames)

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- Layer 0: Channels metadata
-- ============================================================
CREATE TABLE IF NOT EXISTS channels (
  channel_id text PRIMARY KEY,
  channel_name text NOT NULL,
  handle text,
  subscriber_count text,
  total_video_count text,
  avatar_url text,
  banner_url text,
  description text,
  category text,
  pedagogical_style text[],              -- v2: ["lecture", "tutorial", "visual_proof"]
  tier integer NOT NULL,
  is_verified boolean DEFAULT false,
  discovered_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_ch" ON channels FOR SELECT USING (true);
CREATE POLICY "write_ch" ON channels FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Layer 1: Video Knowledge (anchor table — created early for FK refs)
-- ============================================================
CREATE TABLE IF NOT EXISTS video_knowledge (
  video_id text PRIMARY KEY,
  channel_id text REFERENCES channels(channel_id),
  title text NOT NULL DEFAULT '',
  duration_seconds integer,

  -- Video-level metadata (simple scalars)
  summary text,
  topics text[] NOT NULL DEFAULT '{}',
  topic_hierarchy text[] DEFAULT '{}',
  target_audience text,
  content_type text,
  difficulty text CHECK (difficulty IN ('introductory', 'intermediate', 'advanced')),
  prerequisites text[] DEFAULT '{}',
  learning_objectives text[] DEFAULT '{}',
  teaching_approach text[] DEFAULT '{}',
  transcript_quality jsonb DEFAULT '{}',

  -- Structured extractions (JSONB — kept for raw storage + backward compat)
  -- v2: These are also promoted to first-class tables below
  chapter_summaries jsonb NOT NULL DEFAULT '[]',
  timestamped_concepts jsonb NOT NULL DEFAULT '[]',
  notable_quotes jsonb DEFAULT '[]',
  questions_in_video jsonb DEFAULT '[]',
  analogies jsonb DEFAULT '[]',
  misconceptions_addressed jsonb DEFAULT '[]',
  real_world_applications jsonb DEFAULT '[]',
  aha_moments jsonb DEFAULT '[]',
  timeline_events jsonb DEFAULT '[]',
  suggested_questions jsonb DEFAULT '[]',
  quiz_seeds jsonb DEFAULT '[]',
  key_moments jsonb DEFAULT '[]',

  -- Safety net: raw response for future re-parsing
  raw_extraction jsonb,
  extraction_prompt_hash text,

  -- Cost tracking
  extraction_model text DEFAULT 'claude-sonnet-4-5',
  extraction_tokens_input integer,
  extraction_tokens_output integer,
  extraction_cost_cents real,
  extraction_version integer DEFAULT 1,

  -- Computed
  transcript_word_count integer,
  transcript_hash text,
  view_count integer,
  upload_date text,
  thumbnail_url text,

  -- v2: Pre-rendered XML context block for Anthropic prompt caching
  -- Built by build_context_block() function, ~1500-3000 tokens
  context_block text,
  context_block_tokens integer,
  context_block_version integer DEFAULT 0,

  extracted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vk_channel ON video_knowledge(channel_id);
CREATE INDEX IF NOT EXISTS idx_vk_topics ON video_knowledge USING GIN(topics);

ALTER TABLE video_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_vk" ON video_knowledge FOR SELECT USING (true);
CREATE POLICY "write_vk" ON video_knowledge FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Layer 2: Canonical Concepts (first-class knowledge entities)
-- ============================================================
CREATE TABLE IF NOT EXISTS concepts (
  id text PRIMARY KEY,                    -- canonical_name ("attention_mechanism")
  display_name text NOT NULL,             -- "Attention Mechanism"
  definition text,                        -- Best definition across all videos
  aliases text[] DEFAULT '{}',            -- ["self-attention", "scaled dot-product attention"]
  domain text[],                          -- ["machine_learning", "deep_learning"]

  -- v2: Enhanced metadata for graph traversal + search
  category text,                          -- "algorithm", "theorem", "data_structure", "concept", "technique"
  difficulty_level text CHECK (difficulty_level IN ('foundational', 'intermediate', 'advanced', 'expert')),
  prerequisite_count integer DEFAULT 0,   -- Denormalized: count of incoming prerequisite edges
  video_count integer DEFAULT 0,          -- Denormalized: count of videos mentioning this concept

  -- v2: Embedding for semantic dedup + similarity
  embedding vector(1024),

  wikidata_qid text,                      -- Q-identifier for external linking
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_concepts_display_trgm ON concepts USING gin(display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_concepts_category ON concepts(category);
CREATE INDEX IF NOT EXISTS idx_concepts_embedding ON concepts USING ivfflat (embedding vector_cosine_ops);

ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_concepts" ON concepts FOR SELECT USING (true);
CREATE POLICY "write_concepts" ON concepts FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Layer 3: Concept Relations (prerequisite DAG + typed edges)
-- ============================================================
CREATE TABLE IF NOT EXISTS concept_relations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id text NOT NULL REFERENCES concepts(id),
  target_id text NOT NULL REFERENCES concepts(id),
  relation_type text NOT NULL CHECK (relation_type IN (
    'prerequisite', 'part_of', 'enables', 'contrasts',
    'specializes', 'generalizes', 'applied_in', 'co_occurs'
  )),
  confidence real DEFAULT 0.8,
  strength real DEFAULT 0.5,              -- v2: How strong is this relationship (0-1)
  evidence_count integer DEFAULT 1,       -- v2: How many videos support this edge
  source_video_id text REFERENCES video_knowledge(video_id),
  UNIQUE(source_id, target_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_cr_source ON concept_relations(source_id);
CREATE INDEX IF NOT EXISTS idx_cr_target ON concept_relations(target_id);
CREATE INDEX IF NOT EXISTS idx_cr_type ON concept_relations(relation_type);

ALTER TABLE concept_relations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_cr" ON concept_relations FOR SELECT USING (true);
CREATE POLICY "write_cr" ON concept_relations FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Layer 4: Video-Concept Mentions (typed edges with pedagogy)
-- ============================================================
CREATE TABLE IF NOT EXISTS concept_mentions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  concept_id text NOT NULL REFERENCES concepts(id),
  video_id text NOT NULL REFERENCES video_knowledge(video_id) ON DELETE CASCADE,
  mention_type text NOT NULL CHECK (mention_type IN (
    'defines', 'explains', 'uses', 'references', 'assumes', 'introduces', 'compares'
  )),
  timestamp_seconds real NOT NULL DEFAULT 0,
  context_snippet text NOT NULL DEFAULT '',
  confidence real DEFAULT 1.0,

  -- v2: How does the video teach this concept?
  pedagogical_approach text CHECK (pedagogical_approach IN (
    'visual_geometric', 'algebraic_symbolic', 'intuitive_analogy',
    'formal_proof', 'code_implementation', 'worked_example',
    'historical_narrative', 'comparative', 'socratic'
  )),
  explanation_quality real,               -- 0-1 score (populated by batch normalization)

  UNIQUE(concept_id, video_id, mention_type)
);

CREATE INDEX IF NOT EXISTS idx_cm_concept ON concept_mentions(concept_id);
CREATE INDEX IF NOT EXISTS idx_cm_video ON concept_mentions(video_id);

ALTER TABLE concept_mentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_cm" ON concept_mentions FOR SELECT USING (true);
CREATE POLICY "write_cm" ON concept_mentions FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Layer 5: Video Chapters (promoted from JSONB)
-- ============================================================
CREATE TABLE IF NOT EXISTS video_chapters (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id text NOT NULL REFERENCES video_knowledge(video_id) ON DELETE CASCADE,
  chapter_index integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  start_seconds real NOT NULL DEFAULT 0,
  end_seconds real,
  summary text,
  concepts text[] DEFAULT '{}',           -- Concept IDs covered in this chapter
  UNIQUE(video_id, chapter_index)
);

CREATE INDEX IF NOT EXISTS idx_vc_video ON video_chapters(video_id);

ALTER TABLE video_chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_vc" ON video_chapters FOR SELECT USING (true);
CREATE POLICY "write_vc" ON video_chapters FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Layer 6: Video Moments (unified table for all moment types)
-- 12 types: quote, analogy, aha_moment, misconception, application,
--           question, insight, definition, example, proof, joke, callout
-- ============================================================
CREATE TABLE IF NOT EXISTS video_moments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id text NOT NULL REFERENCES video_knowledge(video_id) ON DELETE CASCADE,
  moment_type text NOT NULL CHECK (moment_type IN (
    'quote', 'analogy', 'aha_moment', 'misconception', 'application',
    'question', 'insight', 'definition', 'example', 'proof', 'joke', 'callout'
  )),
  timestamp_seconds real NOT NULL DEFAULT 0,
  content text NOT NULL,                  -- The actual text/quote/analogy
  context text,                           -- Surrounding context
  concept_ids text[] DEFAULT '{}',        -- Related concept IDs
  importance real DEFAULT 0.5,            -- 0-1 ranking for surfacing
  metadata jsonb DEFAULT '{}'             -- Type-specific data (e.g., analogy has source_domain/target_domain)
);

CREATE INDEX IF NOT EXISTS idx_vm_video ON video_moments(video_id);
CREATE INDEX IF NOT EXISTS idx_vm_type ON video_moments(moment_type);
CREATE INDEX IF NOT EXISTS idx_vm_concepts ON video_moments USING GIN(concept_ids);

ALTER TABLE video_moments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_vm" ON video_moments FOR SELECT USING (true);
CREATE POLICY "write_vm" ON video_moments FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Layer 7: Quiz Questions (promoted from quiz_seeds JSONB)
-- ============================================================
CREATE TABLE IF NOT EXISTS quiz_questions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id text NOT NULL REFERENCES video_knowledge(video_id) ON DELETE CASCADE,
  concept_id text REFERENCES concepts(id),
  question_type text NOT NULL CHECK (question_type IN (
    'multiple_choice', 'true_false', 'fill_blank', 'explain', 'apply'
  )),
  question text NOT NULL,
  correct_answer text NOT NULL,
  distractors text[] DEFAULT '{}',        -- Wrong answers for MC
  explanation text,                       -- Why the answer is correct
  difficulty text CHECK (difficulty IN ('easy', 'medium', 'hard')),
  timestamp_seconds real,                 -- Video moment this tests
  bloom_level text CHECK (bloom_level IN (
    'remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'
  ))
);

CREATE INDEX IF NOT EXISTS idx_qq_video ON quiz_questions(video_id);
CREATE INDEX IF NOT EXISTS idx_qq_concept ON quiz_questions(concept_id);

ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_qq" ON quiz_questions FOR SELECT USING (true);
CREATE POLICY "write_qq" ON quiz_questions FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Layer 8: External References (kept from v1)
-- ============================================================
CREATE TABLE IF NOT EXISTS external_references (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id text NOT NULL REFERENCES video_knowledge(video_id) ON DELETE CASCADE,
  name text NOT NULL,
  ref_type text NOT NULL CHECK (ref_type IN (
    'paper', 'book', 'website', 'tool', 'course', 'video'
  )),
  timestamp_seconds real,
  description text,
  url text,
  UNIQUE(video_id, name, ref_type)
);

CREATE INDEX IF NOT EXISTS idx_er_video ON external_references(video_id);

ALTER TABLE external_references ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_er" ON external_references FOR SELECT USING (true);
CREATE POLICY "write_er" ON external_references FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Layer 9: Cross-video links (kept from v1)
-- ============================================================
CREATE TABLE IF NOT EXISTS cross_video_links (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_video_id text NOT NULL REFERENCES video_knowledge(video_id) ON DELETE CASCADE,
  target_video_id text NOT NULL REFERENCES video_knowledge(video_id) ON DELETE CASCADE,
  relationship text NOT NULL CHECK (relationship IN (
    'prerequisite', 'follow_up', 'related', 'deeper_dive',
    'alternative_explanation', 'builds_on', 'contrasts'
  )),
  shared_concepts text[] DEFAULT '{}',
  reason text,
  confidence real DEFAULT 0.5,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_video_id, target_video_id, relationship)
);

CREATE INDEX IF NOT EXISTS idx_cvl_source ON cross_video_links(source_video_id);
CREATE INDEX IF NOT EXISTS idx_cvl_target ON cross_video_links(target_video_id);

ALTER TABLE cross_video_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_cvl" ON cross_video_links FOR SELECT USING (true);
CREATE POLICY "write_cvl" ON cross_video_links FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Layer 10: Enriched transcript segments (kept from v1)
-- ============================================================
CREATE TABLE IF NOT EXISTS enriched_transcripts (
  video_id text PRIMARY KEY REFERENCES video_knowledge(video_id) ON DELETE CASCADE,
  segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  enriched_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE enriched_transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_et" ON enriched_transcripts FOR SELECT USING (true);
CREATE POLICY "write_et" ON enriched_transcripts FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Layer 11: Batch progress (added 'normalized' status)
-- ============================================================
CREATE TABLE IF NOT EXISTS batch_progress (
  video_id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'transcript_done', 'extraction_done',
    'normalized', 'connected', 'enriched', 'embedded', 'completed', 'failed'
  )),
  error_message text,
  attempt_count integer DEFAULT 0,
  extraction_version integer DEFAULT 1,
  last_attempt_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE batch_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_bp" ON batch_progress FOR SELECT USING (true);
CREATE POLICY "write_bp" ON batch_progress FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Layer 12: Knowledge Embeddings (unified vector store)
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_embeddings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL CHECK (entity_type IN (
    'video_summary', 'transcript_chunk', 'concept', 'chapter', 'moment'
  )),
  entity_id text NOT NULL,               -- video_id, concept_id, chapter uuid, or moment uuid
  video_id text REFERENCES video_knowledge(video_id) ON DELETE CASCADE,
  chunk_index integer DEFAULT 0,
  start_timestamp real,
  end_timestamp real,
  content text NOT NULL,
  embedding vector(1024) NOT NULL,
  metadata jsonb DEFAULT '{}'             -- Type-specific metadata
);

CREATE INDEX IF NOT EXISTS idx_ke_entity ON knowledge_embeddings(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ke_video ON knowledge_embeddings(video_id);
CREATE INDEX IF NOT EXISTS idx_ke_embedding ON knowledge_embeddings USING ivfflat (embedding vector_cosine_ops);

ALTER TABLE knowledge_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_ke" ON knowledge_embeddings FOR SELECT USING (true);
CREATE POLICY "write_ke" ON knowledge_embeddings FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Backward-compat: video_embeddings view over knowledge_embeddings
-- ============================================================
CREATE OR REPLACE VIEW video_embeddings AS
SELECT
  id,
  video_id,
  entity_type AS chunk_type,
  chunk_index,
  start_timestamp,
  end_timestamp,
  content,
  embedding
FROM knowledge_embeddings
WHERE entity_type IN ('video_summary', 'transcript_chunk');

-- ============================================================
-- Function: get_prerequisite_chain(concept_id, max_depth)
-- Returns the full prerequisite DAG up to max_depth levels
-- ============================================================
CREATE OR REPLACE FUNCTION get_prerequisite_chain(
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
  FROM concept_relations cr
  JOIN concepts c ON c.id = cr.source_id
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
  FROM concept_relations cr
  JOIN concepts c ON c.id = cr.source_id
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
$$ LANGUAGE SQL STABLE;

-- ============================================================
-- Function: get_learning_path(from_concept, to_concept)
-- BFS shortest path between two concepts in the prerequisite DAG
-- ============================================================
CREATE OR REPLACE FUNCTION get_learning_path(
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
  WHERE EXISTS (SELECT 1 FROM concepts WHERE id = p_from_concept)

  UNION ALL

  SELECT
    cr.target_id,
    path.step + 1,
    path.visited || cr.target_id
  FROM concept_relations cr
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
JOIN concepts c ON c.id = pe.cid
LEFT JOIN LATERAL (
  SELECT cm.video_id, vk.title
  FROM concept_mentions cm
  JOIN video_knowledge vk ON vk.video_id = cm.video_id
  WHERE cm.concept_id = pe.cid
    AND cm.mention_type IN ('defines', 'explains')
  ORDER BY cm.explanation_quality DESC NULLS LAST, cm.confidence DESC
  LIMIT 1
) best_vid ON true
ORDER BY pe.step;
$$ LANGUAGE SQL STABLE;

-- ============================================================
-- Function: build_context_block(video_id)
-- Pre-renders an XML context block for Anthropic prompt caching
-- Called after extraction + normalization, stored in video_knowledge.context_block
-- ============================================================
CREATE OR REPLACE FUNCTION build_context_block(p_video_id text)
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
  SELECT * INTO v FROM video_knowledge WHERE video_id = p_video_id;
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
    SELECT * FROM video_chapters WHERE video_id = p_video_id ORDER BY chapter_index
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
    FROM concept_mentions cm
    JOIN concepts c ON c.id = cm.concept_id
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
    FROM video_moments
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
  UPDATE video_knowledge
  SET context_block = result,
      context_block_tokens = (length(result) / 4)::integer,  -- Rough token estimate
      context_block_version = coalesce(context_block_version, 0) + 1
  WHERE video_id = p_video_id;

  RETURN result;
END;
$$ LANGUAGE plpgsql;
