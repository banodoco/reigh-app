/**
 * useOutputSelection - Manages selected output state with persistence
 *
 * Handles the shared output selection between FinalVideoSection and SegmentOutputStrip.
 * Persists selection to shot settings so it survives page refreshes and shot switching.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { SETTINGS_IDS } from '@/shared/lib/settingsIds';

interface UseOutputSelectionProps {
  projectId?: string;
  shotId?: string;
}

interface UseOutputSelectionReturn {
  selectedOutputId: string | null;
  setSelectedOutputId: (id: string | null) => void;
  isLoading: boolean;
  isReady: boolean;
}

export function useOutputSelection({
  projectId,
  shotId,
}: UseOutputSelectionProps): UseOutputSelectionReturn {
  // Persistence settings
  const {
    settings: outputSelectionSettings,
    update: updateOutputSelectionSettings,
    isLoading: isOutputSelectionLoading
  } = useToolSettings<{
    selectedParentGenerationId?: string | null;
  }>(SETTINGS_IDS.TRAVEL_SELECTED_OUTPUT, {
    projectId,
    shotId,
    enabled: !!shotId
  });

  // Internal state for immediate UI updates
  const [selectedOutputId, setSelectedOutputIdState] = useState<string | null>(null);
  const hasInitializedRef = useRef<string | null>(null);
  // Track if we're currently persisting to avoid re-loading our own writes
  const isPersistingRef = useRef(false);

  // Load persisted selection when shot loads (one-time init per shot)
  useEffect(() => {
    // Skip if still loading, no shot, or we're persisting
    if (isOutputSelectionLoading || !shotId || isPersistingRef.current) return;
    if (hasInitializedRef.current === shotId) return;

    const persistedId = outputSelectionSettings?.selectedParentGenerationId ?? null;
    setSelectedOutputIdState(persistedId);
    hasInitializedRef.current = shotId;
  }, [isOutputSelectionLoading, outputSelectionSettings, shotId]);

  // Reset initialization flag when shot changes
  useEffect(() => {
    if (shotId !== hasInitializedRef.current) {
      hasInitializedRef.current = null;
    }
  }, [shotId]);

  // Setter that updates both state and persists to DB
  const setSelectedOutputId = useCallback((id: string | null) => {
    setSelectedOutputIdState(id);
    // Mark that we're persisting to avoid re-loading our own write
    isPersistingRef.current = true;
    updateOutputSelectionSettings('shot', { selectedParentGenerationId: id });
    // Clear the flag after a short delay
    setTimeout(() => { isPersistingRef.current = false; }, 100);
  }, [updateOutputSelectionSettings]);

  // Track if selection is ready (initialized for current shot)
  const isReady = hasInitializedRef.current === shotId;

  return {
    selectedOutputId,
    setSelectedOutputId,
    isLoading: isOutputSelectionLoading,
    isReady,
  };
}
