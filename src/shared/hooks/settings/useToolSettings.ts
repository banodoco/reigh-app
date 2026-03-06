import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useCallback, useMemo } from 'react';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { queryKeys } from '@/shared/lib/queryKeys';
import { QUERY_PRESETS, STANDARD_RETRY_DELAY } from '@/shared/lib/queryDefaults';
import {
  callUpdateToolSettingsAtomicRpc,
  resolveSettingsScopeTable,
  selectSettingsForScope,
} from '@/shared/lib/toolSettingsWriteRepository';
import {
  enqueueSettingsWrite,
  setSettingsWriteFunction,
  type QueuedWrite
} from '@/shared/lib/settingsWriteQueue';
import { deepMerge } from '@/shared/lib/utils/deepEqual';
import { isCancellationError } from '@/shared/lib/errorHandling/errorUtils';
import {
  classifyToolSettingsError,
  fetchToolSettingsSupabaseOrThrow,
  resolveAndCacheUserId,
  ToolSettingsError,
  type SettingsFetchResult,
} from '@/shared/lib/toolSettingsService';
import { getProjectSelectionFallbackId } from '@/shared/contexts/projectSelectionStore';

export type SettingsScope = 'user' | 'project' | 'shot';
type SettingsWriteMode = 'debounced' | 'immediate';

interface UpdateToolSettingsParams {
  scope: SettingsScope;
  id: string;
  toolId: string;
  patch: unknown;
}

interface AbortSignalCapable<T> {
  abortSignal?: (signal: AbortSignal) => T;
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return !!value
    && typeof value === 'object'
    && 'aborted' in value
    && typeof (value as AbortSignal).addEventListener === 'function';
}

function maybeAttachAbortSignal<T>(query: T, signal?: AbortSignal): T {
  if (!signal) return query;

  const candidate = query as T & AbortSignalCapable<T>;
  if (typeof candidate.abortSignal === 'function') {
    return candidate.abortSignal(signal);
  }

  return query;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new ToolSettingsError('cancelled', 'Request was cancelled', {
      recoverable: true,
      cause: signal.reason,
    });
  }
}

/**
 * Raw write function - performs the actual DB update.
 * Used internally by the settings write queue.
 *
 * @internal Use updateToolSettingsSupabase (queued) for normal usage
 */
async function fetchSettingsForScope(
  scope: SettingsScope,
  id: string,
  signal?: AbortSignal,
) {
  throwIfAborted(signal);

  return maybeAttachAbortSignal(selectSettingsForScope(scope, id), signal);
}

async function rawUpdateToolSettings(write: QueuedWrite): Promise<Record<string, unknown>> {
  const { scope, entityId: id, toolId, patch, signal } = write;

  try {
    if (scope !== 'user' && scope !== 'project' && scope !== 'shot') {
      throw new ToolSettingsError(
        'invalid_scope_identifier',
        `Invalid scope: ${scope}`,
      );
    }

    const tableName = resolveSettingsScopeTable(scope);

    // For patch updates, we need to fetch current settings to merge
    // This is necessary because the caller provides a partial update
    // TODO: In the future, consider passing full settings to eliminate this fetch
    const { data: currentEntity, error: fetchError } = await fetchSettingsForScope(scope, id, signal);

    if (fetchError) {
      const errorMessage = fetchError.message || '';
      if (errorMessage.includes('ERR_INSUFFICIENT_RESOURCES') ||
          errorMessage.includes('Failed to fetch') ||
          fetchError.code === 'ERR_INSUFFICIENT_RESOURCES') {
        throw new ToolSettingsError(
          'network',
          `Network exhaustion: ${errorMessage}`,
          { recoverable: true, cause: fetchError },
        );
      }
      throw new ToolSettingsError(
        'scope_fetch_failed',
        `Failed to fetch current ${scope} settings: ${errorMessage}`,
        { recoverable: true, cause: fetchError },
      );
    }

    // Merge patch with current tool settings
    const currentSettings = (currentEntity?.settings as Record<string, unknown>) ?? {};
    const currentToolSettings = (currentSettings[toolId] as Record<string, unknown>) ?? {};
    const updatedToolSettings = deepMerge({}, currentToolSettings, patch);

    // Use atomic PostgreSQL function to update settings
    // This is much faster than update() because it happens in a single DB operation
    throwIfAborted(signal);
    const { error: rpcError } = await maybeAttachAbortSignal(
      callUpdateToolSettingsAtomicRpc(
        tableName,
        id,
        toolId,
        updatedToolSettings,
      ),
      signal,
    );

    if (rpcError) {
      throw new ToolSettingsError(
        'scope_fetch_failed',
        `Failed to update ${scope} settings: ${rpcError.message}`,
        { recoverable: true, cause: rpcError },
      );
    }

    // CRITICAL: Return the full merged settings, not just the patch
    // This ensures the cache gets the exact same data that was saved to the DB
    // Prevents data loss when cache is stale (e.g., multiple tabs, concurrent edits)
    return updatedToolSettings;

  } catch (error: unknown) {
    // Handle abort errors silently to reduce noise during task cancellation
    if (isCancellationError(error)) {
      throw new ToolSettingsError('cancelled', 'Request was cancelled', {
        recoverable: true,
        cause: error,
      });
    }

    console.error('[rawUpdateToolSettings] Error:', error);
    throw error;
  }
}

