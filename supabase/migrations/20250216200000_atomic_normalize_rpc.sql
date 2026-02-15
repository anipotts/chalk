CREATE OR REPLACE FUNCTION public.atomic_normalize_video(
  p_video_id TEXT,
  p_channel JSONB DEFAULT NULL,
  p_video JSONB DEFAULT '{}'::jsonb,
  p_concepts JSONB DEFAULT '[]'::jsonb,
  p_mentions JSONB DEFAULT '[]'::jsonb,
  p_relations JSONB DEFAULT '[]'::jsonb,
  p_chapters JSONB DEFAULT '[]'::jsonb,
  p_moments JSONB DEFAULT '[]'::jsonb,
  p_quiz JSONB DEFAULT '[]'::jsonb,
  p_references JSONB DEFAULT '[]'::jsonb,
  p_enriched_transcript JSONB DEFAULT '[]'::jsonb,
  p_prompt_hash TEXT DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  c JSONB;
  m JSONB;
  r JSONB;
  ch JSONB;
  mo JSONB;
  q JSONB;
  ref JSONB;
  v_concept_id TEXT;
  v_existing_aliases TEXT[];
  v_new_aliases TEXT[];
  v_existing_def TEXT;
  v_new_def TEXT;
BEGIN
  IF p_channel IS NOT NULL AND p_channel != 'null'::jsonb THEN
    INSERT INTO public.channels (channel_id, channel_name, tier)
    VALUES (p_channel->>'channelId', p_channel->>'name', COALESCE((p_channel->>'tier')::integer, 0))
    ON CONFLICT (channel_id) DO UPDATE SET channel_name = EXCLUDED.channel_name, tier = EXCLUDED.tier;
  END IF;

  INSERT INTO public.video_knowledge (
    video_id, channel_id, title, duration_seconds, summary, topics, topic_hierarchy,
    target_audience, content_type, difficulty, prerequisites, learning_objectives,
    teaching_approach, transcript_quality, chapter_summaries, timestamped_concepts,
    notable_quotes, questions_in_video, analogies, misconceptions_addressed,
    real_world_applications, aha_moments, timeline_events, suggested_questions,
    quiz_seeds, key_moments, raw_extraction, extraction_prompt_hash, extraction_model,
    extraction_tokens_input, extraction_tokens_output, extraction_cost_cents,
    extraction_version, transcript_word_count, transcript_hash, view_count,
    upload_date, thumbnail_url, extracted_at
  ) VALUES (
    p_video_id, p_video->>'channel_id', COALESCE(p_video->>'title', ''),
    (p_video->>'duration_seconds')::integer, p_video->>'summary',
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_video->'topics', '[]'::jsonb))), '{}'::text[]),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_video->'topic_hierarchy', '[]'::jsonb))), '{}'::text[]),
    p_video->>'target_audience', p_video->>'content_type', p_video->>'difficulty',
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_video->'prerequisites', '[]'::jsonb))), '{}'::text[]),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_video->'learning_objectives', '[]'::jsonb))), '{}'::text[]),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_video->'teaching_approach', '[]'::jsonb))), '{}'::text[]),
    COALESCE(p_video->'transcript_quality', '{}'::jsonb),
    COALESCE(p_video->'chapter_summaries', '[]'::jsonb),
    COALESCE(p_video->'timestamped_concepts', '[]'::jsonb),
    COALESCE(p_video->'notable_quotes', '[]'::jsonb),
    COALESCE(p_video->'questions_in_video', '[]'::jsonb),
    COALESCE(p_video->'analogies', '[]'::jsonb),
    COALESCE(p_video->'misconceptions_addressed', '[]'::jsonb),
    COALESCE(p_video->'real_world_applications', '[]'::jsonb),
    COALESCE(p_video->'aha_moments', '[]'::jsonb),
    COALESCE(p_video->'timeline_events', '[]'::jsonb),
    COALESCE(p_video->'suggested_questions', '[]'::jsonb),
    COALESCE(p_video->'quiz_seeds', '[]'::jsonb),
    COALESCE(p_video->'key_moments', '[]'::jsonb),
    p_video->'raw_extraction', p_prompt_hash,
    COALESCE(p_video->>'extraction_model', 'claude-sonnet-4-5'),
    (p_video->>'extraction_tokens_input')::integer,
    (p_video->>'extraction_tokens_output')::integer,
    (p_video->>'extraction_cost_cents')::real,
    COALESCE((p_video->>'extraction_version')::integer, 1),
    (p_video->>'transcript_word_count')::integer,
    p_video->>'transcript_hash', (p_video->>'view_count')::integer,
    p_video->>'upload_date', p_video->>'thumbnail_url', NOW()
  )
  ON CONFLICT (video_id) DO UPDATE SET
    channel_id = EXCLUDED.channel_id, title = EXCLUDED.title,
    duration_seconds = EXCLUDED.duration_seconds, summary = EXCLUDED.summary,
    topics = EXCLUDED.topics, topic_hierarchy = EXCLUDED.topic_hierarchy,
    target_audience = EXCLUDED.target_audience, content_type = EXCLUDED.content_type,
    difficulty = EXCLUDED.difficulty, prerequisites = EXCLUDED.prerequisites,
    learning_objectives = EXCLUDED.learning_objectives,
    teaching_approach = EXCLUDED.teaching_approach,
    transcript_quality = EXCLUDED.transcript_quality,
    chapter_summaries = EXCLUDED.chapter_summaries,
    timestamped_concepts = EXCLUDED.timestamped_concepts,
    notable_quotes = EXCLUDED.notable_quotes,
    questions_in_video = EXCLUDED.questions_in_video,
    analogies = EXCLUDED.analogies,
    misconceptions_addressed = EXCLUDED.misconceptions_addressed,
    real_world_applications = EXCLUDED.real_world_applications,
    aha_moments = EXCLUDED.aha_moments,
    timeline_events = EXCLUDED.timeline_events,
    suggested_questions = EXCLUDED.suggested_questions,
    quiz_seeds = EXCLUDED.quiz_seeds, key_moments = EXCLUDED.key_moments,
    raw_extraction = EXCLUDED.raw_extraction,
    extraction_prompt_hash = EXCLUDED.extraction_prompt_hash,
    extraction_model = EXCLUDED.extraction_model,
    extraction_tokens_input = EXCLUDED.extraction_tokens_input,
    extraction_tokens_output = EXCLUDED.extraction_tokens_output,
    extraction_cost_cents = EXCLUDED.extraction_cost_cents,
    extraction_version = EXCLUDED.extraction_version,
    transcript_word_count = EXCLUDED.transcript_word_count,
    transcript_hash = EXCLUDED.transcript_hash,
    view_count = EXCLUDED.view_count, upload_date = EXCLUDED.upload_date,
    thumbnail_url = EXCLUDED.thumbnail_url, extracted_at = NOW();

  FOR c IN SELECT * FROM jsonb_array_elements(p_concepts) LOOP
    v_concept_id := c->>'canonical_name';
    v_new_def := c->>'definition';
    v_new_aliases := COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(c->'aliases', '[]'::jsonb))), '{}'::text[]);
    SELECT aliases, definition INTO v_existing_aliases, v_existing_def FROM public.concepts WHERE id = v_concept_id;
    IF FOUND THEN
      UPDATE public.concepts SET
        display_name = COALESCE(c->>'display_name', display_name),
        definition = CASE WHEN v_new_def IS NOT NULL AND (v_existing_def IS NULL OR length(v_new_def) > length(v_existing_def)) THEN v_new_def ELSE v_existing_def END,
        aliases = (SELECT ARRAY(SELECT DISTINCT unnest FROM unnest(COALESCE(v_existing_aliases, '{}'::text[]) || v_new_aliases))),
        domain = COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(c->'domain', '[]'::jsonb))), domain),
        category = COALESCE(c->>'category', category),
        difficulty_level = COALESCE(c->>'difficulty_level', difficulty_level),
        video_count = COALESCE(video_count, 0) + COALESCE((c->>'video_count')::integer, 1),
        updated_at = NOW()
      WHERE id = v_concept_id;
    ELSE
      INSERT INTO public.concepts (id, display_name, definition, aliases, domain, category, difficulty_level, video_count, created_at, updated_at)
      VALUES (v_concept_id, COALESCE(c->>'display_name', v_concept_id), v_new_def, v_new_aliases,
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(c->'domain', '[]'::jsonb))), '{}'::text[]),
        c->>'category', c->>'difficulty_level', COALESCE((c->>'video_count')::integer, 1), NOW(), NOW());
    END IF;
  END LOOP;

  DELETE FROM public.concept_mentions WHERE video_id = p_video_id;
  FOR m IN SELECT * FROM jsonb_array_elements(p_mentions) LOOP
    INSERT INTO public.concept_mentions (concept_id, video_id, mention_type, timestamp_seconds, context_snippet, confidence, pedagogical_approach, explanation_quality)
    VALUES (m->>'concept_id', p_video_id, m->>'mention_type', COALESCE((m->>'timestamp_seconds')::real, 0),
      COALESCE(m->>'context_snippet', ''), COALESCE((m->>'confidence')::real, 1.0), m->>'pedagogical_approach', (m->>'explanation_quality')::real)
    ON CONFLICT (concept_id, video_id, mention_type, timestamp_seconds) DO UPDATE SET
      context_snippet = EXCLUDED.context_snippet, confidence = EXCLUDED.confidence,
      pedagogical_approach = EXCLUDED.pedagogical_approach, explanation_quality = EXCLUDED.explanation_quality;
  END LOOP;

  FOR r IN SELECT * FROM jsonb_array_elements(p_relations) LOOP
    INSERT INTO public.concept_relations (source_id, target_id, relation_type, confidence, strength, evidence_count, source_video_id)
    VALUES (r->>'source_id', r->>'target_id', r->>'relation_type', COALESCE((r->>'confidence')::real, 0.8),
      COALESCE((r->>'strength')::real, 0.5), COALESCE((r->>'evidence_count')::integer, 1), p_video_id)
    ON CONFLICT (source_id, target_id, relation_type) DO UPDATE SET
      confidence = GREATEST(public.concept_relations.confidence, EXCLUDED.confidence),
      strength = GREATEST(public.concept_relations.strength, EXCLUDED.strength),
      evidence_count = public.concept_relations.evidence_count + 1;
  END LOOP;

  DELETE FROM public.video_chapters WHERE video_id = p_video_id;
  FOR ch IN SELECT * FROM jsonb_array_elements(p_chapters) LOOP
    INSERT INTO public.video_chapters (video_id, chapter_index, title, start_seconds, end_seconds, summary, concepts)
    VALUES (p_video_id, COALESCE((ch->>'chapter_index')::integer, 0), COALESCE(ch->>'title', ''),
      COALESCE((ch->>'start_seconds')::real, 0), (ch->>'end_seconds')::real, ch->>'summary',
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(ch->'concepts', '[]'::jsonb))), '{}'::text[]));
  END LOOP;

  DELETE FROM public.video_moments WHERE video_id = p_video_id;
  FOR mo IN SELECT * FROM jsonb_array_elements(p_moments) LOOP
    INSERT INTO public.video_moments (video_id, moment_type, timestamp_seconds, content, context, concept_ids, importance, metadata)
    VALUES (p_video_id, mo->>'moment_type', COALESCE((mo->>'timestamp_seconds')::real, 0), COALESCE(mo->>'content', ''),
      mo->>'context', COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(mo->'concept_ids', '[]'::jsonb))), '{}'::text[]),
      COALESCE((mo->>'importance')::real, 0.5), COALESCE(mo->'metadata', '{}'::jsonb));
  END LOOP;

  DELETE FROM public.quiz_questions WHERE video_id = p_video_id;
  FOR q IN SELECT * FROM jsonb_array_elements(p_quiz) LOOP
    INSERT INTO public.quiz_questions (video_id, concept_id, question_type, question, correct_answer, distractors, explanation, difficulty, timestamp_seconds, bloom_level)
    VALUES (p_video_id, q->>'concept_id', COALESCE(q->>'question_type', 'multiple_choice'), COALESCE(q->>'question', ''),
      COALESCE(q->>'correct_answer', ''), COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(q->'distractors', '[]'::jsonb))), '{}'::text[]),
      q->>'explanation', q->>'difficulty', (q->>'timestamp_seconds')::real, q->>'bloom_level');
  END LOOP;

  DELETE FROM public.external_references WHERE video_id = p_video_id;
  FOR ref IN SELECT * FROM jsonb_array_elements(p_references) LOOP
    INSERT INTO public.external_references (video_id, name, ref_type, timestamp_seconds, description, url)
    VALUES (p_video_id, COALESCE(ref->>'name', ''), COALESCE(ref->>'ref_type', 'website'),
      (ref->>'timestamp_seconds')::real, ref->>'description', ref->>'url');
  END LOOP;

  INSERT INTO public.enriched_transcripts (video_id, segments, enriched_at)
  VALUES (p_video_id, p_enriched_transcript, NOW())
  ON CONFLICT (video_id) DO UPDATE SET segments = EXCLUDED.segments, enriched_at = NOW();
END;
$$ LANGUAGE plpgsql;
