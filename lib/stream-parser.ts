import type { ChalkSpec } from '@/lib/schemas';

/**
 * Parse a hybrid text+JSON stream progressively.
 * Claude outputs explanation text first, then a JSON viz spec.
 * We detect the JSON boundary and parse each part separately.
 */
export function parseStreamContent(fullText: string): {
  textContent: string;
  spec: ChalkSpec | null;
  jsonStarted: boolean;
} {
  const jsonStart = fullText.indexOf('{"root"');

  if (jsonStart === -1) {
    return { textContent: fullText.trim(), spec: null, jsonStarted: false };
  }

  const textContent = fullText.slice(0, jsonStart).trim();
  const jsonPart = fullText.slice(jsonStart);

  try {
    const spec = JSON.parse(jsonPart) as ChalkSpec;
    if (spec.root && spec.elements) {
      return { textContent, spec, jsonStarted: true };
    }
  } catch {
    // JSON is incomplete — still streaming
  }

  return { textContent, spec: null, jsonStarted: true };
}

/**
 * Fallback: aggressive regex extraction if clean parse failed.
 * Useful when Claude wraps the JSON in extra text or whitespace.
 */
export function extractSpecFallback(fullText: string): ChalkSpec | null {
  try {
    const jsonMatch = fullText.match(
      /\{[\s\S]*"root"[\s\S]*"elements"[\s\S]*\}/,
    );
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.root && parsed.elements) {
        return parsed;
      }
    }
  } catch {
    // No spec extractable
  }
  return null;
}

/**
 * Split raw stream into reasoning (before \x1E) and text (after \x1E).
 * Fast mode streams have no separator — entire content is text.
 */
export function splitReasoningFromText(fullRaw: string): {
  reasoning: string;
  text: string;
  hasSeparator: boolean;
} {
  const sepIndex = fullRaw.indexOf('\x1E');
  if (sepIndex === -1) {
    return { reasoning: fullRaw, text: '', hasSeparator: false };
  }
  return {
    reasoning: fullRaw.slice(0, sepIndex),
    text: fullRaw.slice(sepIndex + 1),
    hasSeparator: true,
  };
}
