#!/usr/bin/env npx tsx
/**
 * Priority queue worker for GPU transcription.
 *
 * Runs on cuda5 alongside whisperx-service.py. Polls Supabase transcript_queue
 * for jobs, dispatches to local WhisperX, writes results back.
 *
 * Priority: P0 (user watching) preempts P2 (batch background).
 * Cost model: WhisperX = free (university GPU). No API cost for transcription.
 *
 * Usage:
 *   npx tsx scripts/queue-worker.ts [options]
 *
 * Options:
 *   --whisperx-url URL  WhisperX service URL (default: http://localhost:8765)
 *   --once              Process one job then exit
 *   --batch-fill        Auto-enqueue batch P2 jobs when idle
 */

process.loadEnvFile('.env.local');

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'child_process';
import { hostname } from 'os';

// ─── Types ──────────────────────────────────────────────────────────────────

interface QueueJob {
  id: string;
  video_id: string;
  priority: number;
  status: string;
  requested_by: string;
  worker_id: string;
  segments_written: number;
  progress_pct: number;
  attempt_count: number;
  max_attempts: number;
  error_message: string | null;
}

interface TranscribeResult {
  segments: Array<{ text: string; offset: number; duration: number }>;
  duration: number;
  segment_count: number;
}

// ─── Config ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string): string | null => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
  };
  return {
    whisperxUrl: get('--whisperx-url') || 'http://localhost:8765',
    once: args.includes('--once'),
    batchFill: args.includes('--batch-fill'),
  };
}

const WORKER_ID = `${hostname()}-${process.pid}`;
const POLL_INTERVAL = 3_000;        // 3 seconds
const HEARTBEAT_INTERVAL = 15_000;  // 15 seconds
const WHISPERX_TIMEOUT = 3_600_000; // 1 hour (covers 5-hour videos)
const IDLE_BEFORE_BATCH = 30_000;   // 30s idle before enqueuing batch work

// ─── Clients ────────────────────────────────────────────────────────────────

