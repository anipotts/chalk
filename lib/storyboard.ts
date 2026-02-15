/**
 * Storyboard sprite sheet parser (client-safe).
 *
 * YouTube embeds storyboard specs in ytInitialPlayerResponse.
 * Sprite sheets live on i.ytimg.com — publicly accessible, no CORS for <img>.
 * Use CSS background-image + background-position to crop individual thumbnails.
 */

export interface StoryboardLevel {
  baseUrl: string;
  width: number;
  height: number;
  count: number;
  cols: number;
  rows: number;
  interval: number; // ms between frames
  name: string;
  sigh: string;
}

export interface StoryboardFrame {
  url: string;
  backgroundPosition: string;
  width: number;
  height: number;
}

/**
 * Parse the pipe-delimited storyboard spec string from ytInitialPlayerResponse.
 * Format: baseUrl|width#height#count#cols#rows#interval#name#sigh|...
 */
export function parseStoryboardSpec(spec: string): StoryboardLevel[] {
  if (!spec) return [];

  const parts = spec.split('|');
  if (parts.length < 2) return [];

  const baseUrl = parts[0];
  const levels: StoryboardLevel[] = [];

  for (let i = 1; i < parts.length; i++) {
    const fields = parts[i].split('#');
    if (fields.length < 8) continue;

    levels.push({
      baseUrl,
      width: parseInt(fields[0], 10),
      height: parseInt(fields[1], 10),
      count: parseInt(fields[2], 10),
      cols: parseInt(fields[3], 10),
      rows: parseInt(fields[4], 10),
      interval: parseInt(fields[5], 10),
      name: fields[6],
      sigh: fields[7],
    });
  }

  return levels;
}

/**
 * Get the sprite sheet frame for a given timestamp.
 *
 * @param levels Parsed storyboard levels
 * @param timestampSeconds Video timestamp in seconds
 * @param preferredLevel 0 = smallest (48px), 1 = medium (160x90), higher = larger
 * @returns CSS props for rendering the thumbnail, or null if unavailable
 */
export function getStoryboardFrame(
  levels: StoryboardLevel[],
  timestampSeconds: number,
  preferredLevel = 1,
): StoryboardFrame | null {
  if (levels.length === 0) return null;

  // Pick level: prefer medium (L1) for hover cards, clamp to available
  const level = levels[Math.min(preferredLevel, levels.length - 1)];
  if (!level || level.interval <= 0) return null;

  const timestampMs = timestampSeconds * 1000;
  const frameIndex = Math.floor(timestampMs / level.interval);
  const framesPerSheet = level.cols * level.rows;
  const sheetIndex = Math.floor(frameIndex / framesPerSheet);
  const positionInSheet = frameIndex % framesPerSheet;
  const col = positionInSheet % level.cols;
  const row = Math.floor(positionInSheet / level.cols);

  // Build URL: replace $M with sheet index, $N with name
  const url = level.baseUrl
    .replace('$L', String(Math.min(preferredLevel, levels.length - 1)))
    .replace('$N', level.name)
    .replace('$M', String(sheetIndex))
    + `?sigh=${level.sigh}`;

  return {
    url,
    backgroundPosition: `-${col * level.width}px -${row * level.height}px`,
    width: level.width,
    height: level.height,
  };
}