// Initialize the queue with our raw write function
setSettingsWriteFunction(rawUpdateToolSettings);

/**
 * Update tool settings using the global write queue.
 *
 * This is the main entry point for settings updates. It:
 * - Debounces rapid updates (300ms window)
 * - Coalesces multiple writes to the same target
 * - Serializes writes globally to prevent network exhaustion
 *
 * @param params - The update parameters
 * @param signal - Optional AbortSignal (legacy second-arg position) for cancellation
 * @param mode - 'debounced' (default) or 'immediate' for flush-on-unmount
 * @returns The full merged settings after update
 */
function isSettingsWriteMode(value: unknown): value is SettingsWriteMode {
  return value === 'debounced' || value === 'immediate';
}

export function updateToolSettingsSupabase(
  params: UpdateToolSettingsParams,
  mode?: SettingsWriteMode,
): Promise<Record<string, unknown>>;
export function updateToolSettingsSupabase(
  params: UpdateToolSettingsParams,
  signal?: AbortSignal,
  mode?: SettingsWriteMode,
): Promise<Record<string, unknown>>;
export function updateToolSettingsSupabase(
  params: UpdateToolSettingsParams,
  signalOrMode?: AbortSignal | SettingsWriteMode,
  maybeMode: SettingsWriteMode = 'debounced',
): Promise<Record<string, unknown>> {
  const { scope, id, toolId, patch } = params;
  const signal = isAbortSignal(signalOrMode) ? signalOrMode : undefined;
  const mode = isSettingsWriteMode(signalOrMode) ? signalOrMode : maybeMode;

  return enqueueSettingsWrite({
    scope,
    entityId: id,
    toolId,
    patch: patch as Record<string, unknown>,
    ...(signal ? { signal } : {}),
  }, mode) as Promise<Record<string, unknown>>;
}

// ============================================================================
// Cache format helpers
// ============================================================================

/**
 * Helper to check if a cache value has the wrapper format.
 * fetchToolSettingsSupabase always returns { settings, hasShotSettings },
 * but legacy or manually-set cache entries may use flat format.
 */
function isSettingsWrapper(data: unknown): data is SettingsFetchResult {
  if (!data || typeof data !== 'object') return false;
  return 'settings' in data && 'hasShotSettings' in data;
}

/**
 * Helper to extract settings from cache data (handles wrapper format)
 * Cache stores data as { settings: T, hasShotSettings: boolean }
 */
export function extractSettingsFromCache<T>(cacheData: unknown): T | undefined {
  if (!cacheData) return undefined;
  return isSettingsWrapper(cacheData) ? (cacheData.settings as T) : (cacheData as T);
}

/**
 * Helper to update settings cache with proper wrapper format
 * Use this in setQueryData callbacks for optimistic updates
 *
 * @param prev - The previous cache value (may be wrapper or flat format)
 * @param updater - Either an object of updates, or a function that receives prevSettings and returns updates
 */
