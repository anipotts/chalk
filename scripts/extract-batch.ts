#!/usr/bin/env npx tsx
/**
 * Batch knowledge extraction: reads video-manifest.json (from discover-videos.ts),
 * processes with p-limit parallel concurrency.
 * Includes pre-flight validation, cost estimates, and post-run verification.
 *
 * Usage:
 *   npx tsx scripts/extract-batch.ts [--tier 1|2|3|4|all] [--concurrency N] [--retry-failed] [--dry-run]
 *   npx tsx scripts/extract-batch.ts --batch-api [--tier 1|2|3|4|all] [--model opus|sonnet]
 *
 * The --batch-api flag delegates to the batch-worker.ts script which uses the
 * Anthropic Message Batches API for 50% cost reduction. It runs a single batch
 * then exits (equivalent to batch-worker.ts --once).
 */

process.loadEnvFile('.env.local');

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
const __scripts_dir = (typeof __dirname !== 'undefined' ? __dirname : null)
  ?? dirname(fileURLToPath(import.meta.url));
import pLimit from 'p-limit';
import { extractSingleVideo } from './extract-knowledge';
import type { VideoManifestEntry } from '../lib/batch/types';

// Legacy format for backward compat with video-list.json
interface VideoEntry {
  videoId: string;
  channel: string;
  title: string;
}

interface VideoList {
  demo_opus: VideoEntry[];
  tier2_sonnet: VideoEntry[];
}

// Cost estimates per video (cents) — tier-based estimation
const EST_COST = { opus: 109, sonnet: 16 } as const;
// Time estimates per video (seconds)
const EST_TIME = { opus: 180, sonnet: 60 } as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Pre-Flight Validation ──────────────────────────────────────────────────

interface WorkItem {
  videoId: string;
  channel: string;
  title: string;
  model: 'opus' | 'sonnet';
  tier: string;
}

async function preflight(work: WorkItem[]): Promise<boolean> {
  console.log('\n--- Pre-Flight Validation ---\n');
  let ok = true;

  // 1. Video ID format check
  const badIds = work.filter(w => w.videoId.length !== 11);
  if (badIds.length > 0) {
    console.log(`  FAIL: ${badIds.length} video IDs are not 11 characters:`);
    for (const b of badIds) console.log(`        ${b.videoId} (${b.channel})`);
    ok = false;
  } else {
    console.log(`  OK: All ${work.length} video IDs are 11 characters`);
  }

  // 2. Required env vars
  const required = ['ANTHROPIC_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL'];
  const recommended = ['SUPABASE_SERVICE_ROLE_KEY', 'VOYAGE_API_KEY'];
  for (const key of required) {
    if (!process.env[key]) {
      console.log(`  FAIL: Missing required env var ${key}`);
      ok = false;
    } else {
      console.log(`  OK: ${key} is set`);
    }
  }
  for (const key of recommended) {
    if (!process.env[key]) {
      console.log(`  WARN: Missing recommended env var ${key} (non-fatal)`);
    } else {
      console.log(`  OK: ${key} is set`);
    }
  }

  // 3. Supabase connection
  try {
    const client = getClient();
    const { error } = await client.from('batch_progress').select('video_id').limit(1);
    if (error) throw error;
    console.log('  OK: Supabase connection works');
  } catch (err) {
    console.log(`  FAIL: Supabase connection failed: ${err instanceof Error ? err.message : err}`);
    ok = false;
  }

  // 4. Anthropic API ping
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (resp.ok) {
      console.log('  OK: Anthropic API responds');
    } else {
      const text = await resp.text();
      console.log(`  FAIL: Anthropic API error ${resp.status}: ${text.slice(0, 100)}`);
      ok = false;
    }
  } catch (err) {
    console.log(`  FAIL: Anthropic API unreachable: ${err instanceof Error ? err.message : err}`);
    ok = false;
  }

  // 5. Voyage API ping (non-fatal)
  if (process.env.VOYAGE_API_KEY) {
    try {
      const resp = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'voyage-3-large',
          input: ['test'],
          input_type: 'document',
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (resp.ok) {
        console.log('  OK: Voyage API responds');
      } else {
        console.log(`  WARN: Voyage API error ${resp.status} (embeddings will be skipped)`);
      }
    } catch {
      console.log('  WARN: Voyage API unreachable (embeddings will be skipped)');
    }
  }

  console.log('');
  return ok;
}

