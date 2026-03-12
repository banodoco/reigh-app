import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { readUserIdFromStorage } from '@/shared/lib/supabaseSession';
import type { Session } from '@supabase/supabase-js';

const USER_CACHE_MS = 10_000; // 10 seconds

type UserLookupResult = Promise<{ data: { user: { id: string } | null }; error: null }>;
type AuthStateCallback = (event: string, session: Session | null) => void;

export interface ToolSettingsSupabaseClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<unknown>;
        abortSignal?: <T>(signal: AbortSignal) => T;
      };
    };
  };
  auth: {
    getSession: () => Promise<{ data: { session: Session | null } }>;
    onAuthStateChange?: (
      callback: AuthStateCallback,
    ) => {
      data?: {
        subscription?: {
          unsubscribe?: () => void;
        };
      };
    };
  };
}

interface AuthCacheSyncSource {
  subscribe: (id: string, callback: AuthStateCallback) => () => void;
}

let cachedUser: { id: string } | null = null;
let hasCachedUserSnapshot = false;
let cachedUserAt = 0;
let cleanupAuthCacheSync: (() => void) | null = null;
let authCacheInitializationPromise: Promise<void> | null = null;
let runtimeSupabaseClient: ToolSettingsSupabaseClient | null = null;
let invalidateAuthDependentState: (() => void) | null = null;

function createDirectAuthCacheSyncSource(
  supabaseClient: ToolSettingsSupabaseClient,
): AuthCacheSyncSource {
  return {
    subscribe: (_id, callback) => {
      if (typeof supabaseClient.auth.onAuthStateChange !== 'function') {
        return () => {};
      }
      const authSubscription = supabaseClient.auth.onAuthStateChange((event, session) => {
        callback(event, session);
      });
      const unsubscribe = authSubscription.data?.subscription?.unsubscribe;
      return typeof unsubscribe === 'function' ? () => unsubscribe() : () => {};
    },
  };
}

function updateCachedUserId(userId: string | null, invalidateState: boolean): void {
  if (invalidateState) {
    invalidateAuthDependentState?.();
  }

  cachedUser = userId ? { id: userId } : null;
  hasCachedUserSnapshot = true;
  cachedUserAt = Date.now();
}

function setToolSettingsRuntimeClient(
  supabaseClient: ToolSettingsSupabaseClient,
): void {
  runtimeSupabaseClient = supabaseClient;
}

function resolveToolSettingsRuntimeClient(
  supabaseClient?: ToolSettingsSupabaseClient,
): ToolSettingsSupabaseClient | null {
  return supabaseClient ?? runtimeSupabaseClient;
}

function syncCachedUserId(userId: string | null): void {
  if (userId) {
    setCachedUserId(userId);
    return;
  }
  clearCachedUserId();
}

function syncCachedUserFromSession(session: Session | null): void {
  syncCachedUserId(session?.user?.id ?? null);
}

function startToolSettingsAuthCacheInitialization(
  supabaseClient: ToolSettingsSupabaseClient,
  authManager: AuthCacheSyncSource,
): Promise<void> {
  if (authCacheInitializationPromise) {
    return authCacheInitializationPromise;
  }

  syncCachedUserId(readUserIdFromStorage());

  if (!cleanupAuthCacheSync) {
    cleanupAuthCacheSync = authManager.subscribe('toolSettingsService', (_event, session) => {
      syncCachedUserFromSession(session);
    });
  }

  authCacheInitializationPromise = supabaseClient.auth
    .getSession()
    .then(({ data: { session } }) => {
      syncCachedUserFromSession(session);
    })
    .catch((error) => {
      normalizeAndPresentError(error, {
        context: 'toolSettingsAuthCache.initializeToolSettingsAuthCache',
        showToast: false,
      });
    });

  return authCacheInitializationPromise;
}

function buildUserLookupResult(userId: string | null): UserLookupResult {
  return Promise.resolve({
    data: { user: userId ? { id: userId } : null },
    error: null,
  });
}

function readFreshCachedUserId(): string | null | undefined {
  if (!hasCachedUserSnapshot) {
    return undefined;
  }
  if (cleanupAuthCacheSync) {
    return cachedUser?.id ?? null;
  }
  if ((Date.now() - cachedUserAt) >= USER_CACHE_MS) {
    return undefined;
  }
  return cachedUser?.id ?? null;
}

export function setToolSettingsAuthCacheInvalidationHandler(
  handler: (() => void) | null,
): void {
  invalidateAuthDependentState = handler;
}

export function setCachedUserId(userId: string) {
  updateCachedUserId(userId, true);
}

export function clearCachedUserId() {
  updateCachedUserId(null, true);
}

export function initializeToolSettingsAuthCache(
  supabaseClient: ToolSettingsSupabaseClient,
  authManager: AuthCacheSyncSource,
): void {
  setToolSettingsRuntimeClient(supabaseClient);
  void startToolSettingsAuthCacheInitialization(supabaseClient, authManager);
}

export function ensureToolSettingsAuthCacheInitialized(
  supabaseClient?: ToolSettingsSupabaseClient,
): Promise<void> {
  if (authCacheInitializationPromise) {
    return authCacheInitializationPromise;
  }

  const runtimeClient = resolveToolSettingsRuntimeClient(supabaseClient);
  if (!runtimeClient) {
    syncCachedUserId(readUserIdFromStorage());
    return Promise.resolve();
  }

  setToolSettingsRuntimeClient(runtimeClient);
  return startToolSettingsAuthCacheInitialization(
    runtimeClient,
    createDirectAuthCacheSyncSource(runtimeClient),
  );
}

export function getToolSettingsRuntimeClient(
  supabaseClient?: ToolSettingsSupabaseClient,
): ToolSettingsSupabaseClient | null {
  return resolveToolSettingsRuntimeClient(supabaseClient);
}

export function readCachedUserId(): UserLookupResult {
  const cachedUserId = readFreshCachedUserId();
  return buildUserLookupResult(cachedUserId ?? null);
}

export function resolveAndCacheUserId(
  supabaseClient?: ToolSettingsSupabaseClient,
): UserLookupResult {
  const cachedUserId = readFreshCachedUserId();
  if (cachedUserId !== undefined) {
    return buildUserLookupResult(cachedUserId);
  }

  return ensureToolSettingsAuthCacheInitialized(supabaseClient).then(() => {
    return buildUserLookupResult(readFreshCachedUserId() ?? null);
  });
}

export function _resetToolSettingsAuthCacheForTesting() {
  cleanupAuthCacheSync?.();
  cleanupAuthCacheSync = null;
  authCacheInitializationPromise = null;
  cachedUser = null;
  hasCachedUserSnapshot = false;
  cachedUserAt = 0;
  runtimeSupabaseClient = null;
  invalidateAuthDependentState = null;
}
