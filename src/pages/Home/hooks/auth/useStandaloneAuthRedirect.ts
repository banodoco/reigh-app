import { useEffect } from 'react';
import type { Session } from '@getSupabase/supabase-js';
import { getSupabaseClient } from '@/integrations/supabase/client';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { isStandaloneDisplayMode } from './displayMode';

const getSupabase = () => getSupabaseClient();

interface UseStandaloneAuthRedirectOptions {
  setSession: (session: Session | null) => void;
  navigate: (to: string) => void;
}

export function useStandaloneAuthRedirect({
  setSession,
  navigate,
}: UseStandaloneAuthRedirectOptions): void {
  useEffect(() => {
    let cancelled = false;
    let delayedCheckTimer: ReturnType<typeof setTimeout> | null = null;

    const syncSessionAndRedirect = async () => {
      try {
        const { data, error } = await getSupabase().auth.getSession();
        if (error) {
          throw error;
        }
        if (cancelled) {
          return;
        }

        const session = data.session;
        setSession(session);
        if (session && isStandaloneDisplayMode()) {
          navigate('/tools');
        }
      } catch (error) {
        normalizeAndPresentError(error, {
          context: 'useStandaloneAuthRedirect.syncSessionAndRedirect',
          showToast: false,
        });
      }
    };

    void syncSessionAndRedirect();

    if (isStandaloneDisplayMode()) {
      delayedCheckTimer = setTimeout(() => {
        void syncSessionAndRedirect();
      }, 500);
    }

    return () => {
      cancelled = true;
      if (delayedCheckTimer) {
        clearTimeout(delayedCheckTimer);
      }
    };
  }, [navigate, setSession]);
}
