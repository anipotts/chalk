#!/usr/bin/env npx tsx
/**
 * LaTeX enrichment for math channel transcripts.
 * Post-processing step: converts spoken math to LaTeX using Haiku.
 *
 * Usage:
 *   npx tsx scripts/enrich-transcripts-latex.ts [--limit 5]
 */

process.loadEnvFile('.env.local');

import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { createClient } from '@supabase/supabase-js';
import { MATH_CHANNEL_IDS } from '../lib/batch/channel-registry';

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE env vars');
  return createClient(url, key);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Patterns that suggest math content
const MATH_PATTERNS = /(?:equals|squared|cubed|derivative|integral|matrix|vector|function|equation|sum of|product of|limit|infinity|square root|fraction|logarithm|exponential|sine|cosine|tangent|gradient|divergence|laplacian|probability|variance|standard deviation|x squared|x to the|over (?:two|three|four|n)|pi|sigma|theta|lambda|alpha|beta|delta)/i;

interface TranscriptSegment {
  text: string;
  offset: number;
  duration: number;
  latex?: string;
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find(a => a.startsWith('--limit'))?.split('=')[1]
    || args[args.indexOf('--limit') + 1];
  const maxVideos = limitArg ? parseInt(limitArg) : Infinity;

  const client = getClient();

  console.log('\n=== LaTeX Enrichment for Math Channels ===\n');

  // Get completed math videos
  const { data: videosRaw } = await client
    .from('video_knowledge')
    .select('video_id, title, channel_id')
    .in('channel_id', [...MATH_CHANNEL_IDS]);

  if (!videosRaw || videosRaw.length === 0) {
    console.log('No math channel videos found.');
    return;
  }

  const videos = (videosRaw as Array<{ video_id: string; title: string; channel_id: string }>)
    .slice(0, maxVideos);

  console.log(`Found ${videos.length} math channel videos to enrich\n`);

  let enrichedCount = 0;
  let totalCost = 0;

  for (const video of videos) {
    // Load transcript segments
    const { data: transcriptRaw } = await client
      .from('enriched_transcripts')
      .select('segments')
      .eq('video_id', video.video_id)
      .single();

    if (!transcriptRaw) {
      console.log(`  skip: ${video.title} — no transcript`);
      continue;
    }

    const segments = (transcriptRaw as { segments: TranscriptSegment[] }).segments;

    // Filter segments with math-like content
    const mathSegments = segments.filter(s => MATH_PATTERNS.test(s.text));

    if (mathSegments.length === 0) {
      console.log(`  skip: ${video.title} — no math segments detected`);
      continue;
    }

    console.log(`  ${video.title}: ${mathSegments.length} math segments`);

    // Batch segments into groups of ~20 for Haiku calls
    const batchSize = 20;
    const enrichedMap = new Map<number, string>();

    for (let i = 0; i < mathSegments.length; i += batchSize) {
      const batch = mathSegments.slice(i, i + batchSize);
      const prompt = `Convert spoken math to LaTeX. Return a JSON array of objects with "offset" (number) and "latex" (string).
Only include entries where there IS math to convert. Do NOT convert plain text.

Segments:
${batch.map(s => `[${s.offset}] ${s.text}`).join('\n')}

Return ONLY the JSON array, no other text.`;

      try {
        const result = await generateText({
          model: anthropic('claude-haiku-4-5-20251001'),
          prompt,
          maxOutputTokens: 2000,
        });

        const usage = result.usage || { inputTokens: 0, outputTokens: 0 };
        totalCost += Math.round(((usage.inputTokens || 0) * 80 + (usage.outputTokens || 0) * 400) / 1_000_000);

        // Parse response
        const jsonMatch = result.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as Array<{ offset: number; latex: string }>;
          for (const p of parsed) {
            enrichedMap.set(p.offset, p.latex);
          }
        }
      } catch (err) {
        console.log(`    batch ${i} failed: ${err instanceof Error ? err.message : err}`);
      }

      await sleep(500);
    }

    if (enrichedMap.size === 0) {
      console.log(`    no LaTeX generated`);
      continue;
    }

    // Update segments with LaTeX
    const updatedSegments = segments.map(s => {
      const latex = enrichedMap.get(s.offset);
      return latex ? { ...s, latex } : s;
    });

    // Write back
    await client.from('enriched_transcripts').update({
      segments: updatedSegments,
      enriched_at: new Date().toISOString(),
    }).eq('video_id', video.video_id);

    enrichedCount++;
    console.log(`    ✓ ${enrichedMap.size} segments enriched with LaTeX`);
  }

  console.log(`\n=== LaTeX Enrichment Summary ===`);
  console.log(`  Videos enriched: ${enrichedCount}`);
  console.log(`  Total cost: ${totalCost}¢ ($${(totalCost / 100).toFixed(2)})`);
  console.log('');
}

main().catch(err => {
  console.error('LaTeX enrichment failed:', err);
  process.exit(1);
});
