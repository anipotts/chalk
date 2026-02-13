/**
 * Extraction system prompt + tool schema (v2).
 * Shared by:
 * - scripts/batch-preprocess/extract.ts (local batch)
 * - app/api/cron/process-new-videos/route.ts (Vercel auto-processing)
 *
 * v2 changes:
 * - Concepts include pedagogical_approach (HOW the video teaches it)
 * - Unified moments array (replaces separate quotes/analogies/misconceptions/aha arrays)
 * - Quiz questions with Bloom taxonomy levels
 * - Chapters link to concept canonical_names
 * - co_occurs relation type
 */

export const EXTRACTION_SYSTEM_PROMPT = `You are a video content analyst. Extract structured knowledge from educational video transcripts.

RULES:
- Timestamps are in seconds (the transcript provides them)
- Be precise with definitions — use the video's exact framing, not textbook definitions
- chapter_summaries: divide the video into 3-10 logical sections based on topic shifts
- If the transcript is low quality (many [Music] tags, garbled text), set transcript_quality.accuracy to "low"

CONCEPT EXTRACTION (EDC Pipeline):
1. EXTRACT: Identify every concept, term, entity, algorithm, person, paper, tool
2. DEFINE: Write a 1-sentence definition as the video explains it
3. CANONICALIZE: Normalize to lowercase_underscores. "Self-Attention" → "self_attention"
   - Mark mention_type: defines | explains | uses | references | assumes | introduces | compares
     - "defines": video gives a formal or clear definition
     - "explains": video walks through how it works
     - "uses": video applies it without explaining
     - "references": brief mention without deep explanation
     - "assumes": video expects the viewer already knows this
     - "introduces": first appearance of a novel term
     - "compares": concept is compared/contrasted with another
   - Mark pedagogical_approach: HOW the video teaches this concept
     - "visual_geometric": geometric intuition, diagrams, spatial reasoning
     - "algebraic_symbolic": formulas, equations, symbolic manipulation
     - "intuitive_analogy": everyday analogies, metaphors
     - "formal_proof": rigorous mathematical proof
     - "code_implementation": code walkthroughs, implementations
     - "worked_example": step-by-step problem solving
     - "historical_narrative": history of the concept, who invented it
     - "comparative": comparing multiple approaches
     - "socratic": question-driven exploration
   - Mark depends_on/enables: only concepts IN THIS VIDEO (use canonical_names)
   - Mark domain: broad category tags
   - Include aliases: alternative names the speaker uses

CONCEPT RELATIONS:
- Extract typed relationships between concepts in this video
- Only include relations explicitly stated or strongly implied
- Types: prerequisite | part_of | enables | contrasts | specializes | generalizes | applied_in | co_occurs
- co_occurs: concepts that are discussed together but without explicit directional relationship

MOMENTS (unified):
- Extract notable moments from the video into a single array
- Each moment has a type: quote | analogy | aha_moment | misconception | application | question | insight | definition | example | proof | joke | callout
- Rate importance 0-1. Top moments should be the ones a student would highlight.
- For analogies, include source_domain/target_domain in metadata
- For misconceptions, include the correction in metadata
- For questions, include whether it's answered and when

QUIZ QUESTIONS:
- Create 2-4 questions per chapter section
- question_type: multiple_choice | true_false | fill_blank | explain | apply
- bloom_level: remember | understand | apply | analyze | evaluate | create
  - "remember": recall facts ("What is X?")
  - "understand": explain concepts ("Why does X happen?")
  - "apply": use in new situations ("Given X, what would Y be?")
  - "analyze": break down components ("How does X differ from Y?")
  - "evaluate": judge/critique ("Is X a good approach for Y? Why?")
  - "create": design new solutions ("Design an approach that...")
- Distractors should reflect real misconceptions, not obviously wrong answers
- Link to concept_id (canonical_name) when possible

EXTERNAL REFERENCES:
- Papers, books, websites, tools, courses, videos the speaker explicitly mentions
- Include timestamp and brief description`;

