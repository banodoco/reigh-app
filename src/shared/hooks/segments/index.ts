/**
 * Segment Hooks
 *
 * Modular hooks for managing segment-level video generation settings and outputs.
 *
 * Main exports:
 * - useSegmentSettings - Composed hook for full settings management
 * - useSegmentOutputsForShot - Hook for segment outputs/slots
 *
 * Internal hooks (used by useSegmentSettings, not re-exported):
 * - usePairMetadata - Query hook for pair metadata
 * - useShotVideoSettings - Query hook for shot settings
 * - useSegmentMutations - Mutations for saving settings
 */

// Main composed hook
export { useSegmentSettings } from './useSegmentSettings';
export type {
  UseSegmentSettingsOptions,
  UseSegmentSettingsReturn,
  FieldOverrides,
  ShotDefaults,
} from './useSegmentSettings';

// Segment outputs hook (moved from travel-between-images tool)
export { useSegmentOutputsForShot } from './useSegmentOutputsForShot';
export type {
  SegmentSlot,
  ExpectedSegmentData,
  UseSegmentOutputsReturn,
} from './useSegmentOutputsForShot';

// NOTE: The following are internal hooks used by useSegmentSettings.
// They are not re-exported as nothing imports them directly.
// - usePairMetadata (./usePairMetadata)
// - useShotVideoSettings (./useShotVideoSettings)
// - useSegmentMutations (./useSegmentMutations)
