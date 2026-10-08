import { useEffect, useState } from 'react';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { isLocalTestMode } from '@/app/localTestRuntime';
import { isDeferredCloudDataAuthority } from '@/app/runtime/dataAuthority';
import { hasLocalModeUrlParams } from '@/shared/dev/devSession';
import { checkAstridDoctorAvailability } from '@/integrations/astrid/doctorAvailability.ts';

/**
 * - `first-run`: Astrid has never been set up in this browser. The whole flow (setup, brightness, text
 *   case) shows on every launch until it is finished.
 * - `reconnect`: it was set up before, but the local Runtime is not running, so only the "start your
 *   Runtime" step shows, and it closes once the Runtime is back.
 */
export type OnboardingMode = 'first-run' | 'reconnect';

export const ASTRID_SETUP_COMPLETE_KEY = 'astrid-setup-complete';

function readSetupComplete(): boolean {
  try {
    return window.localStorage.getItem(ASTRID_SETUP_COMPLETE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeSetupComplete(): void {
  try {
    window.localStorage.setItem(ASTRID_SETUP_COMPLETE_KEY, 'true');
  } catch {
    // Without storage the flow simply shows again next launch.
  }
}

/** Decides whether the onboarding shows, and in which mode; blocks the app until it is done. */
export function useOnboarding() {
  const [mode, setMode] = useState<OnboardingMode | null>(null);
  const localTestMode = isLocalTestMode();
  // A local editor link is always local, whatever the build's default authority.
  const isLocalEditorLink = hasLocalModeUrlParams(typeof window === 'undefined' ? '' : window.location.search);
  const skipOnboarding = localTestMode && !isLocalEditorLink;
  const isDeferredCloudMode = isDeferredCloudDataAuthority() && !isLocalEditorLink;

  useEffect(() => {
    if (skipOnboarding) return undefined;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const open = (next: OnboardingMode) => {
      timeoutId = setTimeout(() => { if (!cancelled) setMode(next); }, 500);
    };

    const decide = async () => {
      try {
        if (isDeferredCloudMode) {
          const { data: { user } } = await supabase().auth.getUser();
          if (!user) return;
          const { data: userData, error } = await supabase().from('users')
            .select('onboarding_completed')
            .eq('id', user.id)
            .single();
          if (error || !userData) return;
          if (!(userData as Record<string, unknown>).onboarding_completed) open('first-run');
          return;
        }
        // Astrid (local) mode: the app needs a running local Runtime.
        if (!readSetupComplete()) {
          open('first-run');
          return;
        }
        const availability = await checkAstridDoctorAvailability();
        if (!cancelled && availability.status === 'unavailable') open('reconnect');
      } catch (error) {
        normalizeAndPresentError(error, { context: 'useOnboarding', showToast: false });
      }
    };
    void decide();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isDeferredCloudMode, skipOnboarding]);

  const completeOnboarding = async () => {
    if (skipOnboarding) return;
    writeSetupComplete();
    if (!isDeferredCloudMode) return;
    try {
      const { data: { user } } = await supabase().auth.getUser();
      if (!user) return;
      await supabase().from('users')
        .update({ onboarding_completed: true })
        .eq('id', user.id);
    } catch (error) {
      normalizeAndPresentError(error, { context: 'useOnboarding', showToast: false });
    }
  };

  return {
    showOnboardingModal: mode !== null,
    onboardingMode: mode ?? 'first-run',
    closeOnboardingModal: () => {
      const wasFirstRun = mode === 'first-run';
      setMode(null);
      if (wasFirstRun) void completeOnboarding();
    },
  };
}
