/** @publicContract Supabase browser runtime entrypoint. */

import {
  type SupabaseClientAccessResult,
  getOrInitializeSupabaseRuntimeClientResult,
  initializeSupabaseClientRuntime,
  normalizeSupabaseError,
} from '@/integrations/supabase/runtime/supabaseRuntime';

export type { SupabaseClientAccessResult };
export type GetSupabaseClientResult = () => SupabaseClientAccessResult;

/** Runtime bootstrap entrypoint for app startup. */
function initializeSupabase() {
  return initializeSupabaseClientRuntime();
}

export function initializeSupabaseResult(): SupabaseClientAccessResult {
  try {
    const client = initializeSupabase();
    return { ok: true, client };
  } catch (error) {
    return { ok: false, error: normalizeSupabaseError(error) };
  }
}

/** Runtime accessor that never throws; callers can branch on initialization state. */
export function getSupabaseClientResult(): SupabaseClientAccessResult {
  const result = getOrInitializeSupabaseRuntimeClientResult();
  return result.ok ? result : { ok: false, error: normalizeSupabaseError(result.error) };
}

/** Runtime accessor for initialized app runtime. Throws if bootstrap has not run. */
export function getSupabaseClient() {
  const result = getSupabaseClientResult();
  if (!result.ok) {
    throw result.error;
  }
  return result.client;
}
