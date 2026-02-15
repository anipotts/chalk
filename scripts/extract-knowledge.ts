#!/usr/bin/env npx tsx
/**
 * Single video knowledge extraction pipeline.
 * 7-step resumable: transcript → extraction → normalize → connect → enrich → embed → complete
 *
 * Usage:
 *   npx tsx scripts/extract-knowledge.ts <videoId> [--model opus|sonnet]
 */

// Load env before any imports that need it (wrapped for Vercel API route import safety)
try { process.loadEnvFile('.env.local'); } catch { /* env already loaded or running in Vercel */ }

import { createHash } from 'crypto';
import { generateText, jsonSchema, tool } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_TOOL } from '../lib/batch/extraction-prompt';
import type { ExtractionResult, MentionType } from '../lib/batch/types';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TranscriptSegment {
  text: string;
  offset: number;
  duration: number;
}

interface VideoMetadata {
  title?: string;
  lengthSeconds?: number;
  channelId?: string;
  description?: string;
  author?: string;
}

interface ExtractOptions {
  model?: 'opus' | 'sonnet';
  channelTier?: number;
}

type PipelineStatus = 'pending' | 'transcript_done' | 'extraction_done' | 'normalized' | 'connected' | 'enriched' | 'embedded' | 'completed' | 'failed';

// ─── Constants ──────────────────────────────────────────────────────────────

const MODEL_MAP = {
  opus: 'claude-opus-4-6',
  sonnet: 'claude-sonnet-4-5-20250929',
} as const;

// Cost per 1M tokens in cents
const COST_TABLE = {
  'claude-opus-4-6': { input: 1500, output: 7500 },
  'claude-sonnet-4-5-20250929': { input: 300, output: 1500 },
} as const;

const EXPLANATION_QUALITY_MAP: Record<string, number> = {
  defines: 0.8,
  explains: 0.7,
  introduces: 0.6,
  compares: 0.6,
  uses: 0.5,
  references: 0.3,
  assumes: 0.1,
};

// Pipeline status ordering for resume logic
const STATUS_ORDER: PipelineStatus[] = [
  'pending', 'transcript_done', 'extraction_done', 'normalized',
  'connected', 'enriched', 'embedded', 'completed',
];

// ─── Anthropic provider with extended timeout for long extractions ─────────
// Default Node.js fetch has a ~5-10 min headers timeout which is too short for
// long Opus extractions (116-min Karpathy video takes 15+ min for first response)

