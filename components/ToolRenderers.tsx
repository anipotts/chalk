'use client';

import { formatTimestamp } from '@/lib/video-utils';
import { ArrowSquareOut, Clock, VideoCamera, TreeStructure, Exam, BookOpen, Shuffle, Path, SquareHalf } from '@phosphor-icons/react';

// Tool result types matching the server-side tool outputs

export interface CiteMomentResult {
  type: 'cite_moment';
  timestamp: string;
  timestamp_seconds: number;
  label: string;
  context: string;
  transcript_line: string;
  video_id: string;
}

export interface ReferenceVideoResult {
  type: 'reference_video';
  video_id: string;
  timestamp_seconds: number | null;
  video_title: string;
  channel_name: string;
  reason: string;
  thumbnail_url: string;
  caption_excerpt: string | null;
  relationship?: string;
  shared_concepts?: string[];
}

export interface SearchResult {
  type: 'search_results';
  query: string;
  results: Array<{
    kind: string;
    video_id: string;
    title: string;
    channel_name: string | null;
    mention_type?: string;
  }>;
  message?: string;
}

export interface PrerequisiteChainResult {
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
}

export interface QuizResult {
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
}

export interface ChapterContextResult {
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
}

export interface AlternativeExplanationsResult {
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
}

export interface LearningPathResult {
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
}

export type ToolResult =
  | CiteMomentResult
  | ReferenceVideoResult
  | SearchResult
  | PrerequisiteChainResult
  | QuizResult
  | ChapterContextResult
  | AlternativeExplanationsResult
  | LearningPathResult;

export interface ToolCallData {
  toolName: string;
  result: ToolResult;
}

// === UI Components ===

/**
 * Inline citation pill for a specific video moment.
 */
export function CiteMomentCard({
  result,
  onSeek,
}: {
  result: CiteMomentResult;
  onSeek: (seconds: number) => void;
}) {
  return (
    <button
      onClick={() => onSeek(result.timestamp_seconds)}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-chalk-accent/15 hover:bg-chalk-accent/25 text-chalk-accent text-sm transition-colors cursor-pointer border border-chalk-accent/20"
      title={result.context}
    >
      <Clock size={14} weight="bold" />
      <span className="font-medium">[{result.timestamp}]</span>
      <span className="text-slate-300">{result.label}</span>
    </button>
  );
}

const relationshipLabels: Record<string, string> = {
  prerequisite: 'Prerequisite',
  follow_up: 'Follow-up',
  related: 'Related',
  deeper_dive: 'Deeper Dive',
  alternative_explanation: 'Alt. Explanation',
  builds_on: 'Builds On',
  contrasts: 'Contrasts',
};

/**
 * Card showing a referenced video with thumbnail, title, channel, and reason.
 * Clicking opens a 55/45 split-screen view alongside the main video.
 */
