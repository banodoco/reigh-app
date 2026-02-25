import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { initAuthStateManager } from '@/integrations/supabase/auth/AuthStateManager';
import { getReconnectScheduler } from '@/integrations/supabase/reconnect/ReconnectScheduler';
import { maybeAutoLogin } from '@/integrations/supabase/dev/autoLogin';

export function initializeSupabaseRuntime(
  client: ReturnType<typeof createClient<Database>>,
): void {
  // Shared runtime wiring after client construction.
  getReconnectScheduler();
  initAuthStateManager(client);
  maybeAutoLogin(client);
}
