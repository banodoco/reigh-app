/**
 * Utility functions for transforming share page data to match component expectations.
 *
 * These transformers ensure the RPC response data is shaped correctly for
 * components that normally receive data from hooks like useShotImages.
 *
 * IMPORTANT: If hook return shapes change, update these transformers.
 */

import type { GenerationRow } from '@/domains/generation/types';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import type { StructureVideoConfigWithLegacyGuidance } from '@/shared/lib/tasks/travelBetweenImages';
import type { VideoMetadata } from '@/shared/lib/media/videoUploader';

type SharedStructureType = 'uni3c' | 'flow' | 'canny' | 'depth';

function parseStructureType(value: unknown): SharedStructureType {
  if (value === 'flow' || value === 'canny' || value === 'depth' || value === 'uni3c') {
    return value;
  }
  return 'uni3c';
}

/**
 * Transform a shared generation (video) to the GenerationRow format expected by FinalVideoSection.
 *
 * @param generation - The generation data from the share RPC
 * @returns GenerationRow compatible object, or null if no generation
 */
export function transformGenerationToParentRow(
  generation: GenerationRow | Record<string, unknown> | null | undefined
): GenerationRow | null {
  if (!generation) return null;
  const rawGeneration = generation as Record<string, unknown>;

  const metadata = rawGeneration.metadata;
  const generationIdentity = {
    generation_id: typeof rawGeneration.generation_id === 'string' ? rawGeneration.generation_id : null,
    id: typeof rawGeneration.id === 'string' ? rawGeneration.id : null,
    metadata: metadata && typeof metadata === 'object'
      ? metadata as Record<string, unknown>
      : undefined,
  };
  const resolvedGenerationId = getGenerationId(generationIdentity) || 'shared';

  const id = typeof rawGeneration.id === 'string'
    ? rawGeneration.id
    : (typeof rawGeneration.generation_id === 'string' ? rawGeneration.generation_id : 'shared');

  const location = typeof rawGeneration.location === 'string' ? rawGeneration.location : null;
  const thumbUrl = typeof rawGeneration.thumbUrl === 'string'
    ? rawGeneration.thumbUrl
    : (typeof rawGeneration.thumbnail_url === 'string' ? rawGeneration.thumbnail_url : undefined);
  const createdAt = typeof rawGeneration.created_at === 'string' ? rawGeneration.created_at : undefined;
  const params = rawGeneration.params;

  return {
    id,
    generation_id: resolvedGenerationId,
    type: 'video',
    location,
    imageUrl: location ?? undefined, // FinalVideoSection/VideoItem uses imageUrl
    thumbUrl,
    created_at: createdAt,
    params: params as GenerationRow['params'],
  };
}

/**
 * Calculate the appropriate column count for the image grid based on device type.
 *
 * Uses the same logic as ShotEditor to ensure consistent display.
 *
 * @param mobileColumns - Column count from useDeviceInfo (2-6)
 * @returns Validated column count (2, 3, 4, or 6)
 */
export function calculateColumnsForDevice(
  mobileColumns: number
): 2 | 3 | 4 | 6 {
  // Ensure we return a valid column value
  if (mobileColumns <= 2) return 2;
  if (mobileColumns === 3) return 3;
  if (mobileColumns === 4) return 4;
  return 6;
}

/**
 * Extract structure video configuration from settings.
 *
 * Handles both single structure video (legacy) and multi-video array formats.
 *
 * @param settings - The travel settings object
 * @returns Array of structure video configurations
 */
export function extractStructureVideos(
  settings: Record<string, unknown> | null | undefined
): StructureVideoConfigWithLegacyGuidance[] {
  if (!settings) return [];

  const structureVideo = settings.structureVideo as Record<string, unknown> | undefined;
  const structureVideos = settings.structureVideos;

  // Prefer the array format if present
  if (structureVideos && Array.isArray(structureVideos) && structureVideos.length > 0) {
    const parsedVideos: StructureVideoConfigWithLegacyGuidance[] = [];
    structureVideos.forEach((video) => {
      const raw = (video && typeof video === 'object') ? video as Record<string, unknown> : null;
      if (!raw || typeof raw.path !== 'string') return;

      const metadata = (raw.metadata && typeof raw.metadata === 'object')
        ? raw.metadata as VideoMetadata
        : null;

      parsedVideos.push({
        path: raw.path,
        start_frame: typeof raw.start_frame === 'number' ? raw.start_frame : 0,
        end_frame: typeof raw.end_frame === 'number' ? raw.end_frame : 300,
        treatment: raw.treatment === 'clip' ? 'clip' : 'adjust',
        motion_strength: typeof raw.motion_strength === 'number' ? raw.motion_strength : 1.0,
        structure_type: parseStructureType(raw.structure_type),
        metadata,
        uni3c_end_percent: typeof raw.uni3c_end_percent === 'number' ? raw.uni3c_end_percent : undefined,
      });
    });
    return parsedVideos;
  }

  // Fall back to single video format
  if (structureVideo && structureVideo.path) {
    return [{
      path: structureVideo.path as string,
      start_frame: (structureVideo.startFrame as number) ?? 0,
      end_frame: (structureVideo.endFrame as number) ?? 300,
      treatment: (structureVideo.treatment as 'adjust' | 'clip') || 'adjust',
      motion_strength: (structureVideo.motionStrength as number) ?? 1.0,
      structure_type: parseStructureType(structureVideo.structureType),
      metadata: (structureVideo.metadata as VideoMetadata) || null,
      uni3c_end_percent: typeof structureVideo.uni3cEndPercent === 'number'
        ? structureVideo.uni3cEndPercent
        : undefined,
    }];
  }

  return [];
}
