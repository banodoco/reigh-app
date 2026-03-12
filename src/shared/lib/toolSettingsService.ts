/**
 * Tool Settings Service
 *
 * Pure async functions for fetching tool settings from Supabase.
 * Extracted from useToolSettings.ts to reduce hook file complexity.
 *
 * Contains:
 * - Settings fetch with single-flight deduplication (fetchToolSettingsSupabase)
 * - Scope fetch/merge helpers
 * - Tool settings error classification and normalization
 */
import { deepMerge } from '@/shared/lib/utils/deepEqual';
import { isCancellationError, getErrorMessage } from '@/shared/lib/errorHandling/errorUtils';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { isKnownSettingsId } from '@/shared/lib/settingsIds';
import {
  operationFailure,
  operationSuccess,
  type OperationFailure,
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
interface ToolSettingsContext {
  projectId?: string;
  shotId?: string;
}
type ToolSettingsErrorCode =
  | 'auth_required'
  | 'cancelled'
  | 'network'
  | 'scope_fetch_failed'
  | 'invalid_scope_identifier'
  | 'unknown';
interface ToolSettingsErrorOptions {
  recoverable?: boolean;
  cause?: unknown;
  metadata?: Record<string, unknown>;
}
export class ToolSettingsError extends Error {
  readonly code: ToolSettingsErrorCode;
  readonly recoverable: boolean;
  readonly metadata?: Record<string, unknown>;
  readonly cause?: unknown;
  constructor(
    code: ToolSettingsErrorCode,
    message: string,
    options: ToolSettingsErrorOptions = {},
  ) {
    super(message);
    this.name = 'ToolSettingsError';
    this.code = code;
    this.recoverable = options.recoverable ?? false;
    this.metadata = options.metadata;
    this.cause = options.cause;
  }
}
function isToolSettingsError(error: unknown): error is ToolSettingsError {
  return error instanceof ToolSettingsError;
}
export function classifyToolSettingsError(error: unknown): ToolSettingsError {
  if (isToolSettingsError(error)) {
    return error;
  }
  if (isCancellationError(error)) {
    return new ToolSettingsError('cancelled', 'Request was cancelled', {
      recoverable: true,
      cause: error,
    });
  }
  const message = getErrorMessage(error);
  if (message.includes('Authentication required')) {
    return new ToolSettingsError('auth_required', message, {
      recoverable: false,
      cause: error,
    });
  }
  if (
    message.includes('Failed to fetch')
    || message.includes('ERR_INSUFFICIENT_RESOURCES')
    || message.includes('Network connection issue')
    || message.includes('Network exhaustion')
  ) {
    return new ToolSettingsError('network', message, {
      recoverable: true,
      cause: error,
    });
  }
  return new ToolSettingsError('unknown', message, {
    recoverable: false,
    cause: error,
  });
}
function toOperationFailure(error: ToolSettingsError): OperationFailure {
  return operationFailure(error, {
    policy: error.recoverable ? 'best_effort' : 'fail_closed',
    recoverable: error.recoverable,
    errorCode: error.code,
    message: error.message,
    cause: error.cause,
  });
}
function toToolSettingsErrorFromOperationFailure(failure: OperationFailure): ToolSettingsError {
  const code = failure.errorCode as ToolSettingsErrorCode;
  const normalizedCode: ToolSettingsErrorCode = (
    code === 'auth_required'
    || code === 'cancelled'
    || code === 'network'
    || code === 'scope_fetch_failed'
    || code === 'invalid_scope_identifier'
    || code === 'unknown'
  ) ? code : 'unknown';
  return new ToolSettingsError(normalizedCode, failure.message, {
    recoverable: failure.recoverable,
    cause: failure.cause ?? failure.error,
  });
}
/** The wrapper format returned by fetchToolSettingsSupabase */
export interface SettingsFetchResult<T = unknown> {
  settings: T;
  hasShotSettings: boolean;
}
type SettingsRow = { data: { settings: unknown } | null; error: unknown };
function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }
  throw new ToolSettingsError('cancelled', 'Request was cancelled', {
    recoverable: true,
  });
}
type AbortableQuery<T> = {
  abortSignal?: (signal: AbortSignal) => T;
};
function maybeAttachAbortSignal<T>(query: T, signal?: AbortSignal): T {
  if (!signal) {
    return query;
  }
  const abortable = query as AbortableQuery<T>;
  if (typeof abortable.abortSignal === 'function') {
    return abortable.abortSignal(signal);
  }
  return query;
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
/** Fetch settings from all three scopes (user, project, shot) in parallel. */
function fetchAllScopes(
  supabaseClient: ToolSettingsSupabaseClient,
  userId: string,
  ctx: ToolSettingsContext,
  signal?: AbortSignal,
): Promise<[SettingsRow, SettingsRow, SettingsRow]> {
  const userQuery = maybeAttachAbortSignal(
    supabaseClient
      .from('users')
      .select('settings')
      .eq('id', userId)
      .maybeSingle(),
    signal,
  );
  const projectQuery = ctx.projectId
    ? maybeAttachAbortSignal(
        supabaseClient
          .from('projects')
          .select('settings')
          .eq('id', ctx.projectId)
          .maybeSingle(),
        signal,
      )
    : Promise.resolve({ data: null, error: null });
  const shotQuery = ctx.shotId
    ? maybeAttachAbortSignal(
        supabaseClient
          .from('shots')
          .select('settings')
          .eq('id', ctx.shotId)
          .maybeSingle(),
        signal,
      )
    : Promise.resolve({ data: null, error: null });
  return Promise.all([
    userQuery,
    projectQuery,
    shotQuery,
  ]) as Promise<[SettingsRow, SettingsRow, SettingsRow]>;
}
/** Extract tool-specific settings from scope results and merge in priority order. */
function extractAndMergeSettings(
  userResult: SettingsRow,
  projectResult: SettingsRow,
  shotResult: SettingsRow,
  toolId: string,
  ctx: ToolSettingsContext,
): SettingsFetchResult {
  if (userResult.error) {
    throw new ToolSettingsError(
      'scope_fetch_failed',
      `Failed to load user settings: ${getErrorMessage(userResult.error)}`,
      { recoverable: true, cause: userResult.error, metadata: { scope: 'user' } },
    );
  }
  if (ctx.projectId && projectResult.error) {
    throw new ToolSettingsError(
      'scope_fetch_failed',
      `Failed to load project settings: ${getErrorMessage(projectResult.error)}`,
      { recoverable: true, cause: projectResult.error, metadata: { scope: 'project', projectId: ctx.projectId } },
    );
  }
  if (ctx.shotId && shotResult.error) {
    throw new ToolSettingsError(
      'scope_fetch_failed',
      `Failed to load shot settings: ${getErrorMessage(shotResult.error)}`,
      { recoverable: true, cause: shotResult.error, metadata: { scope: 'shot', shotId: ctx.shotId } },
    );
  }
  const userSettingsData = userResult.data?.settings as Record<string, unknown> | null;
  const projectSettingsData = projectResult.data?.settings as Record<string, unknown> | null;
  const shotSettingsData = shotResult.data?.settings as Record<string, unknown> | null;
  const userSettings = (userSettingsData?.[toolId] as Record<string, unknown>) ?? {};
  const projectSettings = (projectSettingsData?.[toolId] as Record<string, unknown>) ?? {};
  const shotSettings = (shotSettingsData?.[toolId] as Record<string, unknown>) ?? {};
  const defaultSettings = (toolDefaultsRegistry[toolId] as Record<string, unknown> | undefined) ?? {};
  const hasShotSettings = shotSettings && Object.keys(shotSettings).length > 0;
  const merged = deepMerge(
    {},
    defaultSettings,
    userSettings,
    projectSettings,
    shotSettings
  );
  return { settings: merged, hasShotSettings };
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
      return toOperationFailure(new ToolSettingsError('cancelled', 'Request was cancelled', {
        recoverable: true,
      }));
    }
    const runtimeClient = getToolSettingsRuntimeClient(supabaseClient);
    if (!runtimeClient) {
      return toOperationFailure(new ToolSettingsError(
        'unknown',
        'Tool settings runtime is not initialized',
      ));
    }
    const { data: { user } } = await resolveAndCacheUserId(runtimeClient);
    if (!user) {
      return toOperationFailure(new ToolSettingsError('auth_required', 'Authentication required'));
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
      const [userResult, projectResult, shotResult] = await fetchAllScopes(runtimeClient, userId, ctx, signal);
      throwIfAborted(signal);
      const { data: { user: latestUser } } = await resolveAndCacheUserId(runtimeClient);
      if (!latestUser || latestUser.id !== userId) {
        throw new ToolSettingsError('cancelled', 'Request was cancelled due to auth state change', {
          recoverable: true,
          metadata: { expectedUserId: userId, latestUserId: latestUser?.id ?? null },
        });
      }
      return extractAndMergeSettings(userResult, projectResult, shotResult, toolId, ctx);
    })();
    inflightSettingsFetches.set(singleFlightKey, promise);
    promise.finally(() => {
      inflightSettingsFetches.delete(singleFlightKey);
    }).catch(() => {});
    const value = await raceWithAbort(promise, signal);
    return operationSuccess(value);
  } catch (error: unknown) {
    if (isToolSettingsError(error) && error.code === 'cancelled') {
      return toOperationFailure(error);
    }
    if (isCancellationError(error)) {
      return toOperationFailure(new ToolSettingsError('cancelled', 'Request was cancelled', {
        recoverable: true,
        cause: error,
      }));
    }
    const errorMsg = getErrorMessage(error);
    const contextInfo = {
      visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
      hidden: typeof document !== 'undefined' ? document.hidden : false,
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    };
    if (errorMsg.includes('Auth timeout') || errorMsg.includes('Auth request was cancelled')) {
      normalizeAndPresentError(error, {
        context: 'fetchToolSettingsSupabase.authTimeout',
        showToast: false,
        logData: contextInfo,
      });
      return toOperationFailure(new ToolSettingsError(
        'network',
        'Authentication check timed out. Please retry.',
        {
          recoverable: true,
          cause: error,
          metadata: { ...contextInfo, reason: 'auth_timeout' },
        },
      ));
    }
    if (errorMsg.includes('Failed to fetch')) {
      normalizeAndPresentError(error, { context: 'fetchToolSettingsSupabase.network', showToast: false, logData: contextInfo });
      return toOperationFailure(new ToolSettingsError(
        'network',
        'Network connection issue. Please check your internet connection.',
        {
          recoverable: true,
          cause: error,
          metadata: contextInfo,
        },
      ));
    }
    normalizeAndPresentError(error, { context: 'fetchToolSettingsSupabase', showToast: false, logData: contextInfo });
    return toOperationFailure(classifyToolSettingsError(error));
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
};

/** @internal Only for test isolation — do not call in production code. */
export function _resetCachedUserForTesting() {
  _resetToolSettingsAuthCacheForTesting();
  inflightSettingsFetches.clear();
}