export function ReferenceVideoCard({
  result,
  onOpenVideo,
}: {
  result: ReferenceVideoResult;
  onOpenVideo?: (videoId: string, title: string, channelName: string, seekTo?: number) => void;
}) {
  const handleClick = () => {
    if (onOpenVideo) {
      onOpenVideo(result.video_id, result.video_title, result.channel_name, result.timestamp_seconds ?? undefined);
    }
  };

  const handleNewTab = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = result.timestamp_seconds
      ? `/watch?v=${result.video_id}&t=${Math.floor(result.timestamp_seconds)}`
      : `/watch?v=${result.video_id}`;
    window.open(url, '_blank');
  };

  return (
    <div
      onClick={handleClick}
      className="flex gap-3 p-3 rounded-xl bg-white/[0.04] hover:bg-chalk-accent/[0.06] border border-white/[0.06] hover:border-chalk-accent/20 cursor-pointer transition-all group my-2"
    >
      <div className="flex-shrink-0 w-28 h-16 rounded-lg overflow-hidden bg-white/[0.06] relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={result.thumbnail_url}
          alt={result.video_title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {result.timestamp_seconds !== null && (
          <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-white text-[10px] px-1 rounded font-mono">
            {formatTimestamp(result.timestamp_seconds)}
          </span>
        )}
        {/* Split-screen indicator on hover */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
          <SquareHalf size={20} weight="bold" className="text-white" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-1">
          <VideoCamera size={14} className="text-chalk-accent flex-shrink-0 mt-0.5" weight="fill" />
          <span className="text-sm font-medium text-slate-200 line-clamp-1">{result.video_title}</span>
        </div>
        <div className="text-xs text-slate-400 mt-0.5">{result.channel_name}</div>
        {result.relationship && (
          <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-300 mt-1">
            {relationshipLabels[result.relationship] || result.relationship}
          </span>
        )}
        <div className="text-xs text-slate-400 mt-1 line-clamp-2">{result.reason}</div>
        {result.shared_concepts && result.shared_concepts.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {result.shared_concepts.slice(0, 5).map((concept, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-400">
                {concept}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col items-center gap-1 flex-shrink-0">
        <button
          onClick={handleNewTab}
          className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] opacity-0 group-hover:opacity-100 transition-opacity"
          title="Open in new tab"
        >
          <ArrowSquareOut size={14} />
        </button>
      </div>
    </div>
  );
}

/**
 * Prerequisite chain visualization — shows concepts to learn first.
 */
export function PrerequisiteChainCard({
  result,
  onOpenVideo,
}: {
  result: PrerequisiteChainResult;
  onOpenVideo?: (videoId: string, title: string, channelName: string, seekTo?: number) => void;
}) {
  if (result.message || result.chain.length === 0) {
    return null;
  }

  // Group by depth
  const byDepth = new Map<number, typeof result.chain>();
  for (const item of result.chain) {
    if (!byDepth.has(item.depth)) byDepth.set(item.depth, []);
    byDepth.get(item.depth)!.push(item);
  }

  return (
    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] my-2">
      <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
        <TreeStructure size={14} weight="bold" />
        <span>Prerequisites for this concept</span>
      </div>
      <div className="space-y-1">
        {[...byDepth.entries()].sort((a, b) => a[0] - b[0]).map(([depth, items]) => (
          <div key={depth} className="flex flex-wrap gap-1.5" style={{ paddingLeft: `${(depth - 1) * 12}px` }}>
            {items.map(item => (
              <button
                key={item.concept_id}
                onClick={() => {
                  if (item.best_video_id && onOpenVideo) {
                    onOpenVideo(item.best_video_id, item.best_video_title || item.display_name, '', undefined);
                  }
                }}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs transition-colors ${
                  item.best_video_id
                    ? 'bg-chalk-accent/10 text-chalk-accent hover:bg-chalk-accent/20 cursor-pointer'
                    : 'bg-white/[0.06] text-slate-300'
                }`}
                title={item.best_video_title ? `Watch: ${item.best_video_title}` : item.display_name}
              >
                {depth > 1 && <span className="text-slate-500">{'>'}</span>}
                {item.display_name}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Interactive quiz card with reveal-on-click answers.
 */
export function QuizCard({
  result,
  onSeek,
}: {
  result: QuizResult;
  onSeek: (seconds: number) => void;
}) {
  if (result.message || result.questions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 my-2">
      {result.questions.map((q, i) => (
        <QuizQuestion key={i} question={q} onSeek={onSeek} />
      ))}
    </div>
  );
}

function QuizQuestion({
  question: q,
  onSeek,
}: {
  question: QuizResult['questions'][0];
  onSeek: (seconds: number) => void;
}) {
  return (
    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
      <div className="flex items-start gap-2">
        <Exam size={14} className="text-amber-400 flex-shrink-0 mt-0.5" weight="bold" />
        <div className="flex-1">
          <div className="text-sm text-slate-200">{q.question}</div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {q.bloom_level && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 uppercase">
                {q.bloom_level}
              </span>
            )}
            <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase ${
              q.difficulty === 'easy' ? 'bg-green-500/15 text-green-300' :
              q.difficulty === 'hard' ? 'bg-red-500/15 text-red-300' :
              'bg-amber-500/15 text-amber-300'
            }`}>
              {q.difficulty}
            </span>
            {q.timestamp_seconds !== null && (
              <button
                onClick={() => onSeek(q.timestamp_seconds!)}
                className="text-[10px] px-1.5 py-0.5 rounded bg-chalk-accent/15 text-chalk-accent hover:bg-chalk-accent/25 transition-colors"
              >
                [{formatTimestamp(q.timestamp_seconds!)}]
              </button>
            )}
          </div>
          {/* Answer (shown as details toggle) */}
          <details className="mt-2">
            <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-300">Show answer</summary>
            <div className="mt-1.5 text-xs text-slate-300 pl-2 border-l border-chalk-accent/30">
              <div className="font-medium text-green-300">{q.correct_answer}</div>
              {q.explanation && <div className="mt-1 text-slate-400">{q.explanation}</div>}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

/**
 * Chapter context card — shows current chapter info and nearby moments.
 */
export function ChapterContextCard({
  result,
  onSeek,
}: {
  result: ChapterContextResult;
  onSeek: (seconds: number) => void;
}) {
  if (!result.chapter && result.moments.length === 0) return null;

  return (
    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] my-2">
      {result.chapter && (
        <div className="mb-2">
          <div className="flex items-center gap-1.5">
            <BookOpen size={14} className="text-blue-400" weight="bold" />
            <button
              onClick={() => onSeek(result.chapter!.start_seconds)}
              className="text-sm font-medium text-slate-200 hover:text-chalk-accent transition-colors"
            >
              {result.chapter.title}
            </button>
          </div>
          {result.chapter.summary && (
            <div className="text-xs text-slate-400 mt-1 ml-5">{result.chapter.summary}</div>
          )}
        </div>
      )}
      {result.moments.length > 0 && (
        <div className="space-y-1 mt-2">
          {result.moments.map((m, i) => (
            <button
              key={i}
              onClick={() => onSeek(m.timestamp_seconds)}
              className="flex items-start gap-1.5 w-full text-left text-xs hover:bg-white/[0.04] rounded px-1 py-0.5 transition-colors"
            >
              <span className="text-chalk-accent font-mono flex-shrink-0">
                [{formatTimestamp(m.timestamp_seconds)}]
              </span>
              <span className="text-slate-500">{m.moment_type}:</span>
              <span className="text-slate-300 line-clamp-1">{m.content}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Alternative explanations — shows different teaching approaches for a concept.
 */
export function AlternativeExplanationsCard({
  result,
  onOpenVideo,
}: {
  result: AlternativeExplanationsResult;
  onOpenVideo?: (videoId: string, title: string, channelName: string, seekTo?: number) => void;
}) {
  if (result.message || result.alternatives.length === 0) return null;

  const approachLabels: Record<string, string> = {
    visual_geometric: 'Visual',
    algebraic_symbolic: 'Algebraic',
    intuitive_analogy: 'Analogy',
    formal_proof: 'Proof',
    code_implementation: 'Code',
    worked_example: 'Example',
    historical_narrative: 'History',
    comparative: 'Comparison',
    socratic: 'Socratic',
  };

  return (
    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] my-2">
      <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
        <Shuffle size={14} weight="bold" />
        <span>Alternative explanations</span>
      </div>
      <div className="space-y-2">
        {result.alternatives.slice(0, 4).map((alt, i) => (
          <button
            key={i}
            onClick={() => onOpenVideo?.(alt.video_id, alt.video_title, alt.channel_name || '', alt.timestamp_seconds)}
            className="flex items-start gap-2 w-full text-left hover:bg-white/[0.04] rounded-lg p-1.5 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm text-slate-200 line-clamp-1">{alt.video_title}</div>
              <div className="text-xs text-slate-400">{alt.channel_name || 'Unknown'}</div>
            </div>
            {alt.pedagogical_approach && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 flex-shrink-0">
                {approachLabels[alt.pedagogical_approach] || alt.pedagogical_approach}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Learning path — shows step-by-step concept progression.
 */
export function LearningPathCard({
  result,
  onOpenVideo,
}: {
  result: LearningPathResult;
  onOpenVideo?: (videoId: string, title: string, channelName: string, seekTo?: number) => void;
}) {
  if (result.message || result.steps.length === 0) return null;

  return (
    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] my-2">
      <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
        <Path size={14} weight="bold" />
        <span>Learning path</span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {result.steps.map((step, i) => (
          <div key={step.concept_id} className="flex items-center gap-1">
            {i > 0 && <span className="text-slate-500 text-xs">{'>'}</span>}
            <button
              onClick={() => {
                if (step.best_video_id && onOpenVideo) {
                  onOpenVideo(step.best_video_id, step.best_video_title || step.display_name, '', undefined);
                }
              }}
              className={`px-2 py-0.5 rounded-md text-xs transition-colors ${
                step.best_video_id
                  ? 'bg-chalk-accent/10 text-chalk-accent hover:bg-chalk-accent/20 cursor-pointer'
                  : 'bg-white/[0.06] text-slate-300'
              }`}
              title={step.best_video_title || step.display_name}
            >
              {step.display_name}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// === Registry / Renderer ===

/**
 * Renders a tool result based on its type.
 */
export function ToolResultRenderer({
  toolCall,
  onSeek,
  onOpenVideo,
}: {
  toolCall: ToolCallData;
  onSeek: (seconds: number) => void;
  onOpenVideo?: (videoId: string, title: string, channelName: string, seekTo?: number) => void;
}) {
  const { result } = toolCall;

  switch (result.type) {
    case 'cite_moment':
      return <CiteMomentCard result={result} onSeek={onSeek} />;
    case 'reference_video':
      return <ReferenceVideoCard result={result} onOpenVideo={onOpenVideo} />;
    case 'prerequisite_chain':
      return <PrerequisiteChainCard result={result} onOpenVideo={onOpenVideo} />;
    case 'quiz':
      return <QuizCard result={result} onSeek={onSeek} />;
    case 'chapter_context':
      return <ChapterContextCard result={result} onSeek={onSeek} />;
    case 'alternative_explanations':
      return <AlternativeExplanationsCard result={result} onOpenVideo={onOpenVideo} />;
    case 'learning_path':
      return <LearningPathCard result={result} onOpenVideo={onOpenVideo} />;
    case 'search_results':
      // Search results are internal — the model uses them to make reference_video calls
      return null;
    default:
      return null;
  }
}

/**
 * Parses a stream chunk to separate text and tool results.
 * Tool results are delimited by \x1D (group separator).
 */
export function parseStreamWithToolCalls(fullText: string): {
  text: string;
  toolCalls: ToolCallData[];
} {
  const toolCalls: ToolCallData[] = [];
  let cleanText = '';
  let remaining = fullText;

  while (remaining.length > 0) {
    const startIdx = remaining.indexOf('\x1D');
    if (startIdx === -1) {
      cleanText += remaining;
      break;
    }

    cleanText += remaining.slice(0, startIdx);

    const endIdx = remaining.indexOf('\x1D', startIdx + 1);
    if (endIdx === -1) {
      break;
    }

    const jsonStr = remaining.slice(startIdx + 1, endIdx);
    try {
      const parsed = JSON.parse(jsonStr) as ToolCallData;
      if (parsed.toolName && parsed.result) {
        toolCalls.push(parsed);
      }
    } catch {
      // Malformed JSON, skip
    }

    remaining = remaining.slice(endIdx + 1);
  }

  return { text: cleanText, toolCalls };
}
