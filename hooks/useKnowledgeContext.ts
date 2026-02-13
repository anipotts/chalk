'use client';

import { useState, useEffect } from 'react';
import type { KnowledgeContext } from '@/app/api/knowledge-context/route';

export type { KnowledgeContext };

/**
 * Fetches knowledge graph context for a video.
 * Returns null gracefully for unprocessed videos (no degradation).
 */
export function useKnowledgeContext(videoId: string | null) {
  const [data, setData] = useState<KnowledgeContext | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!videoId) {
      setData(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetch(`/api/knowledge-context?v=${videoId}`)
      .then(res => res.ok ? res.json() : null)
      .then(json => {
        if (!cancelled) {
          setData(json as KnowledgeContext | null);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [videoId]);

  return { knowledgeContext: data, isKnowledgeLoading: isLoading };
}

/**
 * Builds XML context string for system prompt injection from knowledge context.
 */
export function buildKnowledgeGraphPromptContext(ctx: KnowledgeContext): string {
  if (!ctx.video && ctx.related_videos.length === 0 && ctx.concept_connections.length === 0) {
    return '';
  }

  let xml = '<knowledge_graph>\n';

  if (ctx.video) {
    xml += '<video_metadata>\n';
    if (ctx.video.summary) xml += `<summary>${ctx.video.summary}</summary>\n`;
    if (ctx.video.topics.length) xml += `<topics>${ctx.video.topics.join(', ')}</topics>\n`;
    if (ctx.video.difficulty) xml += `<difficulty>${ctx.video.difficulty}</difficulty>\n`;
    if (ctx.video.learning_objectives.length) {
      xml += `<learning_objectives>\n${ctx.video.learning_objectives.map(o => `- ${o}`).join('\n')}\n</learning_objectives>\n`;
    }
    if (ctx.video.prerequisites.length) {
      xml += `<prerequisites>\n${ctx.video.prerequisites.map(p => `- ${p}`).join('\n')}\n</prerequisites>\n`;
    }
    if (ctx.video.key_moments.length) {
      xml += '<key_moments>\n';
      for (const m of ctx.video.key_moments) {
        const mins = Math.floor(m.timestamp_seconds / 60);
        const secs = Math.floor(m.timestamp_seconds % 60);
        xml += `- [${mins}:${secs.toString().padStart(2, '0')}] ${m.label}: ${m.summary}\n`;
      }
      xml += '</key_moments>\n';
    }
    xml += '</video_metadata>\n';
  }

  if (ctx.related_videos.length > 0) {
    xml += '<related_videos>\n';
    xml += 'You can reference these related videos using the reference_video tool:\n';
    for (const v of ctx.related_videos) {
      xml += `- "${v.title}" by ${v.channel_name || 'Unknown'} (${v.relationship}): ${v.reason || v.shared_concepts.join(', ')}\n`;
      xml += `  video_id: ${v.video_id}\n`;
    }
    xml += '</related_videos>\n';
  }

  if (ctx.concept_connections.length > 0) {
    xml += '<concept_connections>\n';
    xml += 'Key concepts from this video appear in other videos (use search_knowledge for more):\n';
    for (const c of ctx.concept_connections) {
      const mentionLabel = c.mention_type !== 'references' ? ` [${c.mention_type}]` : '';
      const vids = c.videos.slice(0, 3).map(v => {
        const vMention = v.mention_type !== 'references' ? ` (${v.mention_type})` : '';
        return `"${v.title}" by ${v.channel_name || 'Unknown'}${vMention}`;
      }).join(', ');
      xml += `- ${c.display_name}${mentionLabel}: also covered in ${vids}\n`;
    }
    xml += '</concept_connections>\n';
  }

  xml += '</knowledge_graph>';
  return xml;
}
