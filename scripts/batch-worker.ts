#!/usr/bin/env npx tsx
/**
 * Persistent batch worker for knowledge graph extraction.
 *
 * Runs on the Courant CUDA server (or locally). Processes videos in batches:
 *   1. Transcribe locally (WhisperX GPU or existing pipeline)
 *   2. Buffer transcripts until batch threshold
 *   3. Submit to Anthropic Message Batches API (50% cost reduction)
 *   4. Poll for completion
 *   5. Normalize results into Supabase tables
 *   6. Embed locally (nomic-embed-text GPU) or via Voyage API
 *
 * Usage:
 *   npx tsx scripts/batch-worker.ts [options]
 *
 * Options:
 *   --batch-size N    Videos per batch (default: 50, max: 100)
 *   --poll-interval N Poll interval in seconds (default: 60)
 *   --model opus|sonnet  Model for extraction (default: sonnet)
 *   --once            Process one batch then exit (no loop)
 *   --tier 1|2|3|4|all  Filter by tier (default: all)
 *   --dry-run         Show what would be processed, no API calls
 */

process.loadEnvFile('.env.local');

import Anthropic from '@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pLimit from 'p-limit';
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_TOOL } from '../lib/batch/extraction-prompt';
import type { VideoManifestEntry } from '../lib/batch/types';

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
const __dirname_compat = (typeof __dirname !== 'undefined' ? __dirname : null)
  ?? dirname(fileURLToPath(import.meta.url));

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

interface PreparedVideo {
  videoId: string;
  channelName: string;
  title: string;
  tier: number;
  segments: TranscriptSegment[];
  metadata: VideoMetadata;
  formattedTranscript: string;
}

type PipelineStatus = 'pending' | 'transcript_done' | 'batch_queued' | 'extraction_done' |
  'normalized' | 'connected' | 'enriched' | 'embedded' | 'completed' | 'failed';

// ─── Constants ──────────────────────────────────────────────────────────────

const MODEL_MAP = {
  opus: 'claude-opus-4-6' as const,
  sonnet: 'claude-sonnet-4-5-20250929' as const,
};

const COST_TABLE = {
  'claude-opus-4-6': { input: 1500, output: 7500 },
  'claude-sonnet-4-5-20250929': { input: 300, output: 1500 },
} as const;

const EXPLANATION_QUALITY_MAP: Record<string, number> = {
  defines: 0.8, explains: 0.7, introduces: 0.6, compares: 0.6,
  uses: 0.5, references: 0.3, assumes: 0.1,
};

// ─── CLI Parsing ────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string): string | null => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
  };

  return {
    batchSize: Math.min(parseInt(get('--batch-size') || '50', 10), 100),
    pollInterval: parseInt(get('--poll-interval') || '60', 10) * 1000,
    model: (get('--model') === 'opus' ? 'opus' : 'sonnet') as 'opus' | 'sonnet',
    once: args.includes('--once'),
    tier: get('--tier') || 'all',
    dryRun: args.includes('--dry-run'),
  };
}

// ─── Clients ────────────────────────────────────────────────────────────────

function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

