/**
 * useModeReadiness - Manages mode readiness state and transitions
 *
 * Handles the complex logic for determining when the editor is ready to display,
 * including settings loading timeouts, mobile mode overrides, and error recovery.
 */

import { useEffect, useRef, useMemo } from 'react';
import { ShotEditorActions } from '../state';
import { Shot, GenerationRow } from '@/types/shots';

interface UseModeReadinessProps {
  selectedShot: Shot | undefined;
  contextImages: GenerationRow[];
  settingsLoading: boolean;
  isShotUISettingsLoading: boolean;
  isShotLoraSettingsLoading: boolean;
  isPhone: boolean;
  isMobile: boolean;
  generationMode: 'batch' | 'timeline';
  state: {
    settingsError: string | null;
    isModeReady: boolean;
  };
  actions: ShotEditorActions;
  onGenerationModeChange?: (mode: 'batch' | 'timeline') => void;
}

export function useModeReadiness({
  selectedShot,
  contextImages,
  settingsLoading,
  isShotUISettingsLoading,
  isShotLoraSettingsLoading,
  isPhone,
  isMobile,
  generationMode,
  state,
  actions,
  onGenerationModeChange,
}: UseModeReadinessProps): void {
  // Track previous shot ID for change detection
  const prevShotIdRef = useRef<string | undefined>(undefined);

  // Track if we've applied the mobile mode override
  const mobileOverrideAppliedRef = useRef(false);

  // Reset mobile override flag when shot changes
  useEffect(() => {
    mobileOverrideAppliedRef.current = false;
  }, [selectedShot?.id]);

  // Enhanced settings loading timeout with mobile-specific recovery
  useEffect(() => {
    const anySettingsLoading = settingsLoading || isShotUISettingsLoading || isShotLoraSettingsLoading;

    if (!anySettingsLoading) {
      // Reset any existing error once all settings loading completes successfully
      actions.setSettingsError(null);
      return;
    }

    // Conservative timeouts to handle poor network conditions gracefully
    const timeoutMs = isMobile ? 8000 : 6000;

    const fallbackTimer = setTimeout(() => {

      // Force recovery - prevents endless loading states
      actions.setSettingsError(null);
      actions.setModeReady(true);

      // Mobile-specific: dispatch event to notify other components
      if (isMobile) {
        window.dispatchEvent(new CustomEvent('shotEditorRecovery', {
          detail: { shotId: selectedShot?.id, reason: 'settings_timeout' }
        }));
      }
    }, timeoutMs);

    return () => clearTimeout(fallbackTimer);
  }, [settingsLoading, isShotUISettingsLoading, isShotLoraSettingsLoading, actions, isMobile, selectedShot?.id]);

  // Reset mode readiness when shot changes
  // Only reset if we don't have context images yet
  useEffect(() => {
    const shotId = selectedShot?.id;
    const shotIdChanged = shotId !== prevShotIdRef.current;

    if (shotId && shotIdChanged) {
      prevShotIdRef.current = shotId;
      const hasContextImages = contextImages.length > 0;
      if (hasContextImages) {
        // We have images - stay ready, let settings update in background
        actions.setModeReady(true);
      } else {
        // No images yet - reset to loading state
        actions.setModeReady(false);
      }
    }
    // Note: We intentionally DON'T include contextImages.length in deps
    // to prevent mode flipping when cache updates temporarily clear images
  }, [selectedShot?.id, actions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute readiness state
  const readinessState = useMemo(() => ({
    hasImageData: contextImages.length > 0,
    criticalSettingsReady: !settingsLoading,
    modeCorrect: !isPhone || generationMode === 'batch',
    hasError: !!state.settingsError,
    shotId: selectedShot?.id,
    isReady: state.isModeReady
  }), [contextImages.length, settingsLoading, isPhone, generationMode, state.settingsError, selectedShot?.id, state.isModeReady]);

  // Handle mode setup and readiness transitions
  useEffect(() => {
    const { hasImageData, criticalSettingsReady, modeCorrect, hasError, isReady } = readinessState;

    // Skip if already ready
    if (isReady) return;

    // Handle mobile mode correction - LOCAL OVERRIDE ONLY, don't save to database
    if (!modeCorrect && !mobileOverrideAppliedRef.current) {
      mobileOverrideAppliedRef.current = true;
      actions.setModeReady(true);
      return;
    }

    // Handle error recovery
    if (hasError) {
      actions.setModeReady(true);
      return;
    }

    // PERFORMANCE BOOST: Allow ready state if we have images + critical settings
    if (hasImageData && criticalSettingsReady) {
      actions.setModeReady(true);
      return;
    }

    // For shots without images, wait for all settings
    if (!hasImageData && !settingsLoading && !isShotUISettingsLoading && !isShotLoraSettingsLoading) {
      actions.setModeReady(true);
    }
  }, [readinessState, actions, selectedShot?.id, contextImages.length, isShotUISettingsLoading, isShotLoraSettingsLoading, settingsLoading]);
}
