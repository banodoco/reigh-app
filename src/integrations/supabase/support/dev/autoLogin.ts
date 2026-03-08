import { __IS_DEV_ENV__, getSupabaseUrl } from '@/integrations/supabase/config/env';
import { normalizeAndLogError } from '@/shared/lib/errorHandling/runtimeErrorReporting';
import type { SupabaseClient, AuthError } from '@supabase/supabase-js';

// Read the stored session from localStorage without acquiring navigator.locks.
// Key format matches GoTrueClient: sb-${projectRef}-auth-token
// Returns true for any session (including expired) — AuthContext.getSession() handles
// token refresh automatically, so we only skip signInWithPassword() when there's
// genuinely no session at all (empty localStorage).
function hasStoredSession(): boolean {
  try {
    const projectRef = new URL(getSupabaseUrl()).hostname.split('.')[0];
    const raw = localStorage.getItem(`sb-${projectRef}-auth-token`);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { access_token?: string };
    if (!parsed?.access_token) return false;
    return true;
  } catch (error) {
    normalizeAndLogError(error, {
      context: 'SupabaseAutoLogin.hasStoredSession',
          });
    return false;
  }
}

export function maybeAutoLogin(supabase: SupabaseClient) {
  if (!__IS_DEV_ENV__) return;
  // Skip if the user already has a stored session. signInWithPassword() acquires
  // navigator.locks for its entire network round-trip — calling it unnecessarily
  // queues AuthContext.getSession() and stalls the initial render.
  if (hasStoredSession()) return;
  const DEV_USER_EMAIL = import.meta.env?.VITE_DEV_USER_EMAIL;
  const DEV_USER_PASSWORD = import.meta.env?.VITE_DEV_USER_PASSWORD;
  if (DEV_USER_EMAIL && DEV_USER_PASSWORD) {
    supabase.auth.signInWithPassword({
      email: DEV_USER_EMAIL,
      password: DEV_USER_PASSWORD,
    }).then(({ error }: { error: AuthError | null }) => {
      if (error) {
        normalizeAndLogError(error, { context: 'SupabaseAutoLogin' });
      }
    });
  }
}
