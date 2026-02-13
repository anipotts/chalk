// Shared TypeScript interfaces for the batch extraction pipeline.
// Used by both local scripts (scripts/batch-preprocess/) and Vercel cron (app/api/cron/).
// Schema v2: concept-first design with pedagogical metadata.

export interface ChannelConfig {
  id: string;
  name: string;
  handle?: string;
  tier: 1 | 2 | 3 | 4;
  category: 'ai_ml' | 'math_cs' | 'programming' | 'science' | 'safety' | 'general';
  /** Max videos to process (null = ALL for tier 1) */
  maxVideos: number | null;
  /** Keywords for tier 3/4 filtering */
  keywords?: string[];
  /** Force-include these video IDs regardless of filtering */
  forceInclude?: string[];
}

export interface VideoManifestEntry {
  videoId: string;
  channelId: string;
  channelName: string;
  title: string;
  tier: 1 | 2 | 3 | 4;
  viewCount?: number;
  durationSeconds?: number;
  uploadDate?: string;
  thumbnailUrl?: string;
}

export interface TranscriptSegment {
  text: string;
  offset: number;   // seconds (matches lib/video-utils.ts)
  duration: number;
}

// === EDC Pipeline Types (Extract-Define-Canonicalize) ===

export type MentionType = 'defines' | 'explains' | 'uses' | 'references' | 'assumes' | 'introduces' | 'compares';

export type PedagogicalApproach =
  | 'visual_geometric'
  | 'algebraic_symbolic'
  | 'intuitive_analogy'
  | 'formal_proof'
  | 'code_implementation'
  | 'worked_example'
  | 'historical_narrative'
  | 'comparative'
  | 'socratic';

export interface ConceptExtraction {
  canonical_name: string;       // lowercase_underscores: "attention_mechanism"
  display_name: string;         // "Attention Mechanism"
  definition: string;           // 1-sentence as the video explains it
  aliases: string[];            // Alternative names
  mention_type: MentionType;
  timestamp: number;            // First mention in seconds
  depends_on: string[];         // canonical_names this builds on (in this video only)
  enables: string[];            // canonical_names this enables (in this video only)
  domain: string[];             // e.g. ["machine_learning", "deep_learning"]
  pedagogical_approach?: PedagogicalApproach;  // v2: HOW this video teaches the concept
}

export type RelationType = 'prerequisite' | 'part_of' | 'enables' | 'contrasts' | 'specializes' | 'generalizes' | 'applied_in' | 'co_occurs';

export interface ConceptRelationExtraction {
  source: string;               // canonical_name
  target: string;               // canonical_name
  relation_type: RelationType;
  confidence: number;           // 0-1
}

export interface ExternalReferenceExtraction {
  name: string;
  ref_type: 'paper' | 'book' | 'website' | 'tool' | 'course' | 'video';
  timestamp: number;
  description: string;
  url?: string;
}

// v2: Unified moment type (replaces separate notable_quotes, analogies, etc.)
export type MomentType =
  | 'quote' | 'analogy' | 'aha_moment' | 'misconception' | 'application'
  | 'question' | 'insight' | 'definition' | 'example' | 'proof' | 'joke' | 'callout';

export interface MomentExtraction {
  moment_type: MomentType;
  timestamp: number;
  content: string;              // The text/quote/analogy itself
  context?: string;             // Surrounding context
  concept_ids?: string[];       // Related canonical_names
  importance?: number;          // 0-1
  metadata?: Record<string, unknown>;  // Type-specific (e.g., analogy: source_domain/target_domain)
}

// v2: Enhanced quiz with Bloom taxonomy
export type BloomLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
export type QuestionType = 'multiple_choice' | 'true_false' | 'fill_blank' | 'explain' | 'apply';

export interface QuizQuestionExtraction {
  question: string;
  question_type: QuestionType;
  correct_answer: string;
  distractors: string[];        // Wrong answers for MC
  explanation: string;
  concept_id?: string;          // canonical_name this tests
  difficulty: 'easy' | 'medium' | 'hard';
  bloom_level: BloomLevel;
  timestamp?: number;
}

export interface ChapterExtraction {
  start_timestamp: number;
  end_timestamp: number;
  title: string;
  summary: string;
  concepts: string[];           // v2: canonical_names covered in this chapter
  difficulty: string;
  speaker_energy: string;
  visual_content: string;
}

export interface ExtractionResult {
  // Video-level metadata
  summary: string;
  topics: string[];
  topic_hierarchy: string[];
  target_audience: string;
  content_type: string;
  difficulty: 'introductory' | 'intermediate' | 'advanced';
  prerequisites: string[];
  learning_objectives: string[];
  teaching_approach: string[];
  transcript_quality: {
    accuracy: 'high' | 'medium' | 'low';
    has_technical_errors: boolean;
    notes: string;
  };

  // EDC concept extractions
  concepts: ConceptExtraction[];
  concept_relations: ConceptRelationExtraction[];
  external_references: ExternalReferenceExtraction[];

  // Chapter-level
  chapter_summaries: ChapterExtraction[];

  // v2: Unified moments (replaces separate notable_quotes, analogies, etc.)
  moments: MomentExtraction[];

  // v2: Enhanced quiz questions
  quiz_questions: QuizQuestionExtraction[];

  // Timeline structural markers
  timeline_events: Array<{
    type: 'topic_change' | 'example_start' | 'example_end' | 'recap' | 'key_insight' | 'demonstration' | 'tangent' | 'joke';
    timestamp: number;
    label: string;
  }>;

  // Suggested learner questions (per chapter)
  suggested_questions: Array<{
    question: string;
    chapter_index: number;
    timestamp: number;
  }>;

  // Legacy JSONB fields still extracted for backward compat (stored in video_knowledge JSONB columns)
  timestamped_concepts: Array<{
    timestamp: number;
    concept: string;
    canonical_name: string;
    summary: string;
    related_concepts: string[];
  }>;
}

export interface CostEntry {
  videoId: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costCents: number;
  status: 'success' | 'error';
  timestamp: string;
  phase: string;
}

export interface BatchStatus {
  videoId: string;
  status: 'pending' | 'transcript_done' | 'extraction_done' | 'normalized' | 'connected' | 'enriched' | 'embedded' | 'completed' | 'failed';
  errorMessage?: string;
  attemptCount: number;
  extractionVersion: number;
  lastAttemptAt?: string;
}
