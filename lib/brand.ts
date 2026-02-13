// lib/brand.ts — Single source of truth for branding
export const BRAND = {
  name: 'chalk',
  tagline: 'Paste a YouTube URL, pause the video, and ask AI anything about what you\'re watching.',
  icon: 'ChalkboardSimple', // @phosphor-icons/react component name
  domain: 'chalk-tan.vercel.app',
} as const;

export const STORAGE_PREFIX = 'chalk';

export function storageKey(key: string): string {
  return `${STORAGE_PREFIX}-${key}`;
}
