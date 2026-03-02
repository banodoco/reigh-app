/** @publicContract Supabase browser runtime entrypoint. */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import {
  getSupabaseRuntimeClient,
  initializeSupabaseClientRuntime,
} from '@/integrations/supabase/runtime/supabaseRuntime';

type SupabaseClientInstance = SupabaseClient<Database>;
const SUPABASE_NOT_INITIALIZED_MESSAGE =
  'Supabase runtime has not been initialized. Call initializeSupabase() during app bootstrap before using Supabase clients.';

type SupabaseRuntimeStatus = 'uninitialized' | 'ready' | 'failed';

interface SupabaseRuntimeRegistryState {
  status: SupabaseRuntimeStatus;
  client: SupabaseClientInstance | null;
  error: Error | null;
}

export type SupabaseClientAccessResult =
  | { ok: true; client: SupabaseClientInstance }
  | { ok: false; error: Error };

export interface SupabaseClientRegistry {
  getClientResult: () => SupabaseClientAccessResult;
}

const runtimeRegistry: SupabaseRuntimeRegistryState = {
  status: 'uninitialized',
  client: null,
  error: null,
};

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** Runtime bootstrap entrypoint for app startup. */
export function initializeSupabase(): SupabaseClientInstance {
  if (runtimeRegistry.status === 'ready' && runtimeRegistry.client) {
    return runtimeRegistry.client;
  }

  try {
    const client = initializeSupabaseClientRuntime();
    runtimeRegistry.status = 'ready';
    runtimeRegistry.client = client;
    runtimeRegistry.error = null;
    return client;
  } catch (error) {
    const normalized = normalizeError(error);
    runtimeRegistry.status = 'failed';
    runtimeRegistry.client = null;
    runtimeRegistry.error = normalized;
    throw normalized;
  }
}

export function initializeSupabaseResult(): SupabaseClientAccessResult {
  try {
    const client = initializeSupabase();
    return { ok: true, client };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

/** Runtime accessor that never throws; callers can branch on initialization state. */
export function getSupabaseClientResult(): SupabaseClientAccessResult {
  if (runtimeRegistry.status === 'ready' && runtimeRegistry.client) {
    return { ok: true, client: runtimeRegistry.client };
  }

  if (runtimeRegistry.status === 'failed' && runtimeRegistry.error) {
    return { ok: false, error: runtimeRegistry.error };
  }

  if (runtimeRegistry.status === 'uninitialized') {
    return { ok: false, error: new Error(SUPABASE_NOT_INITIALIZED_MESSAGE) };
  }

  try {
    return { ok: true, client: getSupabaseRuntimeClient() };
  } catch (error) {
    return {
      ok: false,
      error: normalizeError(error),
    };
  }
}

export const supabaseClientRegistry: SupabaseClientRegistry = {
  getClientResult: getSupabaseClientResult,
};

/** Runtime accessor for initialized app runtime. Throws if bootstrap has not run. */
export function getSupabaseClient(): SupabaseClientInstance {
  const result = supabaseClientRegistry.getClientResult();
  if (!result.ok) {
    throw result.error;
  }
  return result.client;
}
