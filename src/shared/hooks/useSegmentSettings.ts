/**
 * useSegmentSettings Hook
 *
 * @deprecated Import from '@/shared/hooks/segments' instead.
 *
 * This file re-exports from the new modular location for backwards compatibility.
 * The hook has been split into focused modules:
 * - useSegmentSettings (composed hook)
 * - usePairMetadata (query) - internal only
 * - useShotVideoSettings (query) - internal only
 * - useSegmentMutations (mutations) - internal only
 */

// Re-export everything from the new location
export {
  useSegmentSettings,
  type UseSegmentSettingsOptions,
} from './segments';
