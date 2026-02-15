#!/usr/bin/env npx tsx
/**
 * Smart channel discovery via yt-dlp search.
 *
 * Finds new channels by searching YouTube for educational content
 * and extracting channel IDs from results. No YouTube API key needed.
 *
 * Usage:
 *   npx tsx scripts/discover-channels.ts [--search "query"] [--limit N]
 */

import { execFileSync } from 'child_process';

const SEARCH_QUERIES = [
  'AI engineering tutorial 2024',
  'machine learning explained',
  'deep learning from scratch',
  'systems programming rust',
  'distributed systems design',
  'linear algebra intuition',
  'calculus visualization',
  'computer science fundamentals',
  'web development modern stack',
  'startup technical founder',
  'data structures algorithms explained',
  'GPU programming CUDA',
  'transformer architecture explained',
  'reinforcement learning tutorial',
  'category theory programming',
];

interface DiscoveredChannel {
  channelId: string;
  channelName: string;
  videoCount: number;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string): string | null => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
  };
  return {
    search: get('--search'),
    limit: parseInt(get('--limit') || '20', 10),
  };
}

function discoverFromSearch(query: string, limit: number): Map<string, DiscoveredChannel> {
  const channels = new Map<string, DiscoveredChannel>();

  try {
    const output = execFileSync(
      'yt-dlp',
      ['--flat-playlist', `ytsearch${limit}:${query}`, '--print', '%(channel_id)s\t%(channel)s'],
      { encoding: 'utf-8', timeout: 30_000, stdio: ['pipe', 'pipe', 'ignore'] },
    ).trim();

    for (const line of output.split('\n')) {
      const [channelId, channelName] = line.split('\t');
      if (!channelId || channelId === 'NA' || !channelName) continue;

      const existing = channels.get(channelId);
      if (existing) {
        existing.videoCount++;
      } else {
        channels.set(channelId, { channelId, channelName, videoCount: 1 });
      }
    }
  } catch (e) {
    console.error(`Search failed for "${query}":`, e instanceof Error ? e.message : e);
  }

  return channels;
}

async function main() {
  const config = parseArgs();
  const queries = config.search ? [config.search] : SEARCH_QUERIES;

  console.log(`\n=== Channel Discovery ===`);
  console.log(`Queries: ${queries.length}`);
  console.log(`Results per query: ${config.limit}\n`);

  // Import existing registry to filter known channels
  const { CHANNEL_REGISTRY } = await import('../lib/batch/channel-registry');
  const knownIds = new Set(CHANNEL_REGISTRY.map(c => c.id));

  const allChannels = new Map<string, DiscoveredChannel>();

  for (const query of queries) {
    console.log(`Searching: "${query}"...`);
    const results = discoverFromSearch(query, config.limit);

    for (const [id, channel] of results) {
      const existing = allChannels.get(id);
      if (existing) {
        existing.videoCount += channel.videoCount;
      } else {
        allChannels.set(id, channel);
      }
    }
  }

  // Filter out known channels and sort by frequency
  const newChannels = [...allChannels.values()]
    .filter(c => !knownIds.has(c.channelId))
    .sort((a, b) => b.videoCount - a.videoCount);

  console.log(`\n=== Results ===`);
  console.log(`Total channels found: ${allChannels.size}`);
  console.log(`Already in registry: ${allChannels.size - newChannels.length}`);
  console.log(`New channels: ${newChannels.length}\n`);

  // Output as registry entries
  console.log('// Suggested additions to channel-registry.ts:');
  for (const ch of newChannels.slice(0, 50)) {
    const tier = ch.videoCount >= 3 ? 3 : 4;
    console.log(`  { id: '${ch.channelId}', name: '${ch.channelName.replace(/'/g, "\\'")}', tier: ${tier}, category: 'general', maxVideos: 15 },`);
  }
}

main().catch(err => {
  console.error('Discovery failed:', err);
  process.exit(1);
});
