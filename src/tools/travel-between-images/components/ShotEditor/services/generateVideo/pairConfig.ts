import { getDisplayUrl } from '@/shared/lib/mediaUrl';
import { isVideoShotGenerations, type ShotGenerationsLike } from '@/shared/lib/typeGuards';
import { readSegmentOverrides } from '@/shared/lib/settingsMigration';
import type { PairOverridesExtraction, ImagePayload, PairConfigPayload, ShotGenRow } from './types';
import { stripModeFromPhaseConfig } from './modelPhase';
import type { PhaseConfig } from '@/shared/types/phaseConfig';

/**
 * Extract segment overrides from metadata using migration utility.
 * Legacy formats should be migrated before this service is called.
 */
export function extractPairOverrides(metadata: Record<string, unknown> | null | undefined): PairOverridesExtraction {
  if (!metadata) {
    return { overrides: {}, enhancedPrompt: undefined };
  }

  const overrides = readSegmentOverrides(metadata);
  const enhancedPrompt = metadata.enhanced_prompt as string | undefined;

  return { overrides, enhancedPrompt };
}

/** Filter shot_generations to positioned image rows with valid locations. */
export function filterImageShotGenerations(rows: ShotGenRow[]): ShotGenRow[] {
  return rows.filter((shotGen) => {
    const hasValidLocation = shotGen.generation?.location && shotGen.generation.location !== '/placeholder.svg';
    return shotGen.generation
      && shotGen.timeline_frame != null
      && !isVideoShotGenerations(shotGen as ShotGenerationsLike)
      && hasValidLocation;
  });
}

export function buildImagePayload(allShotGenerations: ShotGenRow[]): ImagePayload {
  const filteredForUrls = filterImageShotGenerations(allShotGenerations)
    .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));

  const freshImagesWithIds = filteredForUrls
    .map((shotGen) => ({
      location: shotGen.generation?.location,
      generationId: shotGen.generation?.id || shotGen.generation_id,
      primaryVariantId: shotGen.generation?.primary_variant_id || undefined,
      shotGenerationId: shotGen.id,
    }))
    .filter((item) => Boolean(item.location));

  const filteredImages = freshImagesWithIds.filter((item) => {
    const url = getDisplayUrl(item.location);
    return Boolean(url) && url !== '/placeholder.svg';
  });

  return {
    absoluteImageUrls: filteredImages
      .map((item) => getDisplayUrl(item.location))
      .filter((url): url is string => Boolean(url) && url !== '/placeholder.svg'),
    imageGenerationIds: filteredImages
      .map((item) => item.generationId)
      .filter((id): id is string => Boolean(id)),
    imageVariantIds: filteredImages
      .map((item) => item.primaryVariantId)
      .filter((id): id is string => Boolean(id)),
    pairShotGenerationIds: filteredImages
      .slice(0, -1)
      .map((item) => item.shotGenerationId)
      .filter((id): id is string => Boolean(id)),
  };
}

