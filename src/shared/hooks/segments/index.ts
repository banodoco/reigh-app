/**
 * Segment Settings Hooks
 *
 * Modular hooks for managing segment-level video generation settings.
 *
 * Main exports:
 * - useSegmentSettings - Composed hook for full settings management
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

// Query hooks
export { usePairMetadata } from './usePairMetadata';
export type { UsePairMetadataReturn } from './usePairMetadata';

export { useShotVideoSettings } from './useShotVideoSettings';
export type { UseShotVideoSettingsReturn } from './useShotVideoSettings';

// Mutations
export { useSegmentMutations } from './useSegmentMutations';
export type {
  UseSegmentMutationsOptions,
  UseSegmentMutationsReturn,
} from './useSegmentMutations';
