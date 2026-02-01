/**
 * Shot hooks barrel file.
 * Re-exports all shot-related hooks for backwards compatibility.
 *
 * Import from this file or from '@/shared/hooks/useShots' (which re-exports from here).
 */

// Cache utilities
export {
  SHOTS_CACHE_VARIANTS,
  getShotsCacheKeys,
  updateAllShotsCaches,
  rollbackShotsCaches,
  cancelShotsQueries,
  findShotsCache,
  updateShotGenerationsCache,
  rollbackShotGenerationsCache,
  cancelShotGenerationsQuery,
} from './cacheUtils';

// Debug utilities
export { shotDebug, shotError } from './debug';
export type { ShotOperation } from './debug';

// Mappers
export { mapShotGenerationToRow } from './mappers';
export type { ShotGenerationRow } from './mappers';

// Shot CRUD operations
export {
  useCreateShot,
  useDeleteShot,
  useDuplicateShot,
  useReorderShots,
} from './useShotsCrud';

// Shot queries
export { useListShots, useProjectImageStats } from './useShotsQueries';

// Shot field updates
export {
  useUpdateShotField,
  useUpdateShotName,
  useUpdateShotAspectRatio,
} from './useShotUpdates';

// Shot-generation mutations (add, remove, reorder images in shots)
export {
  useAddImageToShot,
  useAddImageToShotWithoutPosition,
  useRemoveImageFromShot,
  useUpdateShotImageOrder,
  usePositionExistingGenerationInShot,
  useDuplicateAsNewGeneration,
} from './useShotGenerationMutations';

// Composite creation operations
export {
  createGenerationForUploadedImage,
  useCreateShotWithImage,
  useHandleExternalImageDrop,
} from './useShotCreation';
