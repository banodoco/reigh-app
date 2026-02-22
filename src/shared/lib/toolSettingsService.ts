/**
 * Tool Settings Service
 *
 * Pure async functions for fetching tool settings from Supabase.
 * Extracted from useToolSettings.ts to reduce hook file complexity.
 *
 * Contains:
 * - Auth timeout/caching logic (getUserWithTimeout)
 * - Settings fetch with single-flight deduplication (fetchToolSettingsSupabase)
 * - Module-level state for caching and deduplication
 */

import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL } from '@/integrations/supabase/config/env';
import { deepMerge } from '@/shared/lib/deepEqual';
import { isCancellationError, getErrorMessage } from '@/shared/lib/errorUtils';
import { handleError } from '@/shared/lib/errorHandling/handleError';
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

/**
 * Seed the user cache from an external source (e.g. AuthContext).
 *
 * Call this as early as possible — ideally in AuthContext right after getSession()
 * resolves, before AuthGate opens. This lets getUserWithTimeout() return
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

/**
 * Read the user ID directly from localStorage without acquiring navigator.locks.
 *
 * Supabase stores the full session JSON (including user.id) under
 * `sb-${projectRef}-auth-token`. Reading this is synchronous and never
 * contends with token-refresh exclusive locks, unlike getSession()/getUser().
 *
 * Returns null if no session exists in storage (user is signed out).
 */
function readUserIdFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
    const raw = localStorage.getItem(`sb-${projectRef}-auth-token`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { user?: { id?: string } };
    return parsed?.user?.id ?? null;
  } catch {
    return null;
  }
}

// ============================================================================
// Types
// ============================================================================

interface ToolSettingsContext {
  projectId?: string;
  shotId?: string;
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
export function getUserWithTimeout(_timeoutMs = 15000): Promise<{ data: { user: { id: string } | null }; error: null }> {
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

/** Fetch settings from all three scopes (user, project, shot) in parallel. */
function fetchAllScopes(
  userId: string,
  ctx: ToolSettingsContext
): Promise<[SettingsRow, SettingsRow, SettingsRow]> {
  return Promise.all([
    supabase
      .from('users')
      .select('settings')
      .eq('id', userId)
      .maybeSingle(),

    ctx.projectId
      ? supabase
          .from('projects')
          .select('settings')
          .eq('id', ctx.projectId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    ctx.shotId
      ? supabase
          .from('shots')
          .select('settings')
          .eq('id', ctx.shotId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]) as Promise<[SettingsRow, SettingsRow, SettingsRow]>;
}

/** Extract tool-specific settings from scope results and merge in priority order. */
function extractAndMergeSettings(
  userResult: SettingsRow,
  projectResult: SettingsRow,
  shotResult: SettingsRow,
  toolId: string
): SettingsFetchResult {
  const userSettingsData = userResult.data?.settings as Record<string, unknown> | null;
  const projectSettingsData = projectResult.data?.settings as Record<string, unknown> | null;
  const shotSettingsData = shotResult.data?.settings as Record<string, unknown> | null;
  const userSettings = (userSettingsData?.[toolId] as Record<string, unknown>) ?? {};
  const projectSettings = (projectSettingsData?.[toolId] as Record<string, unknown>) ?? {};
  const shotSettings = (shotSettingsData?.[toolId] as Record<string, unknown>) ?? {};

  const hasShotSettings = shotSettings && Object.keys(shotSettings).length > 0;

  // Merge in priority order: defaults -> user -> project -> shot
  const merged = deepMerge(
    {},
    toolDefaultsRegistry[toolId] ?? {},
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
): Promise<SettingsFetchResult> {
  try {
    // Check if request was cancelled before starting
    if (signal?.aborted) {
      throw new DOMException('Request was cancelled', 'AbortError');
    }

    // Single-flight dedupe key for concurrent identical requests
    const singleFlightKey = JSON.stringify({ toolId, projectId: ctx.projectId ?? null, shotId: ctx.shotId ?? null });
    const existingPromise = inflightSettingsFetches.get(singleFlightKey);
    if (existingPromise) {
      return existingPromise as Promise<SettingsFetchResult>;
    }

    const promise = (async (): Promise<SettingsFetchResult> => {
      const { data: { user }, error: authError } = await getUserWithTimeout();

      if (authError || !user) {
        throw new Error('Authentication required');
      }

      if (signal?.aborted) {
        throw new DOMException('Request was cancelled', 'AbortError');
      }

      const [userResult, projectResult, shotResult] = await fetchAllScopes(user.id, ctx);
      return extractAndMergeSettings(userResult, projectResult, shotResult, toolId);
    })();

    inflightSettingsFetches.set(singleFlightKey, promise);
    // The .finally cleanup promise is intentionally not awaited or returned.
    // Suppress its rejection to avoid unhandled rejection warnings — the original
    // `promise` reference (returned below) handles propagation to the caller.
    promise.finally(() => {
      inflightSettingsFetches.delete(singleFlightKey);
    }).catch(() => {});
    return promise;

  } catch (error: unknown) {
    if (isCancellationError(error)) {
      throw new DOMException('Request was cancelled', 'AbortError');
    }
    // Build context info without calling getSession() — can block during token refresh
    const errorMsg = getErrorMessage(error);
    const contextInfo = {
      visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
      hidden: typeof document !== 'undefined' ? document.hidden : false,
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    };

    if (errorMsg.includes('Auth timeout') || errorMsg.includes('Auth request was cancelled')) {
      return { settings: deepMerge({}, toolDefaultsRegistry[toolId] ?? {}), hasShotSettings: false };
    }

    if (errorMsg.includes('Failed to fetch')) {
      handleError(error, { context: 'fetchToolSettingsSupabase.network', showToast: false, logData: contextInfo });
      throw new Error('Network connection issue. Please check your internet connection.');
    }

    handleError(error, { context: 'fetchToolSettingsSupabase', showToast: false, logData: contextInfo });
    throw error;
  }
}
