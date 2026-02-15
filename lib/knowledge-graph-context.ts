/**
 * Builds XML context string from knowledge graph data for injection into AI prompts.
 * Server-safe — no React dependencies.
 */
import type { KnowledgeContext } from '@/app/api/knowledge-context/route';

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
