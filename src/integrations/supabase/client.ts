/** @publicContract Supabase browser runtime entrypoint. */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import {
  getSupabaseRuntimeClientResult,
  initializeSupabaseClientRuntime,
} from '@/integrations/supabase/runtime/supabaseRuntime';

type SupabaseClientInstance = SupabaseClient<Database>;

export type SupabaseClientAccessResult =
  | { ok: true; client: SupabaseClientInstance }
  | { ok: false; error: Error };

export interface SupabaseClientRegistry {
  getClientResult: () => SupabaseClientAccessResult;
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** Runtime bootstrap entrypoint for app startup. */
export function initializeSupabase(): SupabaseClientInstance {
  return initializeSupabaseClientRuntime();
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
  const result = getSupabaseRuntimeClientResult();
  return result.ok ? result : { ok: false, error: normalizeError(result.error) };
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
