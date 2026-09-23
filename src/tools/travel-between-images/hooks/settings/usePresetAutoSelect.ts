import { useEffect, useRef } from 'react';
import type { PresetMetadata } from '@/shared/types/presetMetadata';
import type { PhaseConfig } from '../../settings';

interface UsePresetAutoSelectParams {
  /** The built-in default preset for the current mode */
  builtinDefaultPreset: {
    id: string;
    metadata: { name: string; description: string; phaseConfig: PhaseConfig };
  };
  /** Currently selected preset ID */
  selectedPhasePresetId?: string | null;
  /** Handler to select a preset */
  onPhasePresetSelect: (presetId: string, config: PhaseConfig, presetMetadata?: PresetMetadata) => void;
  /** Whether settings are still loading */
  settingsLoading?: boolean;
  /** Current motion mode (basic or advanced) */
  motionMode: 'basic' | 'advanced';
  /** Disable implicit selection when selection itself would mutate canonical data. */
  enabled?: boolean;
}

/**
 * Auto-selects the current built-in default preset only on initial mount or
 * after shot navigation when a basic-mode shot has no preset selected yet.
 */
export function usePresetAutoSelect({
  builtinDefaultPreset,
  selectedPhasePresetId,
  onPhasePresetSelect,
  settingsLoading,
  motionMode,
  enabled = true,
}: UsePresetAutoSelectParams) {
  // Track if we've done initial auto-select
  const hasAutoSelectedRef = useRef(false);

  // Reset hasAutoSelectedRef when settings start loading (new shot navigation)
  // This ensures auto-select can run for each shot, not just the first one visited
  useEffect(() => {
    if (settingsLoading) {
      hasAutoSelectedRef.current = false;
    }
  }, [settingsLoading]);

  // Auto-select the built-in default preset when we first land on a basic-mode shot
  // that does not already have a preset association.
  useEffect(() => {
    // Skip if settings are still loading
    if (settingsLoading) {
      return;
    }

    // CRITICAL FIX: Skip auto-select when user is in advanced mode
    // In advanced mode, user has explicitly chosen to configure phaseConfig manually
    // Auto-selecting a preset would overwrite their custom configuration
    if (motionMode === 'advanced') {
      return;
    }

    // Canonical shot settings treat selecting a preset as an explicit edit.
    if (!enabled) {
      return;
    }

    // Initial auto-select: only if no preset selected and we haven't auto-selected yet
    if (!selectedPhasePresetId && !hasAutoSelectedRef.current) {
      hasAutoSelectedRef.current = true;
      onPhasePresetSelect(
        builtinDefaultPreset.id,
        builtinDefaultPreset.metadata.phaseConfig,
        builtinDefaultPreset.metadata
      );
    }
  }, [
    builtinDefaultPreset,
    selectedPhasePresetId,
    onPhasePresetSelect,
    settingsLoading,
    motionMode,
    enabled,
  ]);
}
