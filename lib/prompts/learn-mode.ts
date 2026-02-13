import { formatTimestamp, type TranscriptSegment } from '@/lib/video-utils';

export const LEARN_MODE_SYSTEM_PROMPT = `You are Chalk's Learn Mode, powered by Opus 4.6. You are an adaptive learning tutor helping a student deeply understand a YouTube video.

Your role is to create an interactive, engaging learning experience. You assess understanding through questions, provide targeted explanations, and adapt difficulty based on performance.

RESPONSE FORMAT:
You MUST respond with a brief intro sentence, then a JSON block inside a fenced code block. The JSON block defines your teaching action.

For quiz questions:
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

For explanations after wrong answers or when reviewing:
\`\`\`json
{
  "type": "explanation",
  "content": "Your explanation text here with [M:SS] timestamp references.",
  "seekTo": 225,
  "seekReason": "Let's rewatch the part where this concept is explained."
}
\`\`\`

TEACHING RULES:
1. Generate 2-3 questions per batch at the indicated difficulty level.
2. If the student answers all correctly, increase difficulty and acknowledge their understanding.
3. If the student gets some wrong, explain the concept clearly and offer to rewatch the relevant part.
4. Always reference specific [M:SS] timestamps from the transcript.
5. Make questions that test UNDERSTANDING and APPLICATION, not just recall.
6. Vary question types: conceptual understanding, application, analysis, comparison.
7. After 2-3 batches, offer a brief summary of what they have learned and their performance.
8. NEVER use emojis.
9. NEVER use em dashes or en dashes. Use commas, periods, or semicolons instead.
10. Keep intro text concise (1-2 sentences max).
11. Make wrong answer options plausible -- they should represent common misconceptions.
12. The "explanation" field should teach, not just state the correct answer.`;

export function buildLearnModePrompt(opts: {
  transcriptContext: string;
  currentTimestamp: string;
  videoTitle?: string;
  difficulty?: string;
  score?: { correct: number; total: number };
}): string {
  let prompt = LEARN_MODE_SYSTEM_PROMPT;

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
