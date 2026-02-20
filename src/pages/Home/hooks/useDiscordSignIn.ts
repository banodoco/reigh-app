import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { handleError } from '@/shared/lib/errorHandling/handleError';

export function useDiscordSignIn() {
  return useCallback(async () => {
    try {
      try {
        localStorage.setItem('oauthInProgress', 'true');
      } catch {
        // intentionally ignored
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: {
          redirectTo: window.location.origin,
        },
      });

      if (error) {
        handleError(error, { context: 'HomePage', toastTitle: 'Failed to start Discord sign-in. Please try again.' });
      }
    } catch (error) {
      handleError(error, { context: 'HomePage', toastTitle: 'An unexpected error occurred. Please try again.' });
    }
  }, []);
}