export function updateSettingsCache<T extends Record<string, unknown>>(
  prev: unknown,
  updater: Partial<T> | ((prevSettings: T) => Partial<T>)
): SettingsFetchResult<T> {
  const wrapper = isSettingsWrapper(prev);
  const prevSettings = (wrapper ? ((prev as SettingsFetchResult).settings ?? {}) : (prev ?? {})) as T;
  const updates = typeof updater === 'function' ? updater(prevSettings) : updater;
  return {
    settings: { ...prevSettings, ...updates } as T,
    hasShotSettings: wrapper ? ((prev as SettingsFetchResult).hasShotSettings ?? false) : false
  };
}

// ============================================================================
// Query retry helper
// ============================================================================

/** Determines whether a failed settings query should be retried. */
function shouldRetrySettingsQuery(failureCount: number, error: Error): boolean {
  const classified = classifyToolSettingsError(error);
  if (
    classified.code === 'auth_required'
    || classified.code === 'cancelled'
    || classified.code === 'network'
  ) {
    return false;
  }
  return failureCount < 3;
}

// ============================================================================
// Mutation success/error helpers
// ============================================================================

/** Merge mutation result into query cache and refetch related caches. */
function handleMutationSuccess(
  fullMergedSettings: Record<string, unknown> | null,
  toolId: string,
  projectId: string | undefined,
  shotId: string | undefined,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  if (fullMergedSettings === null) return;

  queryClient.setQueryData(
    queryKeys.settings.tool(toolId, projectId, shotId),
    (oldData: unknown) => {
      const oldWrapper = isSettingsWrapper(oldData);
      const oldSettings = oldWrapper
        ? (((oldData as SettingsFetchResult).settings ?? {}) as Record<string, unknown>)
        : ((oldData ?? {}) as Record<string, unknown>);
      const mergedSettings = deepMerge({}, oldSettings, fullMergedSettings);

      return {
        settings: mergedSettings,
        hasShotSettings: oldWrapper ? ((oldData as SettingsFetchResult).hasShotSettings ?? false) : false
      };
    }
  );

  if (shotId) {
    queryClient.refetchQueries({ queryKey: queryKeys.shots.batchSettings(shotId) });
  }
}

/** Log/toast mutation errors and invalidate cache for non-network failures. */
function handleMutationError(
  error: Error,
  toolId: string,
  projectId: string | undefined,
  shotId: string | undefined,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  const classified = classifyToolSettingsError(error);

  if (classified.code === 'cancelled') {
    return;
  }

  if (classified.code === 'network') return;

  normalizeAndPresentError(classified, { context: 'useToolSettings.update', toastTitle: `Failed to save ${toolId} settings` });

  queryClient.invalidateQueries({
    queryKey: queryKeys.settings.tool(toolId, projectId, shotId)
  });
}

// Type overloads
export function useToolSettings<T>(toolId: string, context?: { projectId?: string; shotId?: string; enabled?: boolean }): {
  settings: T | undefined;
  isLoading: boolean;
  error: Error | null;
  update: (scope: SettingsScope, settings: Partial<T>) => Promise<void>;
  isUpdating: boolean;
  /** Whether the shot had settings stored in DB (vs just defaults/project settings) */
  hasShotSettings: boolean;
};

/**
 * Low-level hook for reading and writing tool settings across all scopes.
 *
 * Performs cascade resolution (defaults -> user -> project -> shot) and returns
 * a merged settings object. Writes go through the global settings write queue.
 *
 * Most features should use `useAutoSaveSettings` instead, which adds auto-save,
 * dirty tracking, and entity-change handling on top of this hook.
 *
 * Use this directly only when you need manual save control or complex write patterns.
 *
 * @see docs/structure_detail/settings_system.md for the full settings hook decision tree
 */