export function buildTimelinePairConfig(
  allShotGenerations: ShotGenRow[],
  batchVideoFrames: number,
  defaultNegativePrompt: string,
): PairConfigPayload {
  const pairPrompts: Record<number, { prompt: string; negativePrompt: string }> = {};
  const enhancedPrompts: Record<number, string> = {};
  const pairPhaseConfigsOverrides: Record<number, PhaseConfig> = {};
  const pairLorasOverrides: Record<number, Array<{ path: string; strength: number }>> = {};
  const pairMotionSettingsOverrides: Record<number, Record<string, unknown>> = {};
  const pairNumFramesOverrides: Record<number, number> = {};

  const filteredShotGenerations = filterImageShotGenerations(allShotGenerations);
  const sortedPositions = filteredShotGenerations
    .filter((shotGen) => shotGen.timeline_frame != null && shotGen.timeline_frame >= 0)
    .map((shotGen) => ({
      id: shotGen.generation?.id || shotGen.generation_id || shotGen.id,
      pos: shotGen.timeline_frame!,
    }))
    .sort((a, b) => a.pos - b.pos);

  for (let i = 0; i < filteredShotGenerations.length - 1; i += 1) {
    const firstItem = filteredShotGenerations[i];
    const metadata = firstItem.metadata as Record<string, unknown> | null;
    const { overrides, enhancedPrompt } = extractPairOverrides(metadata);

    if (overrides.prompt || overrides.negativePrompt) {
      pairPrompts[i] = {
        prompt: overrides.prompt || '',
        negativePrompt: overrides.negativePrompt || '',
      };
    }
    if (enhancedPrompt) enhancedPrompts[i] = enhancedPrompt;

    const isBasicMode = overrides.motionMode === 'basic';
    if (!isBasicMode && overrides.phaseConfig) {
      pairPhaseConfigsOverrides[i] = overrides.phaseConfig;
    }

    if (overrides.loras && overrides.loras.length > 0) {
      pairLorasOverrides[i] = overrides.loras.map((lora) => ({
        path: lora.path,
        strength: lora.strength,
      }));
    }

    const hasMotionOverrides = overrides.motionMode !== undefined || overrides.amountOfMotion !== undefined;
    const hasStructureOverrides = overrides.structureMotionStrength !== undefined
      || overrides.structureTreatment !== undefined
      || overrides.structureUni3cEndPercent !== undefined;

    if (hasMotionOverrides || hasStructureOverrides) {
      pairMotionSettingsOverrides[i] = {
        ...(overrides.amountOfMotion !== undefined && { amount_of_motion: overrides.amountOfMotion / 100 }),
        ...(overrides.motionMode !== undefined && { motion_mode: overrides.motionMode }),
        ...(overrides.structureMotionStrength !== undefined && { structure_motion_strength: overrides.structureMotionStrength }),
        ...(overrides.structureTreatment !== undefined && { structure_treatment: overrides.structureTreatment }),
        ...(overrides.structureUni3cEndPercent !== undefined && { uni3c_end_percent: overrides.structureUni3cEndPercent }),
      };
    }

    if (overrides.numFrames !== undefined) {
      pairNumFramesOverrides[i] = overrides.numFrames;
    }
  }

  const frameGaps: number[] = [];
  for (let i = 0; i < sortedPositions.length - 1; i += 1) {
    frameGaps.push(sortedPositions[i + 1].pos - sortedPositions[i].pos);
  }

  return {
    basePrompts: frameGaps.length > 0
      ? frameGaps.map((_, index) => pairPrompts[index]?.prompt?.trim() || '')
      : [''],
    segmentFrames: frameGaps.length > 0
      ? frameGaps.map((gap, index) => pairNumFramesOverrides[index] ?? gap)
      : [batchVideoFrames],
    frameOverlap: frameGaps.length > 0 ? frameGaps.map(() => 10) : [10],
    negativePrompts: frameGaps.length > 0
      ? frameGaps.map((_, index) => pairPrompts[index]?.negativePrompt?.trim() || defaultNegativePrompt)
      : [defaultNegativePrompt],
    enhancedPromptsArray: frameGaps.length > 0
      ? frameGaps.map((_, index) => enhancedPrompts[index] || '')
      : [],
    pairPhaseConfigsArray: frameGaps.length > 0
      ? frameGaps.map((_, index) =>
        pairPhaseConfigsOverrides[index] ? stripModeFromPhaseConfig(pairPhaseConfigsOverrides[index]) : null)
      : [],
    pairLorasArray: frameGaps.length > 0
      ? frameGaps.map((_, index) => pairLorasOverrides[index] || null)
      : [],
    pairMotionSettingsArray: frameGaps.length > 0
      ? frameGaps.map((_, index) => pairMotionSettingsOverrides[index] || null)
      : [],
  };
}

export function buildBatchPairConfig(
  absoluteImageUrls: string[],
  batchVideoFrames: number,
  defaultNegativePrompt: string,
): PairConfigPayload {
  const numPairs = Math.max(0, absoluteImageUrls.length - 1);
  return {
    basePrompts: numPairs > 0 ? Array(numPairs).fill('') : [''],
    negativePrompts: numPairs > 0 ? Array(numPairs).fill(defaultNegativePrompt) : [defaultNegativePrompt],
    segmentFrames: numPairs > 0 ? Array(numPairs).fill(batchVideoFrames) : [batchVideoFrames],
    frameOverlap: numPairs > 0 ? Array(numPairs).fill(10) : [10],
    pairPhaseConfigsArray: numPairs > 0 ? Array(numPairs).fill(null) : [],
    pairLorasArray: numPairs > 0 ? Array(numPairs).fill(null) : [],
    pairMotionSettingsArray: numPairs > 0 ? Array(numPairs).fill(null) : [],
    enhancedPromptsArray: numPairs > 0 ? Array(numPairs).fill(null) : [],
  };
}
