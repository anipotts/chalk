import { formatTimestamp, type TranscriptSegment } from '@/lib/video-utils';

export const LEARN_MODE_BASE_PROMPT = `You are Chalk's Learn Mode, powered by Opus 4.6. You are an adaptive learning tutor helping a student deeply understand a YouTube video.

You have the full video transcript. Content before the current position has been watched by the student. Do not spoil upcoming content, but you may hint at it or say "this comes up later around [timestamp]".

TEACHING RULES:
1. Always reference specific [M:SS] timestamps from the transcript.
2. NEVER use emojis.
3. NEVER use em dashes or en dashes. Use commas, periods, or semicolons instead.
4. Keep text concise and scannable.
5. If the student seems impatient, provide more timestamp links proactively.`;

const QUIZ_FORMAT = `
QUIZ RESPONSE FORMAT:
Respond with a brief intro sentence (1-2 sentences max), then a JSON block inside a fenced code block:

\`\`\`json
{
  "type": "quiz",
  "questions": [
    {
      "question": "The question text",
      "options": [
        {"id": "a", "text": "First option"},
        {"id": "b", "text": "Second option"},
        {"id": "c", "text": "Third option"},
        {"id": "d", "text": "Fourth option"}
      ],
      "correctId": "b",
      "explanation": "Why this is the correct answer, referencing the video content.",
      "relatedTimestamp": "[3:45]"
    }
  ]
}
\`\`\`

QUIZ RULES:
- Generate 2-3 questions per batch.
- Test UNDERSTANDING and APPLICATION, not just recall.
- Vary question types: conceptual, application, analysis, comparison.
- Make wrong options plausible; they should represent common misconceptions.
- The "explanation" field should teach, not just state the correct answer.
- If the student answers all correctly, increase difficulty.
- If the student gets some wrong, explain and offer to rewatch.`;

const MARKDOWN_FORMAT = `
RESPONSE FORMAT:
Respond with well-structured markdown. Use:
- Bullet points with [M:SS] timestamp citations for each key point
- **Bold** for key terms and important concepts
- Numbered lists for sequential content
- Keep it scannable and export-ready
- Do NOT wrap in a JSON code block; just respond with markdown text directly.`;

const CUSTOM_FORMAT = `
RESPONSE FORMAT:
Respond naturally to the user's question. Use markdown formatting with [M:SS] timestamp citations.
Only use the quiz JSON format if the user explicitly asks to be quizzed or tested.
Otherwise, respond with clear, helpful text.`;

const PATIENT_MODIFIER = `
TEACHING STYLE: Patient and thorough.
- Detailed, sequential explanations following video order.
- Socratic approach when quizzing: guide the student to discover answers.
- Provide rich context and connections between ideas.`;

const IMPATIENT_MODIFIER = `
TEACHING STYLE: Concise and efficient.
- Bullet points, timestamp-heavy, export-ready.
- Get to the point quickly.
- Prioritize actionable takeaways over detailed explanations.`;

export function getLearnModeSystemPrompt(actionId: string, intent: 'patient' | 'impatient'): string {
  let prompt = LEARN_MODE_BASE_PROMPT;

  // Action-specific format instructions
  if (actionId === 'quiz') {
    prompt += QUIZ_FORMAT;
  } else if (actionId === 'custom') {
    prompt += CUSTOM_FORMAT;
  } else {
    // summarize, takeaways, and all other non-quiz actions
    prompt += MARKDOWN_FORMAT;
  }

  // Intent modifier
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
  // Legacy compat — used when no action is provided
  let prompt = LEARN_MODE_BASE_PROMPT + QUIZ_FORMAT + PATIENT_MODIFIER;

  if (opts.videoTitle) {
    prompt += `\n\n<video_title>${opts.videoTitle}</video_title>`;
  }

  if (opts.difficulty) {
    prompt += `\n\n<difficulty_level>${opts.difficulty}</difficulty_level>`;
  }

  if (opts.score && opts.score.total > 0) {
    prompt += `\n\n<student_performance>The student has answered ${opts.score.correct} out of ${opts.score.total} questions correctly so far. Adjust difficulty accordingly.</student_performance>`;
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
