import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { handleError } from '@/shared/lib/errorHandler';

/**
 * Hook to check if user has completed onboarding and show modal if not
 */
export function useOnboarding() {
  const [showModal, setShowModal] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const checkOnboardingStatus = async () => {
      if (isChecking) {
        return;
      }

      setIsChecking(true);

      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          return;
        }

        // Check if user has completed onboarding
        const { data: userData, error } = await supabase
          .from('users')
          .select('onboarding_completed')
          .eq('id', user.id)
          .single();

        if (error) {
          console.log('[Onboarding] Query error:', error);
          return;
        }

        if (!userData) {
          return;
        }

        const onboardingCompleted = (userData as any).onboarding_completed;

        // If user hasn't completed onboarding, show the modal
        if (!onboardingCompleted) {
          timeoutId = setTimeout(() => {
            setShowModal(true);
          }, 500);
        }

      } catch (error) {
        handleError(error, { context: 'useOnboarding', showToast: false });
      } finally {
        setIsChecking(false);
      }
    };

    checkOnboardingStatus();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const completeOnboarding = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('users')
        .update({ onboarding_completed: true })
        .eq('id', user.id);
    } catch (error) {
      handleError(error, { context: 'useOnboarding', showToast: false });
    }
  };

  return {
    showOnboardingModal: showModal,
    closeOnboardingModal: () => {
      setShowModal(false);
      completeOnboarding();
    },
  };
}
