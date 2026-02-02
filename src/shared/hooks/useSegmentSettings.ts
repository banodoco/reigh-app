/**
 * useSegmentSettings Hook
 *
 * @deprecated Import from '@/shared/hooks/segments' instead.
 *
 * This file re-exports from the new modular location for backwards compatibility.
 * The hook has been split into focused modules:
 * - useSegmentSettings (composed hook)
 * - usePairMetadata (query)
 * - useShotVideoSettings (query)
 * - useSegmentMutations (mutations)
 * - useServerForm (reusable pattern)
 */

// Re-export everything from the new location
export {
  useSegmentSettings,
  type UseSegmentSettingsOptions,
  type UseSegmentSettingsReturn,
  type FieldOverrides,
  type ShotDefaults,
} from './segments';

// Also re-export individual hooks for consumers who want them
export {
  usePairMetadata,
  useShotVideoSettings,
  useSegmentMutations,
} from './segments';