// ─── Post-Run Verification ──────────────────────────────────────────────────

async function postRunSummary(client: SupabaseClient) {
  console.log('\n--- Post-Run Verification ---\n');

  // Table row counts
  const tables = [
    'video_knowledge', 'concepts', 'concept_mentions', 'concept_relations',
    'video_chapters', 'video_moments', 'quiz_questions', 'knowledge_embeddings',
  ];

  for (const table of tables) {
    const { count, error } = await client
      .from(table)
      .select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`  ${table}: ERROR (${error.message})`);
    } else {
      console.log(`  ${table}: ${count} rows`);
    }
  }

  // Flag videos with 0 moments or 0 quizzes (truncation indicator)
  console.log('\n  --- Truncation Check ---');
  const { data: videos } = await client
    .from('video_knowledge')
    .select('video_id, title');

  if (videos) {
    for (const v of videos as Array<{ video_id: string; title: string }>) {
      const { count: momentCount } = await client
        .from('video_moments')
        .select('*', { count: 'exact', head: true })
        .eq('video_id', v.video_id);

      const { count: quizCount } = await client
        .from('quiz_questions')
        .select('*', { count: 'exact', head: true })
        .eq('video_id', v.video_id);

      if ((momentCount || 0) === 0 || (quizCount || 0) === 0) {
        console.log(`  WARNING: ${v.video_id} "${v.title}" — ${momentCount || 0} moments, ${quizCount || 0} quizzes`);
      }
    }
  }

  // Embedding coverage
  const { count: totalConcepts } = await client
    .from('concepts')
    .select('*', { count: 'exact', head: true });
  const { count: embeddedConcepts } = await client
    .from('concepts')
    .select('*', { count: 'exact', head: true })
    .not('embedding', 'is', null);

  const pct = totalConcepts ? Math.round(((embeddedConcepts || 0) / totalConcepts) * 100) : 0;
  console.log(`\n  Embedding coverage: ${embeddedConcepts || 0}/${totalConcepts || 0} concepts (${pct}%)`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // --batch-api flag: delegate to batch-worker.ts --once
  if (args.includes('--batch-api')) {
    const tierArg = args.find(a => a.startsWith('--tier'))?.split('=')[1]
      || (args.includes('--tier') ? args[args.indexOf('--tier') + 1] : null)
      || 'all';
    const modelArg = args.find(a => a.startsWith('--model'))?.split('=')[1]
      || (args.includes('--model') ? args[args.indexOf('--model') + 1] : null)
      || 'sonnet';
    const dryRun = args.includes('--dry-run');

    console.log('\n=== Batch API Mode (50% cost reduction) ===\n');
    console.log('Delegating to batch-worker.ts --once\n');

    const workerArgs = [
      'npx', 'tsx', join(__scripts_dir, 'batch-worker.ts'),
      '--once',
      '--tier', tierArg,
      '--model', modelArg,
    ];
    if (dryRun) workerArgs.push('--dry-run');

    execSync(workerArgs.join(' '), { stdio: 'inherit', timeout: 24 * 60 * 60_000 });
    return;
  }

  const tierArg = args.find(a => a.startsWith('--tier'))?.split('=')[1]
    || (args.includes('--tier') ? args[args.indexOf('--tier') + 1] : null)
    || 'all';
  const concurrencyArg = args.find(a => a.startsWith('--concurrency'))?.split('=')[1]
    || (args.includes('--concurrency') ? args[args.indexOf('--concurrency') + 1] : null);
  const concurrency = concurrencyArg ? parseInt(concurrencyArg, 10) : 3;
  const retryFailed = args.includes('--retry-failed');
  const dryRun = args.includes('--dry-run');

  // Load video manifest (prefer video-manifest.json, fall back to video-list.json)
  const manifestPath = join(__scripts_dir, 'video-manifest.json');
  const legacyPath = join(__scripts_dir, 'video-list.json');

  const work: WorkItem[] = [];

  if (existsSync(manifestPath)) {
    const manifest: VideoManifestEntry[] = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    console.log(`Loaded ${manifest.length} videos from video-manifest.json`);

    // Filter by tier
    const filtered = tierArg === 'all'
      ? manifest
      : manifest.filter(v => String(v.tier) === tierArg);

    for (const v of filtered) {
      work.push({
        videoId: v.videoId,
        channel: v.channelName,
        title: v.title,
        model: 'sonnet',
        tier: String(v.tier),
      });
    }
  } else if (existsSync(legacyPath)) {
    console.log('WARN: video-manifest.json not found, falling back to video-list.json');
    console.log('  Run: npx tsx scripts/discover-videos.ts to generate the manifest\n');
    const videoList: VideoList = JSON.parse(readFileSync(legacyPath, 'utf-8'));

    if (tierArg === 'demo' || tierArg === '1' || tierArg === 'all') {
      for (const v of videoList.demo_opus) {
        work.push({ ...v, model: 'opus', tier: 'demo' });
      }
    }
    if (tierArg === '2' || tierArg === 'all') {
      for (const v of videoList.tier2_sonnet) {
        work.push({ ...v, model: 'sonnet', tier: '2' });
      }
    }
  } else {
    console.error('No video manifest found. Run: npx tsx scripts/discover-videos.ts');
    process.exit(1);
  }

  if (work.length === 0) {
    console.error('No videos to process. Check --tier argument.');
    process.exit(1);
  }

  // Pre-flight validation
  const valid = await preflight(work);
  if (dryRun) {
    const client = getClient();
    const videoIds = work.map(w => w.videoId);

    // Batch fetch progress in chunks (Supabase .in() limit)
    const statusMap = new Map<string, string>();
    for (let i = 0; i < videoIds.length; i += 500) {
      const chunk = videoIds.slice(i, i + 500);
      const { data: progressData } = await client
        .from('batch_progress')
        .select('video_id, status')
        .in('video_id', chunk);
      for (const p of (progressData || []) as Array<{ video_id: string; status: string }>) {
        statusMap.set(p.video_id, p.status);
      }
    }

    const completed = work.filter(w => statusMap.get(w.videoId) === 'completed');
    const toProcess = work.filter(w => statusMap.get(w.videoId) !== 'completed');
    const opusCount = toProcess.filter(w => w.model === 'opus').length;
    const sonnetCount = toProcess.filter(w => w.model === 'sonnet').length;

    const estCost = opusCount * EST_COST.opus + sonnetCount * EST_COST.sonnet;
    const estTime = (opusCount * EST_TIME.opus + sonnetCount * EST_TIME.sonnet) / concurrency;

    console.log(`=== Dry Run Summary ===`);
    console.log(`  Total in manifest: ${work.length} videos`);
    console.log(`  Already completed: ${completed.length} (skipping)`);
    console.log(`  To process: ${toProcess.length} (${opusCount} opus + ${sonnetCount} sonnet)`);
    console.log(`  Concurrency: ${concurrency}`);
    console.log(`  Estimated cost: ~$${(estCost / 100).toFixed(0)}-${Math.round(estCost * 1.3 / 100)}`);
    console.log(`  Estimated time: ~${Math.round(estTime / 3600 * 10) / 10} hours (with ${concurrency}x parallelism)`);
    console.log(`\n  Pre-flight: ${valid ? 'PASSED' : 'FAILED'}`);

    if (!valid) {
      console.log('\n  Fix the above failures before running the batch.\n');
      process.exit(1);
    }
    console.log('\n  Ready to run! Remove --dry-run to start extraction.\n');
    process.exit(0);
  }

  if (!valid) {
    console.error('\nPre-flight validation FAILED. Fix errors above or use --dry-run to check.\n');
    process.exit(1);
  }

  // Check existing progress
  const client = getClient();
  const videoIds = work.map(w => w.videoId);
  const statusMap = new Map<string, string>();
  for (let i = 0; i < videoIds.length; i += 500) {
    const chunk = videoIds.slice(i, i + 500);
    const { data: progressData } = await client
      .from('batch_progress')
      .select('video_id, status')
      .in('video_id', chunk);
    for (const p of (progressData || []) as Array<{ video_id: string; status: string }>) {
      statusMap.set(p.video_id, p.status);
    }
  }

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
        console.log(`  reset: ${w.videoId} (${w.channel}) — failed -> pending`);
      }
    }
  }

  // Print batch start summary with cost estimate
  const opusCount = filtered.filter(w => w.model === 'opus').length;
  const sonnetCount = filtered.filter(w => w.model === 'sonnet').length;
  const estCost = opusCount * EST_COST.opus + sonnetCount * EST_COST.sonnet;
  const estTime = (opusCount * EST_TIME.opus + sonnetCount * EST_TIME.sonnet) / concurrency;

  console.log(`\n=== Batch Extraction: ${work.length} videos ===`);
  console.log(`  Already completed: ${work.length - filtered.length} (skipping)`);
  console.log(`  Processing: ${filtered.length} (${opusCount} opus + ${sonnetCount} sonnet)`);
  console.log(`  Concurrency: ${concurrency}`);
  console.log(`  Estimated cost: ~$${(estCost / 100).toFixed(0)}-${Math.round(estCost * 1.3 / 100)}`);
  console.log(`  Estimated time: ~${Math.round(estTime / 3600 * 10) / 10} hours\n`);

  // Process with p-limit concurrency
  let succeeded = 0;
  let failed = 0;
  let totalCost = 0;
  let processed = 0;
  const failedIds: string[] = [];
  const startTime = Date.now();
  const limit = pLimit(concurrency);

  await Promise.allSettled(
    filtered.map(w =>
      limit(async () => {
        const idx = ++processed;
        const num = `[${idx}/${filtered.length}]`;

        console.log(`${num} START ${w.channel} — "${w.title}" (${w.model})`);

        const result = await extractSingleVideo(w.videoId, {
          model: w.model,
          channelTier: parseInt(w.tier) || 1,
        });

        if (result.success) {
          succeeded++;
          totalCost += result.costCents;
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          const eta = succeeded > 0 ? Math.round(elapsed / succeeded * (filtered.length - idx) / 60) : 0;
          console.log(`${num} DONE ${Math.round(result.durationMs / 1000)}s | ${result.concepts} concepts, ${result.moments} moments, ${result.quizzes} quizzes | ${result.costCents}c | ETA ~${eta}min`);
        } else {
          failed++;
          failedIds.push(w.videoId);
          totalCost += result.costCents;
          console.log(`${num} FAILED ${w.videoId} after ${Math.round(result.durationMs / 1000)}s`);
        }
      }),
    ),
  );

  const elapsedMin = Math.round((Date.now() - startTime) / 60000);

  // Summary
  console.log('\n=== Batch Summary ===');
  console.log(`  Processed: ${filtered.length}`);
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  Total cost: ${totalCost}c ($${(totalCost / 100).toFixed(2)})`);
  console.log(`  Total time: ${elapsedMin} minutes`);

  // Save failed IDs
  if (failedIds.length > 0) {
    const failedPath = join(__scripts_dir, 'failed-videos.json');
    writeFileSync(failedPath, JSON.stringify(failedIds, null, 2));
    console.log(`\n  Failed IDs saved to ${failedPath}`);
    console.log(`  Re-run with --retry-failed to retry`);
  }

  // Post-run verification
  await postRunSummary(client);

  // Auto-run cross-video linking if 2+ videos succeeded
  if (succeeded >= 2) {
    console.log('\n--- Running cross-video linking ---\n');
    try {
      const linkScript = join(__scripts_dir, 'link-videos.ts');
      execSync(`npx tsx ${linkScript}`, { stdio: 'inherit', timeout: 600_000 });
      console.log('\nCross-video linking complete.');
    } catch (err) {
      console.log(`\nWARN: Cross-video linking failed: ${err instanceof Error ? err.message : err}`);
      console.log('Run manually: npx tsx scripts/link-videos.ts');
    }
  }

  console.log('');
}

main().catch(err => {
  console.error('Batch failed:', err);
  process.exit(1);
});
