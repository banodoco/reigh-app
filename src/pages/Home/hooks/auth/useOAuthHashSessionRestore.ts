import { useEffect } from 'react';
import type { Session } from '@getSupabase/supabase-js';
import { getSupabaseClient } from '@/integrations/supabase/client';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { removeStorageItem, setStorageItem } from './storage';

const getSupabase = () => getSupabaseClient();

interface UseOAuthHashSessionRestoreOptions {
  setSession: (session: Session | null) => void;
}

export function useOAuthHashSessionRestore({
  setSession,
}: UseOAuthHashSessionRestoreOptions): void {
  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      const hash = window.location.hash;
      if (!hash || !hash.includes('access_token')) {
        return;
      }

      try {
        const hashParams = new URLSearchParams(hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (!accessToken || !refreshToken) {
          return;
        }

        setStorageItem(
          'oauthInProgress',
          'true',
          'useOAuthHashSessionRestore.setOAuthInProgress',
        );

        const { data, error } = await getSupabase().auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          throw error;
        }

        if (!cancelled) {
          setSession(data.session ?? null);
        }
      } catch (error) {
        normalizeAndPresentError(error, {
          context: 'useOAuthHashSessionRestore.restore',
          showToast: false,
        });
        removeStorageItem(
          'oauthInProgress',
          'useOAuthHashSessionRestore.clearOAuthInProgressOnError',
        );
      } finally {
        window.history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search,
        );
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [setSession]);
}
