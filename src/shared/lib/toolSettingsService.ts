/**
 * Tool Settings Service
 *
 * Pure async functions for fetching tool settings from Supabase.
 * Extracted from useToolSettings.ts to reduce hook file complexity.
 *
 * Contains:
 * - Settings fetch orchestration with single-flight deduplication
 * - Runtime-facing error normalization and operation-result shaping
 */
import { isKnownSettingsId } from '@/shared/lib/settingsIds';
import {
  operationSuccess,
  type OperationResult,
} from '@/shared/lib/operationResult';
import { toolDefaultsRegistry } from '@/tooling/toolDefaultsRegistry';
import {
  clearCachedUserId,
  ensureToolSettingsAuthCacheInitialized,
  getToolSettingsRuntimeClient,
  initializeToolSettingsAuthCache,
  readCachedUserId,
  resolveAndCacheUserId,
  setCachedUserId,
  setToolSettingsAuthCacheInvalidationHandler,
  type ToolSettingsSupabaseClient,
  _resetToolSettingsAuthCacheForTesting,
} from './toolSettingsAuthCache';
import {
  SettingsFetchResult,
  fetchToolSettingsScopes,
  mergeToolSettingsScopes,
  type ToolSettingsContext,
} from './toolSettingsScopeReader';
import {
  ToolSettingsError,
} from './toolSettingsErrors';
import {
  normalizeToolSettingsOperationFailure,
  toToolSettingsErrorFromOperationFailure,
  toToolSettingsOperationFailure,
} from './toolSettingsOperationFailures';

const inflightSettingsFetches = new Map<string, Promise<unknown>>();
setToolSettingsAuthCacheInvalidationHandler(() => {
  inflightSettingsFetches.clear();
});

const unknownSettingsIdsReported = new Set<string>();
function reportUnknownSettingsId(toolId: string): void {
  if (isKnownSettingsId(toolId) || unknownSettingsIdsReported.has(toolId)) {
    return;
  }
  if (import.meta.env.MODE === 'test') {
    return;
  }
  unknownSettingsIdsReported.add(toolId);
  if (import.meta.env.DEV) {
    console.warn(
      `[toolSettingsService] Unknown settings key "${toolId}". ` +
      'Add this key to SETTINGS_IDS if it should be persisted via useToolSettings.',
    );
  }
}
function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }
  throw new ToolSettingsError('cancelled', 'Request was cancelled', {
    recoverable: true,
  });
}
async function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }
  throwIfAborted(signal);
  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(new ToolSettingsError('cancelled', 'Request was cancelled', {
        recoverable: true,
      }));
    };
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}
/**
 * Fetch and merge tool settings from all scopes using direct Supabase calls.
 *
 * Pipeline: dedup → auth → fetchAllScopes → extractAndMerge.
 * Uses single-flight deduplication for concurrent identical requests.
 *
 * @returns `{ settings, hasShotSettings }` wrapper
 */
export async function fetchToolSettingsSupabase(
  toolId: string,
  ctx: ToolSettingsContext,
  signal?: AbortSignal,
  supabaseClient?: ToolSettingsSupabaseClient,
): Promise<OperationResult<SettingsFetchResult>> {
  try {
    reportUnknownSettingsId(toolId);
    if (signal?.aborted) {
      return toToolSettingsOperationFailure(new ToolSettingsError('cancelled', 'Request was cancelled', {
        recoverable: true,
      }));
    }
    const runtimeClient = getToolSettingsRuntimeClient(supabaseClient);
    if (!runtimeClient) {
      return toToolSettingsOperationFailure(new ToolSettingsError(
        'unknown',
        'Tool settings runtime is not initialized',
      ));
    }
    const { data: { user } } = await resolveAndCacheUserId(runtimeClient);
    if (!user) {
      return toToolSettingsOperationFailure(new ToolSettingsError('auth_required', 'Authentication required'));
    }
    const userId = user.id;
    const singleFlightKey = JSON.stringify({
      toolId,
      projectId: ctx.projectId ?? null,
      shotId: ctx.shotId ?? null,
      userId,
    });
    const existingPromise = inflightSettingsFetches.get(singleFlightKey);
    if (existingPromise) {
      const value = await raceWithAbort(existingPromise as Promise<SettingsFetchResult>, signal);
      return operationSuccess(value);
    }
    const promise = (async (): Promise<SettingsFetchResult> => {
      throwIfAborted(signal);
      const [userResult, projectResult, shotResult] = await fetchToolSettingsScopes(runtimeClient, userId, ctx, signal);
      throwIfAborted(signal);
      const { data: { user: latestUser } } = await resolveAndCacheUserId(runtimeClient);
      if (!latestUser || latestUser.id !== userId) {
        throw new ToolSettingsError('cancelled', 'Request was cancelled due to auth state change', {
          recoverable: true,
          metadata: { expectedUserId: userId, latestUserId: latestUser?.id ?? null },
        });
      }
      return mergeToolSettingsScopes(userResult, projectResult, shotResult, toolId, ctx);
    })();
    inflightSettingsFetches.set(singleFlightKey, promise);
    promise.finally(() => {
      inflightSettingsFetches.delete(singleFlightKey);
    }).catch(() => {});
    const value = await raceWithAbort(promise, signal);
    return operationSuccess(value);
  } catch (error: unknown) {
    return normalizeToolSettingsOperationFailure(error);
  }
}
/**
 * Fetch tool settings and throw `ToolSettingsError` on failure.
 *
 * Use this from hook boundaries that already model errors as thrown exceptions
 * (for example React Query query functions and mutation pipelines) so read/write
 * settings flows share the same error contract.
 */
export async function fetchToolSettingsSupabaseOrThrow(
  toolId: string,
  ctx: ToolSettingsContext,
  signal?: AbortSignal,
  supabaseClient?: ToolSettingsSupabaseClient,
): Promise<SettingsFetchResult> {
  const result = await fetchToolSettingsSupabase(toolId, ctx, signal, supabaseClient);
  if (!result.ok) {
    throw toToolSettingsErrorFromOperationFailure(result);
  }
  return result.value;
}

export {
  clearCachedUserId,
  ensureToolSettingsAuthCacheInitialized,
  initializeToolSettingsAuthCache,
  readCachedUserId,
  resolveAndCacheUserId,
  setCachedUserId,
  ToolSettingsError,
};
export type { SettingsFetchResult } from './toolSettingsScopeReader';
export { classifyToolSettingsError } from './toolSettingsErrors';

/** @internal Only for test isolation — do not call in production code. */
export function _resetCachedUserForTesting() {
  _resetToolSettingsAuthCacheForTesting();
  inflightSettingsFetches.clear();
}
