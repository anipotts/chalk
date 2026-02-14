#!/usr/bin/env npx tsx
/**
 * Batch knowledge extraction: reads video-list.json, processes sequentially.
 *
 * Usage:
 *   npx tsx scripts/extract-batch.ts [--tier 1|2|all] [--retry-failed]
 */

process.loadEnvFile('.env.local');

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { extractSingleVideo } from './extract-knowledge';

interface VideoEntry {
  videoId: string;
  channel: string;
  title: string;
}

interface VideoList {
  tier1_opus: VideoEntry[];
  tier2_sonnet: VideoEntry[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE env vars');
  return createClient(url, key);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const tierArg = args.find(a => a.startsWith('--tier'))?.split('=')[1]
    || args[args.indexOf('--tier') + 1]
    || 'all';
  const retryFailed = args.includes('--retry-failed');

  // Load video list
  const listPath = join(import.meta.dirname, 'video-list.json');
  const videoList: VideoList = JSON.parse(readFileSync(listPath, 'utf-8'));

  // Build work list based on tier
  interface WorkItem {
    videoId: string;
    channel: string;
    title: string;
    model: 'opus' | 'sonnet';
    tier: number;
  }

  const work: WorkItem[] = [];

  if (tierArg === '1' || tierArg === 'all') {
    for (const v of videoList.tier1_opus) {
      work.push({ ...v, model: 'opus', tier: 1 });
    }
  }
  if (tierArg === '2' || tierArg === 'all') {
    for (const v of videoList.tier2_sonnet) {
      work.push({ ...v, model: 'sonnet', tier: 2 });
    }
  }

  if (work.length === 0) {
    console.error('No videos to process. Check --tier argument.');
    process.exit(1);
  }

  console.log(`\n=== Batch Extraction: ${work.length} videos (tier: ${tierArg}) ===\n`);

  // Check existing progress
  const client = getClient();
  const videoIds = work.map(w => w.videoId);
  const { data: progressData } = await client
    .from('batch_progress')
    .select('video_id, status')
    .in('video_id', videoIds);

  const statusMap = new Map(
    ((progressData || []) as Array<{ video_id: string; status: string }>)
      .map(p => [p.video_id, p.status])
  );

  // Filter work
  const filtered = work.filter(w => {
    const status = statusMap.get(w.videoId);
    if (status === 'completed') {
      console.log(`  skip: ${w.videoId} (${w.channel}) — already completed`);
      return false;
    }
    if (status === 'failed' && !retryFailed) {
      console.log(`  skip: ${w.videoId} (${w.channel}) — failed (use --retry-failed)`);
      return false;
    }
    return true;
  });

  // Reset failed videos if requested
  if (retryFailed) {
    for (const w of filtered) {
      if (statusMap.get(w.videoId) === 'failed') {
        await client.from('batch_progress').update({
          status: 'pending',
          error_message: null,
        }).eq('video_id', w.videoId);
        console.log(`  reset: ${w.videoId} (${w.channel}) — failed → pending`);
      }
    }
  }

  console.log(`\n  Processing ${filtered.length} of ${work.length} videos\n`);

  // Process sequentially
  let succeeded = 0;
  let failed = 0;
  let totalCost = 0;
  const failedIds: string[] = [];

  for (let i = 0; i < filtered.length; i++) {
    const w = filtered[i];
    const num = `[${i + 1}/${filtered.length}]`;

    console.log(`${num} ${w.channel} — "${w.title}" (${w.model})`);

    const result = await extractSingleVideo(w.videoId, {
      model: w.model,
      channelTier: w.tier,
    });

    if (result.success) {
      succeeded++;
      totalCost += result.costCents;
      console.log(`${num} ✓ ${Math.round(result.durationMs / 1000)}s | ${result.concepts} concepts, ${result.moments} moments | ${result.costCents}¢\n`);
    } else {
      failed++;
      failedIds.push(w.videoId);
      totalCost += result.costCents;
      console.log(`${num} ✗ FAILED after ${Math.round(result.durationMs / 1000)}s\n`);
    }

    // Rate limit: 2s between API calls
    if (i < filtered.length - 1) {
      await sleep(2000);
    }
  }

  // Summary
  console.log('\n=== Batch Summary ===');
  console.log(`  Processed: ${filtered.length}`);
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  Total cost: ${totalCost}¢ ($${(totalCost / 100).toFixed(2)})`);

  // Save failed IDs
  if (failedIds.length > 0) {
    const failedPath = join(import.meta.dirname, 'failed-videos.json');
    writeFileSync(failedPath, JSON.stringify(failedIds, null, 2));
    console.log(`\n  Failed IDs saved to ${failedPath}`);
    console.log(`  Re-run with --retry-failed to retry`);
  }

  console.log('');
}

main().catch(err => {
  console.error('Batch failed:', err);
  process.exit(1);
});
