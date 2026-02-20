import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import type { NavigatorWithDeviceInfo } from '@/types/browser-extensions';

// Full home page auth flow: iPad OAuth hash parsing, PWA redirect,
// delayed session restoration, auth manager subscription + referral linking
export function useHomeAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // [iPadAuthFix] Explicitly check for OAuth tokens in URL hash on mount
    const handleHashTokens = async () => {
      const hash = window.location.hash;
      if (hash && hash.includes('access_token')) {
        try {
          const hashParams = new URLSearchParams(hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');

          if (accessToken && refreshToken) {
            try { localStorage.setItem('oauthInProgress', 'true'); } catch { /* intentionally ignored */ }

            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              handleError(error, { context: 'HomePage', showToast: false });
              try { localStorage.removeItem('oauthInProgress'); } catch { /* intentionally ignored */ }
            } else if (data.session) {
              setSession(data.session);
            }
          } else {
            const { data, error } = await supabase.auth.getSession();
            if (error) {
              handleError(error, { context: 'HomePage', showToast: false });
            } else if (data.session) {
              setSession(data.session);
            }
          }

          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        } catch (err) {
          handleError(err, { context: 'HomePage', showToast: false });
        }
      }
    };

    handleHashTokens();

    // Check for standalone/PWA mode once
    const nav = navigator as NavigatorWithDeviceInfo;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                        window.matchMedia('(display-mode: fullscreen)').matches ||
                        nav.standalone === true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);

      if (session && isStandalone) {
        navigate('/tools');
      }
    });

    // Also redirect if we're in PWA mode and session becomes available later
    if (isStandalone) {
      const checkSessionAndRedirect = async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        const { data: { session: delayedSession } } = await supabase.auth.getSession();
        if (delayedSession) {
          navigate('/tools');
        }
      };
      checkSessionAndRedirect();
    }

    const authManager = window.__AUTH_MANAGER__;
    let unsubscribe: (() => void) | null = null;

    const handleAuthChange = (event: string, session: Session | null) => {
      const navInner = navigator as NavigatorWithDeviceInfo;
      const isStandaloneNow = window.matchMedia('(display-mode: standalone)').matches ||
                              window.matchMedia('(display-mode: fullscreen)').matches ||
                              navInner.standalone === true;

      setSession(session);

      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session && isStandaloneNow) {
        navigate('/tools');
        return;
      }

      if (event === 'SIGNED_IN' && session) {
        const isHomePath = location.pathname === '/home' || location.pathname === '/';
        const oauthInProgress = localStorage.getItem('oauthInProgress') === 'true';
        if (oauthInProgress) {
          try {
            const referralCode = localStorage.getItem('referralCode');
            const referralSessionId = localStorage.getItem('referralSessionId');
            const referralFingerprint = localStorage.getItem('referralFingerprint');
            if (referralCode && referralSessionId && referralFingerprint) {
              (async () => {
                try {
                  await supabase.rpc('create_referral_from_session', {
                    p_session_id: referralSessionId,
                    p_fingerprint: referralFingerprint,
                  });
                } catch { /* intentionally ignored */ } finally {
                  try {
                    localStorage.removeItem('referralCode');
                    localStorage.removeItem('referralSessionId');
                    localStorage.removeItem('referralFingerprint');
                    localStorage.removeItem('referralTimestamp');
                  } catch { /* intentionally ignored */ }
                }
              })();
            }
          } catch { /* intentionally ignored */ }
          localStorage.removeItem('oauthInProgress');
          navigate('/tools');
        } else if (!isHomePath) {
          navigate('/tools');
        }
      }
    };

    if (authManager) {
      unsubscribe = authManager.subscribe('HomePage', handleAuthChange);
    } else {
      const { data: listener } = supabase.auth.onAuthStateChange(handleAuthChange);
      unsubscribe = () => listener.subscription.unsubscribe();
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [navigate, location.pathname]);

  return { session };
}