const anthropic = createAnthropic({
  fetch: async (input, init) => {
    const timeoutMs = 30 * 60 * 1000; // 30 minutes
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('Extraction timeout'), timeoutMs);

    // Forward abort from caller's signal (if any) to our controller
    const callerSignal = (init as RequestInit | undefined)?.signal;
    if (callerSignal) {
      if (callerSignal.aborted) {
        controller.abort(callerSignal.reason);
      } else {
        callerSignal.addEventListener('abort', () => controller.abort(callerSignal.reason), { once: true });
      }
    }

    try {
      return await globalThis.fetch(input as RequestInfo, {
        ...(init as RequestInit),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  },
});

// ─── Supabase client ────────────────────────────────────────────────────────

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY — anon key cannot bypass RLS for writes');
  return createClient(url, key);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(videoId: string, step: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${videoId}] ${step}: ${msg}`);
}

function calcCost(model: string, tokensIn: number, tokensOut: number): number {
  const rates = COST_TABLE[model as keyof typeof COST_TABLE];
  if (!rates) return 0;
  return Math.round((tokensIn * rates.input + tokensOut * rates.output) / 1_000_000);
}

async function updateProgress(
  client: SupabaseClient,
  videoId: string,
  status: PipelineStatus,
  extra?: { error_message?: string; completed_at?: string },
) {
  await client.from('batch_progress').upsert({
    video_id: videoId,
    status,
    last_attempt_at: new Date().toISOString(),
    ...(extra || {}),
  }, { onConflict: 'video_id' });
}

async function getProgress(client: SupabaseClient, videoId: string): Promise<PipelineStatus> {
  const { data } = await client
    .from('batch_progress')
    .select('status')
    .eq('video_id', videoId)
    .single();
  return (data as { status: PipelineStatus } | null)?.status || 'pending';
}

function shouldRun(current: PipelineStatus, target: PipelineStatus): boolean {
  return STATUS_ORDER.indexOf(current) < STATUS_ORDER.indexOf(target);
}

// ─── Retry wrapper for API calls ────────────────────────────────────────────

async function generateTextWithRetry(
  options: Parameters<typeof generateText>[0],
  videoId: string,
  maxAttempts = 3,
): ReturnType<typeof generateText> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await generateText(options);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable = /timeout|ETIMEDOUT|ECONNRESET|socket hang up|fetch failed/i.test(msg);

      if (isRetryable && attempt < maxAttempts) {
        const waitSec = attempt * 30;
        log(videoId, 'EXTRACTION', `attempt ${attempt}/${maxAttempts} failed (${msg.slice(0, 80)}), retrying in ${waitSec}s...`);
        await new Promise(r => setTimeout(r, waitSec * 1000));
        continue;
      }
      throw new Error(`Failed after ${attempt} attempts. Last error: ${msg.slice(0, 200)}`);
    }
  }
  throw new Error('Unreachable');
}

// ─── Fallback metadata fetch (oEmbed) ───────────────────────────────────────

async function fetchVideoMetadata(videoId: string): Promise<{ title?: string; author?: string }> {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) return {};
    const data = await resp.json() as { title?: string; author_name?: string };
    return { title: data.title, author: data.author_name };
  } catch {
    return {};
  }
}

// ─── Enhanced extraction schema (runtime extension, no lib/ changes) ────────

function buildEnhancedSchema() {
  const schema = JSON.parse(JSON.stringify(EXTRACTION_TOOL.input_schema));

  // Add enhanced fields to concept items
  const conceptProps = schema.properties.concepts.items.properties;
  conceptProps.category = {
    type: 'string',
    enum: ['algorithm', 'theorem', 'data_structure', 'concept', 'technique', 'model', 'framework', 'person', 'paper', 'tool'],
    description: 'Category of this concept',
  };
  conceptProps.difficulty_level = {
    type: 'string',
    enum: ['foundational', 'intermediate', 'advanced', 'expert'],
    description: 'Difficulty level of this concept',
  };
  conceptProps.explanation_quality = {
    type: 'number',
    description: '0-1 how well this video explains this concept (0.8=defines, 0.7=explains, 0.5=uses, 0.3=references, 0.1=assumes)',
  };

  // Add math_expressions at top level
  schema.properties.math_expressions = {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        timestamp: { type: 'number' },
        spoken_text: { type: 'string' },
        latex: { type: 'string' },
      },
    },
    description: 'Mathematical expressions spoken in the video, converted to LaTeX',
  };

  return schema;
}

// ─── Step 1: TRANSCRIPT ─────────────────────────────────────────────────────

async function stepTranscript(
  client: SupabaseClient,
  videoId: string,
): Promise<{ segments: TranscriptSegment[]; metadata: VideoMetadata }> {
  log(videoId, 'TRANSCRIPT', 'checking cache...');

  // Check Supabase transcript cache
  const { data: cached } = await client
    .from('transcripts')
    .select('segments, video_title, duration_seconds')
    .eq('video_id', videoId)
    .single();

  if (cached && (cached as { segments: TranscriptSegment[] }).segments?.length > 0) {
    const c = cached as { segments: TranscriptSegment[]; video_title: string; duration_seconds: number };
    log(videoId, 'TRANSCRIPT', `cached (${c.segments.length} segments), fetching metadata...`);

    // Fetch metadata separately (cache doesn't store channelId/author)
    let metadata: VideoMetadata = { title: c.video_title, lengthSeconds: Math.round(c.duration_seconds) };
    try {
      const { captionRace } = await import('../lib/transcript');
      // captionRace returns metadata from Innertube; we just need the metadata
      const raceResult = await captionRace(videoId);
      if (raceResult.metadata) {
        metadata = { ...metadata, ...raceResult.metadata };
      }
    } catch {
      // Fallback: oEmbed for title/author
      const oembed = await fetchVideoMetadata(videoId);
      if (oembed.title) metadata.title = metadata.title || oembed.title;
      if (oembed.author) metadata.author = oembed.author;
      log(videoId, 'TRANSCRIPT', 'metadata fetch failed, used oEmbed fallback');
    }

    return { segments: c.segments, metadata };
  }

  // Fetch fresh transcript
  log(videoId, 'TRANSCRIPT', 'fetching from YouTube...');
  const { fetchTranscript, cleanSegments, deduplicateSegments, mergeIntoSentences } = await import('../lib/transcript');
  const result = await fetchTranscript(videoId);

  const cleaned = mergeIntoSentences(deduplicateSegments(cleanSegments(result.segments)));
  const metadata: VideoMetadata = result.metadata || {};
  const lastSeg = cleaned[cleaned.length - 1];
  const durationSeconds = lastSeg ? lastSeg.offset + lastSeg.duration : 0;

  // Cache in Supabase
  await client.from('transcripts').upsert({
    video_id: videoId,
    segments: cleaned,
    source: result.source,
    segment_count: cleaned.length,
    duration_seconds: durationSeconds,
    video_title: metadata.title || null,
  }, { onConflict: 'video_id' });

  log(videoId, 'TRANSCRIPT', `fetched via ${result.source} (${cleaned.length} segments, ${Math.round(durationSeconds)}s)`);
  return { segments: cleaned, metadata };
}

// ─── Step 2: EXTRACTION ─────────────────────────────────────────────────────

// Enhanced concept type with runtime-added fields from the extended schema
interface EnhancedConcept {
  canonical_name: string;
  display_name: string;
  definition: string;
  aliases: string[];
  mention_type: MentionType;
  timestamp: number;
  depends_on: string[];
  enables: string[];
  domain: string[];
  pedagogical_approach?: string;
  category?: string;
  difficulty_level?: string;
  explanation_quality?: number;
}

interface EnhancedExtraction extends Omit<ExtractionResult, 'concepts'> {
  concepts: EnhancedConcept[];
  math_expressions?: Array<{ timestamp: number; spoken_text: string; latex: string }>;
}

interface ExtractionOutput {
  extraction: EnhancedExtraction;
  tokensIn: number;
  tokensOut: number;
  model: string;
  promptHash: string;
}

async function stepExtraction(
  client: SupabaseClient,
  videoId: string,
  segments: TranscriptSegment[],
  metadata: VideoMetadata,
  modelChoice: 'opus' | 'sonnet',
): Promise<ExtractionOutput> {
  const modelId = MODEL_MAP[modelChoice];
  log(videoId, 'EXTRACTION', `using ${modelChoice} (${modelId})`);

  // Format transcript for prompt
  const formattedTranscript = segments
    .map(s => {
      const mins = Math.floor(s.offset / 60);
      const secs = Math.floor(s.offset % 60);
      return `[${mins}:${secs.toString().padStart(2, '0')}] ${s.text}`;
    })
    .join('\n');

  // Truncate if too long
  const maxChars = 200_000;
  const transcript = formattedTranscript.length > maxChars
    ? formattedTranscript.slice(0, maxChars) + '\n\n[TRANSCRIPT TRUNCATED — video is very long]'
    : formattedTranscript;

  if (formattedTranscript.length > maxChars) {
    log(videoId, 'EXTRACTION', `WARNING: transcript truncated from ${formattedTranscript.length} to ${maxChars} chars (${Math.round((maxChars / formattedTranscript.length) * 100)}% retained)`);
  }

  let userPrompt = `Extract structured knowledge from this video transcript.

VIDEO: "${metadata.title || videoId}"
CHANNEL: ${metadata.author || 'Unknown'}
DURATION: ${metadata.lengthSeconds ? Math.round(metadata.lengthSeconds / 60) + ' minutes' : 'Unknown'}

TRANSCRIPT:
${transcript}`;

  // Scale output tokens based on transcript length: short videos (< 15 min) get 16K,
  // medium videos get 24K, long videos (> 45 min) get 32K
  const durationMin = (metadata.lengthSeconds || 600) / 60;
  const maxOutput = durationMin > 45 ? 32000 : durationMin > 15 ? 24000 : 16000;

  // For long videos, add conciseness instructions to prevent output truncation.
  // Without this, concepts can consume all output tokens, leaving 0 moments and 0 quizzes.
  if (durationMin > 30) {
    userPrompt += `\n\nIMPORTANT — This is a long video (${Math.round(durationMin)} minutes). To fit all sections within the output limit:
- Limit concepts to the TOP 30 most important (skip trivial/assumed ones)
- Keep concept definitions under 50 characters each
- Keep chapter summaries to 1-2 sentences each
- Still include ALL moments and quiz questions — these are critical`;
  }

  const enhancedSchema = buildEnhancedSchema();
  const promptHash = createHash('sha256').update(EXTRACTION_SYSTEM_PROMPT + userPrompt).digest('hex').slice(0, 16);
  log(videoId, 'EXTRACTION', `maxOutputTokens: ${maxOutput} (${Math.round(durationMin)} min video), promptHash: ${promptHash}`);

  const result = await generateTextWithRetry({
    model: anthropic(modelId),
    system: { role: 'system', content: EXTRACTION_SYSTEM_PROMPT, providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } } },
    prompt: userPrompt,
    tools: {
      extract_video_knowledge: tool({
        description: EXTRACTION_TOOL.description,
        inputSchema: jsonSchema(enhancedSchema),
      }),
    },
    maxOutputTokens: maxOutput,
    toolChoice: { type: 'tool', toolName: 'extract_video_knowledge' },
  }, videoId);

  // Extract tool call result
  const toolCall = result.toolCalls?.[0];
  if (!toolCall) {
    // Retry once with stronger instruction
    log(videoId, 'EXTRACTION', 'no tool call in response, retrying...');
    const retry = await generateTextWithRetry({
      model: anthropic(modelId),
      system: { role: 'system', content: EXTRACTION_SYSTEM_PROMPT, providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } } },
      prompt: userPrompt + '\n\nIMPORTANT: You MUST call the extract_video_knowledge tool with all extracted data.',
      tools: {
        extract_video_knowledge: tool({
          description: EXTRACTION_TOOL.description,
          inputSchema: jsonSchema(enhancedSchema),
        }),
      },
      maxOutputTokens: maxOutput,
      toolChoice: { type: 'tool', toolName: 'extract_video_knowledge' },
    }, videoId);

    const retryCall = retry.toolCalls?.[0];
    if (!retryCall) throw new Error('No tool call after retry');

    const usage = retry.usage || { inputTokens: 0, outputTokens: 0 };
    return {
      extraction: retryCall.input as EnhancedExtraction,
      tokensIn: usage.inputTokens || 0,
      tokensOut: usage.outputTokens || 0,
      model: modelId,
      promptHash,
    };
  }

  const usage = result.usage || { inputTokens: 0, outputTokens: 0 };
  return {
    extraction: toolCall.input as EnhancedExtraction,
    tokensIn: usage.inputTokens || 0,
    tokensOut: usage.outputTokens || 0,
    model: modelId,
    promptHash,
  };
}

// ─── Step 3: NORMALIZE ──────────────────────────────────────────────────────

async function stepNormalize(
  client: SupabaseClient,
  videoId: string,
  extraction: EnhancedExtraction,
  metadata: VideoMetadata,
  segments: TranscriptSegment[],
  extractionMeta: { model: string; tokensIn: number; tokensOut: number; costCents: number },
  channelTier: number,
) {
  log(videoId, 'NORMALIZE', 'inserting into tables...');

  // 1. Channels — upsert
  if (metadata.channelId) {
    await client.from('channels').upsert({
      channel_id: metadata.channelId,
      channel_name: metadata.author || 'Unknown',
      tier: channelTier,
    }, { onConflict: 'channel_id' });
    log(videoId, 'NORMALIZE', `channel: ${metadata.author}`);
  }

  // 2. Video Knowledge — upsert
  // Build legacy JSONB from unified moments
  const quotesMoments = extraction.moments?.filter(m => m.moment_type === 'quote') || [];
  const analogiesMoments = extraction.moments?.filter(m => m.moment_type === 'analogy') || [];
  const misconceptionsMoments = extraction.moments?.filter(m => m.moment_type === 'misconception') || [];
  const ahaMoments = extraction.moments?.filter(m => m.moment_type === 'aha_moment') || [];
  const applicationsMoments = extraction.moments?.filter(m => m.moment_type === 'application') || [];
  const questionsMoments = extraction.moments?.filter(m => m.moment_type === 'question') || [];

  const lastSeg = segments[segments.length - 1];
  const durationSeconds = lastSeg ? Math.round(lastSeg.offset + lastSeg.duration) : (metadata.lengthSeconds || 0);

  await client.from('video_knowledge').upsert({
    video_id: videoId,
    channel_id: metadata.channelId || null,
    title: metadata.title || '',
    duration_seconds: durationSeconds,
    summary: extraction.summary,
    topics: extraction.topics || [],
    topic_hierarchy: extraction.topic_hierarchy || [],
    target_audience: extraction.target_audience,
    content_type: extraction.content_type,
    difficulty: extraction.difficulty,
    prerequisites: extraction.prerequisites || [],
    learning_objectives: extraction.learning_objectives || [],
    teaching_approach: extraction.teaching_approach || [],
    transcript_quality: extraction.transcript_quality || {},
    // Legacy JSONB columns
    chapter_summaries: extraction.chapter_summaries || [],
    timestamped_concepts: extraction.timestamped_concepts || [],
    notable_quotes: quotesMoments,
    analogies: analogiesMoments,
    misconceptions_addressed: misconceptionsMoments,
    aha_moments: ahaMoments,
    real_world_applications: applicationsMoments,
    questions_in_video: questionsMoments,
    timeline_events: extraction.timeline_events || [],
    suggested_questions: extraction.suggested_questions || [],
    quiz_seeds: extraction.quiz_questions || [],
    key_moments: (extraction.moments || []).filter(m => (m.importance || 0) >= 0.7),
    raw_extraction: extraction,
    extraction_model: extractionMeta.model,
    extraction_tokens_input: extractionMeta.tokensIn,
    extraction_tokens_output: extractionMeta.tokensOut,
    extraction_cost_cents: extractionMeta.costCents,
    extraction_version: 3,
    thumbnail_url: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    transcript_word_count: segments.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0),
  }, { onConflict: 'video_id' });
  log(videoId, 'NORMALIZE', 'video_knowledge upserted');

  // 3. Concepts — smart upsert
  const concepts = extraction.concepts || [];
  const allCanonicalNames = concepts.map(c => c.canonical_name);

  // Fetch existing concepts
  const { data: existingRaw } = await client
    .from('concepts')
    .select('id, display_name, definition, aliases, domain, category, difficulty_level, video_count')
    .in('id', allCanonicalNames.length > 0 ? allCanonicalNames : ['__none__']);

  const existing = new Map(
    ((existingRaw || []) as Array<{
      id: string; display_name: string; definition: string | null;
      aliases: string[]; domain: string[]; category: string | null;
      difficulty_level: string | null; video_count: number;
    }>).map(c => [c.id, c])
  );

  const newConcepts: Array<Record<string, unknown>> = [];
  const updatedConcepts: Array<{ id: string; updates: Record<string, unknown> }> = [];

  for (const c of concepts) {
    const ex = existing.get(c.canonical_name);
    if (ex) {
      // Merge: union aliases, keep longer definition, increment video_count
      const mergedAliases = [...new Set([...(ex.aliases || []), ...(c.aliases || [])])];
      const betterDef = (c.definition?.length || 0) > (ex.definition?.length || 0) ? c.definition : ex.definition;
      updatedConcepts.push({
        id: c.canonical_name,
        updates: {
          aliases: mergedAliases,
          definition: betterDef,
          video_count: (ex.video_count || 0) + 1,
          category: ex.category || c.category || null,
          difficulty_level: ex.difficulty_level || c.difficulty_level || null,
          updated_at: new Date().toISOString(),
        },
      });
    } else {
      newConcepts.push({
        id: c.canonical_name,
        display_name: c.display_name,
        definition: c.definition || null,
        aliases: c.aliases || [],
        domain: c.domain || [],
        category: c.category || null,
        difficulty_level: c.difficulty_level || null,
        video_count: 1,
      });
    }
  }

  if (newConcepts.length > 0) {
    const { error } = await client.from('concepts').insert(newConcepts);
    if (error) log(videoId, 'NORMALIZE', `concept insert warning: ${error.message}`);
  }
  for (const u of updatedConcepts) {
    await client.from('concepts').update(u.updates).eq('id', u.id);
  }
  log(videoId, 'NORMALIZE', `concepts: ${newConcepts.length} new, ${updatedConcepts.length} updated`);

  // 4. Concept Mentions — delete existing, bulk insert
  await client.from('concept_mentions').delete().eq('video_id', videoId);

  const validConceptIds = new Set(allCanonicalNames);
  const mentions = concepts
    .filter(c => validConceptIds.has(c.canonical_name))
    .map(c => ({
      concept_id: c.canonical_name,
      video_id: videoId,
      mention_type: c.mention_type,
      timestamp_seconds: c.timestamp || 0,
      context_snippet: c.definition || '',
      pedagogical_approach: c.pedagogical_approach || null,
      explanation_quality: c.explanation_quality ?? EXPLANATION_QUALITY_MAP[c.mention_type] ?? 0.5,
    }));

  if (mentions.length > 0) {
    const { error } = await client.from('concept_mentions').insert(mentions);
    if (error) log(videoId, 'NORMALIZE', `mention insert warning: ${error.message}`);
  }
  log(videoId, 'NORMALIZE', `concept_mentions: ${mentions.length} rows`);

  // 5. Concept Relations — upsert
  const relations = extraction.concept_relations || [];
  const validRelations = relations.filter(
    r => validConceptIds.has(r.source) && validConceptIds.has(r.target)
  );

  for (const r of validRelations) {
    await client.from('concept_relations').upsert({
      source_id: r.source,
      target_id: r.target,
      relation_type: r.relation_type,
      confidence: r.confidence ?? 0.8,
      source_video_id: videoId,
    }, { onConflict: 'source_id,target_id,relation_type' });
  }
  log(videoId, 'NORMALIZE', `concept_relations: ${validRelations.length} edges`);

  // 6. Video Chapters — delete existing, bulk insert
  await client.from('video_chapters').delete().eq('video_id', videoId);

  const chapters = (extraction.chapter_summaries || []).map((ch, i) => ({
    video_id: videoId,
    chapter_index: i,
    title: ch.title,
    start_seconds: ch.start_timestamp,
    end_seconds: ch.end_timestamp || null,
    summary: ch.summary,
    concepts: ch.concepts || [],
  }));

  if (chapters.length > 0) {
    const { error } = await client.from('video_chapters').insert(chapters);
    if (error) log(videoId, 'NORMALIZE', `chapter insert warning: ${error.message}`);
  }
  log(videoId, 'NORMALIZE', `video_chapters: ${chapters.length} rows`);

  // 7. Video Moments — delete existing, bulk insert
  await client.from('video_moments').delete().eq('video_id', videoId);

  const moments = (extraction.moments || []).map(m => ({
    video_id: videoId,
    moment_type: m.moment_type,
    timestamp_seconds: m.timestamp || 0,
    content: m.content,
    context: m.context || null,
    concept_ids: (m.concept_ids || []).filter(id => validConceptIds.has(id)),
    importance: m.importance ?? 0.5,
    metadata: m.metadata || {},
  }));

  if (moments.length > 0) {
    const { error } = await client.from('video_moments').insert(moments);
    if (error) log(videoId, 'NORMALIZE', `moment insert warning: ${error.message}`);
  }
  log(videoId, 'NORMALIZE', `video_moments: ${moments.length} rows`);

  // 8. Quiz Questions — delete existing, bulk insert
  await client.from('quiz_questions').delete().eq('video_id', videoId);

  const quizzes = (extraction.quiz_questions || []).map(q => ({
    video_id: videoId,
    concept_id: (q.concept_id && validConceptIds.has(q.concept_id)) ? q.concept_id : null,
    question_type: q.question_type,
    question: q.question,
    correct_answer: q.correct_answer,
    distractors: q.distractors || [],
    explanation: q.explanation || null,
    difficulty: q.difficulty || 'medium',
    bloom_level: q.bloom_level || 'understand',
    timestamp_seconds: q.timestamp || null,
  }));

  if (quizzes.length > 0) {
    const { error } = await client.from('quiz_questions').insert(quizzes);
    if (error) log(videoId, 'NORMALIZE', `quiz insert warning: ${error.message}`);
  }
  log(videoId, 'NORMALIZE', `quiz_questions: ${quizzes.length} rows`);

  // 9. External References — delete existing, bulk insert
  await client.from('external_references').delete().eq('video_id', videoId);

  const refs = (extraction.external_references || []).map(r => ({
    video_id: videoId,
    name: r.name,
    ref_type: r.ref_type,
    timestamp_seconds: r.timestamp || null,
    description: r.description || null,
    url: r.url || null,
  }));

  if (refs.length > 0) {
    const { error } = await client.from('external_references').insert(refs);
    if (error) log(videoId, 'NORMALIZE', `ref insert warning: ${error.message}`);
  }
  log(videoId, 'NORMALIZE', `external_references: ${refs.length} rows`);

  // 10. Enriched Transcripts — upsert
  await client.from('enriched_transcripts').upsert({
    video_id: videoId,
    segments: segments,
  }, { onConflict: 'video_id' });
  log(videoId, 'NORMALIZE', 'enriched_transcripts upserted');
}

// ─── Step 4: CONNECT ────────────────────────────────────────────────────────

async function stepConnect(
  client: SupabaseClient,
  videoId: string,
  extraction: EnhancedExtraction,
) {
  log(videoId, 'CONNECT', 'inferring relations from depends_on/enables...');

  const concepts = extraction.concepts || [];
  const validIds = new Set(concepts.map(c => c.canonical_name));
  let addedCount = 0;

  for (const c of concepts) {
    // depends_on → prerequisite relation
    for (const dep of c.depends_on || []) {
      if (!validIds.has(dep)) continue;
      await client.from('concept_relations').upsert({
        source_id: dep,
        target_id: c.canonical_name,
        relation_type: 'prerequisite',
        confidence: 0.7,
        source_video_id: videoId,
      }, { onConflict: 'source_id,target_id,relation_type' });
      addedCount++;
    }

    // enables → enables relation
    for (const en of c.enables || []) {
      if (!validIds.has(en)) continue;
      await client.from('concept_relations').upsert({
        source_id: c.canonical_name,
        target_id: en,
        relation_type: 'enables',
        confidence: 0.7,
        source_video_id: videoId,
      }, { onConflict: 'source_id,target_id,relation_type' });
      addedCount++;
    }
  }

  // Update prerequisite_count on concepts
  const { data: prereqCounts } = await client
    .from('concept_relations')
    .select('target_id')
    .eq('relation_type', 'prerequisite');

  if (prereqCounts) {
    const counts = new Map<string, number>();
    for (const r of prereqCounts as Array<{ target_id: string }>) {
      counts.set(r.target_id, (counts.get(r.target_id) || 0) + 1);
    }
    for (const [id, count] of counts) {
      if (validIds.has(id)) {
        await client.from('concepts').update({ prerequisite_count: count }).eq('id', id);
      }
    }
  }

  log(videoId, 'CONNECT', `${addedCount} inferred relations`);
}

// ─── Step 5: ENRICH ─────────────────────────────────────────────────────────

async function stepEnrich(client: SupabaseClient, videoId: string) {
  log(videoId, 'ENRICH', 'building context block...');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.rpc as any)('build_context_block', {
    p_video_id: videoId,
  });

  if (error) {
    log(videoId, 'ENRICH', `warning: ${error.message}`);
    return;
  }

  // Verify context_block was written
  const { data: vk } = await client
    .from('video_knowledge')
    .select('context_block_version')
    .eq('video_id', videoId)
    .single();

  const version = (vk as { context_block_version: number } | null)?.context_block_version || 0;
  log(videoId, 'ENRICH', `context block v${version} built`);
}

// ─── Step 6: EMBED ──────────────────────────────────────────────────────────

async function tryLocalEmbedding(
  texts: string[],
  inputType: 'document' | 'query' = 'document',
): Promise<number[][] | null> {
  // Check service_registry for local embedding service URL
  let serviceUrl: string | null = null;

  try {
    const client = getClient();
    const { data } = await client
      .from('service_registry')
      .select('url')
      .eq('service_name', 'embedding')
      .single();
    if (data) serviceUrl = (data as { url: string }).url;
  } catch {
    // service_registry not available or empty
  }

  if (!serviceUrl) return null;

  try {
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < texts.length; i += 256) {
      const batch = texts.slice(i, i + 256);
      const resp = await fetch(`${serviceUrl}/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: batch, input_type: inputType }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!resp.ok) return null;
      const data = await resp.json() as { embeddings: number[][] };
      allEmbeddings.push(...data.embeddings);
    }
    return allEmbeddings;
  } catch {
    return null;
  }
}

