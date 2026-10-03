import { LIGHT_STUDY_METADATA } from './content/light-study-v1/metadata.ts';
import type { PublicAstridExampleBundle } from './publicAstridExample.tsx';

/** One active local placeholder package. Keep only shell-safe metadata static here. */
export const ACTIVE_PUBLIC_ASTRID_EXAMPLE_METADATA = LIGHT_STUDY_METADATA;

export function formatPublicAstridExampleDuration(durationSeconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationSeconds));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatPublicAstridExampleClipCount(clipCount: number): string {
  return `${clipCount} ${clipCount === 1 ? 'clip' : 'clips'}`;
}

/** Called with the lazy editor import so full timeline/media/script data never enters the landing shell. */
export async function loadActivePublicAstridExample(): Promise<PublicAstridExampleBundle> {
  const { LIGHT_STUDY_PUBLIC_EXAMPLE } = await import('./content/light-study-v1/public-example.ts');
  return LIGHT_STUDY_PUBLIC_EXAMPLE;
}
