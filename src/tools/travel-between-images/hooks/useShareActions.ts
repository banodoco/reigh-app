/**
 * useShareActions — auth + copy-to-account logic for SharedGenerationView.
 *
 * Handles:
 * - Checking authentication status (and subscribing to auth state changes)
 * - "Copy to account" flow (redirects to sign-in if needed, opens project selector)
 * - Pending share resume after sign-in
 * - Project selection → RPC copy → navigation
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

interface UseShareActionsReturn {
  isAuthenticated: boolean;
  isCopying: boolean;
  copied: boolean;
  showProjectSelector: boolean;
  setShowProjectSelector: (open: boolean) => void;
  handleCopyToAccount: () => void;
  handleProjectSelected: (projectId: string) => Promise<void>;
}

export function useShareActions(shareSlug: string): UseShareActionsReturn {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showProjectSelector, setShowProjectSelector] = useState(false);

  const checkAuth = useCallback(async () => {
    const { data: { session } } = await supabase().auth.getSession();
    setIsAuthenticated(!!session);
  }, []);

  const handleCopyToAccount = useCallback(() => {
    if (!isAuthenticated) {
      sessionStorage.setItem('pending_share', shareSlug);
      toast({
        title: "Sign in required",
        description: "Please sign in to copy this to your account"
      });
      navigate('/?action=copy-share');
      return;
    }
    setShowProjectSelector(true);
  }, [isAuthenticated, shareSlug, navigate]);

  const checkPendingShare = useCallback(() => {
    const pendingShare = sessionStorage.getItem('pending_share');
    if (pendingShare) {
      sessionStorage.removeItem('pending_share');
      handleCopyToAccount();
    }
  }, [handleCopyToAccount]);

  // Check authentication status and subscribe to auth changes
  useEffect(() => {
    checkAuth();

    const { data: { subscription } } = supabase().auth.onAuthStateChange((event, session) => {
      setIsAuthenticated(!!session);
      if (event === 'SIGNED_IN') {
        checkPendingShare();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [checkAuth, checkPendingShare]);

  const handleProjectSelected = useCallback(async (projectId: string) => {
    setShowProjectSelector(false);
    setIsCopying(true);

    try {
      const { error: copyError } = await supabase().rpc('copy_shot_from_share', {
        share_slug_param: shareSlug,
        target_project_id: projectId,
      });

      if (copyError) {
        normalizeAndPresentError(copyError, {
          context: 'useShareActions',
          toastTitle: 'Copy failed',
        });
        setIsCopying(false);
        return;
      }

      setCopied(true);
      toast({
        title: "Copied to your account!",
        description: "The shot has been added to your project"
      });

      setTimeout(() => {
        navigate('/tools/travel-between-images');
      }, 1500);

    } catch (error) {
      normalizeAndPresentError(error, {
        context: 'useShareActions',
        toastTitle: 'Something went wrong',
      });
      setIsCopying(false);
    }
  }, [shareSlug, navigate]);

  return {
    isAuthenticated,
    isCopying,
    copied,
    showProjectSelector,
    setShowProjectSelector,
    handleCopyToAccount,
    handleProjectSelected,
  };
}
