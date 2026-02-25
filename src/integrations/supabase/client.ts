/** @publicContract Supabase browser runtime entrypoint. */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import {
  getSupabaseRuntimeClient,
  initializeSupabaseClientRuntime,
} from '@/integrations/supabase/runtime/supabaseRuntime';

type SupabaseClientInstance = SupabaseClient<Database>;
let hasInitializedRuntimeClient = false;

/** Runtime bootstrap entrypoint for app startup. */
export function initializeSupabase(): SupabaseClientInstance {
  const client = initializeSupabaseClientRuntime();
  hasInitializedRuntimeClient = true;
  return client;
}

/** Runtime accessor for initialized app runtime. Throws if bootstrap has not run. */
export function getSupabaseClient(): SupabaseClientInstance {
  if (!hasInitializedRuntimeClient) {
    throw new Error(
      'Supabase runtime has not been initialized. Call initializeSupabase() during app bootstrap before using getSupabaseClient().',
    );
  }
  return getSupabaseRuntimeClient();
}
