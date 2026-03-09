import type { GenerationRow } from '@/domains/generation/types';

const PLACEHOLDER_LOCATION = '/placeholder.svg';

function hasValidImageLocation(generation: GenerationRow): boolean {
  const location = generation.imageUrl || generation.location;
  return Boolean(location && location !== PLACEHOLDER_LOCATION);
}

function isVideoOutputGeneration(generation: GenerationRow): boolean {
  return Boolean(generation.type?.includes('video'));
}

function isTimelineImageGeneration(generation: GenerationRow): boolean {
  return (
    generation.timeline_frame != null &&
    generation.timeline_frame >= 0 &&
    !isVideoOutputGeneration(generation) &&
    hasValidImageLocation(generation)
  );
}

function isUnpositionedImageGeneration(generation: GenerationRow): boolean {
  return (
    generation.timeline_frame == null &&
    !isVideoOutputGeneration(generation) &&
    hasValidImageLocation(generation)
  );
}

export function selectTimelineImages(generations: GenerationRow[]): GenerationRow[] {
  return generations
    .filter(isTimelineImageGeneration)
    .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
}

export function selectUnpositionedImages(generations: GenerationRow[]): GenerationRow[] {
  return generations.filter(isUnpositionedImageGeneration);
}

export function selectVideoOutputs(generations: GenerationRow[]): GenerationRow[] {
  return generations.filter(isVideoOutputGeneration);
}
