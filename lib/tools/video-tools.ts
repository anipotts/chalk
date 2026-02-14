import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { getAdminClient } from '@/lib/supabase-admin';
import { formatTimestamp, type TranscriptSegment } from '@/lib/video-utils';
import { searchSimilarContent, isVectorSearchAvailable } from '@/lib/upstash-vector';

// === Zod Schemas ===

const citeMomentSchema = z.object({
  timestamp_seconds: z.number().describe('The timestamp in seconds to cite'),
  label: z.string().max(100).describe('Short label for this moment (e.g., "Key definition", "Example starts")'),
  context: z.string().max(300).optional().describe('Brief context about what happens at this moment'),
});

const referenceVideoSchema = z.object({
  video_id: z.string().describe('YouTube video ID of the referenced video'),
  timestamp_seconds: z.number().optional().describe('Optional timestamp to link to in the referenced video'),
  video_title: z.string().describe('Title of the referenced video'),
  channel_name: z.string().describe('Channel name of the referenced video'),
  reason: z.string().max(200).describe('Why this video is relevant'),
});

const searchKnowledgeSchema = z.object({
  query: z.string().max(200).describe('Search query (concept name, topic, or keyword)'),
  type: z.enum(['concept', 'video', 'all']).optional().describe('Filter to concepts, videos, or both'),
  exclude_current_video: z.boolean().optional().describe('Exclude the current video (default: true)'),
});

const getPrerequisitesSchema = z.object({
  concept_id: z.string().max(100).describe('The canonical concept ID (e.g., "attention_mechanism")'),
  max_depth: z.number().min(1).max(8).optional().describe('Max depth of prerequisite chain (default: 4)'),
});

const getQuizSchema = z.object({
  difficulty: z.enum(['easy', 'medium', 'hard']).optional().describe('Filter by difficulty'),
  bloom_level: z.enum(['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']).optional().describe('Filter by Bloom taxonomy level'),
  concept_id: z.string().optional().describe('Filter to a specific concept'),
  limit: z.number().min(1).max(10).optional().describe('Max questions to return (default: 5)'),
});

const getChapterContextSchema = z.object({
  timestamp_seconds: z.number().describe('Current timestamp to find the chapter for'),
});

const explainDifferentlySchema = z.object({
  concept_id: z.string().describe('The canonical concept ID to find alternative explanations for'),
  current_approach: z.string().optional().describe('The pedagogical approach already seen (to find different ones)'),
});

const getLearningPathSchema = z.object({
  from_concept: z.string().describe('Starting concept canonical ID'),
  to_concept: z.string().describe('Target concept canonical ID'),
});

// === Type aliases ===
type CiteMomentInput = z.infer<typeof citeMomentSchema>;
type ReferenceVideoInput = z.infer<typeof referenceVideoSchema>;
type SearchKnowledgeInput = z.infer<typeof searchKnowledgeSchema>;
type GetPrerequisitesInput = z.infer<typeof getPrerequisitesSchema>;
type GetQuizInput = z.infer<typeof getQuizSchema>;
type GetChapterContextInput = z.infer<typeof getChapterContextSchema>;
type ExplainDifferentlyInput = z.infer<typeof explainDifferentlySchema>;
type GetLearningPathInput = z.infer<typeof getLearningPathSchema>;

/**
 * Creates the video assistant tools.
 * 3 AI tools (cite_moment, reference_video, search_knowledge)
 * + 5 programmatic tools (zero AI tokens — pure SQL)
 */
