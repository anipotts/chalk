/**
 * YouTube Search API Route
 * Proxies search requests to Piped/Invidious instances with fallback
 */

import { normalizeInvidiousResults, normalizePipedResults } from '@/lib/youtube-search';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // Max 30 seconds for search

// Instance configuration with priority order
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz'
];

const INVIDIOUS_INSTANCES = [
  'https://yewtu.be',
  'https://inv.nadeko.net'
];

// Module-level cache for last working instance
let lastWorkingInstance: { url: string; type: 'piped' | 'invidious' } | null = null;

interface SearchOptions {
  query: string;
  limit: number;
  timeout: number;
}

/**
 * Fetch from a Piped instance
 */
async function searchPiped(
  instance: string,
  query: string,
  limit: number,
  signal: AbortSignal
): Promise<any> {
  const url = `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`;

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return normalizePipedResults(data).slice(0, limit);
}

/**
 * Fetch from an Invidious instance
 */
async function searchInvidious(
  instance: string,
  query: string,
  limit: number,
  signal: AbortSignal
): Promise<any> {
  const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`;

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return normalizeInvidiousResults(data).slice(0, limit);
}

/**
 * Try searching with fallback across all instances
 */
async function searchWithFallback(options: SearchOptions) {
  const { query, limit, timeout } = options;

  // Build priority list: last working instance first, then others
  const pipedInstances = lastWorkingInstance?.type === 'piped'
    ? [lastWorkingInstance.url, ...PIPED_INSTANCES.filter(i => i !== lastWorkingInstance.url)]
    : PIPED_INSTANCES;

  const invidiousInstances = lastWorkingInstance?.type === 'invidious'
    ? [lastWorkingInstance.url, ...INVIDIOUS_INSTANCES.filter(i => i !== lastWorkingInstance.url)]
    : INVIDIOUS_INSTANCES;

  // Try Piped instances first (better performance)
  for (const instance of pipedInstances) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const results = await searchPiped(instance, query, limit, controller.signal);

      clearTimeout(timeoutId);
      lastWorkingInstance = { url: instance, type: 'piped' };
      return results;
    } catch (error) {
      console.error(`Piped instance ${instance} failed:`, error);
      // Continue to next instance
    }
  }

  // Fall back to Invidious instances
  for (const instance of invidiousInstances) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const results = await searchInvidious(instance, query, limit, controller.signal);

      clearTimeout(timeoutId);
      lastWorkingInstance = { url: instance, type: 'invidious' };
      return results;
    } catch (error) {
      console.error(`Invidious instance ${instance} failed:`, error);
      // Continue to next instance
    }
  }

  // All instances failed
  throw new Error('All instances are unavailable');
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');
    const limitParam = searchParams.get('limit');

    // Validate query parameter
    if (!query || typeof query !== 'string') {
      return Response.json(
        { error: 'Missing or invalid query parameter "q"' },
        { status: 400 }
      );
    }

    if (query.length < 1 || query.length > 200) {
      return Response.json(
        { error: 'Query must be between 1 and 200 characters' },
        { status: 400 }
      );
    }

    // Validate and parse limit parameter
    const limit = limitParam ? parseInt(limitParam, 10) : 9;
    if (isNaN(limit) || limit < 1 || limit > 50) {
      return Response.json(
        { error: 'Limit must be between 1 and 50' },
        { status: 400 }
      );
    }

    // Perform search with fallback
    const results = await searchWithFallback({
      query,
      limit,
      timeout: 5000 // 5 second timeout per instance
    });

    return Response.json({ results });
  } catch (error) {
    console.error('Search API error:', error);

    // Check if all instances failed
    if (error instanceof Error && error.message === 'All instances are unavailable') {
      return Response.json(
        {
          error: 'YouTube search is temporarily unavailable. Please try pasting a URL instead.'
        },
        { status: 503 }
      );
    }

    // Generic error
    return Response.json(
      { error: 'An unexpected error occurred while searching' },
      { status: 500 }
    );
  }
}
