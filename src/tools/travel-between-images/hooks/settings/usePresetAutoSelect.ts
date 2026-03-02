import { useEffect, useRef } from 'react';
import type { PhaseConfig } from '../../settings';
import type { PresetMetadata } from '@/shared/types/presetMetadata';

interface UsePresetAutoSelectParams {
  /** Current generation type mode (I2V vs VACE) */
  generationTypeMode: 'i2v' | 'vace';
  /** Whether a structure video is currently set */
  hasStructureVideo: boolean;
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
  /** Current phase config */
  phaseConfig?: PhaseConfig;
}

/**
 * Auto-selects the appropriate built-in default preset when:
 * 1. Initial mount with no preset selected AND user is in basic mode
 * 2. Generation type mode changes (I2V vs VACE) - only in basic mode
 *
 * Tracks generationTypeMode instead of hasStructureVideo because
 * Uni3C has structure video but uses I2V.
 */
export function usePresetAutoSelect({
  generationTypeMode,
  hasStructureVideo,
  builtinDefaultPreset,
  selectedPhasePresetId,
  onPhasePresetSelect,
  settingsLoading,
  motionMode,
  phaseConfig,
}: UsePresetAutoSelectParams) {
  // Track previous state for auto-switching presets
  const prevHasStructureVideoRef = useRef<boolean | undefined>(undefined);
  const prevGenerationTypeModeRef = useRef<'i2v' | 'vace' | undefined>(undefined);

  // Track if we've done initial auto-select
  const hasAutoSelectedRef = useRef(false);

  // Reset hasAutoSelectedRef when settings start loading (new shot navigation)
  // This ensures auto-select can run for each shot, not just the first one visited
  useEffect(() => {
    if (settingsLoading) {
      hasAutoSelectedRef.current = false;
    }
  }, [settingsLoading]);

  // Auto-select the built-in default preset when:
  // 1. Initial mount with no preset selected AND user is in basic mode
  // 2. Generation type mode changes (I2V vs VACE) - only in basic mode
  // Note: We track generationTypeMode instead of hasStructureVideo because Uni3C has structure video but uses I2V
  useEffect(() => {
    // Skip if settings are still loading
    if (settingsLoading) {
      return;
    }

    // CRITICAL FIX: Skip auto-select when user is in advanced mode
    // In advanced mode, user has explicitly chosen to configure phaseConfig manually
    // Auto-selecting a preset would overwrite their custom configuration
    if (motionMode === 'advanced') {
      prevHasStructureVideoRef.current = hasStructureVideo;
      prevGenerationTypeModeRef.current = generationTypeMode;
      return;
    }

    // Also skip if phaseConfig already exists with valid data
    // This prevents overwriting user's config when remounting
    if (phaseConfig && phaseConfig.phases && phaseConfig.phases.length > 0) {
      // Only auto-select if no preset is selected (user may have deselected preset but kept config)
      // But still allow generation type mode change to trigger preset switch
      const modeChanged =
        prevGenerationTypeModeRef.current !== undefined &&
        prevGenerationTypeModeRef.current !== generationTypeMode;

      if (!modeChanged) {
        prevHasStructureVideoRef.current = hasStructureVideo;
        prevGenerationTypeModeRef.current = generationTypeMode;
        return;
      }
    }

    const modeChanged =
      prevGenerationTypeModeRef.current !== undefined &&
      prevGenerationTypeModeRef.current !== generationTypeMode;

    // When generation type mode changes, select appropriate default (only in basic mode)
    // This handles switching between I2V and VACE (including Uni3C which uses I2V with structure video)
    if (modeChanged) {
      onPhasePresetSelect(
        builtinDefaultPreset.id,
        builtinDefaultPreset.metadata.phaseConfig,
        builtinDefaultPreset.metadata
      );
      prevHasStructureVideoRef.current = hasStructureVideo;
      prevGenerationTypeModeRef.current = generationTypeMode;
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

    prevHasStructureVideoRef.current = hasStructureVideo;
    prevGenerationTypeModeRef.current = generationTypeMode;
  }, [
    generationTypeMode,
    hasStructureVideo,
    builtinDefaultPreset,
    selectedPhasePresetId,
    onPhasePresetSelect,
    settingsLoading,
    motionMode,
    phaseConfig,
  ]);
}
