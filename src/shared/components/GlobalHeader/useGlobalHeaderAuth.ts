import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import type { ReferralStats, GlobalHeaderAuthState } from './types';

/** Fetch username for a given user ID */
async function fetchUsername(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('users')
    .select('username')
    .eq('id', userId)
    .single();

  if (data?.username && !error) {
    return data.username;
  }
  return null;
}

/**
 * Consolidated auth state management for GlobalHeader.
 * Handles session tracking, username fetch, and referral stats.
 */
export function useGlobalHeaderAuth(): GlobalHeaderAuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);

  // Track session + username
  useEffect(() => {
    const getSessionAndUserData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);

      if (session?.user?.id) {
        const name = await fetchUsername(session.user.id);
        if (name) setUsername(name);
      }
    };

    getSessionAndUserData();

    // Use centralized auth manager instead of direct listener
    const authManager = window.__AUTH_MANAGER__;
    let unsubscribe: (() => void) | null = null;

    const handleAuthChange = async (_event: string, newSession: Session | null) => {
      setSession(newSession);

      if (!newSession?.user?.id) {
        setUsername(null);
        setReferralStats(null);
      } else {
        const name = await fetchUsername(newSession.user.id);
        if (name) setUsername(name);
      }
    };

    if (authManager) {
      unsubscribe = authManager.subscribe('GlobalHeader', handleAuthChange);
    } else {
      // Fallback to direct listener if auth manager not available
      const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthChange);
      unsubscribe = () => subscription?.unsubscribe();
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Get referral stats when username is available
  useEffect(() => {
    const getReferralStats = async () => {
      if (!username) {
        setReferralStats(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('referral_stats')
          .select('total_visits, successful_referrals')
          .eq('username', username)
          .single();

        if (data && !error) {
          setReferralStats({
            total_visits: data.total_visits ?? 0,
            successful_referrals: data.successful_referrals ?? 0,
          });
        } else {
          // No stats yet, show zeros
          setReferralStats({ total_visits: 0, successful_referrals: 0 });
        }
      } catch {
        setReferralStats({ total_visits: 0, successful_referrals: 0 });
      }
    };

    getReferralStats();
  }, [username]);

  return { session, username, referralStats };
}
