import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { getAuthStateManager } from '@/integrations/supabase/auth/AuthStateManager';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

// Returns undefined while loading, null when unauthenticated, Session when authenticated
export function useAuthGuard() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const client = getSupabaseClient();
    let isMounted = true;
    void client.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (isMounted) {
          setSession(session);
        }
      })
      .catch((error) => {
        normalizeAndPresentError(error, {
          context: 'useAuthGuard.getSession',
          showToast: false,
        });
        if (isMounted) {
          setSession(null);
        }
      });

    const authManager = getAuthStateManager();
    let unsubscribe: (() => void) | null = null;

    if (authManager) {
      unsubscribe = authManager.subscribe('Layout', (_event, session) => {
        setSession(session);
      });
    } else {
      const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
        setSession(session);
      });
      unsubscribe = () => subscription?.unsubscribe();
    }

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return { session };
}
