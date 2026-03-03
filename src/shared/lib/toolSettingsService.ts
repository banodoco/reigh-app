/**
 * Tool Settings Service
 *
 * Pure async functions for fetching tool settings from Supabase.
 * Extracted from useToolSettings.ts to reduce hook file complexity.
 *
 * Contains:
 * - Auth caching logic (getCachedUserId)
 * - Settings fetch with single-flight deduplication (fetchToolSettingsSupabase)
 * - Module-level state for caching and deduplication
 */

import { getSupabaseClient } from '@/integrations/supabase/client';
import { deepMerge } from '@/shared/lib/utils/deepEqual';
import { isCancellationError, getErrorMessage } from '@/shared/lib/errorHandling/errorUtils';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { readUserIdFromStorage } from '@/shared/lib/supabaseSession';
import { isKnownSettingsId } from '@/shared/lib/settingsIds';
import {
  operationFailure,
  operationSuccess,
  type OperationFailure,
  type OperationResult,
} from '@/shared/lib/operationResult';
import { toolDefaultsRegistry } from '@/tooling/toolDefaultsRegistry';

// ============================================================================
// Module-level state
// ============================================================================

// Single-flight dedupe for settings fetches across components
const inflightSettingsFetches = new Map<string, Promise<unknown>>();

// Lightweight user cache to avoid repeated localStorage reads within a short window
let cachedUser: { id: string } | null = null;
let cachedUserAt: number = 0;
const USER_CACHE_MS = 10_000; // 10 seconds

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

/**
 * Seed the user cache from an external source (e.g. AuthContext).
 *
 * Call this as early as possible — ideally in AuthContext right after getSession()
 * resolves, before AuthGate opens. This lets getCachedUserId() return
 * immediately from cache without acquiring any navigator.locks, avoiding stalls
 * during token refresh.
 */
export function setCachedUserId(userId: string) {
  cachedUser = { id: userId };
  cachedUserAt = Date.now();
}

/** @internal Only for test isolation — do not call in production code. */
export function _resetCachedUserForTesting() {
  cachedUser = null;
  cachedUserAt = 0;
}

// ============================================================================
// Types
// ============================================================================

interface ToolSettingsContext {
  projectId?: string;
  shotId?: string;
}

export type ToolSettingsErrorCode =
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

export function isToolSettingsError(error: unknown): error is ToolSettingsError {
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

export function toToolSettingsErrorFromOperationFailure(failure: OperationFailure): ToolSettingsError {
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

// ============================================================================
// Auth helpers
// ============================================================================

/**
 * Get authenticated user ID without acquiring navigator.locks.
 *
 * Resolution order (all synchronous / lock-free):
 *   1. In-memory cache (set by AuthContext via setCachedUserId)
 *   2. localStorage session (same key Supabase uses; contains full user object)
 *   3. null — user is genuinely signed out
 *
 * Previously this called getSession() / getUser() which both acquire a shared
 * navigator.lock. During token refresh Supabase holds an EXCLUSIVE lock, so
 * ALL shared-lock requests queue behind it — blocking for 600ms-16s. By reading
 * the user ID from localStorage instead we avoid locks entirely. Token validity
 * for actual data requests is handled by createSupabaseClient's cached token.
 */
export function getCachedUserId(): Promise<{ data: { user: { id: string } | null }; error: null }> {
  // Check in-memory cache first
  if (cachedUser && (Date.now() - cachedUserAt) < USER_CACHE_MS) {
    return Promise.resolve({ data: { user: { id: cachedUser.id } }, error: null });
  }

  // Read from localStorage — synchronous, no navigator.locks, always fresh
  const localUserId = readUserIdFromStorage();
  if (localUserId) {
    cachedUser = { id: localUserId };
    cachedUserAt = Date.now();
    return Promise.resolve({ data: { user: { id: localUserId } }, error: null });
  }

  // No session in storage — user is signed out
  return Promise.resolve({ data: { user: null }, error: null });
}

// ============================================================================
// Settings fetch helpers
// ============================================================================

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
  supabaseClient: ReturnType<typeof getSupabaseClient>,
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

  // Merge in priority order: defaults -> user -> project -> shot
  const merged = deepMerge(
    {},
    defaultSettings,
    userSettings,
    projectSettings,
    shotSettings
  );

  return { settings: merged, hasShotSettings };
}

// ============================================================================
// Settings fetch
// ============================================================================

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
  signal?: AbortSignal
): Promise<OperationResult<SettingsFetchResult>> {
  try {
    reportUnknownSettingsId(toolId);

    // Check if request was cancelled before starting
    if (signal?.aborted) {
      return toOperationFailure(new ToolSettingsError('cancelled', 'Request was cancelled', {
        recoverable: true,
      }));
    }

    // Single-flight dedupe key for concurrent identical requests
    const singleFlightKey = JSON.stringify({ toolId, projectId: ctx.projectId ?? null, shotId: ctx.shotId ?? null });
    const existingPromise = inflightSettingsFetches.get(singleFlightKey);
    if (existingPromise) {
      const value = await raceWithAbort(existingPromise as Promise<SettingsFetchResult>, signal);
      return operationSuccess(value);
    }

    const promise = (async (): Promise<SettingsFetchResult> => {
      throwIfAborted(signal);

      const { data: { user } } = await getCachedUserId();

      if (!user) {
        throw new ToolSettingsError('auth_required', 'Authentication required');
      }

      throwIfAborted(signal);

      const supabaseClient = getSupabaseClient();
      const [userResult, projectResult, shotResult] = await fetchAllScopes(supabaseClient, user.id, ctx, signal);
      throwIfAborted(signal);
      return extractAndMergeSettings(userResult, projectResult, shotResult, toolId, ctx);
    })();

    inflightSettingsFetches.set(singleFlightKey, promise);
    // The .finally cleanup promise is intentionally not awaited or returned.
    // Suppress its rejection to avoid unhandled rejection warnings — the original
    // `promise` reference (returned below) handles propagation to the caller.
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
    // Build context info without calling getSession() — can block during token refresh
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
): Promise<SettingsFetchResult> {
  const result = await fetchToolSettingsSupabase(toolId, ctx, signal);
  if (!result.ok) {
    throw toToolSettingsErrorFromOperationFailure(result);
  }
  return result.value;
}
