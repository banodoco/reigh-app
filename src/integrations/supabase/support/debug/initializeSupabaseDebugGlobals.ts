import { getSupabaseClient } from '@/integrations/supabase/client';
import {
  __CORRUPTION_TRACE_ENABLED__,
  __REALTIME_DOWN_FIX_ENABLED__,
  __WS_INSTRUMENTATION_ENABLED__,
} from '@/integrations/supabase/config/env';
import { installRealtimeInstrumentation } from '@/integrations/supabase/instrumentation/realtime';
import { installWindowOnlyInstrumentation } from '@/integrations/supabase/instrumentation/window';
import { registerDebugGlobal } from '@/shared/runtime/debugRegistry';

let cleanupSupabaseDebugGlobals: (() => void) | null = null;

/**
 * Optional dev diagnostics registration.
 * Exposes the singleton on window only when explicitly requested.
 */
export function initializeSupabaseDebugGlobals(): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return;
  }

  const client = getSupabaseClient();
  if (
    __CORRUPTION_TRACE_ENABLED__ ||
    __REALTIME_DOWN_FIX_ENABLED__ ||
    __WS_INSTRUMENTATION_ENABLED__
  ) {
    installWindowOnlyInstrumentation();
    installRealtimeInstrumentation(client);
  }

  cleanupSupabaseDebugGlobals?.();
  const disposeSupabaseClient = registerDebugGlobal(
    '__supabase_client__',
    client,
    'initializeSupabaseDebugGlobals',
  );
  const disposeSupabaseAlias = registerDebugGlobal(
    'supabase',
    client,
    'initializeSupabaseDebugGlobals',
  );
  cleanupSupabaseDebugGlobals = () => {
    disposeSupabaseAlias();
    disposeSupabaseClient();
  };
}