export function createVideoTools(currentVideoId: string, segments: TranscriptSegment[]) {
  return {
    // ========================================
    // AI Tools (model decides when to call)
    // ========================================

    cite_moment: tool<CiteMomentInput, {
      type: 'cite_moment';
      timestamp: string;
      timestamp_seconds: number;
      label: string;
      context: string;
      transcript_line: string;
      video_id: string;
    }>({
      description: 'Cite a specific moment in the current video with a timestamp, label, and context. Use this to create rich, clickable timestamp references.',
      inputSchema: zodSchema(citeMomentSchema),
      execute: async ({ timestamp_seconds, label, context }) => {
        const segment = segments.length > 0 ? segments.reduce((closest, seg) => {
          const diff = Math.abs(seg.offset - timestamp_seconds);
          const closestDiff = Math.abs(closest.offset - timestamp_seconds);
          return diff < closestDiff ? seg : closest;
        }, segments[0]) : null;

        const transcriptLine = segment ? segment.text : '';
        return {
          type: 'cite_moment' as const,
          timestamp: formatTimestamp(timestamp_seconds),
          timestamp_seconds,
          label,
          context: context || transcriptLine,
          transcript_line: transcriptLine,
          video_id: currentVideoId,
        };
      },
    }),

    reference_video: tool<ReferenceVideoInput, {
      type: 'reference_video';
      video_id: string;
      timestamp_seconds: number | null;
      video_title: string;
      channel_name: string;
      reason: string;
      thumbnail_url: string;
      caption_excerpt: string | null;
      relationship: string | null;
      shared_concepts: string[];
    }>({
      description: 'Reference another video that covers a related topic. Use when the knowledge graph indicates relevant videos, or when the user asks about topics covered elsewhere.',
      inputSchema: zodSchema(referenceVideoSchema),
      execute: async ({ video_id, timestamp_seconds, video_title, channel_name, reason }) => {
        const client = getAdminClient();

        let thumbnail_url: string | null = null;
        let caption_excerpt: string | null = null;

        let relationship: string | null = null;
        let shared_concepts: string[] = [];

        if (client) {
          const { data: rawData } = await client
            .from('video_knowledge')
            .select('thumbnail_url, summary')
            .eq('video_id', video_id)
            .single();

          const data = rawData as { thumbnail_url: string | null; summary: string | null } | null;
          if (data) {
            thumbnail_url = data.thumbnail_url;
            caption_excerpt = data.summary?.slice(0, 150) || null;
          }

          // Query cross_video_links for relationship between current and referenced video
          const { data: linkRaw } = await client
            .from('cross_video_links')
            .select('relationship, shared_concepts')
            .or(
              `and(source_video_id.eq.${currentVideoId},target_video_id.eq.${video_id}),` +
              `and(source_video_id.eq.${video_id},target_video_id.eq.${currentVideoId})`
            )
            .order('confidence', { ascending: false })
            .limit(1);

          const linkData = linkRaw as Array<{
            relationship: string;
            shared_concepts: string[] | null;
          }> | null;

          if (linkData && linkData.length > 0) {
            relationship = linkData[0].relationship;
            shared_concepts = linkData[0].shared_concepts || [];
          }
        }

        return {
          type: 'reference_video' as const,
          video_id,
          timestamp_seconds: timestamp_seconds ?? null,
          video_title,
          channel_name,
          reason,
          thumbnail_url: thumbnail_url || `https://i.ytimg.com/vi/${video_id}/mqdefault.jpg`,
          caption_excerpt,
          relationship,
          shared_concepts,
        };
      },
    }),

    search_knowledge: tool<SearchKnowledgeInput, {
      type: 'search_results';
      query: string;
      results: Array<{
        kind: string;
        video_id: string;
        title: string;
        channel_name: string | null;
        concept?: string;
        mention_type?: string;
        timestamp_seconds?: number | null;
        difficulty?: string | null;
        relevance?: string;
      }>;
      message?: string;
    }>({
      description: 'Search the knowledge base for concepts, topics, or videos. Use this to find relevant content across all indexed videos before making reference_video calls.',
      inputSchema: zodSchema(searchKnowledgeSchema),
      execute: async ({ query, type, exclude_current_video }) => {
        const client = getAdminClient();
        if (!client) {
          return { type: 'search_results' as const, query, results: [], message: 'Knowledge base not available' };
        }

        const excludeCurrent = exclude_current_video !== false;
        const searchType = type || 'all';
        const results: Array<{
          kind: string;
          video_id: string;
          title: string;
          channel_name: string | null;
          concept?: string;
          mention_type?: string;
          timestamp_seconds?: number | null;
          difficulty?: string | null;
          relevance?: string;
        }> = [];

        if (searchType === 'concept' || searchType === 'all') {
          const { data: rawConceptHits } = await client
            .from('concepts')
            .select('id, display_name')
            .ilike('display_name', `%${query}%`)
            .limit(10);

          const conceptHits = rawConceptHits as Array<{ id: string; display_name: string }> | null;

          if (conceptHits?.length) {
            const conceptIds = conceptHits.map(c => c.id);
            const displayMap = new Map(conceptHits.map(c => [c.id, c.display_name]));

            let mentionQuery = client
              .from('concept_mentions')
              .select('concept_id, video_id, mention_type, timestamp_seconds')
              .in('concept_id', conceptIds)
              .limit(16);

            if (excludeCurrent) {
              mentionQuery = mentionQuery.neq('video_id', currentVideoId);
            }

            const { data: rawMentionData } = await mentionQuery;
            const mentionData = rawMentionData as Array<{
              concept_id: string; video_id: string; mention_type: string; timestamp_seconds: number;
            }> | null;

            if (mentionData?.length) {
              const videoIds = [...new Set(mentionData.map(m => m.video_id))];
              const { data: rawTitleData } = await client
                .from('video_knowledge')
                .select('video_id, title, difficulty')
                .in('video_id', videoIds);
              const titleVids = rawTitleData as Array<{ video_id: string; title: string; difficulty: string | null }> | null;
              const titleMap = new Map(titleVids?.map(v => [v.video_id, v.title]) || []);
              const diffMap = new Map(titleVids?.map(v => [v.video_id, v.difficulty]) || []);

              for (const m of mentionData) {
                results.push({
                  kind: 'concept',
                  video_id: m.video_id,
                  title: titleMap.get(m.video_id) || 'Unknown',
                  channel_name: null,
                  concept: displayMap.get(m.concept_id) || m.concept_id,
                  mention_type: m.mention_type,
                  timestamp_seconds: m.timestamp_seconds,
                  difficulty: diffMap.get(m.video_id) || null,
                });
              }
            }
          }
        }

        if (searchType === 'video' || searchType === 'all') {
          let videoQuery = client
            .from('video_knowledge')
            .select('video_id, title, difficulty, topics')
            .or(`title.ilike.%${query}%,topics.cs.{${query}}`)
            .limit(5);

          if (excludeCurrent) {
            videoQuery = videoQuery.neq('video_id', currentVideoId);
          }

          const { data: rawVideoData } = await videoQuery;
          const videoData = rawVideoData as Array<{
            video_id: string; title: string; difficulty: string | null; topics: string[];
          }> | null;
          if (videoData) {
            for (const v of videoData) {
              results.push({
                kind: 'video',
                video_id: v.video_id,
                title: v.title,
                channel_name: null,
                difficulty: v.difficulty,
                relevance: `Topics: ${(v.topics || []).join(', ')}`,
              });
            }
          }
        }

        // Augment with semantic search if available
        if (isVectorSearchAvailable() && results.length < 5) {
          try {
            const vectorResults = await searchSimilarContent(query, {
              topK: 5,
              excludeVideoId: excludeCurrent ? currentVideoId : undefined,
            });

            const existingIds = new Set(results.map(r => r.video_id));
            for (const vr of vectorResults) {
              if (!existingIds.has(vr.video_id)) {
                results.push({
                  kind: 'video',
                  video_id: vr.video_id,
                  title: vr.title,
                  channel_name: vr.channel_name,
                  timestamp_seconds: vr.timestamp_seconds ?? null,
                  difficulty: vr.difficulty ?? null,
                  relevance: vr.chunk_text ? `"${vr.chunk_text.slice(0, 100)}..."` : `Semantic match (${(vr.score * 100).toFixed(0)}%)`,
                });
                existingIds.add(vr.video_id);
              }
            }
          } catch {
            // Vector search failed, continue with existing results
          }
        }

        return {
          type: 'search_results' as const,
          query,
          results: results.slice(0, 10),
          message: results.length === 0 ? `No results found for "${query}"` : undefined,
        };
      },
    }),

    // ========================================
    // Programmatic Tools (zero AI tokens — pure SQL)
    // ========================================

    get_prerequisites: tool<GetPrerequisitesInput, {
      type: 'prerequisite_chain';
      concept_id: string;
      chain: Array<{
        concept_id: string;
        display_name: string;
        depth: number;
        best_video_id: string | null;
        best_video_title: string | null;
      }>;
      message?: string;
    }>({
      description: 'Get the prerequisite chain for a concept. Returns concepts that should be understood first, with the best video to learn each one. Use when a user is confused or asks "what should I learn first?"',
      inputSchema: zodSchema(getPrerequisitesSchema),
      execute: async ({ concept_id, max_depth }) => {
        const client = getAdminClient();
        if (!client) {
          return { type: 'prerequisite_chain' as const, concept_id, chain: [], message: 'Knowledge base not available' };
        }

        const depth = max_depth ?? 4;

        // Try the recursive CTE function first
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (client.rpc as any)('get_prerequisite_chain', {
          p_concept_id: concept_id,
          p_max_depth: depth,
        });

        if (error || !data?.length) {
          // Fallback: simple one-level lookup
          const { data: rawPrereqs } = await client
            .from('concept_relations')
            .select('source_id')
            .eq('target_id', concept_id)
            .eq('relation_type', 'prerequisite')
            .gte('confidence', 0.5)
            .limit(10);

          const directPrereqs = rawPrereqs as Array<{ source_id: string }> | null;
          if (!directPrereqs?.length) {
            return { type: 'prerequisite_chain' as const, concept_id, chain: [], message: 'No prerequisites found' };
          }

          const prereqIds = directPrereqs.map(p => p.source_id);
          const { data: rawConcepts } = await client
            .from('concepts')
            .select('id, display_name')
            .in('id', prereqIds);
          const conceptData = rawConcepts as Array<{ id: string; display_name: string }> | null;

          return {
            type: 'prerequisite_chain' as const,
            concept_id,
            chain: (conceptData || []).map(c => ({
              concept_id: c.id,
              display_name: c.display_name,
              depth: 1,
              best_video_id: null,
              best_video_title: null,
            })),
          };
        }

        // Fetch best video for each concept
        const chainIds = (data as Array<{ concept_id: string }>).map(d => d.concept_id);
        const { data: rawMentions } = await client
          .from('concept_mentions')
          .select('concept_id, video_id')
          .in('concept_id', chainIds)
          .in('mention_type', ['defines', 'explains'])
          .order('explanation_quality', { ascending: false, nullsFirst: false })
          .limit(chainIds.length * 2);
        const mentionData = rawMentions as Array<{ concept_id: string; video_id: string }> | null;

        const bestVideoMap = new Map<string, string>();
        for (const m of mentionData || []) {
          if (!bestVideoMap.has(m.concept_id)) bestVideoMap.set(m.concept_id, m.video_id);
        }

        const videoIds = [...new Set(bestVideoMap.values())];
        const { data: rawTitles } = await client
          .from('video_knowledge')
          .select('video_id, title')
          .in('video_id', videoIds);
        const titleMap = new Map((rawTitles as Array<{ video_id: string; title: string }> || []).map(v => [v.video_id, v.title]));

        return {
          type: 'prerequisite_chain' as const,
          concept_id,
          chain: (data as Array<{ concept_id: string; display_name: string; depth: number }>).map(d => {
            const vid = bestVideoMap.get(d.concept_id);
            return {
              concept_id: d.concept_id,
              display_name: d.display_name,
              depth: d.depth,
              best_video_id: vid || null,
              best_video_title: vid ? (titleMap.get(vid) || null) : null,
            };
          }),
        };
      },
    }),

    get_quiz: tool<GetQuizInput, {
      type: 'quiz';
      questions: Array<{
        question: string;
        question_type: string;
        correct_answer: string;
        distractors: string[];
        explanation: string;
        difficulty: string;
        bloom_level: string | null;
        concept: string | null;
        timestamp_seconds: number | null;
      }>;
      message?: string;
    }>({
      description: 'Get pre-computed quiz questions for the current video. Filtered by difficulty, Bloom level, or concept. Use when a user says "quiz me" or "test my understanding".',
      inputSchema: zodSchema(getQuizSchema),
      execute: async ({ difficulty, bloom_level, concept_id, limit }) => {
        const client = getAdminClient();
        if (!client) {
          return { type: 'quiz' as const, questions: [], message: 'Knowledge base not available' };
        }

        let query = client
          .from('quiz_questions')
          .select('question, question_type, correct_answer, distractors, explanation, difficulty, bloom_level, concept_id, timestamp_seconds')
          .eq('video_id', currentVideoId);

        if (difficulty) query = query.eq('difficulty', difficulty);
        if (bloom_level) query = query.eq('bloom_level', bloom_level);
        if (concept_id) query = query.eq('concept_id', concept_id);

        const { data: rawData } = await query.limit(limit ?? 5);
        const data = rawData as Array<{
          question: string; question_type: string; correct_answer: string;
          distractors: string[]; explanation: string; difficulty: string;
          bloom_level: string | null; concept_id: string | null; timestamp_seconds: number | null;
        }> | null;

        if (!data?.length) {
          // Fallback: try quiz_seeds JSONB on video_knowledge
          const { data: rawVk } = await client
            .from('video_knowledge')
            .select('quiz_seeds')
            .eq('video_id', currentVideoId)
            .single();
          const vk = rawVk as { quiz_seeds: Array<{
            question: string; options?: Array<{ id: string; text: string }>;
            correct_id?: string; explanation?: string; timestamp?: number; difficulty?: string;
          }> } | null;

          if (vk?.quiz_seeds && Array.isArray(vk.quiz_seeds) && vk.quiz_seeds.length > 0) {
            const seeds = vk.quiz_seeds.slice(0, limit ?? 5);
            return {
              type: 'quiz' as const,
              questions: seeds.map(s => ({
                question: s.question,
                question_type: 'multiple_choice',
                correct_answer: s.options?.find(o => o.id === s.correct_id)?.text || '',
                distractors: s.options?.filter(o => o.id !== s.correct_id).map(o => o.text) || [],
                explanation: s.explanation || '',
                difficulty: s.difficulty || 'medium',
                bloom_level: null,
                concept: null,
                timestamp_seconds: s.timestamp || null,
              })),
            };
          }

          return { type: 'quiz' as const, questions: [], message: 'No quiz questions available for this video' };
        }

        // Resolve concept display names
        const conceptIds = data.filter(q => q.concept_id).map(q => q.concept_id!);
        const conceptMap = new Map<string, string>();
        if (conceptIds.length > 0) {
          const { data: rawConcepts } = await client.from('concepts').select('id, display_name').in('id', conceptIds);
          const concepts = rawConcepts as Array<{ id: string; display_name: string }> | null;
          for (const c of concepts || []) conceptMap.set(c.id, c.display_name);
        }

        return {
          type: 'quiz' as const,
          questions: data.map(q => ({
            question: q.question,
            question_type: q.question_type,
            correct_answer: q.correct_answer,
            distractors: q.distractors || [],
            explanation: q.explanation || '',
            difficulty: q.difficulty || 'medium',
            bloom_level: q.bloom_level || null,
            concept: q.concept_id ? (conceptMap.get(q.concept_id) || q.concept_id) : null,
            timestamp_seconds: q.timestamp_seconds || null,
          })),
        };
      },
    }),

    get_chapter_context: tool<GetChapterContextInput, {
      type: 'chapter_context';
      chapter: {
        title: string;
        start_seconds: number;
        end_seconds: number | null;
        summary: string | null;
        concepts: string[];
      } | null;
      moments: Array<{
        moment_type: string;
        timestamp_seconds: number;
        content: string;
      }>;
      message?: string;
    }>({
      description: 'Get the chapter and notable moments at a given timestamp. Use when the user asks "what is being discussed right now?" or needs context about the current section.',
      inputSchema: zodSchema(getChapterContextSchema),
      execute: async ({ timestamp_seconds }) => {
        const client = getAdminClient();
        if (!client) {
          return { type: 'chapter_context' as const, chapter: null, moments: [], message: 'Knowledge base not available' };
        }

        const { data: rawChapters } = await client
          .from('video_chapters')
          .select('title, start_seconds, end_seconds, summary, concepts')
          .eq('video_id', currentVideoId)
          .lte('start_seconds', timestamp_seconds)
          .order('start_seconds', { ascending: false })
          .limit(1);

        const chapters = rawChapters as Array<{
          title: string; start_seconds: number; end_seconds: number | null;
          summary: string | null; concepts: string[];
        }> | null;
        const chapter = chapters?.[0] || null;

        const { data: rawMoments } = await client
          .from('video_moments')
          .select('moment_type, timestamp_seconds, content')
          .eq('video_id', currentVideoId)
          .gte('timestamp_seconds', timestamp_seconds - 30)
          .lte('timestamp_seconds', timestamp_seconds + 30)
          .order('importance', { ascending: false })
          .limit(5);

        const moments = rawMoments as Array<{
          moment_type: string; timestamp_seconds: number; content: string;
        }> | null;

        return {
          type: 'chapter_context' as const,
          chapter: chapter ? {
            title: chapter.title,
            start_seconds: chapter.start_seconds,
            end_seconds: chapter.end_seconds,
            summary: chapter.summary,
            concepts: chapter.concepts || [],
          } : null,
          moments: (moments || []).map(m => ({
            moment_type: m.moment_type,
            timestamp_seconds: m.timestamp_seconds,
            content: m.content,
          })),
        };
      },
    }),

    explain_differently: tool<ExplainDifferentlyInput, {
      type: 'alternative_explanations';
      concept: string;
      alternatives: Array<{
        video_id: string;
        video_title: string;
        channel_name: string | null;
        pedagogical_approach: string | null;
        timestamp_seconds: number;
        context_snippet: string;
      }>;
      message?: string;
    }>({
      description: 'Find alternative explanations of a concept from other videos, using different teaching approaches. Use when a user says "I don\'t understand" or "explain it differently".',
      inputSchema: zodSchema(explainDifferentlySchema),
      execute: async ({ concept_id, current_approach }) => {
        const client = getAdminClient();
        if (!client) {
          return { type: 'alternative_explanations' as const, concept: concept_id, alternatives: [], message: 'Knowledge base not available' };
        }

        let query = client
          .from('concept_mentions')
          .select('video_id, mention_type, pedagogical_approach, timestamp_seconds, context_snippet')
          .eq('concept_id', concept_id)
          .neq('video_id', currentVideoId)
          .in('mention_type', ['defines', 'explains'])
          .order('explanation_quality', { ascending: false, nullsFirst: false })
          .limit(8);

        if (current_approach) {
          query = query.neq('pedagogical_approach', current_approach);
        }

        const { data: rawMentions } = await query;
        const mentions = rawMentions as Array<{
          video_id: string; mention_type: string; pedagogical_approach: string | null;
          timestamp_seconds: number; context_snippet: string;
        }> | null;

        if (!mentions?.length) {
          return { type: 'alternative_explanations' as const, concept: concept_id, alternatives: [], message: `No alternative explanations found for "${concept_id}"` };
        }

        const videoIds = [...new Set(mentions.map(m => m.video_id))];
        const { data: rawVideos } = await client
          .from('video_knowledge')
          .select('video_id, title, channel_id')
          .in('video_id', videoIds);
        const videoData = rawVideos as Array<{ video_id: string; title: string; channel_id: string | null }> | null;
        const titleMap = new Map(videoData?.map(v => [v.video_id, v.title]) || []);
        const channelMap = new Map(videoData?.map(v => [v.video_id, v.channel_id]) || []);

        return {
          type: 'alternative_explanations' as const,
          concept: concept_id,
          alternatives: mentions.map(m => ({
            video_id: m.video_id,
            video_title: titleMap.get(m.video_id) || 'Unknown',
            channel_name: channelMap.get(m.video_id) || null,
            pedagogical_approach: m.pedagogical_approach || null,
            timestamp_seconds: m.timestamp_seconds,
            context_snippet: m.context_snippet || '',
          })),
        };
      },
    }),

    get_learning_path: tool<GetLearningPathInput, {
      type: 'learning_path';
      from_concept: string;
      to_concept: string;
      steps: Array<{
        step: number;
        concept_id: string;
        display_name: string;
        best_video_id: string | null;
        best_video_title: string | null;
      }>;
      message?: string;
    }>({
      description: 'Find the shortest learning path between two concepts through the prerequisite graph. Use when a user asks "how do I get from X to Y?" or "what do I need to learn to understand Y?"',
      inputSchema: zodSchema(getLearningPathSchema),
      execute: async ({ from_concept, to_concept }) => {
        const client = getAdminClient();
        if (!client) {
          return { type: 'learning_path' as const, from_concept, to_concept, steps: [], message: 'Knowledge base not available' };
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (client.rpc as any)('get_learning_path', {
          p_from_concept: from_concept,
          p_to_concept: to_concept,
          p_max_depth: 8,
        });

        if (error || !data?.length) {
          return { type: 'learning_path' as const, from_concept, to_concept, steps: [], message: `No path found from "${from_concept}" to "${to_concept}"` };
        }

        return {
          type: 'learning_path' as const,
          from_concept,
          to_concept,
          steps: (data as Array<{
            step: number; concept_id: string; display_name: string;
            best_video_id: string | null; best_video_title: string | null;
          }>).map(d => ({
            step: d.step,
            concept_id: d.concept_id,
            display_name: d.display_name,
            best_video_id: d.best_video_id || null,
            best_video_title: d.best_video_title || null,
          })),
        };
      },
    }),
  };
}
