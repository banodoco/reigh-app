/**
 * ReferenceImage Type
 *
 * Reference pointer stored in tool settings.
 * Actual image data is stored in resources table, usage settings stored here.
 *
 * Moved from tools/image-generation/components/ImageGenerationForm/types.ts
 * to shared/ because it's used by MediaLightbox hooks.
 */

import type { ReferenceMode } from '@/shared/lib/tasks/imageGeneration';

export interface ReferenceImage {
  id: string; // Unique identifier for UI state (use nanoid())
  resourceId: string; // ID in resources table where actual data is stored

  // Project-specific usage settings (how YOU use this reference in YOUR project)
  referenceMode?: ReferenceMode;
  styleReferenceStrength?: number;
  subjectStrength?: number;
  subjectDescription?: string;
  inThisScene?: boolean;
  inThisSceneStrength?: number;
  styleBoostTerms?: string;
}

/**
 * Legacy migration-only fields that should not be part of the canonical
 * reference contract for new code paths.
 */
export interface LegacyReferenceImageFields {
  name?: string;
  styleReferenceImage?: string | null;
  styleReferenceImageOriginal?: string | null;
  thumbnailUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Migration adapter type for legacy read-paths only. */
export type ReferenceImageWithLegacy = ReferenceImage & LegacyReferenceImageFields;