async function embedTexts(
  texts: string[],
  inputType: 'document' | 'query' = 'document',
): Promise<number[][]> {
  // Try local embedding service first (free, GPU-accelerated)
  const local = await tryLocalEmbedding(texts, inputType);
  if (local) return local;

  // Fall back to Voyage API
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error('No embedding service available (local offline, VOYAGE_API_KEY not set)');

  const allEmbeddings: number[][] = [];
  for (let i = 0; i < texts.length; i += 128) {
    const batch = texts.slice(i, i + 128);
    const resp = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'voyage-3-large',
        input: batch,
        input_type: inputType,
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Voyage API error: ${resp.status} ${errText.slice(0, 200)}`);
    }
    const data = await resp.json() as { data: Array<{ embedding: number[] }> };
    allEmbeddings.push(...data.data.map(d => d.embedding));
  }

  return allEmbeddings;
}

function formatEmbedding(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

async function stepEmbed(
  client: SupabaseClient,
  videoId: string,
  extraction: EnhancedExtraction,
  segments: TranscriptSegment[],
  videoMeta: VideoMetadata,
) {
  // Check if any embedding backend is available
  const hasVoyage = !!process.env.VOYAGE_API_KEY;
  const localAvailable = await tryLocalEmbedding(['test'], 'document').then(r => r !== null).catch(() => false);

  if (!hasVoyage && !localAvailable) {
    log(videoId, 'EMBED', 'no embedding service available (VOYAGE_API_KEY not set, local offline), skipping');
    return false;
  }

  log(videoId, 'EMBED', `generating embeddings via ${localAvailable ? 'local GPU' : 'Voyage API'}...`);

  // Delete existing embeddings for this video
  await client.from('knowledge_embeddings').delete().eq('video_id', videoId);

  // Collect texts to embed
  const embeddingEntries: Array<{
    entity_type: string;
    entity_id: string;
    content: string;
    chunk_index?: number;
    start_timestamp?: number;
    end_timestamp?: number;
    metadata?: Record<string, unknown>;
  }> = [];

  // 1. Video summary
  if (extraction.summary) {
    embeddingEntries.push({
      entity_type: 'video_summary',
      entity_id: videoId,
      content: `${extraction.summary} Topics: ${(extraction.topics || []).join(', ')}`,
    });
  }

  // 2. New concepts only (not already embedded)
  const concepts = extraction.concepts || [];
  const conceptIds = concepts.map(c => c.canonical_name);

  // Check which concepts already have embeddings
  const { data: existingEmbedded } = await client
    .from('concepts')
    .select('id')
    .in('id', conceptIds.length > 0 ? conceptIds : ['__none__'])
    .not('embedding', 'is', null);

  const alreadyEmbedded = new Set(
    ((existingEmbedded || []) as Array<{ id: string }>).map(c => c.id)
  );

  for (const c of concepts) {
    if (alreadyEmbedded.has(c.canonical_name)) continue;
    if (!c.definition) continue;
    embeddingEntries.push({
      entity_type: 'concept',
      entity_id: c.canonical_name,
      content: `${c.display_name}: ${c.definition}`,
    });
  }

  // 3. Top moments by importance
  const topMoments = (extraction.moments || [])
    .filter(m => (m.importance || 0) >= 0.6)
    .sort((a, b) => (b.importance || 0) - (a.importance || 0))
    .slice(0, 5);

  for (const m of topMoments) {
    embeddingEntries.push({
      entity_type: 'moment',
      entity_id: `${videoId}_moment_${m.timestamp}`,
      content: `[${m.moment_type}] ${m.content}${m.context ? ` Context: ${m.context}` : ''}`,
      start_timestamp: m.timestamp,
    });
  }

  // 4. Transcript chunks (~500 tokens ≈ ~2000 chars)
  const chunkSize = 2000;
  let chunkIdx = 0;
  let chunkText = '';
  let chunkStart = 0;
  let chunkEnd = 0;

  for (const seg of segments) {
    if (chunkText.length === 0) {
      chunkStart = seg.offset;
    }
    chunkText += seg.text + ' ';
    chunkEnd = seg.offset + seg.duration;

    if (chunkText.length >= chunkSize) {
      embeddingEntries.push({
        entity_type: 'transcript_chunk',
        entity_id: `${videoId}_chunk_${chunkIdx}`,
        content: chunkText.trim(),
        chunk_index: chunkIdx,
        start_timestamp: chunkStart,
        end_timestamp: chunkEnd,
      });
      chunkIdx++;
      chunkText = '';
    }
  }
  // Flush remaining
  if (chunkText.trim().length > 50) {
    embeddingEntries.push({
      entity_type: 'transcript_chunk',
      entity_id: `${videoId}_chunk_${chunkIdx}`,
      content: chunkText.trim(),
      chunk_index: chunkIdx,
      start_timestamp: chunkStart,
      end_timestamp: chunkEnd,
    });
  }

  if (embeddingEntries.length === 0) {
    log(videoId, 'EMBED', 'nothing to embed');
    return true;
  }

  // Generate embeddings
  const texts = embeddingEntries.map(e => e.content);
  log(videoId, 'EMBED', `embedding ${texts.length} texts...`);

  const embeddings = await embedTexts(texts);

  // Insert into knowledge_embeddings
  const keRows = embeddingEntries.map((e, i) => ({
    entity_type: e.entity_type,
    entity_id: e.entity_id,
    video_id: videoId,
    chunk_index: e.chunk_index ?? 0,
    start_timestamp: e.start_timestamp ?? null,
    end_timestamp: e.end_timestamp ?? null,
    content: e.content,
    embedding: formatEmbedding(embeddings[i]),
    metadata: e.metadata || {},
  }));

  // Insert in batches (Supabase has payload size limits)
  for (let i = 0; i < keRows.length; i += 20) {
    const batch = keRows.slice(i, i + 20);
    const { error } = await client.from('knowledge_embeddings').insert(batch);
    if (error) log(videoId, 'EMBED', `ke insert batch ${i} warning: ${error.message}`);
  }

  // Update concept embeddings
  for (const e of embeddingEntries) {
    if (e.entity_type !== 'concept') continue;
    const idx = embeddingEntries.indexOf(e);
    await client
      .from('concepts')
      .update({ embedding: formatEmbedding(embeddings[idx]) })
      .eq('id', e.entity_id);
  }

  log(videoId, 'EMBED', `${keRows.length} embeddings inserted`);

  // Populate Upstash Vector (server-side embedding via data field)
  const upstashUrl = process.env.UPSTASH_VECTOR_REST_URL;
  const upstashToken = process.env.UPSTASH_VECTOR_REST_TOKEN;
  if (upstashUrl && upstashToken) {
    try {
      const { Index } = await import('@upstash/vector');
      const vectorIndex = new Index({ url: upstashUrl, token: upstashToken });

      // Build upsert batch: video summary + transcript chunks
      const vectorUpserts: Array<{ id: string; data: string; metadata: Record<string, unknown> }> = [];

      // Video summary
      if (extraction.summary) {
        vectorUpserts.push({
          id: `${videoId}:summary`,
          data: `${extraction.summary} Topics: ${(extraction.topics || []).join(', ')}`,
          metadata: {
            video_id: videoId,
            title: videoMeta.title || '',
            channel_name: videoMeta.author || '',
            type: 'video',
            topics: extraction.topics || [],
            difficulty: extraction.difficulty || null,
          },
        });
      }

      // Transcript chunks (reuse the chunking from above)
      let upChunkIdx = 0;
      let upChunkText = '';
      let upChunkStart = 0;
      let upChunkEnd = 0;

      for (const seg of segments) {
        if (upChunkText.length === 0) upChunkStart = seg.offset;
        upChunkText += seg.text + ' ';
        upChunkEnd = seg.offset + seg.duration;

        if (upChunkText.length >= 2000) {
          vectorUpserts.push({
            id: `${videoId}:${upChunkIdx}`,
            data: upChunkText.trim(),
            metadata: {
              video_id: videoId,
              title: videoMeta.title || '',
              channel_name: videoMeta.author || '',
              chunk_text: upChunkText.trim().slice(0, 200),
              chunk_index: upChunkIdx,
              start_timestamp: upChunkStart,
              end_timestamp: upChunkEnd,
              type: 'chunk',
            },
          });
          upChunkIdx++;
          upChunkText = '';
        }
      }
      if (upChunkText.trim().length > 50) {
        vectorUpserts.push({
          id: `${videoId}:${upChunkIdx}`,
          data: upChunkText.trim(),
          metadata: {
            video_id: videoId,
            title: videoMeta.title || '',
            channel_name: videoMeta.author || '',
            chunk_text: upChunkText.trim().slice(0, 200),
            chunk_index: upChunkIdx,
            start_timestamp: upChunkStart,
            end_timestamp: upChunkEnd,
            type: 'chunk',
          },
        });
      }

      // Upsert in batches of 100
      for (let i = 0; i < vectorUpserts.length; i += 100) {
        await vectorIndex.upsert(vectorUpserts.slice(i, i + 100));
      }

      log(videoId, 'EMBED', `Upstash Vector: ${vectorUpserts.length} vectors upserted`);
    } catch (upErr) {
      log(videoId, 'EMBED', `Upstash Vector failed: ${upErr instanceof Error ? upErr.message : upErr} — continuing`);
    }
  } else {
    log(videoId, 'EMBED', 'Upstash Vector env vars not set, skipping');
  }

  return true;
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────

export async function extractSingleVideo(
  videoId: string,
  options: ExtractOptions = {},
): Promise<{ success: boolean; concepts: number; moments: number; quizzes: number; costCents: number; durationMs: number }> {
  const startTime = Date.now();
  const client = getClient();
  const modelChoice = options.model || 'sonnet';

  // Initialize batch_progress
  const currentStatus = await getProgress(client, videoId);
  if (currentStatus === 'completed') {
    log(videoId, 'PIPELINE', 'already completed, skipping');
    return { success: true, concepts: 0, moments: 0, quizzes: 0, costCents: 0, durationMs: 0 };
  }
  if (currentStatus === 'pending' || currentStatus === 'failed') {
    await client.from('batch_progress').upsert({
      video_id: videoId,
      status: 'pending',
      attempt_count: currentStatus === 'failed' ? 1 : 0,
      extraction_version: 3,
      started_at: new Date().toISOString(),
      last_attempt_at: new Date().toISOString(),
      error_message: null,
    }, { onConflict: 'video_id' });
  }

  let segments: TranscriptSegment[] = [];
  let metadata: VideoMetadata = {};
  let extraction: EnhancedExtraction | null = null;
  let costCents = 0;

  try {
    // Step 1: TRANSCRIPT
    if (shouldRun(currentStatus, 'transcript_done')) {
      const result = await stepTranscript(client, videoId);
      segments = result.segments;
      metadata = result.metadata;
      await updateProgress(client, videoId, 'transcript_done');
    } else {
      // Load cached transcript
      const { data: cached } = await client
        .from('transcripts')
        .select('segments, video_title, duration_seconds')
        .eq('video_id', videoId)
        .single();
      if (cached) {
        const c = cached as { segments: TranscriptSegment[]; video_title: string; duration_seconds: number };
        segments = c.segments;
        metadata = { title: c.video_title, lengthSeconds: Math.round(c.duration_seconds) };
      }
      // Fetch metadata (channelId, author) if not available
      if (!metadata.channelId) {
        try {
          const { captionRace } = await import('../lib/transcript');
          const raceResult = await captionRace(videoId);
          if (raceResult.metadata) metadata = { ...metadata, ...raceResult.metadata };
        } catch { /* metadata fetch failed, continue */ }
      }
      log(videoId, 'PIPELINE', 'transcript already done, resuming...');
    }

    // Backfill title/author via oEmbed if still missing
    if (!metadata.title || !metadata.author) {
      const oembed = await fetchVideoMetadata(videoId);
      if (oembed.title && !metadata.title) metadata.title = oembed.title;
      if (oembed.author && !metadata.author) metadata.author = oembed.author;
      if (oembed.title || oembed.author) {
        log(videoId, 'PIPELINE', `backfilled metadata via oEmbed: "${metadata.title}" by ${metadata.author}`);
      }
    }

    // Step 2: EXTRACTION
    if (shouldRun(currentStatus, 'extraction_done')) {
      const result = await stepExtraction(client, videoId, segments, metadata, modelChoice);
      extraction = result.extraction;
      costCents = calcCost(result.model, result.tokensIn, result.tokensOut);
      log(videoId, 'EXTRACTION', `done (${result.tokensIn} in, ${result.tokensOut} out, ${costCents}¢, hash: ${result.promptHash})`);

      // Save raw extraction for safety
      await client.from('video_knowledge').upsert({
        video_id: videoId,
        title: metadata.title || '',
        raw_extraction: extraction,
        extraction_model: result.model,
        extraction_tokens_input: result.tokensIn,
        extraction_tokens_output: result.tokensOut,
        extraction_cost_cents: costCents,
        extraction_prompt_hash: result.promptHash,
      }, { onConflict: 'video_id' });

      // Store actual cost in batch_progress metadata
      await client.from('batch_progress').update({
        metadata: {
          tokens_in: result.tokensIn,
          tokens_out: result.tokensOut,
          cost_cents: costCents,
          model: result.model,
          prompt_hash: result.promptHash,
        },
      }).eq('video_id', videoId);

      await updateProgress(client, videoId, 'extraction_done');
    } else {
      // Load cached extraction
      const { data: vk } = await client
        .from('video_knowledge')
        .select('raw_extraction, extraction_cost_cents')
        .eq('video_id', videoId)
        .single();
      if (vk) {
        const v = vk as { raw_extraction: EnhancedExtraction; extraction_cost_cents: number };
        extraction = v.raw_extraction;
        costCents = v.extraction_cost_cents || 0;
      }
      log(videoId, 'PIPELINE', 'extraction already done, resuming...');
    }

    if (!extraction) throw new Error('No extraction data available');

    // Step 3: NORMALIZE
    if (shouldRun(currentStatus, 'normalized')) {
      await stepNormalize(client, videoId, extraction, metadata, segments, {
        model: MODEL_MAP[modelChoice],
        tokensIn: 0,
        tokensOut: 0,
        costCents,
      }, options.channelTier || 2);
      await updateProgress(client, videoId, 'normalized');
    } else {
      log(videoId, 'PIPELINE', 'normalization already done, resuming...');
    }

    // Step 4: CONNECT
    if (shouldRun(currentStatus, 'connected')) {
      await stepConnect(client, videoId, extraction);
      await updateProgress(client, videoId, 'connected');
    } else {
      log(videoId, 'PIPELINE', 'connect already done, resuming...');
    }

    // Step 5: ENRICH
    if (shouldRun(currentStatus, 'enriched')) {
      await stepEnrich(client, videoId);
      await updateProgress(client, videoId, 'enriched');
    } else {
      log(videoId, 'PIPELINE', 'enrich already done, resuming...');
    }

    // Step 6: EMBED (non-fatal — data is still useful without embeddings)
    if (shouldRun(currentStatus, 'embedded')) {
      try {
        const embeddingSuccess = await stepEmbed(client, videoId, extraction, segments, metadata);
        if (embeddingSuccess) {
          await updateProgress(client, videoId, 'embedded');
        } else {
          // Skip embedding but don't fail
          log(videoId, 'EMBED', 'skipped (no API key), continuing without embeddings');
        }
      } catch (embedErr) {
        log(videoId, 'EMBED', `failed: ${embedErr instanceof Error ? embedErr.message : embedErr} — continuing without embeddings`);
      }
    } else {
      log(videoId, 'PIPELINE', 'embed already done, resuming...');
    }

    // Step 7: COMPLETE
    await updateProgress(client, videoId, 'completed', {
      completed_at: new Date().toISOString(),
    });

    const elapsed = Date.now() - startTime;
    const conceptCount = extraction.concepts?.length || 0;
    const momentCount = extraction.moments?.length || 0;
    const quizCount = extraction.quiz_questions?.length || 0;

    log(videoId, 'COMPLETE', `${conceptCount} concepts, ${momentCount} moments, ${quizCount} quizzes | ${costCents}¢ | ${Math.round(elapsed / 1000)}s`);

    return {
      success: true,
      concepts: conceptCount,
      moments: momentCount,
      quizzes: quizCount,
      costCents,
      durationMs: elapsed,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log(videoId, 'ERROR', errMsg);
    await updateProgress(client, videoId, 'failed', { error_message: errMsg });
    return {
      success: false,
      concepts: 0,
      moments: 0,
      quizzes: 0,
      costCents,
      durationMs: Date.now() - startTime,
    };
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const videoId = args.find(a => !a.startsWith('--'));
  const modelArg = args.find(a => a.startsWith('--model'))?.split('=')[1]
    || args[args.indexOf('--model') + 1];

  if (!videoId) {
    console.error('Usage: npx tsx scripts/extract-knowledge.ts <videoId> [--model opus|sonnet]');
    process.exit(1);
  }

  const model = (modelArg === 'opus' || modelArg === 'sonnet') ? modelArg : 'sonnet';
  console.log(`\n=== Extracting knowledge from ${videoId} (model: ${model}) ===\n`);

  const result = await extractSingleVideo(videoId, { model });

  if (result.success) {
    console.log(`\n✓ Success: ${result.concepts} concepts, ${result.moments} moments, ${result.quizzes} quizzes`);
    console.log(`  Cost: ${result.costCents}¢ | Time: ${Math.round(result.durationMs / 1000)}s`);
  } else {
    console.error('\n✗ Failed — check logs above');
    process.exit(1);
  }
}

// Only run CLI when executed directly (not when imported by extract-batch.ts)
const isDirectRun = process.argv[1]?.includes('extract-knowledge');
if (isDirectRun) {
  main();
}
