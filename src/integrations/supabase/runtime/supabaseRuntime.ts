import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { createSupabaseClient } from '@/integrations/supabase/bootstrap/createSupabaseClient';
import { initializeSupabaseRuntime } from '@/integrations/supabase/bootstrap/initializeSupabaseRuntime';

type SupabaseClientInstance = SupabaseClient<Database>;
const SUPABASE_RUNTIME_NOT_INITIALIZED_MESSAGE =
  'Supabase runtime is not initialized. Call initializeSupabaseClientRuntime() during app bootstrap.';

let runtimeClient: SupabaseClientInstance | null = null;
let runtimeError: Error | null = null;

export type SupabaseRuntimeClientResult =
  | { ok: true; client: SupabaseClientInstance }
  | { ok: false; error: Error };

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function initializeSupabaseClientRuntime(): SupabaseClientInstance {
  if (runtimeClient) {
    return runtimeClient;
  }

  try {
    const client = createSupabaseClient();
    initializeSupabaseRuntime(client);
    runtimeClient = client;
    runtimeError = null;
    return client;
  } catch (error) {
    const normalized = normalizeError(error);
    runtimeClient = null;
    runtimeError = normalized;
    throw normalized;
  }
}

export function getSupabaseRuntimeClientResult(): SupabaseRuntimeClientResult {
  if (runtimeClient) {
    return { ok: true, client: runtimeClient };
  }

  if (runtimeError) {
    return { ok: false, error: runtimeError };
  }

  return {
    ok: false,
    error: new Error(SUPABASE_RUNTIME_NOT_INITIALIZED_MESSAGE),
  };
}

export function getSupabaseRuntimeClient(): SupabaseClientInstance {
  const result = getSupabaseRuntimeClientResult();
  if (!result.ok) {
    throw result.error;
  }
  return result.client;
}
