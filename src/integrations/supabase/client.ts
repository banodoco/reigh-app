/** @publicContract Supabase browser runtime entrypoint. */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import {
  getSupabaseRuntimeClient,
  initializeSupabaseClientRuntime,
} from '@/integrations/supabase/runtime/supabaseRuntime';

type SupabaseClientInstance = SupabaseClient<Database>;
let hasInitializedRuntimeClient = false;
const SUPABASE_NOT_INITIALIZED_MESSAGE =
  'Supabase runtime has not been initialized. Call initializeSupabase() during app bootstrap before using Supabase clients.';

type SupabaseClientAccessResult =
  | { ok: true; client: SupabaseClientInstance }
  | { ok: false; error: Error };

/** Runtime bootstrap entrypoint for app startup. */
export function initializeSupabase(): SupabaseClientInstance {
  const client = initializeSupabaseClientRuntime();
  hasInitializedRuntimeClient = true;
  return client;
}

/** Runtime accessor that never throws; callers can branch on initialization state. */
export function getSupabaseClientResult(): SupabaseClientAccessResult {
  if (!hasInitializedRuntimeClient) {
    return { ok: false, error: new Error(SUPABASE_NOT_INITIALIZED_MESSAGE) };
  }
  try {
    return { ok: true, client: getSupabaseRuntimeClient() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/** Runtime accessor for initialized app runtime. Throws if bootstrap has not run. */
export function getSupabaseClient(): SupabaseClientInstance {
  const result = getSupabaseClientResult();
  if (!result.ok) {
    throw result.error;
  }
  return result.client;
}
