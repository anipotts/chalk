#!/usr/bin/env npx tsx
/**
 * Cross-video linking via inverted concept index.
 * Builds a concept -> video map, generates pairs from shared concepts,
 * and classifies relationships using tiered heuristics + LLM.
 *
 * Run AFTER batch extraction.
 *
 * Usage:
 *   npx tsx scripts/link-videos.ts
 *   npx tsx scripts/link-videos.ts --dry-run
 */

process.loadEnvFile('.env.local');

import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pLimit from 'p-limit';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const LLM_CONCURRENCY = 3;
const LLM_MODEL = 'claude-sonnet-4-5-20250929';

/** Tier thresholds for shared concept counts */
const STRONG_THRESHOLD = 5;   // 5+ shared concepts -> strongly_related (no LLM)
const MEDIUM_MIN = 3;         // 3-4 shared concepts -> LLM classifies
// 1-2 shared concepts -> tangentially_related (no LLM)

const DRY_RUN = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE env vars');
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VideoInfo {
  title: string;
  summary: string | null;
  difficulty: string | null;
}

interface PairData {
  videoA: string;
  videoB: string;
  sharedConcepts: string[];  // concept display_names
  sharedConceptIds: string[]; // concept IDs
}

type Tier = 'strong' | 'medium' | 'tangential';

interface ClassifiedPair extends PairData {
  tier: Tier;
  relationship: string;
  confidence: number;
  reason: string;
}

const VALID_RELATIONSHIPS = [
  'prerequisite', 'follow_up', 'related', 'deeper_dive',
  'alternative_explanation', 'builds_on', 'contrasts',
] as const;

// ---------------------------------------------------------------------------
// Step 1: Build concept -> video inverted index
// ---------------------------------------------------------------------------

async function buildConceptVideoIndex(client: SupabaseClient): Promise<Map<string, Set<string>>> {
  const { data: mentionsRaw, error } = await client
    .from('concept_mentions')
    .select('concept_id, video_id');

  if (error) throw new Error(`Failed to fetch concept_mentions: ${error.message}`);
  if (!mentionsRaw || mentionsRaw.length === 0) return new Map();

  const conceptToVideos = new Map<string, Set<string>>();
  for (const m of mentionsRaw as Array<{ concept_id: string; video_id: string }>) {
    let videos = conceptToVideos.get(m.concept_id);
    if (!videos) {
      videos = new Set();
      conceptToVideos.set(m.concept_id, videos);
    }
    videos.add(m.video_id);
  }

  return conceptToVideos;
}

// ---------------------------------------------------------------------------
// Step 2: Generate pairs from shared concepts (inverted index approach)
// ---------------------------------------------------------------------------

async function generatePairsFromIndex(
  conceptToVideos: Map<string, Set<string>>,
  client: SupabaseClient,
): Promise<{ pairs: Map<string, PairData>; videoInfoMap: Map<string, VideoInfo> }> {
  // Fetch concept display names
  const conceptIds = [...conceptToVideos.keys()];
  const conceptNameMap = new Map<string, string>();

  // Batch fetch in chunks of 500 (Supabase `.in()` limit)
  for (let i = 0; i < conceptIds.length; i += 500) {
    const chunk = conceptIds.slice(i, i + 500);
    const { data } = await client
      .from('concepts')
      .select('id, display_name')
      .in('id', chunk);

    if (data) {
      for (const c of data as Array<{ id: string; display_name: string }>) {
        conceptNameMap.set(c.id, c.display_name);
      }
    }
  }

  // Build pair map: "vidA:vidB" -> PairData
  // Sort pair key alphabetically so A:B and B:A collapse to same key
  const pairMap = new Map<string, PairData>();

  for (const [conceptId, videoSet] of conceptToVideos) {
    if (videoSet.size < 2) continue;

    const videos = [...videoSet].sort();
    const conceptName = conceptNameMap.get(conceptId) || conceptId;

    for (let i = 0; i < videos.length; i++) {
      for (let j = i + 1; j < videos.length; j++) {
        const key = `${videos[i]}:${videos[j]}`;
        let pair = pairMap.get(key);
        if (!pair) {
          pair = {
            videoA: videos[i],
            videoB: videos[j],
            sharedConcepts: [],
            sharedConceptIds: [],
          };
          pairMap.set(key, pair);
        }
        pair.sharedConcepts.push(conceptName);
        pair.sharedConceptIds.push(conceptId);
      }
    }
  }

  // Fetch video info for all videos in pairs
  const allVideoIds = new Set<string>();
  for (const pair of pairMap.values()) {
    allVideoIds.add(pair.videoA);
    allVideoIds.add(pair.videoB);
  }

  const videoInfoMap = new Map<string, VideoInfo>();
  const videoIdArray = [...allVideoIds];

  for (let i = 0; i < videoIdArray.length; i += 500) {
    const chunk = videoIdArray.slice(i, i + 500);
    const { data } = await client
      .from('video_knowledge')
      .select('video_id, title, summary, difficulty')
      .in('video_id', chunk);

    if (data) {
      for (const v of data as Array<{ video_id: string; title: string; summary: string | null; difficulty: string | null }>) {
        videoInfoMap.set(v.video_id, {
          title: v.title,
          summary: v.summary,
          difficulty: v.difficulty,
        });
      }
    }
  }

  return { pairs: pairMap, videoInfoMap };
}

