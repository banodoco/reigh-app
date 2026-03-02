import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { createSupabaseClient } from '@/integrations/supabase/bootstrap/createSupabaseClient';
import { initializeSupabaseRuntime } from '@/integrations/supabase/bootstrap/initializeSupabaseRuntime';

type SupabaseClientInstance = SupabaseClient<Database>;

let runtimeClient: SupabaseClientInstance | null = null;

export function initializeSupabaseClientRuntime(): SupabaseClientInstance {
  if (runtimeClient) {
    return runtimeClient;
  }

  const client = createSupabaseClient();
  initializeSupabaseRuntime(client);
  runtimeClient = client;
  return client;
}

export function getSupabaseRuntimeClient(): SupabaseClientInstance {
  if (!runtimeClient) {
    throw new Error('Supabase runtime is not initialized. Call initializeSupabaseClientRuntime() during app bootstrap.');
  }
  return runtimeClient;
}
