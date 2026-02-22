/**
 * Shot hooks barrel file.
 * Re-exports all shot-related hooks for backwards compatibility.
 *
 * Import from this file or from the legacy top-level shot hooks module.
 *
 * Note: Cache utilities (cacheUtils.ts) are internal to this module
 * and not re-exported - internal code imports directly from cacheUtils.
 */

// Mappers
export { mapShotGenerationToRow } from './mappers';

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
export { useUpdateShotName } from './useShotUpdates';

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
  useCreateShotWithImage,
  useHandleExternalImageDrop,
} from './useShotCreation';
