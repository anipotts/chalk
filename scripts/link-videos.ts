#!/usr/bin/env npx tsx
/**
 * Cross-video linking: finds videos sharing concepts, asks Sonnet to classify relationships.
 * Run AFTER batch extraction.
 *
 * Usage:
 *   npx tsx scripts/link-videos.ts
 */

process.loadEnvFile('.env.local');

import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { createClient } from '@supabase/supabase-js';

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE env vars');
  return createClient(url, key);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface VideoPair {
  sourceId: string;
  targetId: string;
  sourceTitle: string;
  targetTitle: string;
  sharedConcepts: string[];
}

async function main() {
  const client = getClient();

  console.log('\n=== Cross-Video Linking ===\n');

  // 1. Fetch all concept mentions grouped by video
  const { data: mentionsRaw } = await client
    .from('concept_mentions')
    .select('concept_id, video_id');

  if (!mentionsRaw || mentionsRaw.length === 0) {
    console.log('No concept mentions found. Run extraction first.');
    return;
  }

  const mentions = mentionsRaw as Array<{ concept_id: string; video_id: string }>;

  // Build video → concepts map
  const videoConceptsMap = new Map<string, Set<string>>();
  for (const m of mentions) {
    if (!videoConceptsMap.has(m.video_id)) {
      videoConceptsMap.set(m.video_id, new Set());
    }
    videoConceptsMap.get(m.video_id)!.add(m.concept_id);
  }

  const videoIds = [...videoConceptsMap.keys()];
  console.log(`Found ${videoIds.length} videos with concept mentions`);

  // Fetch video titles
  const { data: titlesRaw } = await client
    .from('video_knowledge')
    .select('video_id, title, summary, difficulty')
    .in('video_id', videoIds);

  const titleMap = new Map(
    ((titlesRaw || []) as Array<{ video_id: string; title: string; summary: string; difficulty: string }>)
      .map(v => [v.video_id, v])
  );

  // 2. Find pairs sharing >= 2 concepts
  const pairs: VideoPair[] = [];

  for (let i = 0; i < videoIds.length; i++) {
    for (let j = i + 1; j < videoIds.length; j++) {
      const a = videoIds[i];
      const b = videoIds[j];
      const conceptsA = videoConceptsMap.get(a)!;
      const conceptsB = videoConceptsMap.get(b)!;

      const shared: string[] = [];
      for (const c of conceptsA) {
        if (conceptsB.has(c)) shared.push(c);
      }

      if (shared.length >= 2) {
        pairs.push({
          sourceId: a,
          targetId: b,
          sourceTitle: titleMap.get(a)?.title || a,
          targetTitle: titleMap.get(b)?.title || b,
          sharedConcepts: shared,
        });
      }
    }
  }

  // Sort by shared concept count descending
  pairs.sort((a, b) => b.sharedConcepts.length - a.sharedConcepts.length);

  console.log(`Found ${pairs.length} pairs sharing >= 2 concepts`);

  if (pairs.length === 0) {
    console.log('No pairs to link.');
    return;
  }

  // 3. Ask Sonnet to classify top pairs (limit to 50 pairs max)
  const topPairs = pairs.slice(0, 50);
  let classified = 0;
  let totalCost = 0;

  for (const pair of topPairs) {
    const sourceInfo = titleMap.get(pair.sourceId);
    const targetInfo = titleMap.get(pair.targetId);

    const prompt = `Classify the relationship between these two educational videos.

VIDEO A: "${pair.sourceTitle}"
${sourceInfo?.summary ? `Summary: ${sourceInfo.summary}` : ''}
${sourceInfo?.difficulty ? `Difficulty: ${sourceInfo.difficulty}` : ''}

VIDEO B: "${pair.targetTitle}"
${targetInfo?.summary ? `Summary: ${targetInfo.summary}` : ''}
${targetInfo?.difficulty ? `Difficulty: ${targetInfo.difficulty}` : ''}

Shared concepts: ${pair.sharedConcepts.join(', ')}

What is the relationship from A → B? Choose ONE:
- prerequisite: A should be watched before B
- follow_up: B is a natural continuation of A
- deeper_dive: B goes deeper into A's topics
- alternative_explanation: B explains the same thing differently
- builds_on: B builds on A's concepts
- contrasts: B offers a contrasting perspective
- related: Generally related but no strong directional relationship

Respond with ONLY a JSON object: {"relationship": "...", "confidence": 0.0-1.0, "reason": "one sentence"}`;

    try {
      const result = await generateText({
        model: anthropic('claude-sonnet-4-5-20250929'),
        prompt,
        maxOutputTokens: 200,
      });

      const usage = result.usage || { inputTokens: 0, outputTokens: 0 };
      const cost = Math.round(((usage.inputTokens || 0) * 300 + (usage.outputTokens || 0) * 1500) / 1_000_000);
      totalCost += cost;

      // Parse response
      const text = result.text.trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log(`  skip: ${pair.sourceTitle} → ${pair.targetTitle} (no JSON in response)`);
        continue;
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        relationship: string;
        confidence: number;
        reason: string;
      };

      const validRelationships = [
        'prerequisite', 'follow_up', 'related', 'deeper_dive',
        'alternative_explanation', 'builds_on', 'contrasts',
      ];

      if (!validRelationships.includes(parsed.relationship)) {
        console.log(`  skip: ${pair.sourceTitle} → ${pair.targetTitle} (invalid: ${parsed.relationship})`);
        continue;
      }

      // Upsert cross_video_link
      await client.from('cross_video_links').upsert({
        source_video_id: pair.sourceId,
        target_video_id: pair.targetId,
        relationship: parsed.relationship,
        shared_concepts: pair.sharedConcepts,
        reason: parsed.reason,
        confidence: parsed.confidence,
      }, { onConflict: 'source_video_id,target_video_id,relationship' });

      classified++;
      console.log(`  ✓ ${pair.sourceTitle} → ${pair.targetTitle}: ${parsed.relationship} (${parsed.confidence})`);

      // Strengthen concept relations: increment evidence_count for shared concepts
      for (const conceptId of pair.sharedConcepts) {
        // Increment evidence_count for relations involving this concept
        await client
          .from('concept_relations')
          .update({ evidence_count: 2 }) // At least 2 videos support this
          .or(`source_id.eq.${conceptId},target_id.eq.${conceptId}`)
          .gt('evidence_count', 0);
      }
    } catch (err) {
      console.log(`  ✗ ${pair.sourceTitle} → ${pair.targetTitle}: ${err instanceof Error ? err.message : err}`);
    }

    await sleep(1000);
  }

  console.log(`\n=== Linking Summary ===`);
  console.log(`  Classified: ${classified} / ${topPairs.length}`);
  console.log(`  Total cost: ${totalCost}¢ ($${(totalCost / 100).toFixed(2)})`);
  console.log('');
}

main().catch(err => {
  console.error('Linking failed:', err);
  process.exit(1);
});
