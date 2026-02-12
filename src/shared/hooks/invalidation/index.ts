/**
 * Centralized cache invalidation hooks.
 *
 * All cache invalidation should go through these hooks to ensure:
 * - Consistent patterns across the codebase
 * - Debug logging via debugConfig
 * - Proper scoping of invalidations
 *
 * Usage:
 *   import { useInvalidateGenerations, invalidateGenerationsSync } from '@/shared/hooks/invalidation';
 */

// Generation invalidation - only export what's actually used
export {
  useInvalidateGenerations,
  invalidateGenerationsSync,
  invalidateAllShotGenerations,
  type InvalidationScope,
  type InvalidationOptions,
  type VariantInvalidationOptions,
} from './useGenerationInvalidation';

// Shot invalidation - types only (no hooks currently used)
export type {
  ShotInvalidationScope,
  ShotInvalidationOptions,
} from './useShotInvalidation';

// Task invalidation - types only (no hooks currently used)
export type {
  TaskInvalidationScope,
  TaskInvalidationOptions,
} from './useTaskInvalidation';

// Settings invalidation - types only (no hooks currently used)
export type {
  SettingsInvalidationScope,
  SettingsInvalidationOptions,
} from './useSettingsInvalidation';