function getAnthropic(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Missing ANTHROPIC_API_KEY');
  return new Anthropic({ apiKey: key });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(ctx: string, step: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${ctx}] ${step}: ${msg}`);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function calcCost(model: string, tokensIn: number, tokensOut: number): number {
  const rates = COST_TABLE[model as keyof typeof COST_TABLE];
  if (!rates) return 0;
  // Batch API is 50% off
  return Math.round((tokensIn * rates.input + tokensOut * rates.output) / 1_000_000 / 2);
}

// ─── Step 1: Find Pending Videos ────────────────────────────────────────────

async function getPendingVideos(
  client: SupabaseClient,
  limit: number,
  tierFilter: string,
): Promise<VideoManifestEntry[]> {
  // Load manifest
  const manifestPath = join(__dirname_compat, 'video-manifest.json');
  if (!existsSync(manifestPath)) {
    log('WORKER', 'PENDING', 'video-manifest.json not found');
    return [];
  }

  const manifest: VideoManifestEntry[] = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const filtered = tierFilter === 'all'
    ? manifest
    : manifest.filter(v => String(v.tier) === tierFilter);

  // Check batch_progress for completed/in-progress
  const videoIds = filtered.map(v => v.videoId);
  const statusMap = new Map<string, string>();

  for (let i = 0; i < videoIds.length; i += 500) {
    const chunk = videoIds.slice(i, i + 500);
    const { data } = await client
      .from('batch_progress')
      .select('video_id, status')
      .in('video_id', chunk);
    for (const p of (data || []) as Array<{ video_id: string; status: string }>) {
      statusMap.set(p.video_id, p.status);
    }
  }

  // Return videos that are pending, failed, or not yet in batch_progress
  const pending = filtered.filter(v => {
    const status = statusMap.get(v.videoId);
    return !status || status === 'pending' || status === 'failed';
  });

  return pending.slice(0, limit);
}

// ─── Step 2: Transcribe ─────────────────────────────────────────────────────

async function transcribeVideo(
  client: SupabaseClient,
  videoId: string,
): Promise<{ segments: TranscriptSegment[]; metadata: VideoMetadata } | null> {
  // Check cache first
  const { data: cached } = await client
    .from('transcripts')
    .select('segments, video_title, duration_seconds')
    .eq('video_id', videoId)
    .single();

  if (cached && (cached as { segments: TranscriptSegment[] }).segments?.length > 0) {
    const c = cached as { segments: TranscriptSegment[]; video_title: string; duration_seconds: number };
    log(videoId, 'TRANSCRIPT', `cached (${c.segments.length} segments)`);

    let metadata: VideoMetadata = { title: c.video_title, lengthSeconds: Math.round(c.duration_seconds) };

    // Try to get channel info
    try {
      const { captionRace } = await import('../lib/transcript');
      const raceResult = await captionRace(videoId);
      if (raceResult.metadata) metadata = { ...metadata, ...raceResult.metadata };
    } catch {
      // Fallback to oEmbed
      const oembed = await fetchVideoMetadata(videoId);
      if (oembed.title) metadata.title = metadata.title || oembed.title;
      if (oembed.author) metadata.author = oembed.author;
    }

    return { segments: c.segments, metadata };
  }

  // Fetch fresh
  log(videoId, 'TRANSCRIPT', 'fetching...');
  try {
    const { fetchTranscript, cleanSegments, deduplicateSegments, mergeIntoSentences } = await import('../lib/transcript');
    const result = await fetchTranscript(videoId);
    const cleaned = mergeIntoSentences(deduplicateSegments(cleanSegments(result.segments)));
    const metadata: VideoMetadata = result.metadata || {};
    const lastSeg = cleaned[cleaned.length - 1];
    const durationSeconds = lastSeg ? lastSeg.offset + lastSeg.duration : 0;

    await client.from('transcripts').upsert({
      video_id: videoId,
      segments: cleaned,
      source: result.source,
      segment_count: cleaned.length,
      duration_seconds: durationSeconds,
      video_title: metadata.title || null,
    }, { onConflict: 'video_id' });

    log(videoId, 'TRANSCRIPT', `fetched via ${result.source} (${cleaned.length} segments)`);
    return { segments: cleaned, metadata };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(videoId, 'TRANSCRIPT', `FAILED: ${msg}`);
    return null;
  }
}

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

// ─── Step 3: Build Batch Request ────────────────────────────────────────────

function buildEnhancedSchema() {
  const schema = JSON.parse(JSON.stringify(EXTRACTION_TOOL.input_schema));
  const conceptProps = schema.properties.concepts.items.properties;
  conceptProps.category = {
    type: 'string',
    enum: ['algorithm', 'theorem', 'data_structure', 'concept', 'technique', 'model', 'framework', 'person', 'paper', 'tool'],
  };
  conceptProps.difficulty_level = {
    type: 'string',
    enum: ['foundational', 'intermediate', 'advanced', 'expert'],
  };
  conceptProps.explanation_quality = { type: 'number' };
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
  };
  return schema;
}

function buildBatchRequest(
  video: PreparedVideo,
  modelId: string,
): Anthropic.Messages.Batches.BatchCreateParams.Request {
  const durationMin = (video.metadata.lengthSeconds || 600) / 60;
  const maxOutput = durationMin > 45 ? 32000 : durationMin > 15 ? 24000 : 16000;

  let userPrompt = `Extract structured knowledge from this video transcript.

VIDEO: "${video.metadata.title || video.videoId}"
CHANNEL: ${video.metadata.author || video.channelName || 'Unknown'}
DURATION: ${video.metadata.lengthSeconds ? Math.round(video.metadata.lengthSeconds / 60) + ' minutes' : 'Unknown'}

TRANSCRIPT:
${video.formattedTranscript}`;

  if (durationMin > 30) {
    userPrompt += `\n\nIMPORTANT — This is a long video (${Math.round(durationMin)} minutes). To fit all sections within the output limit:
- Limit concepts to the TOP 30 most important (skip trivial/assumed ones)
- Keep concept definitions under 50 characters each
- Keep chapter summaries to 1-2 sentences each
- Still include ALL moments and quiz questions — these are critical`;
  }

  return {
    custom_id: video.videoId,
    params: {
      model: modelId,
      max_tokens: maxOutput,
      system: [{ type: 'text', text: EXTRACTION_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userPrompt }],
      tools: [{
        name: EXTRACTION_TOOL.name,
        description: EXTRACTION_TOOL.description,
        input_schema: buildEnhancedSchema() as Anthropic.Messages.Tool.InputSchema,
      }],
      tool_choice: { type: 'tool' as const, name: EXTRACTION_TOOL.name },
    },
  };
}

// ─── Step 4: Submit Batch ───────────────────────────────────────────────────

async function submitBatch(
  anthropic: Anthropic,
  client: SupabaseClient,
  prepared: PreparedVideo[],
  modelChoice: 'opus' | 'sonnet',
): Promise<string> {
  const modelId = MODEL_MAP[modelChoice];
  const requests = prepared.map(v => buildBatchRequest(v, modelId));

  log('BATCH', 'SUBMIT', `submitting ${requests.length} requests (${modelChoice})...`);

  const batch = await anthropic.messages.batches.create({ requests });

  log('BATCH', 'SUBMIT', `batch ${batch.id} created, status: ${batch.processing_status}`);

  // Mark videos as batch_queued
  for (const v of prepared) {
    await client.from('batch_progress').upsert({
      video_id: v.videoId,
      status: 'batch_queued' as PipelineStatus,
      last_attempt_at: new Date().toISOString(),
      metadata: { batch_id: batch.id, model: modelId },
    }, { onConflict: 'video_id' });
  }

  return batch.id;
}

// ─── Step 5: Poll for Completion ────────────────────────────────────────────

async function pollBatch(
  anthropic: Anthropic,
  batchId: string,
  intervalMs: number,
): Promise<Anthropic.Messages.Batches.MessageBatch> {
  let lastLog = 0;
  while (true) {
    const batch = await anthropic.messages.batches.retrieve(batchId);
    const counts = batch.request_counts;

    const now = Date.now();
    if (now - lastLog > 60_000) {
      log('BATCH', 'POLL', `${batchId}: ${counts.succeeded} succeeded, ${counts.processing} processing, ${counts.errored} errored`);
      lastLog = now;
    }

    if (batch.processing_status === 'ended') {
      log('BATCH', 'POLL', `${batchId} ended: ${counts.succeeded} succeeded, ${counts.errored} errored, ${counts.expired} expired`);
      return batch;
    }

    await sleep(intervalMs);
  }
}

// ─── Step 6: Process Results ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExtractionData = any;

async function processResults(
  anthropic: Anthropic,
  client: SupabaseClient,
  batchId: string,
  preparedMap: Map<string, PreparedVideo>,
  modelChoice: 'opus' | 'sonnet',
): Promise<{ succeeded: number; failed: number; totalCostCents: number }> {
  const results = await anthropic.messages.batches.results(batchId);
  const modelId = MODEL_MAP[modelChoice];

  let succeeded = 0;
  let failed = 0;
  let totalCostCents = 0;

  for await (const entry of results) {
    const videoId = entry.custom_id;
    const prepared = preparedMap.get(videoId);

    if (entry.result.type !== 'succeeded') {
      log(videoId, 'RESULT', `${entry.result.type}: ${entry.result.type === 'errored' ? JSON.stringify(entry.result.error) : ''}`);
      await client.from('batch_progress').update({
        status: 'failed',
        error_message: `Batch result: ${entry.result.type}`,
        last_attempt_at: new Date().toISOString(),
      }).eq('video_id', videoId);
      failed++;
      continue;
    }

    const message = entry.result.message;
    const usage = message.usage || { input_tokens: 0, output_tokens: 0 };
    const costCents = calcCost(modelId, usage.input_tokens, usage.output_tokens);
    totalCostCents += costCents;

    // Extract tool call result
    const toolUse = message.content.find(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
    );

    if (!toolUse) {
      log(videoId, 'RESULT', 'no tool_use block in response');
      await client.from('batch_progress').update({
        status: 'failed',
        error_message: 'No tool_use in batch result',
        last_attempt_at: new Date().toISOString(),
      }).eq('video_id', videoId);
      failed++;
      continue;
    }

    const extraction = toolUse.input as ExtractionData;

    try {
      // Save raw extraction
      await client.from('video_knowledge').upsert({
        video_id: videoId,
        title: prepared?.metadata.title || '',
        raw_extraction: extraction,
        extraction_model: modelId,
        extraction_tokens_input: usage.input_tokens,
        extraction_tokens_output: usage.output_tokens,
        extraction_cost_cents: costCents,
      }, { onConflict: 'video_id' });

      await client.from('batch_progress').update({
        status: 'extraction_done',
        last_attempt_at: new Date().toISOString(),
        metadata: {
          batch_id: batchId,
          tokens_in: usage.input_tokens,
          tokens_out: usage.output_tokens,
          cost_cents: costCents,
          model: modelId,
        },
      }).eq('video_id', videoId);

      // Run normalize + connect + enrich + embed
      if (prepared) {
        await normalizeAndFinish(client, videoId, extraction, prepared, modelId, costCents);
      }

      succeeded++;
      const concepts = extraction.concepts?.length || 0;
      const moments = extraction.moments?.length || 0;
      const quizzes = extraction.quiz_questions?.length || 0;
      log(videoId, 'RESULT', `${concepts} concepts, ${moments} moments, ${quizzes} quizzes | ${costCents}c (batch 50% off)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(videoId, 'RESULT', `normalize failed: ${msg}`);
      await client.from('batch_progress').update({
        status: 'failed',
        error_message: `Normalize error: ${msg.slice(0, 200)}`,
        last_attempt_at: new Date().toISOString(),
      }).eq('video_id', videoId);
      failed++;
    }
  }

  return { succeeded, failed, totalCostCents };
}

