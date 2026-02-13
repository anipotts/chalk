import { CHALK_VOICE, VIDEO_RULES } from './shared';
import { formatTimestamp, type TranscriptSegment } from '@/lib/video-utils';

export const LEARN_MODE_BASE_PROMPT = `${CHALK_VOICE}
${VIDEO_RULES}

You are Chalk's Learn Mode (Opus 4.6). Adaptive tutor helping a student deeply understand this video.
Content before current position is watched. Do not spoil upcoming content.`;

const QUIZ_FORMAT = `
QUIZ FORMAT:
Brief intro (1-2 sentences), then a fenced JSON block:

\`\`\`json
{
  "type": "quiz",
  "questions": [
    {
      "question": "...",
      "options": [{"id": "a", "text": "..."}, {"id": "b", "text": "..."}, {"id": "c", "text": "..."}, {"id": "d", "text": "..."}],
      "correctId": "b",
      "explanation": "Why correct, referencing video content.",
      "relatedTimestamp": "[3:45]"
    }
  ]
}
\`\`\`

QUIZ RULES:
- 2-3 questions per batch. Test understanding, not recall.
- Vary types: conceptual, application, analysis. Plausible wrong options.
- Explanation teaches, not just states the answer.
- Adjust difficulty based on student performance.`;

const MARKDOWN_FORMAT = `
FORMAT: Bullet points with [M:SS] citations. **Bold** key terms. Numbered lists for sequential content. Scannable and export-ready.`;

const CUSTOM_FORMAT = `
FORMAT: Natural markdown with [M:SS] citations. Only use quiz JSON if explicitly asked.`;

const PATIENT_MODIFIER = `\nSTYLE: Patient, thorough. Socratic when quizzing. Rich context and connections.`;
const IMPATIENT_MODIFIER = `\nSTYLE: Concise, efficient. Bullet points, timestamp-heavy. Actionable takeaways.`;

export function getLearnModeSystemPrompt(actionId: string, intent: 'patient' | 'impatient'): string {
  let prompt = LEARN_MODE_BASE_PROMPT;

  if (actionId === 'quiz') {
    prompt += QUIZ_FORMAT;
  } else if (actionId === 'custom') {
    prompt += CUSTOM_FORMAT;
  } else {
    prompt += MARKDOWN_FORMAT;
  }

  prompt += intent === 'patient' ? PATIENT_MODIFIER : IMPATIENT_MODIFIER;
  return prompt;
}

export function buildLearnModePrompt(opts: {
  transcriptContext: string;
  currentTimestamp: string;
  videoTitle?: string;
  difficulty?: string;
  score?: { correct: number; total: number };
}): string {
  let prompt = LEARN_MODE_BASE_PROMPT + QUIZ_FORMAT + PATIENT_MODIFIER;

  if (opts.videoTitle) {
    prompt += `\n\n<video_title>${opts.videoTitle}</video_title>`;
  }
  if (opts.difficulty) {
    prompt += `\n\n<difficulty_level>${opts.difficulty}</difficulty_level>`;
  }
  if (opts.score && opts.score.total > 0) {
    prompt += `\n\n<student_performance>${opts.score.correct}/${opts.score.total} correct. Adjust difficulty accordingly.</student_performance>`;
  }
  prompt += `\n\n<current_position>${opts.currentTimestamp}</current_position>`;
  prompt += `\n\n<transcript>\n${opts.transcriptContext}\n</transcript>`;
  return prompt;
}

export function buildTranscriptContext(
  segments: TranscriptSegment[],
  currentTime: number,
): string {
  const watched = segments.filter((s) => s.offset <= currentTime);
  const upcoming = segments.filter((s) => s.offset > currentTime);

  let context = '';
  if (watched.length > 0) {
    context += '<watched_content priority="high">\n';
    context += watched.map((s) => `[${formatTimestamp(s.offset)}] ${s.text}`).join('\n');
    context += '\n</watched_content>';
  }
  if (upcoming.length > 0) {
    context += '\n\n<upcoming_content priority="low">\n';
    context += upcoming.map((s) => `[${formatTimestamp(s.offset)}] ${s.text}`).join('\n');
    context += '\n</upcoming_content>';
  }
  return context || '(No transcript available)';
}