// ---------------------------------------------------------------------------
// Step 3: Tiered classification
// ---------------------------------------------------------------------------

function classifyTier(sharedCount: number): Tier {
  if (sharedCount >= STRONG_THRESHOLD) return 'strong';
  if (sharedCount >= MEDIUM_MIN) return 'medium';
  return 'tangential';
}

async function classifyWithLLM(
  pair: PairData,
  videoInfoMap: Map<string, VideoInfo>,
): Promise<{ relationship: string; confidence: number; reason: string }> {
  const infoA = videoInfoMap.get(pair.videoA);
  const infoB = videoInfoMap.get(pair.videoB);

  const titleA = infoA?.title || pair.videoA;
  const titleB = infoB?.title || pair.videoB;

  const prompt = `Classify the relationship between these two educational videos.

VIDEO A: "${titleA}"
${infoA?.summary ? `Summary: ${infoA.summary}` : ''}
${infoA?.difficulty ? `Difficulty: ${infoA.difficulty}` : ''}

VIDEO B: "${titleB}"
${infoB?.summary ? `Summary: ${infoB.summary}` : ''}
${infoB?.difficulty ? `Difficulty: ${infoB.difficulty}` : ''}

Shared concepts: ${pair.sharedConcepts.join(', ')}

What is the relationship from A to B? Choose ONE:
- prerequisite: A should be watched before B
- follow_up: B is a natural continuation of A
- deeper_dive: B goes deeper into A's topics
- alternative_explanation: B explains the same thing differently
- builds_on: B builds on A's concepts
- contrasts: B offers a contrasting perspective
- related: Generally related but no strong directional relationship

Respond with ONLY a JSON object: {"relationship": "...", "confidence": 0.0-1.0, "reason": "one sentence"}`;

  const result = await generateText({
    model: anthropic(LLM_MODEL),
    prompt,
    maxOutputTokens: 200,
  });

  const text = result.text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON in LLM response');
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    relationship: string;
    confidence: number;
    reason: string;
  };

  if (!(VALID_RELATIONSHIPS as readonly string[]).includes(parsed.relationship)) {
    throw new Error(`Invalid relationship: ${parsed.relationship}`);
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Step 4: Upsert bidirectional links
// ---------------------------------------------------------------------------

async function upsertBidirectionalLinks(
  client: SupabaseClient,
  classified: ClassifiedPair,
  videoInfoMap: Map<string, VideoInfo>,
): Promise<void> {
  const { videoA, videoB, sharedConcepts, relationship, confidence } = classified;

  // Forward link: A -> B
  await client.from('cross_video_links').upsert({
    source_video_id: videoA,
    target_video_id: videoB,
    relationship,
    shared_concepts: sharedConcepts,
    reason: classified.reason,
    confidence,
  }, { onConflict: 'source_video_id,target_video_id,relationship' });

  // Reverse link: B -> A
  // For prerequisite, the reverse is follow_up. For everything else, same type.
  let reverseRelationship = relationship;
  if (relationship === 'prerequisite') {
    reverseRelationship = 'follow_up';
  } else if (relationship === 'follow_up') {
    reverseRelationship = 'prerequisite';
  }

  await client.from('cross_video_links').upsert({
    source_video_id: videoB,
    target_video_id: videoA,
    relationship: reverseRelationship,
    shared_concepts: sharedConcepts,
    reason: classified.reason,
    confidence,
  }, { onConflict: 'source_video_id,target_video_id,relationship' });
}

// ---------------------------------------------------------------------------
// Step 5: Update evidence_count on concept_relations
// ---------------------------------------------------------------------------

async function updateEvidenceCounts(
  client: SupabaseClient,
  pair: ClassifiedPair,
): Promise<void> {
  const conceptIds = pair.sharedConceptIds;
  const sharedCount = conceptIds.length;

  if (conceptIds.length === 0) return;

  // Build comma-separated list for the .in() filter
  // Update evidence_count for concept_relations where source or target is a shared concept
  const idList = conceptIds.map(id => `"${id}"`).join(',');

  await client
    .from('concept_relations')
    .update({ evidence_count: sharedCount })
    .or(`source_id.in.(${idList}),target_id.in.(${idList})`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const client = getClient();
  const limit = pLimit(LLM_CONCURRENCY);

  console.log('\n=== Cross-Video Linking (Inverted Index) ===\n');
  if (DRY_RUN) {
    console.log('[DRY RUN] No LLM calls or DB writes will be made.\n');
  }

  // Step 1: Build inverted index
  console.log('Building concept -> video index...');
  const conceptToVideos = await buildConceptVideoIndex(client);

  if (conceptToVideos.size === 0) {
    console.log('No concept mentions found. Run extraction first.');
    return;
  }

  const multiVideoConcepts = [...conceptToVideos.entries()].filter(([, v]) => v.size >= 2);
  console.log(`  ${conceptToVideos.size} total concepts, ${multiVideoConcepts.length} shared across 2+ videos`);

  // Step 2: Generate pairs
  console.log('Generating video pairs from shared concepts...');
  const { pairs, videoInfoMap } = await generatePairsFromIndex(conceptToVideos, client);

  if (pairs.size === 0) {
    console.log('No video pairs found sharing concepts.');
    return;
  }

  // Sort pairs by shared concept count descending for logging
  const sortedPairs = [...pairs.values()].sort(
    (a, b) => b.sharedConcepts.length - a.sharedConcepts.length,
  );

  // Classify into tiers
  const tierCounts = { strong: 0, medium: 0, tangential: 0 };
  const tierPairs: Record<Tier, PairData[]> = { strong: [], medium: [], tangential: [] };

  for (const pair of sortedPairs) {
    const tier = classifyTier(pair.sharedConcepts.length);
    tierCounts[tier]++;
    tierPairs[tier].push(pair);
  }

  console.log(`  ${pairs.size} total pairs:`);
  console.log(`    Strong (${STRONG_THRESHOLD}+ concepts):  ${tierCounts.strong} pairs -> auto-classify as "related" (0.95)`);
  console.log(`    Medium (${MEDIUM_MIN}-${STRONG_THRESHOLD - 1} concepts):  ${tierCounts.medium} pairs -> LLM classification`);
  console.log(`    Tangential (1-${MEDIUM_MIN - 1} concepts): ${tierCounts.tangential} pairs -> auto-classify as "related" (0.3)`);

  if (DRY_RUN) {
    // Show top pairs per tier
    console.log('\n--- Top Strong Pairs ---');
    for (const pair of tierPairs.strong.slice(0, 10)) {
      const titleA = videoInfoMap.get(pair.videoA)?.title || pair.videoA;
      const titleB = videoInfoMap.get(pair.videoB)?.title || pair.videoB;
      console.log(`  [${pair.sharedConcepts.length}] ${titleA} <-> ${titleB}`);
      console.log(`       Concepts: ${pair.sharedConcepts.slice(0, 5).join(', ')}${pair.sharedConcepts.length > 5 ? '...' : ''}`);
    }

    console.log('\n--- Top Medium Pairs (would call LLM) ---');
    for (const pair of tierPairs.medium.slice(0, 10)) {
      const titleA = videoInfoMap.get(pair.videoA)?.title || pair.videoA;
      const titleB = videoInfoMap.get(pair.videoB)?.title || pair.videoB;
      console.log(`  [${pair.sharedConcepts.length}] ${titleA} <-> ${titleB}`);
      console.log(`       Concepts: ${pair.sharedConcepts.join(', ')}`);
    }

    console.log('\n--- Top Tangential Pairs ---');
    for (const pair of tierPairs.tangential.slice(0, 10)) {
      const titleA = videoInfoMap.get(pair.videoA)?.title || pair.videoA;
      const titleB = videoInfoMap.get(pair.videoB)?.title || pair.videoB;
      console.log(`  [${pair.sharedConcepts.length}] ${titleA} <-> ${titleB}`);
    }

    console.log(`\nEstimated LLM calls: ${tierCounts.medium}`);
    console.log('[DRY RUN] Exiting without changes.\n');
    return;
  }

  // Step 3: Process tiers

  let linkedCount = 0;
  let llmCalls = 0;
  let llmErrors = 0;
  let totalCost = 0;

  // --- Strong tier: auto-classify ---
  console.log(`\nProcessing ${tierCounts.strong} strong pairs...`);
  for (const pair of tierPairs.strong) {
    const classified: ClassifiedPair = {
      ...pair,
      tier: 'strong',
      relationship: 'related',
      confidence: 0.95,
      reason: `Strongly related: ${pair.sharedConcepts.length} shared concepts`,
    };

    await upsertBidirectionalLinks(client, classified, videoInfoMap);
    await updateEvidenceCounts(client, classified);
    linkedCount++;

    const titleA = videoInfoMap.get(pair.videoA)?.title || pair.videoA;
    const titleB = videoInfoMap.get(pair.videoB)?.title || pair.videoB;
    console.log(`  [strong] ${titleA} <-> ${titleB} (${pair.sharedConcepts.length} concepts)`);
  }

  // --- Medium tier: LLM classification with concurrency ---
  console.log(`\nProcessing ${tierCounts.medium} medium pairs (LLM, concurrency ${LLM_CONCURRENCY})...`);

  const mediumResults = await Promise.allSettled(
    tierPairs.medium.map(pair =>
      limit(async () => {
        const titleA = videoInfoMap.get(pair.videoA)?.title || pair.videoA;
        const titleB = videoInfoMap.get(pair.videoB)?.title || pair.videoB;

        try {
          const llmResult = await classifyWithLLM(pair, videoInfoMap);
          llmCalls++;

          const classified: ClassifiedPair = {
            ...pair,
            tier: 'medium',
            relationship: llmResult.relationship,
            confidence: llmResult.confidence,
            reason: llmResult.reason,
          };

          await upsertBidirectionalLinks(client, classified, videoInfoMap);
          await updateEvidenceCounts(client, classified);
          linkedCount++;

          console.log(`  [llm] ${titleA} <-> ${titleB}: ${llmResult.relationship} (${llmResult.confidence}) - ${llmResult.reason}`);
          return classified;
        } catch (err) {
          llmErrors++;
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`  [llm-error] ${titleA} <-> ${titleB}: ${msg}`);
          throw err;
        }
      }),
    ),
  );

  // Count cost from successful LLM calls
  // (Cost estimation is approximate; the AI SDK doesn't always expose usage in generateText)
  const successCount = mediumResults.filter(r => r.status === 'fulfilled').length;

  // --- Tangential tier: auto-classify ---
  console.log(`\nProcessing ${tierCounts.tangential} tangential pairs...`);
  for (const pair of tierPairs.tangential) {
    const classified: ClassifiedPair = {
      ...pair,
      tier: 'tangential',
      relationship: 'related',
      confidence: 0.3,
      reason: `Tangentially related: ${pair.sharedConcepts.length} shared concept${pair.sharedConcepts.length === 1 ? '' : 's'}`,
    };

    await upsertBidirectionalLinks(client, classified, videoInfoMap);
    await updateEvidenceCounts(client, classified);
    linkedCount++;
  }
  console.log(`  Wrote ${tierCounts.tangential} tangential links`);

  // Summary
  console.log(`\n=== Linking Summary ===`);
  console.log(`  Total pairs processed: ${sortedPairs.length}`);
  console.log(`  Links created (bidirectional): ${linkedCount * 2}`);
  console.log(`  Strong (auto):     ${tierCounts.strong}`);
  console.log(`  Medium (LLM):      ${successCount} classified, ${llmErrors} errors`);
  console.log(`  Tangential (auto): ${tierCounts.tangential}`);
  console.log(`  LLM calls made:    ${llmCalls}`);
  console.log('');
}

main().catch(err => {
  console.error('Linking failed:', err);
  process.exit(1);
});