export const EXTRACTION_TOOL = {
  name: 'extract_video_knowledge',
  description: 'Extract structured knowledge from a video transcript. Call this with all extracted data.',
  input_schema: {
    type: 'object' as const,
    required: ['summary', 'topics', 'topic_hierarchy', 'target_audience', 'content_type',
               'difficulty', 'prerequisites', 'learning_objectives', 'teaching_approach',
               'concepts', 'concept_relations', 'external_references',
               'chapter_summaries', 'moments', 'quiz_questions',
               'timeline_events', 'suggested_questions', 'timestamped_concepts',
               'transcript_quality'],
    properties: {
      // === VIDEO-LEVEL METADATA ===
      summary: { type: 'string', description: '2-3 sentence summary of the entire video' },
      topics: { type: 'array', items: { type: 'string' }, description: '3-10 topics, lowercase' },
      topic_hierarchy: { type: 'array', items: { type: 'string' },
        description: 'Hierarchical path e.g. ["Computer Science","ML","Deep Learning","Transformers"]' },
      target_audience: { type: 'string',
        description: 'Who is this for? e.g. "ML practitioners familiar with neural networks"' },
      content_type: { type: 'string',
        enum: ['lecture','tutorial','walkthrough','interview','review','explainer','demo','panel','documentary'] },
      difficulty: { type: 'string', enum: ['introductory','intermediate','advanced'] },
      prerequisites: { type: 'array', items: { type: 'string' },
        description: '2-5 concepts/skills viewer should know beforehand' },
      learning_objectives: { type: 'array', items: { type: 'string' },
        description: '3-5 things viewer will understand after watching' },
      teaching_approach: { type: 'array', items: { type: 'string' },
        description: 'e.g. intuition_first, proof_first, example_driven, theory_heavy, hands_on, visual, math_notation_heavy' },
      transcript_quality: { type: 'object', properties: {
        accuracy: { type: 'string', enum: ['high','medium','low'] },
        has_technical_errors: { type: 'boolean' },
        notes: { type: 'string' }
      }},

      // === EDC CONCEPT EXTRACTIONS ===
      concepts: { type: 'array', items: { type: 'object', properties: {
        canonical_name: { type: 'string', description: 'Normalized lowercase_underscore form' },
        display_name: { type: 'string', description: 'Human-readable name' },
        definition: { type: 'string', description: '1-sentence definition as explained in video' },
        aliases: { type: 'array', items: { type: 'string' }, description: 'Alternative names' },
        mention_type: { type: 'string', enum: ['defines','explains','uses','references','assumes','introduces','compares'] },
        timestamp: { type: 'number', description: 'First mention in seconds' },
        depends_on: { type: 'array', items: { type: 'string' }, description: 'canonical_names this builds on' },
        enables: { type: 'array', items: { type: 'string' }, description: 'canonical_names this enables' },
        domain: { type: 'array', items: { type: 'string' }, description: 'Broad categories' },
        pedagogical_approach: { type: 'string',
          enum: ['visual_geometric','algebraic_symbolic','intuitive_analogy','formal_proof',
                 'code_implementation','worked_example','historical_narrative','comparative','socratic'],
          description: 'HOW the video teaches this concept' },
      }}, description: 'All concepts, terms, entities, people, papers, tools' },

      concept_relations: { type: 'array', items: { type: 'object', properties: {
        source: { type: 'string', description: 'canonical_name of source concept' },
        target: { type: 'string', description: 'canonical_name of target concept' },
        relation_type: { type: 'string', enum: ['prerequisite','part_of','enables','contrasts','specializes','generalizes','applied_in','co_occurs'] },
        confidence: { type: 'number', description: '0-1 confidence score' },
      }}, description: 'Typed relationships between concepts' },

      external_references: { type: 'array', items: { type: 'object', properties: {
        name: { type: 'string' },
        ref_type: { type: 'string', enum: ['paper','book','website','tool','course','video'] },
        timestamp: { type: 'number' },
        description: { type: 'string' },
        url: { type: 'string', description: 'URL if mentioned or inferrable' },
      }}, description: 'Papers, books, tools the speaker references' },

      // === CHAPTER-LEVEL ===
      chapter_summaries: { type: 'array', items: { type: 'object', properties: {
        start_timestamp: { type: 'number' },
        end_timestamp: { type: 'number' },
        title: { type: 'string', description: '3-8 words' },
        summary: { type: 'string', description: '2-3 sentences' },
        concepts: { type: 'array', items: { type: 'string' }, description: 'canonical_names covered in this chapter' },
        difficulty: { type: 'string', enum: ['introductory','intermediate','advanced'] },
        speaker_energy: { type: 'string', enum: ['excited','neutral','cautionary','humorous','building_tension'] },
        visual_content: { type: 'string', description: 'What is likely shown: slide, code, diagram, animation, talking head' }
      }}},

      // === UNIFIED MOMENTS ===
      moments: { type: 'array', items: { type: 'object', properties: {
        moment_type: { type: 'string',
          enum: ['quote','analogy','aha_moment','misconception','application','question','insight','definition','example','proof','joke','callout'] },
        timestamp: { type: 'number' },
        content: { type: 'string', description: 'The text/quote/analogy itself' },
        context: { type: 'string', description: 'Surrounding context' },
        concept_ids: { type: 'array', items: { type: 'string' }, description: 'Related canonical_names' },
        importance: { type: 'number', description: '0-1 how highlight-worthy this is' },
        metadata: { type: 'object', description: 'Type-specific: analogy has source_domain/target_domain, misconception has correction, question has is_answered/answer_timestamp' },
      }}, description: 'All notable moments: quotes, analogies, aha moments, misconceptions, etc.' },

      // === QUIZ QUESTIONS (Bloom taxonomy) ===
      quiz_questions: { type: 'array', items: { type: 'object', properties: {
        question: { type: 'string' },
        question_type: { type: 'string', enum: ['multiple_choice','true_false','fill_blank','explain','apply'] },
        correct_answer: { type: 'string' },
        distractors: { type: 'array', items: { type: 'string' }, description: 'Wrong answers for MC (2-4 options)' },
        explanation: { type: 'string', description: 'Why the answer is correct' },
        concept_id: { type: 'string', description: 'canonical_name this tests' },
        difficulty: { type: 'string', enum: ['easy','medium','hard'] },
        bloom_level: { type: 'string', enum: ['remember','understand','apply','analyze','evaluate','create'] },
        timestamp: { type: 'number', description: 'Video moment this tests' },
      }}, description: '2-4 quiz questions per chapter, Bloom-level tagged' },

      // === TIMELINE ===
      timestamped_concepts: { type: 'array', items: { type: 'object', properties: {
        timestamp: { type: 'number' },
        concept: { type: 'string' },
        canonical_name: { type: 'string' },
        summary: { type: 'string' },
        related_concepts: { type: 'array', items: { type: 'string' } }
      }}},
      timeline_events: { type: 'array', items: { type: 'object', properties: {
        type: { type: 'string', enum: ['topic_change','example_start','example_end','recap',
                'key_insight','demonstration','tangent','joke'] },
        timestamp: { type: 'number' },
        label: { type: 'string' }
      }}, description: 'Structural timeline markers' },
      suggested_questions: { type: 'array', items: { type: 'object', properties: {
        question: { type: 'string' },
        chapter_index: { type: 'number' },
        timestamp: { type: 'number' }
      }}, description: '2-3 contextual learner questions per chapter' },
    }
  }
};