// ─── Normalize + Connect + Enrich + Embed ───────────────────────────────────

async function normalizeAndFinish(
  client: SupabaseClient,
  videoId: string,
  extraction: ExtractionData,
  prepared: PreparedVideo,
  modelId: string,
  costCents: number,
) {
  const { segments, metadata } = prepared;

  // ─── Normalize ─────────────────────────────────────────────────────

  // Channels
  if (metadata.channelId) {
    await client.from('channels').upsert({
      channel_id: metadata.channelId,
      channel_name: metadata.author || prepared.channelName,
      tier: prepared.tier,
    }, { onConflict: 'channel_id' });
  }

  // Video Knowledge
  const quotesMoments = extraction.moments?.filter((m: ExtractionData) => m.moment_type === 'quote') || [];
  const analogiesMoments = extraction.moments?.filter((m: ExtractionData) => m.moment_type === 'analogy') || [];
  const misconceptionsMoments = extraction.moments?.filter((m: ExtractionData) => m.moment_type === 'misconception') || [];
  const ahaMoments = extraction.moments?.filter((m: ExtractionData) => m.moment_type === 'aha_moment') || [];
  const applicationsMoments = extraction.moments?.filter((m: ExtractionData) => m.moment_type === 'application') || [];
  const questionsMoments = extraction.moments?.filter((m: ExtractionData) => m.moment_type === 'question') || [];

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
    key_moments: (extraction.moments || []).filter((m: ExtractionData) => (m.importance || 0) >= 0.7),
    raw_extraction: extraction,
    extraction_model: modelId,
    extraction_tokens_input: 0,
    extraction_tokens_output: 0,
    extraction_cost_cents: costCents,
    extraction_version: 3,
    thumbnail_url: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    transcript_word_count: segments.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0),
  }, { onConflict: 'video_id' });

  // Concepts
  const concepts = extraction.concepts || [];
  const allCanonicalNames = concepts.map((c: ExtractionData) => c.canonical_name);
  const validConceptIds = new Set(allCanonicalNames);

  const { data: existingRaw } = await client
    .from('concepts')
    .select('id, display_name, definition, aliases, domain, category, difficulty_level, video_count')
    .in('id', allCanonicalNames.length > 0 ? allCanonicalNames : ['__none__']);

  const existing = new Map(
    ((existingRaw || []) as Array<Record<string, unknown>>).map(c => [c.id as string, c])
  );

  const newConcepts: Array<Record<string, unknown>> = [];
  const updatedConcepts: Array<{ id: string; updates: Record<string, unknown> }> = [];

  for (const c of concepts) {
    const ex = existing.get(c.canonical_name);
    if (ex) {
      const mergedAliases = [...new Set([...((ex.aliases as string[]) || []), ...(c.aliases || [])])];
      const betterDef = (c.definition?.length || 0) > ((ex.definition as string)?.length || 0) ? c.definition : ex.definition;
      updatedConcepts.push({
        id: c.canonical_name,
        updates: {
          aliases: mergedAliases,
          definition: betterDef,
          video_count: ((ex.video_count as number) || 0) + 1,
          category: (ex.category as string) || c.category || null,
          difficulty_level: (ex.difficulty_level as string) || c.difficulty_level || null,
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
    await client.from('concepts').insert(newConcepts);
  }
  for (const u of updatedConcepts) {
    await client.from('concepts').update(u.updates).eq('id', u.id);
  }

  // Concept Mentions
  await client.from('concept_mentions').delete().eq('video_id', videoId);
  const mentions = concepts
    .filter((c: ExtractionData) => validConceptIds.has(c.canonical_name))
    .map((c: ExtractionData) => ({
      concept_id: c.canonical_name,
      video_id: videoId,
      mention_type: c.mention_type,
      timestamp_seconds: c.timestamp || 0,
      context_snippet: c.definition || '',
      pedagogical_approach: c.pedagogical_approach || null,
      explanation_quality: c.explanation_quality ?? EXPLANATION_QUALITY_MAP[c.mention_type] ?? 0.5,
    }));
  if (mentions.length > 0) {
    await client.from('concept_mentions').insert(mentions);
  }

  // Concept Relations
  const relations = extraction.concept_relations || [];
  for (const r of relations) {
    if (!validConceptIds.has(r.source) || !validConceptIds.has(r.target)) continue;
    await client.from('concept_relations').upsert({
      source_id: r.source,
      target_id: r.target,
      relation_type: r.relation_type,
      confidence: r.confidence ?? 0.8,
      source_video_id: videoId,
    }, { onConflict: 'source_id,target_id,relation_type' });
  }

  // Chapters
  await client.from('video_chapters').delete().eq('video_id', videoId);
  const chapters = (extraction.chapter_summaries || []).map((ch: ExtractionData, i: number) => ({
    video_id: videoId,
    chapter_index: i,
    title: ch.title,
    start_seconds: ch.start_timestamp,
    end_seconds: ch.end_timestamp || null,
    summary: ch.summary,
    concepts: ch.concepts || [],
  }));
  if (chapters.length > 0) {
    await client.from('video_chapters').insert(chapters);
  }

  // Moments
  await client.from('video_moments').delete().eq('video_id', videoId);
  const moments = (extraction.moments || []).map((m: ExtractionData) => ({
    video_id: videoId,
    moment_type: m.moment_type,
    timestamp_seconds: m.timestamp || 0,
    content: m.content,
    context: m.context || null,
    concept_ids: (m.concept_ids || []).filter((id: string) => validConceptIds.has(id)),
    importance: m.importance ?? 0.5,
    metadata: m.metadata || {},
  }));
  if (moments.length > 0) {
    await client.from('video_moments').insert(moments);
  }

  // Quiz Questions
  await client.from('quiz_questions').delete().eq('video_id', videoId);
  const quizzes = (extraction.quiz_questions || []).map((q: ExtractionData) => ({
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
    await client.from('quiz_questions').insert(quizzes);
  }

  // External References
  await client.from('external_references').delete().eq('video_id', videoId);
  const refs = (extraction.external_references || []).map((r: ExtractionData) => ({
    video_id: videoId,
    name: r.name,
    ref_type: r.ref_type,
    timestamp_seconds: r.timestamp || null,
    description: r.description || null,
    url: r.url || null,
  }));
  if (refs.length > 0) {
    await client.from('external_references').insert(refs);
  }

  // Enriched Transcripts
  await client.from('enriched_transcripts').upsert({
    video_id: videoId,
    segments,
  }, { onConflict: 'video_id' });

  await client.from('batch_progress').update({ status: 'normalized' }).eq('video_id', videoId);

  // ─── Connect (infer relations from depends_on/enables) ─────────

  for (const c of concepts) {
    for (const dep of c.depends_on || []) {
      if (!validConceptIds.has(dep)) continue;
      await client.from('concept_relations').upsert({
        source_id: dep,
        target_id: c.canonical_name,
        relation_type: 'prerequisite',
        confidence: 0.7,
        source_video_id: videoId,
      }, { onConflict: 'source_id,target_id,relation_type' });
    }
    for (const en of c.enables || []) {
      if (!validConceptIds.has(en)) continue;
      await client.from('concept_relations').upsert({
        source_id: c.canonical_name,
        target_id: en,
        relation_type: 'enables',
        confidence: 0.7,
        source_video_id: videoId,
      }, { onConflict: 'source_id,target_id,relation_type' });
    }
  }

  await client.from('batch_progress').update({ status: 'connected' }).eq('video_id', videoId);

  // ─── Enrich (build context block via RPC) ──────────────────────

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client.rpc as any)('build_context_block', { p_video_id: videoId });
    await client.from('batch_progress').update({ status: 'enriched' }).eq('video_id', videoId);
  } catch {
    log(videoId, 'ENRICH', 'context block build failed, continuing');
  }

  // ─── Mark completed (embeddings are bonus, not blocking) ──────

  await client.from('batch_progress').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    last_attempt_at: new Date().toISOString(),
  }).eq('video_id', videoId);
}

// ─── Main Worker Loop ───────────────────────────────────────────────────────

async function main() {
  const config = parseArgs();
  const client = getSupabase();
  const anthropic = getAnthropic();

  console.log(`\n=== Chalk Batch Worker ===`);
  console.log(`  Model: ${config.model}`);
  console.log(`  Batch size: ${config.batchSize}`);
  console.log(`  Poll interval: ${config.pollInterval / 1000}s`);
  console.log(`  Tier: ${config.tier}`);
  console.log(`  Mode: ${config.once ? 'single batch' : 'continuous loop'}`);
  console.log(`  Dry run: ${config.dryRun}\n`);

  let totalProcessed = 0;
  let totalCost = 0;
  let iteration = 0;

  while (true) {
    iteration++;
    log('WORKER', 'LOOP', `iteration ${iteration}`);

    // 1. Find pending videos
    const pending = await getPendingVideos(client, config.batchSize, config.tier);

    if (pending.length === 0) {
      log('WORKER', 'LOOP', 'no pending videos');
      if (config.once) break;
      log('WORKER', 'LOOP', 'sleeping 5 minutes...');
      await sleep(5 * 60_000);
      continue;
    }

    log('WORKER', 'LOOP', `${pending.length} videos to process`);

    if (config.dryRun) {
      for (const v of pending) {
        console.log(`  [dry-run] ${v.videoId} — ${v.channelName} — "${v.title}" (tier ${v.tier})`);
      }
      const estCost = pending.length * (config.model === 'opus' ? 55 : 8); // batch 50% off
      console.log(`\n  Estimated cost (batch 50% off): ~$${(estCost / 100).toFixed(2)}`);
      break;
    }

    // 2. Transcribe all videos (parallel, p-limit 2)
    log('WORKER', 'TRANSCRIBE', `transcribing ${pending.length} videos...`);
    const limit = pLimit(2);
    const prepared: PreparedVideo[] = [];

    await Promise.allSettled(
      pending.map(v =>
        limit(async () => {
          // Initialize batch_progress
          await client.from('batch_progress').upsert({
            video_id: v.videoId,
            status: 'pending',
            started_at: new Date().toISOString(),
            last_attempt_at: new Date().toISOString(),
            extraction_version: 3,
          }, { onConflict: 'video_id' });

          const result = await transcribeVideo(client, v.videoId);
          if (!result) return;

          // Format transcript
          const maxChars = 200_000;
          let formatted = result.segments
            .map(s => {
              const mins = Math.floor(s.offset / 60);
              const secs = Math.floor(s.offset % 60);
              return `[${mins}:${secs.toString().padStart(2, '0')}] ${s.text}`;
            })
            .join('\n');

          if (formatted.length > maxChars) {
            formatted = formatted.slice(0, maxChars) + '\n\n[TRANSCRIPT TRUNCATED]';
          }

          // Backfill title/author via oEmbed if missing
          if (!result.metadata.title || !result.metadata.author) {
            const oembed = await fetchVideoMetadata(v.videoId);
            if (oembed.title && !result.metadata.title) result.metadata.title = oembed.title;
            if (oembed.author && !result.metadata.author) result.metadata.author = oembed.author;
          }

          prepared.push({
            videoId: v.videoId,
            channelName: v.channelName,
            title: v.title,
            tier: v.tier,
            segments: result.segments,
            metadata: result.metadata,
            formattedTranscript: formatted,
          });

          await client.from('batch_progress').update({
            status: 'transcript_done',
            last_attempt_at: new Date().toISOString(),
          }).eq('video_id', v.videoId);
        }),
      ),
    );

    if (prepared.length === 0) {
      log('WORKER', 'TRANSCRIBE', 'no videos transcribed successfully');
      if (config.once) break;
      continue;
    }

    log('WORKER', 'TRANSCRIBE', `${prepared.length}/${pending.length} transcribed`);

    // 3. Submit batch
    const preparedMap = new Map(prepared.map(v => [v.videoId, v]));
    const batchId = await submitBatch(anthropic, client, prepared, config.model);

    // 4. Poll for completion
    const completedBatch = await pollBatch(anthropic, batchId, config.pollInterval);

    // 5. Process results
    const { succeeded, failed, totalCostCents } = await processResults(
      anthropic, client, batchId, preparedMap, config.model,
    );

    totalProcessed += succeeded;
    totalCost += totalCostCents;

    log('WORKER', 'BATCH_DONE', `${succeeded} succeeded, ${failed} failed, cost: ${totalCostCents}c ($${(totalCostCents / 100).toFixed(2)})`);
    log('WORKER', 'TOTALS', `${totalProcessed} total processed, $${(totalCost / 100).toFixed(2)} total cost`);

    if (config.once) break;

    // Brief pause between batches
    await sleep(10_000);
  }

  console.log(`\n=== Worker Summary ===`);
  console.log(`  Total processed: ${totalProcessed}`);
  console.log(`  Total cost: $${(totalCost / 100).toFixed(2)}`);
  console.log(`  Iterations: ${iteration}`);
  console.log('');
}

main().catch(err => {
  console.error('Batch worker failed:', err);
  process.exit(1);
});
