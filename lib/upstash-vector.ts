import { Index } from '@upstash/vector';

/**
 * Upstash Vector client for semantic search across indexed videos.
 * Populated by the batch enrichment pipeline (Agent B).
 *
 * Environment variables:
 * - UPSTASH_VECTOR_REST_URL
 * - UPSTASH_VECTOR_REST_TOKEN
 */

let vectorIndex: Index | null = null;

function getVectorIndex(): Index | null {
  if (vectorIndex) return vectorIndex;

  const url = process.env.UPSTASH_VECTOR_REST_URL;
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN;

  if (!url || !token) return null;

  vectorIndex = new Index({ url, token });
  return vectorIndex;
}

export interface VectorSearchResult {
  video_id: string;
  title: string;
  channel_name: string;
  chunk_text?: string;
  timestamp_seconds?: number;
  topics?: string[];
  difficulty?: string;
  score: number;
}

export interface VectorMetadata {
  video_id: string;
  title: string;
  channel_name: string;
  chunk_text?: string;
  chunk_index?: number;
  start_timestamp?: number;
  end_timestamp?: number;
  topics?: string[];
  difficulty?: string;
  type: 'video' | 'chunk';
}

/**
 * Semantic search across all indexed videos.
 * Uses the query text to find similar content.
 */
export async function searchSimilarContent(
  query: string,
  options?: {
    topK?: number;
    excludeVideoId?: string;
    filter?: {
      channel?: string;
      difficulty?: string;
      type?: 'video' | 'chunk';
    };
  }
): Promise<VectorSearchResult[]> {
  const index = getVectorIndex();
  if (!index) return [];

  const topK = options?.topK ?? 10;

  // Build metadata filter
  let filter: string | undefined;
  const conditions: string[] = [];

  if (options?.excludeVideoId) {
    conditions.push(`video_id != '${options.excludeVideoId}'`);
  }
  if (options?.filter?.channel) {
    conditions.push(`channel_name = '${options.filter.channel}'`);
  }
  if (options?.filter?.difficulty) {
    conditions.push(`difficulty = '${options.filter.difficulty}'`);
  }
  if (options?.filter?.type) {
    conditions.push(`type = '${options.filter.type}'`);
  }

  if (conditions.length > 0) {
    filter = conditions.join(' AND ');
  }

  try {
    const results = await index.query({
      data: query,
      topK,
      includeMetadata: true,
      filter,
    });

    return results.map(r => {
      const meta = r.metadata as VectorMetadata | undefined;
      return {
        video_id: meta?.video_id ?? '',
        title: meta?.title ?? '',
        channel_name: meta?.channel_name ?? '',
        chunk_text: meta?.chunk_text,
        timestamp_seconds: meta?.start_timestamp,
        topics: meta?.topics,
        difficulty: meta?.difficulty,
        score: r.score,
      };
    }).filter(r => r.video_id);
  } catch (err) {
    console.error('Vector search error:', err);
    return [];
  }
}

/**
 * Check if vector search is available (env vars configured).
 */
export function isVectorSearchAvailable(): boolean {
  return !!(process.env.UPSTASH_VECTOR_REST_URL && process.env.UPSTASH_VECTOR_REST_TOKEN);
}