function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(ctx: string, step: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${ctx}] ${step}: ${msg}`);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Core: Claim job ────────────────────────────────────────────────────────

async function claimJob(client: SupabaseClient): Promise<QueueJob | null> {
  const { data, error } = await client.rpc('claim_next_job', {
    p_worker_id: WORKER_ID,
  });

  if (error) {
    log('WORKER', 'CLAIM', `RPC error: ${error.message}`);
    return null;
  }

  // claim_next_job returns SETOF, so data is an array
  const jobs = data as QueueJob[] | null;
  if (!jobs || jobs.length === 0) return null;
  return jobs[0];
}

// ─── Core: Process job ──────────────────────────────────────────────────────

async function processJob(
  client: SupabaseClient,
  job: QueueJob,
  whisperxUrl: string,
): Promise<void> {
  log(job.video_id, 'START', `priority=${job.priority}, requested_by=${job.requested_by}, attempt=${job.attempt_count}`);

  // Create AbortController for timeout and preemption
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WHISPERX_TIMEOUT);

  // Start heartbeat timer with preemption check for batch jobs
  const heartbeatTimer = setInterval(async () => {
    try {
      await client.rpc('heartbeat_job', {
        p_job_id: job.id,
        p_worker_id: WORKER_ID,
      });

      // For P2 (batch) jobs, check if a higher-priority job is waiting
      if (job.priority >= 2) {
        const preempt = await shouldPreempt(client, job.priority);
        if (preempt) {
          log(job.video_id, 'PREEMPT', 'Higher-priority job waiting, aborting...');
          controller.abort();
        }
      }
    } catch (e) {
      log(job.video_id, 'HEARTBEAT', `failed: ${e instanceof Error ? e.message : e}`);
    }
  }, HEARTBEAT_INTERVAL);

  try {
    const progressiveUrl = `${whisperxUrl}/transcribe/progressive`;
    log(job.video_id, 'TRANSCRIBE', `calling ${progressiveUrl}...`);

    const response = await fetch(progressiveUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_id: job.video_id,
        job_id: job.id,
        worker_id: WORKER_ID,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown');
      throw new Error(`WhisperX HTTP ${response.status}: ${errText.slice(0, 300)}`);
    }

    const result = await response.json() as TranscribeResult;
    log(job.video_id, 'TRANSCRIBE', `done — ${result.segment_count} segments, ${Math.round(result.duration)}s audio`);

    // Post-process: clean/merge/deduplicate segments
    const { cleanSegments, deduplicateSegments, mergeIntoSentences } = await import('../lib/transcript');

    const cleaned = mergeIntoSentences(cleanSegments(deduplicateSegments(result.segments)));
    log(job.video_id, 'CLEAN', `${result.segments.length} raw -> ${cleaned.length} cleaned segments`);

    // Write final cleaned segments to transcripts cache (90-day TTL)
    const lastSeg = cleaned[cleaned.length - 1];
    const durationSeconds = lastSeg ? lastSeg.offset + (lastSeg.duration || 0) : result.duration;
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    await client.from('transcripts').upsert({
      video_id: job.video_id,
      segments: cleaned,
      source: 'whisperx',
      segment_count: cleaned.length,
      duration_seconds: Math.round(durationSeconds),
      fetched_at: new Date().toISOString(),
      expires_at: expiresAt,
    }, { onConflict: 'video_id' });

    // Mark job complete
    await client.rpc('complete_job', {
      p_job_id: job.id,
      p_worker_id: WORKER_ID,
      p_segments_written: cleaned.length,
    });

    log(job.video_id, 'COMPLETE', `${cleaned.length} segments cached`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(job.video_id, 'FAILED', msg);

    await client.rpc('fail_job', {
      p_job_id: job.id,
      p_worker_id: WORKER_ID,
      p_error: msg.slice(0, 500),
    });
  } finally {
    clearTimeout(timeout);
    clearInterval(heartbeatTimer);
  }
}

// ─── Preemption check ───────────────────────────────────────────────────────

async function shouldPreempt(client: SupabaseClient, currentPriority: number): Promise<boolean> {
  const { data } = await client.rpc('should_preempt', {
    p_current_priority: currentPriority,
  });
  return data === true;
}

// ─── Batch fill: enqueue background transcription jobs ──────────────────────

async function enqueueBatchWork(client: SupabaseClient): Promise<boolean> {
  // Import channel registry
  const { CHANNEL_REGISTRY } = await import('../lib/batch/channel-registry');

  // Pick a random channel and discover recent videos
  const channel = CHANNEL_REGISTRY[Math.floor(Math.random() * CHANNEL_REGISTRY.length)];

  log('BATCH', 'DISCOVER', `scanning ${channel.name} for un-transcribed videos...`);

  try {
    // Use yt-dlp to get recent video IDs from channel
    const maxVideos = channel.maxVideos || 10;
    const channelHandle = (channel.handle || channel.name).replace(/^@*/, '@');
    const output = execFileSync(
      'yt-dlp',
      [
        '--flat-playlist', '--print', 'id',
        `https://www.youtube.com/${channelHandle}/videos`,
        '--playlist-end', String(Math.min(maxVideos, 20)),
      ],
      { encoding: 'utf-8', timeout: 30_000, stdio: ['pipe', 'pipe', 'ignore'] },
    ).trim();

    if (!output) return false;

    const videoIds = output.split('\n').filter(id => /^[a-zA-Z0-9_-]{11}$/.test(id));
    if (videoIds.length === 0) return false;

    // Check which are already transcribed or queued
    const { data: existing } = await client
      .from('transcripts')
      .select('video_id')
      .in('video_id', videoIds);
    const transcribed = new Set((existing || []).map((r: { video_id: string }) => r.video_id));

    const { data: queued } = await client
      .from('transcript_queue')
      .select('video_id')
      .in('video_id', videoIds);
    const alreadyQueued = new Set((queued || []).map((r: { video_id: string }) => r.video_id));

    const newIds = videoIds.filter(id => !transcribed.has(id) && !alreadyQueued.has(id));

    if (newIds.length === 0) {
      log('BATCH', 'DISCOVER', `${channel.name}: all ${videoIds.length} recent videos already processed`);
      return false;
    }

    // Enqueue first new video at P2
    const videoId = newIds[0];
    const { data: result } = await client.rpc('enqueue_transcript', {
      p_video_id: videoId,
      p_priority: 2,
      p_requested_by: 'batch',
    });

    log('BATCH', 'ENQUEUE', `${channel.name} / ${videoId}: ${result}`);
    return result === 'enqueued';
  } catch (e) {
    log('BATCH', 'DISCOVER', `failed: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

// ─── Main Worker Loop ───────────────────────────────────────────────────────

async function main() {
  const config = parseArgs();
  const client = getSupabase();

  console.log(`\n=== Chalk Queue Worker ===`);
  console.log(`  Worker ID: ${WORKER_ID}`);
  console.log(`  WhisperX: ${config.whisperxUrl}`);
  console.log(`  Mode: ${config.once ? 'single job' : 'continuous loop'}`);
  console.log(`  Batch fill: ${config.batchFill}`);
  console.log('');

  // Verify WhisperX is reachable
  try {
    const health = await fetch(`${config.whisperxUrl}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!health.ok) throw new Error(`HTTP ${health.status}`);
    const data = await health.json();
    log('WORKER', 'INIT', `WhisperX healthy: ${JSON.stringify(data)}`);
  } catch (e) {
    log('WORKER', 'INIT', `WhisperX unreachable at ${config.whisperxUrl}: ${e instanceof Error ? e.message : e}`);
    log('WORKER', 'INIT', 'Will retry on each job attempt...');
  }

  let jobsProcessed = 0;
  let idleTime = 0;

  while (true) {
    try {
      const job = await claimJob(client);

      if (job) {
        idleTime = 0;

        // For P2 (batch) jobs, check preemption before starting
        if (job.priority >= 2) {
          const preempt = await shouldPreempt(client, job.priority);
          if (preempt) {
            log(job.video_id, 'PREEMPT', 'Higher-priority job waiting, re-queuing P2 job');
            await client.rpc('fail_job', {
              p_job_id: job.id,
              p_worker_id: WORKER_ID,
              p_error: 'Preempted by higher-priority job',
            });
            continue;
          }
        }

        await processJob(client, job, config.whisperxUrl);
        jobsProcessed++;

        if (config.once) break;
      } else {
        // No jobs available
        idleTime += POLL_INTERVAL;

        if (config.once) {
          log('WORKER', 'IDLE', 'no jobs, --once mode, exiting');
          break;
        }

        // Auto-enqueue batch work after idle threshold
        if (config.batchFill && idleTime >= IDLE_BEFORE_BATCH) {
          await enqueueBatchWork(client);
          idleTime = 0; // Reset so we don't spam discovery
        }

        await sleep(POLL_INTERVAL);
      }
    } catch (err) {
      log('WORKER', 'ERROR', `loop error: ${err instanceof Error ? err.message : err}`);
      await sleep(POLL_INTERVAL * 2);
    }
  }

  console.log(`\n=== Worker Summary ===`);
  console.log(`  Jobs processed: ${jobsProcessed}`);
  console.log('');
}

main().catch(err => {
  console.error('Queue worker failed:', err);
  process.exit(1);
});
