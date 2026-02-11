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
import { toolsManifest } from '@/tools';
import { deepMerge } from '@/shared/lib/deepEqual';
import { isCancellationError, isAbortError, getErrorMessage } from '@/shared/lib/errorUtils';
import { handleError } from '@/shared/lib/errorHandler';

// ============================================================================
// Module-level state
// ============================================================================

// Single-flight dedupe for settings fetches across components
const inflightSettingsFetches = new Map<string, Promise<unknown>>();

// Single-flight dedupe for getSession calls (it's slow - 600ms to 16s!)
let inflightGetSession: Promise<{ data: { session: { user: { id: string } } | null } }> | null = null;

// Lightweight user cache to avoid repeated auth calls within a short window
let cachedUser: { id: string } | null = null;
let cachedUserAt: number = 0;
const USER_CACHE_MS = 10_000; // 10 seconds

// Tool defaults registry - client-side version matching server
const toolDefaults: Record<string, unknown> = Object.fromEntries(
  toolsManifest.map(toolSettings => [toolSettings.id, toolSettings.defaults])
);

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
 * Get authenticated user with timeout protection.
 *
 * Uses a local cache + single-flight deduplication to avoid repeated
 * slow getSession() calls (600ms-16s on mobile networks).
 *
 * @param timeoutMs - Timeout in ms (default 15000, generous for mobile)
 */
export async function getUserWithTimeout(timeoutMs = 15000) {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    // FIRST: Check cached user to avoid slow getSession calls
    // This is critical because getSession() can take 600ms-16s!
    if (cachedUser && (Date.now() - cachedUserAt) < USER_CACHE_MS) {
      clearTimeout(timeoutId);
      return { data: { user: { id: cachedUser.id } }, error: null };
    }

    // Fast path: use local session (no network) to avoid auth network call in background
    // Single-flight the getSession call - it's slow and multiple components call it simultaneously
    if (!inflightGetSession) {
      inflightGetSession = supabase.auth.getSession().finally(() => {
        inflightGetSession = null;
      });
    }

    const { data: sessionData } = await inflightGetSession;

    const sessionUser = sessionData?.session?.user || null;
    if (sessionUser) {
      cachedUser = { id: sessionUser.id };
      cachedUserAt = Date.now();
      clearTimeout(timeoutId);
      return { data: { user: sessionUser }, error: null };
    }

    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<{ data: { user: null }, error: Error }>((_, reject) =>
        setTimeout(() => reject(new Error('Auth timeout - please check your connection')), timeoutMs)
      )
    ]);

    clearTimeout(timeoutId);
    const fetchedUserId = result?.data?.user?.id;
    if (fetchedUserId) {
      cachedUser = { id: fetchedUserId };
      cachedUserAt = Date.now();
    }
    return result;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (isAbortError(error)) {
      throw new Error('Auth request was cancelled - please try again');
    }
    throw error;
  }
}

// ============================================================================
// Settings fetch
// ============================================================================

/**
 * Fetch and merge tool settings from all scopes using direct Supabase calls.
 *
 * Merges in priority order: defaults -> user -> project -> shot.
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
    // Check if request was cancelled before starting - throw to signal cancellation
    if (signal?.aborted) {
      throw new Error('Request was cancelled');
    }

    // Single-flight dedupe key for concurrent identical requests
    const singleFlightKey = JSON.stringify({ toolId, projectId: ctx.projectId ?? null, shotId: ctx.shotId ?? null });
    const existingPromise = inflightSettingsFetches.get(singleFlightKey);
    if (existingPromise) {
      return existingPromise as Promise<SettingsFetchResult>;
    }

    const promise = (async (): Promise<SettingsFetchResult> => {
      // Mobile optimization: Cache user info to avoid repeated auth calls
      // Add timeout to prevent hanging on mobile connections (aligned with Supabase global timeout)
      // Use generous timeout for mobile networks
      const { data: { user }, error: authError } = await getUserWithTimeout();

      if (authError || !user) {
        throw new Error('Authentication required');
      }

      // Check again after auth call - throw to signal cancellation
      // React Query's retry logic won't retry cancelled requests
      if (signal?.aborted) {
        throw new Error('Request was cancelled');
      }

      // Mobile optimization: Use more efficient queries with targeted JSON extraction
      // NOTE: We fetch the entire settings JSON to avoid SQL path issues with tool IDs containing hyphens.
      const [userResult, projectResult, shotResult] = await Promise.all([
        supabase
          .from('users')
          .select('settings')
          .eq('id', user.id)
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
      ]);

      // Handle errors more gracefully for mobile

      // Extract tool-specific settings from the full settings JSON
      const userSettingsData = userResult.data?.settings as Record<string, unknown> | null;
      const projectSettingsData = projectResult.data?.settings as Record<string, unknown> | null;
      const shotSettingsData = shotResult.data?.settings as Record<string, unknown> | null;
      const userSettings = (userSettingsData?.[toolId] as Record<string, unknown>) ?? {};
      const projectSettings = (projectSettingsData?.[toolId] as Record<string, unknown>) ?? {};
      const shotSettings = (shotSettingsData?.[toolId] as Record<string, unknown>) ?? {};

      // Check if shot actually had settings stored (not just empty object)
      const hasShotSettings = shotSettings && Object.keys(shotSettings).length > 0;

      // Merge in priority order: defaults -> user -> project -> shot
      const merged = deepMerge(
        {},
        toolDefaults[toolId] ?? {},
        userSettings,
        projectSettings,
        shotSettings
      );

      return { settings: merged, hasShotSettings };
    })();

    inflightSettingsFetches.set(singleFlightKey, promise);
    promise.finally(() => {
      inflightSettingsFetches.delete(singleFlightKey);
    });
    return promise;

  } catch (error: unknown) {
    // Handle abort errors silently to reduce noise during task cancellation
    if (isCancellationError(error)) {
      // Don't log these as errors - they're expected during component unmounting
      throw new Error('Request was cancelled');
    }
    // Enrich logging with environment context
    const errorMsg = getErrorMessage(error);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const contextInfo = {
        visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
        hidden: typeof document !== 'undefined' ? document.hidden : false,
        online: typeof navigator !== 'undefined' ? navigator.onLine : true,
        hasSession: !!sess?.session,
      };

      if (errorMsg.includes('Auth timeout') || errorMsg.includes('Auth request was cancelled')) {
        // Return defaults rather than erroring, so UI remains usable
        return { settings: deepMerge({}, toolDefaults[toolId] ?? {}), hasShotSettings: false };
      }

      if (errorMsg.includes('Failed to fetch')) {
        handleError(error, { context: 'fetchToolSettingsSupabase.network', showToast: false, logData: contextInfo });
        throw new Error('Network connection issue. Please check your internet connection.');
      }

      handleError(error, { context: 'fetchToolSettingsSupabase', showToast: false, logData: contextInfo });
    } catch (e) {
      // If context gathering fails, still rethrow the original error
      handleError(error, { context: 'fetchToolSettingsSupabase', showToast: false });
    }
    throw error;
  }
}
