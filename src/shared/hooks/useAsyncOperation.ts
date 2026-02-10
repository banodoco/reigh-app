import { useState, useCallback, useRef, useEffect } from 'react';
import { handleError } from '@/shared/lib/errorHandler';

/**
 * useAsyncOperation - Standardized hook for USER-TRIGGERED async operations
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHEN TO USE THIS HOOK:
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ✅ Button-triggered operations (upload, delete, submit, save)
 * ✅ Form submissions
 * ✅ User-initiated mutations (create, update, delete)
 * ✅ Any action where user clicks → loading spinner → success/error
 *
 * Examples of good candidates:
 *   - ProjectSelectorModal: creating/renaming projects
 *   - EditImagesPage: submitting edit operations
 *   - CharacterAnimatePage: starting animation generation
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHEN NOT TO USE THIS HOOK (use manual useState instead):
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ❌ INITIALIZATION LOADING - tracking whether data has loaded on mount
 *    Pattern: `const [isLoading, setIsLoading] = useState(true)` in useEffect
 *    Examples: useGenerationEditSettings, useUserUIState, SharePage
 *    Why: These track "is data ready?" not "is operation in progress?"
 *    Naming hint: consider `isInitializing` or `isDataLoading` for clarity
 *
 * ❌ MULTI-STATE HOOKS - where loading is one piece of larger state management
 *    Examples: useTimelinePositionUtils, useShotGenerationMetadata
 *    Why: Loading state is tightly coupled with other state; extracting it
 *         would increase complexity, not reduce it
 *
 * ❌ SPECIALIZED TIMING - operations with specific timing requirements
 *    Examples: VideoSegmentEditor frame capture, debounced saves
 *    Why: These need fine-grained control over when loading starts/stops
 *
 * ❌ MULTIPLE LOADING STATES - hooks that track separate loading states
 *    Example: useShotGenerationMetadata has `isLoading` AND `isUpdating`
 *    Why: useAsyncOperation provides single isLoading; multiple states need manual
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * NAMING CONVENTIONS (to distinguish patterns in code reviews):
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - `isLoading` from useAsyncOperation → user-triggered operation in progress
 * - `isLoading` (manual, starts true) → initialization/data fetching
 * - `isUpdating` → mutation in progress (manual, for hooks with separate states)
 * - `isCreating` → creation operation (manual, component-specific)
 *
 * If you see manual `isLoading` state and wonder "should this use useAsyncOperation?",
 * check if it starts as `true` (init pattern) or `false` (operation pattern).
 */

interface AsyncOperationOptions {
  /** Context string for error reporting (e.g., 'ImageUpload') */
  context?: string;
  /** Whether to show a toast on error (default: true) */
  showToast?: boolean;
  /** Custom toast title for errors */
  toastTitle?: string;
}

interface UseAsyncOperationReturn<T> {
  /** Whether an operation is currently in progress */
  isLoading: boolean;
  /** The last error that occurred, if any */
  error: Error | null;
  /** Execute an async operation with automatic loading state and error handling */
  execute: (
    operation: () => Promise<T>,
    options?: AsyncOperationOptions
  ) => Promise<T | undefined>;
  /** Reset the error state */
  clearError: () => void;
}

interface UseAsyncOperationMapReturn<T> {
  /** Check if an operation is in progress for a given key */
  isLoading: (key: string) => boolean;
  /** Get the error for a given key, if any */
  getError: (key: string) => Error | null;
  /** Execute an async operation for a given key */
  execute: (
    key: string,
    operation: () => Promise<T>,
    options?: AsyncOperationOptions
  ) => Promise<T | undefined>;
  /** Clear the error for a given key */
  clearError: (key: string) => void;
}

/**
 * Hook for managing async operations with loading state and error handling.
 *
 * Provides a standardized pattern for:
 * - Loading state management (isLoading)
 * - Error state tracking
 * - Centralized error handling via handleError()
 *
 * @example
 * ```tsx
 * const { isLoading, error, execute } = useAsyncOperation<UploadResult>();
 *
 * const handleUpload = async () => {
 *   const result = await execute(
 *     () => uploadFile(file),
 *     { context: 'FileUpload', toastTitle: 'Upload failed' }
 *   );
 *   if (result) {
 *     // Success handling
 *   }
 * };
 *
 * return (
 *   <Button onClick={handleUpload} disabled={isLoading}>
 *     {isLoading ? 'Uploading...' : 'Upload'}
 *   </Button>
 * );
 * ```
 */
export function useAsyncOperation<T = void>(): UseAsyncOperationReturn<T> {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track mounted state to prevent state updates after unmount
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const execute = useCallback(async (
    operation: () => Promise<T>,
    options: AsyncOperationOptions = {}
  ): Promise<T | undefined> => {
    const { context, showToast = true, toastTitle } = options;

    if (!isMountedRef.current) return undefined;

    setIsLoading(true);
    setError(null);

    try {
      const result = await operation();
      if (isMountedRef.current) {
        setIsLoading(false);
      }
      return result;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (isMountedRef.current) {
        setError(err);
        setIsLoading(false);
      }
      handleError(err, {
        context,
        showToast,
        toastTitle,
      });
      return undefined;
    }
  }, []);

  return { isLoading, error, execute, clearError };
}

/**
 * Variant that tracks multiple concurrent operations.
 * Useful when you need to track individual loading states (e.g., per-item operations).
 *
 * @example
 * ```tsx
 * const { isLoading, execute } = useAsyncOperationMap<void>();
 *
 * const handleDelete = (id: string) => {
 *   execute(id, () => deleteItem(id), { context: 'DeleteItem' });
 * };
 *
 * return items.map(item => (
 *   <Button
 *     key={item.id}
 *     onClick={() => handleDelete(item.id)}
 *     disabled={isLoading(item.id)}
 *   >
 *     Delete
 *   </Button>
 * ));
 * ```
 */
export function useAsyncOperationMap<T = void>(): UseAsyncOperationMapReturn<T> {
  const [loadingMap, setLoadingMap] = useState<Map<string, boolean>>(new Map());
  const [errorMap, setErrorMap] = useState<Map<string, Error>>(new Map());

  // Track mounted state to prevent state updates after unmount
  const isMountedRef = useRef(true);

  // Keep refs to current map state for stable callbacks
  const loadingMapRef = useRef(loadingMap);
  const errorMapRef = useRef(errorMap);
  loadingMapRef.current = loadingMap;
  errorMapRef.current = errorMap;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Stable callbacks that read from refs
  const isLoading = useCallback((key: string) => loadingMapRef.current.get(key) ?? false, []);
  const getError = useCallback((key: string) => errorMapRef.current.get(key) ?? null, []);

  const execute = useCallback(async (
    key: string,
    operation: () => Promise<T>,
    options: AsyncOperationOptions = {}
  ): Promise<T | undefined> => {
    const { context, showToast = true, toastTitle } = options;

    if (!isMountedRef.current) return undefined;

    setLoadingMap(prev => new Map(prev).set(key, true));
    setErrorMap(prev => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });

    try {
      const result = await operation();
      if (isMountedRef.current) {
        setLoadingMap(prev => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      }
      return result;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (isMountedRef.current) {
        setErrorMap(prev => new Map(prev).set(key, err));
        setLoadingMap(prev => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      }
      handleError(err, { context, showToast, toastTitle });
      return undefined;
    }
  }, []);

  const clearError = useCallback((key: string) => {
    setErrorMap(prev => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  return { isLoading, getError, execute, clearError };
}
