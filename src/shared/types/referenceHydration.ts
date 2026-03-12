import type { ReferenceMode } from '@/shared/lib/tasks/families/imageGeneration';

/**
 * Hydrated reference pointer resolved against the resources table.
 * Shared by hooks and UI so hydration contracts stay outside component modules.
 */
export interface HydratedReferenceImage {
  id: string;
  resourceId: string;
  name: string;
  styleReferenceImage: string;
  styleReferenceImageOriginal: string;
  thumbnailUrl: string | null;
  styleReferenceStrength: number;
  subjectStrength: number;
  subjectDescription: string;
  inThisScene: boolean;
  inThisSceneStrength: number;
  referenceMode: ReferenceMode;
  styleBoostTerms: string;
  createdAt: string;
  updatedAt: string;
  isPublic: boolean;
  isOwner: boolean;
}
