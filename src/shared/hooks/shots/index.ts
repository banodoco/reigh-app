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