export function useToolSettings<T>(
  toolId: string,
  context?: { projectId?: string; shotId?: string; enabled?: boolean }
) {
  const queryClient = useQueryClient();

  // Determine parameter shapes
  const projectIdFromRuntime = getProjectSelectionFallbackId() ?? undefined;
  const projectId: string | undefined = context?.projectId ?? projectIdFromRuntime ?? undefined;
  const shotId: string | undefined = context?.shotId;
  const fetchEnabled: boolean = context?.enabled ?? true;

  // Refs to access current values in stable callbacks without recreating them
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const shotIdRef = useRef(shotId);
  shotIdRef.current = shotId;

  // Fetch merged settings using Supabase with mobile optimizations
  const { data: queryResult, isLoading, error } = useQuery({
    queryKey: queryKeys.settings.tool(toolId, projectId, shotId),
    queryFn: async ({ signal }): Promise<SettingsFetchResult> => {
      return fetchToolSettingsSupabaseOrThrow(toolId, { projectId, shotId }, signal);
    },
    enabled: !!toolId && fetchEnabled,
    ...QUERY_PRESETS.static,
    staleTime: 10 * 60 * 1000,
    retry: shouldRetrySettingsQuery,
    retryDelay: STANDARD_RETRY_DELAY,
    networkMode: 'online',
  });

  // Extract settings and hasShotSettings from the query result
  const wrapper = isSettingsWrapper(queryResult);
  const settings = wrapper ? (queryResult as SettingsFetchResult).settings : queryResult;
  const hasShotSettings = wrapper ? ((queryResult as SettingsFetchResult).hasShotSettings ?? false) : false;

  // Log errors for debugging (except expected cancellations)
  if (error && classifyToolSettingsError(error).code !== 'cancelled') {
    normalizeAndPresentError(error, { context: 'useToolSettings', showToast: false });
  }

  // Update settings mutation
  const updateMutation = useMutation({
    mutationFn: async ({ scope, settings: newSettings, entityId }: {
      scope: SettingsScope;
      settings: Partial<T>;
      entityId?: string;
    }) => {
      let idForScope: string | undefined = entityId;

      if (!idForScope) {
        if (scope === 'user') {
          const { data: { user } } = await resolveAndCacheUserId();
          idForScope = user?.id;
          if (!idForScope) {
            throw new ToolSettingsError(
              'auth_required',
              'Authentication required for user settings update',
            );
          }
        } else if (scope === 'project') {
          idForScope = projectId;
        } else if (scope === 'shot') {
          idForScope = shotId;
        }
      }

      if (!idForScope) {
        throw new ToolSettingsError(
          'invalid_scope_identifier',
          `Missing identifier for ${scope} tool settings update`,
        );
      }

      const fullMergedSettings = await updateToolSettingsSupabase({
          scope,
          id: idForScope,
          toolId,
          patch: newSettings,
      });

      return fullMergedSettings;
    },
    onSuccess: (fullMergedSettings) => {
      handleMutationSuccess(fullMergedSettings, toolId, projectId, shotId, queryClient);
    },
    onError: (error: Error) => {
      handleMutationError(error, toolId, projectId, shotId, queryClient);
    },
  });

  // Get stable reference to mutateAsync - useMutation returns a new object each render
  // but mutateAsync itself is stable
  const mutateAsyncRef = useRef(updateMutation.mutateAsync);
  mutateAsyncRef.current = updateMutation.mutateAsync;

  // CRITICAL: Wrap in useCallback with stable deps to prevent cascading re-renders.
  // Use refs to access current projectId/shotId without recreating this function.
  // The entityId is snapshotted at call time via refs for correctness.
  const update = useCallback(async (scope: SettingsScope, settings: Partial<T>): Promise<void> => {
    // Snapshot the target entity id NOW to prevent cross-project/shot overwrites
    // Use refs to get current values without causing callback recreation
    const entityId = scope === 'project' ? projectIdRef.current : (scope === 'shot' ? shotIdRef.current : undefined);

    // NOTE: No debounce here - callers (like useShotSettings) are responsible for debouncing.
    // Using mutateAsync so callers can await the actual DB write completion.
    // Use ref to access stable mutateAsync without recreating this callback.
    await mutateAsyncRef.current({ scope, settings, entityId });
  }, []); // Empty deps - all values accessed via refs for stability

  return useMemo(() => ({
    settings: settings as T | undefined,
    isLoading,
    error: error as Error | null,
    update,
    isUpdating: updateMutation.isPending,
    hasShotSettings,
  }), [settings, isLoading, error, update, updateMutation.isPending, hasShotSettings]);
}
