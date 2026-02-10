/**
 * Settings Handlers Hook for VideoTravelToolPage
 * 
 * Extracted from VideoTravelToolPage.tsx to reduce component size and improve maintainability.
 * Contains all callbacks that update shot settings via shotSettingsRef.
 * 
 * Dependencies:
 * - shotSettingsRef: Ref to the shot settings object (from useShotSettings)
 * - currentShotId: Current shot ID for guards
 * - selectedShot: Currently selected shot (for generation mode cache updates)
 * - updateShotMode: Function to optimistically update generation mode cache
 * 
 * @see VideoTravelToolPage.tsx - Main page component that uses this hook
 * @see useShotSettings.ts - Settings management hook
 */

import { useCallback, useRef, MutableRefObject } from 'react';
import { Shot } from '@/types/shots';
import { VideoTravelSettings, PhaseConfig, DEFAULT_PHASE_CONFIG, DEFAULT_VACE_PHASE_CONFIG } from '../settings';
import { BUILTIN_DEFAULT_I2V_ID, BUILTIN_DEFAULT_VACE_ID } from '../components/MotionControl';
import { SteerableMotionSettings, DEFAULT_STEERABLE_MOTION_SETTINGS } from '../components/ShotEditor/state/types';
import { buildBasicModePhaseConfig } from '../components/ShotEditor/services/generateVideoService';
import { UseShotSettingsReturn } from './useShotSettings';
import type { PresetMetadata } from '@/shared/types/presetMetadata';
import type { ActiveLora } from '@/shared/components/ActiveLoRAsDisplay';

interface UseVideoTravelSettingsHandlersParams {
  /** Ref to the shot settings - used to access current settings without triggering re-renders */
  shotSettingsRef: MutableRefObject<UseShotSettingsReturn>;
  /** Current shot ID - used for guards in mode change handlers */
  currentShotId: string | null;
  /** Currently selected shot - used for generation mode cache updates */
  selectedShot: Shot | null;
  /** Function to optimistically update the generation mode cache */
  updateShotMode: (shotId: string, mode: 'batch' | 'timeline') => void;
}

export interface VideoTravelSettingsHandlers {
  // Video control mode
  handleVideoControlModeChange: (mode: 'individual' | 'batch') => void;

  // Pair configs
  handlePairConfigChange: (pairId: string, field: 'prompt' | 'frames' | 'context', value: string | number) => void;

  // Batch video settings
  handleBatchVideoPromptChange: (prompt: string) => void;
  handleNegativePromptChange: (prompt: string) => void;
  handleBatchVideoFramesChange: (frames: number) => void;
  handleBatchVideoStepsChange: (steps: number) => void;

  // Text prompts
  handleTextBeforePromptsChange: (text: string) => void;
  handleTextAfterPromptsChange: (text: string) => void;
  
  // Save triggers
  handleBlurSave: () => void;
  
  // Generation settings
  handleEnhancePromptChange: (enhance: boolean) => void;
  handleTurboModeChange: (turbo: boolean) => void;
  handleSmoothContinuationsChange: (smooth: boolean) => void;
  
  // Motion settings
  handleAmountOfMotionChange: (motion: number) => void;
  handleMotionModeChange: (mode: 'basic' | 'advanced') => void;
  handleGenerationTypeModeChange: (mode: 'i2v' | 'vace') => void;
  handleSteerableMotionSettingsChange: (settings: Partial<SteerableMotionSettings>) => void;
  
  // Phase config
  handlePhaseConfigChange: (config: PhaseConfig) => void;
  handlePhasePresetSelect: (presetId: string, config: PhaseConfig, presetMetadata?: PresetMetadata) => void;
  handlePhasePresetRemove: () => void;
  handleRestoreDefaults: () => void;
  
  // Generation mode (batch vs timeline)
  handleGenerationModeChange: (mode: 'batch' | 'timeline') => void;
  
  // LoRAs
  handleSelectedLorasChange: (loras: ActiveLora[]) => void;
  
  // No-op callback for disabled handlers
  noOpCallback: () => void;
}

/**
 * Hook that provides all settings handler callbacks for VideoTravelToolPage.
 * 
 * All handlers use refs to access current values without triggering callback recreation.
 * This is critical for performance - preventing infinite re-render loops.
 */
export const useVideoTravelSettingsHandlers = ({
  shotSettingsRef,
  currentShotId,
  selectedShot,
  updateShotMode,
}: UseVideoTravelSettingsHandlersParams): VideoTravelSettingsHandlers => {
  
  // Use refs to avoid recreating callbacks when these values change
  const selectedShotRef = useRef(selectedShot);
  selectedShotRef.current = selectedShot;
  const updateShotModeRef = useRef(updateShotMode);
  updateShotModeRef.current = updateShotMode;
  
  // =============================================================================
  // NO-OP CALLBACK
  // =============================================================================
  const noOpCallback = useCallback(() => {}, []);
  
  // =============================================================================
  // VIDEO CONTROL MODE
  // =============================================================================
  const handleVideoControlModeChange = useCallback((mode: 'individual' | 'batch') => {
    shotSettingsRef.current.updateField('videoControlMode', mode);
  }, [shotSettingsRef]);

  // =============================================================================
  // PAIR CONFIGS
  // =============================================================================
  const handlePairConfigChange = useCallback((pairId: string, field: 'prompt' | 'frames' | 'context', value: string | number) => {
    const currentPairConfigs = shotSettingsRef.current.settings?.pairConfigs || [];
    const updated = currentPairConfigs.map(p => p.id === pairId ? { ...p, [field]: value } : p);
    shotSettingsRef.current.updateField('pairConfigs', updated);
  }, [shotSettingsRef]);

  // =============================================================================
  // BATCH VIDEO SETTINGS
  // =============================================================================
  const handleBatchVideoPromptChange = useCallback((prompt: string) => {
    shotSettingsRef.current.updateField('prompt', prompt);
  }, [shotSettingsRef]);

  const handleNegativePromptChange = useCallback((prompt: string) => {
    shotSettingsRef.current.updateField('negativePrompt', prompt);
  }, [shotSettingsRef]);

  const handleBatchVideoFramesChange = useCallback((frames: number) => {
    shotSettingsRef.current.updateField('batchVideoFrames', frames);
  }, [shotSettingsRef]);

  const handleBatchVideoStepsChange = useCallback((steps: number) => {
    shotSettingsRef.current.updateField('batchVideoSteps', steps);
  }, [shotSettingsRef]);

  // =============================================================================
  // TEXT PROMPTS
  // =============================================================================
  const handleTextBeforePromptsChange = useCallback((text: string) => {
    shotSettingsRef.current.updateField('textBeforePrompts', text);
  }, [shotSettingsRef]);
  
  const handleTextAfterPromptsChange = useCallback((text: string) => {
    shotSettingsRef.current.updateField('textAfterPrompts', text);
  }, [shotSettingsRef]);
  
  // =============================================================================
  // SAVE TRIGGERS
  // =============================================================================
  const handleBlurSave = useCallback(() => {
    shotSettingsRef.current.saveImmediate();
  }, [shotSettingsRef]);

  // =============================================================================
  // GENERATION SETTINGS
  // =============================================================================
  const handleEnhancePromptChange = useCallback((enhance: boolean) => {
    shotSettingsRef.current.updateField('enhancePrompt', enhance);
  }, [shotSettingsRef]);

  const handleTurboModeChange = useCallback((turbo: boolean) => {
    // When enabling turbo mode, automatically disable advanced mode but keep preset
    if (turbo && shotSettingsRef.current.settings?.advancedMode) {
      shotSettingsRef.current.updateFields({
        turboMode: turbo,
        advancedMode: false,
        motionMode: 'basic'
      });
    } else {
      shotSettingsRef.current.updateField('turboMode', turbo);
    }
  }, [shotSettingsRef]);

  const handleSmoothContinuationsChange = useCallback((smooth: boolean) => {
    shotSettingsRef.current.updateField('smoothContinuations', smooth);

    // When enabling smooth continuations, clamp batchVideoFrames to 77 if it exceeds the new limit
    if (smooth) {
      const currentFrames = shotSettingsRef.current.settings?.batchVideoFrames;
      if (currentFrames && currentFrames > 77) {
        shotSettingsRef.current.updateField('batchVideoFrames', 77);
      }
    }
  }, [shotSettingsRef]);

  // =============================================================================
  // PHASE CONFIG SYNC
  // Keep the phase config in sync based on basic mode settings.
  // Used by multiple handlers to ensure Advanced mode shows correct defaults:
  // - I2V vs VACE mode (2 vs 3 phases, different models)
  // - Amount of motion (motion LoRA strength)
  // - User-selected LoRAs (added to all phases)
  //
  // By default, only rebuilds when in Basic mode (to preserve Advanced customizations).
  // Pass force: true to always rebuild (for I2V/VACE toggle and Restore Defaults).
  // =============================================================================
  const rebuildPhaseConfig = useCallback((options?: {
    generationTypeMode?: 'i2v' | 'vace';
    amountOfMotion?: number;
    selectedLoras?: Array<{ path: string; strength: number }>;
    force?: boolean;  // Set true to always rebuild (I2V/VACE toggle, Restore Defaults)
  }) => {
    const currentSettings = shotSettingsRef.current.settings;
    
    // Only rebuild when in Basic mode, unless force is true
    const isBasicMode = currentSettings?.motionMode === 'basic' || !currentSettings?.motionMode;
    if (!isBasicMode && !options?.force) return;

    const motion = options?.amountOfMotion ?? currentSettings?.amountOfMotion ?? 50;
    const loras = options?.selectedLoras ?? (currentSettings?.loras || []).map(l => ({
      path: l.path,
      strength: l.strength
    }));
    
    const basicConfig = buildBasicModePhaseConfig(motion, loras);
    shotSettingsRef.current.updateField('phaseConfig', basicConfig.phaseConfig);
  }, [shotSettingsRef]);

  // =============================================================================
  // MOTION SETTINGS
  // =============================================================================
  const handleAmountOfMotionChange = useCallback((motion: number) => {
    shotSettingsRef.current.updateField('amountOfMotion', motion);
    rebuildPhaseConfig({ amountOfMotion: motion });
  }, [shotSettingsRef, rebuildPhaseConfig]);

  const handleMotionModeChange = useCallback((mode: 'basic' | 'advanced') => {
    // CRITICAL: Guard against calls when no shot is selected
    // This can happen during component unmount/remount cycles when Tabs triggers onValueChange
    // Use currentShotId (same source as useShotSettings) not selectedShot which can be out of sync
    if (!currentShotId) {
      return;
    }
    
    // Prevent switching to advanced mode when turbo mode is on
    if (mode === 'advanced' && shotSettingsRef.current.settings?.turboMode) {
      return;
    }
    
    // When switching to advanced mode, initialize phaseConfig from basic mode settings
    if (mode === 'advanced') {
      const currentPhaseConfig = shotSettingsRef.current.settings?.phaseConfig;
      if (!currentPhaseConfig) {
        // Build phase config from current basic mode settings (always I2V now)
        const currentSettings = shotSettingsRef.current.settings;
        const currentMotion = currentSettings?.amountOfMotion ?? 50;
        const currentLoras = (currentSettings?.loras || []).map(l => ({
          path: l.path,
          strength: l.strength
        }));

        const basicConfig = buildBasicModePhaseConfig(currentMotion, currentLoras);

        shotSettingsRef.current.updateFields({
          motionMode: mode,
          advancedMode: true,
          phaseConfig: basicConfig.phaseConfig
        });
      } else {
        shotSettingsRef.current.updateFields({
          motionMode: mode,
          advancedMode: true
        });
      }
    } else {
      // Basic mode - disable advanced mode and reset to defaults
      // Always reset to default config when switching from Advanced to Basic
      const currentSettings = shotSettingsRef.current.settings;
      const isVaceMode = currentSettings?.generationTypeMode === 'vace';
      const defaultPresetId = isVaceMode ? BUILTIN_DEFAULT_VACE_ID : BUILTIN_DEFAULT_I2V_ID;
      const defaultConfig = isVaceMode ? DEFAULT_VACE_PHASE_CONFIG : DEFAULT_PHASE_CONFIG;

      shotSettingsRef.current.updateFields({
        motionMode: mode,
        advancedMode: false,
        selectedPhasePresetId: defaultPresetId,
        phaseConfig: defaultConfig
      });
    }
  }, [currentShotId, shotSettingsRef]);

  const handleGenerationTypeModeChange = useCallback((mode: 'i2v' | 'vace') => {
    
    // Update generation type mode AND the preset ID to match
    // This keeps things consistent (preset ID should match the mode's default)
    const currentSettings = shotSettingsRef.current.settings;
    const isBasicMode = currentSettings?.motionMode === 'basic' || !currentSettings?.motionMode;
    
    if (isBasicMode) {
      // In basic mode: update mode, preset ID, and rebuild phase config
      const defaultPresetId = mode === 'vace' ? BUILTIN_DEFAULT_VACE_ID : BUILTIN_DEFAULT_I2V_ID;
      shotSettingsRef.current.updateFields({
        generationTypeMode: mode,
        selectedPhasePresetId: defaultPresetId
      });
    } else {
      // In advanced mode: just update the mode (user has custom config)
      shotSettingsRef.current.updateField('generationTypeMode', mode);
    }
    
    // Always rebuild phase config when mode changes (force: true bypasses Basic mode check)
    // because I2V vs VACE fundamentally changes the phase structure (2 vs 3 phases)
    rebuildPhaseConfig({ generationTypeMode: mode, force: true });
  }, [shotSettingsRef, rebuildPhaseConfig]);

  const handleSteerableMotionSettingsChange = useCallback((settings: Partial<SteerableMotionSettings>) => {
    // FIX: Use ref to get current value and avoid callback recreation
    // Ensure required fields are always present by seeding with defaults
    const currentSettings: SteerableMotionSettings = {
      ...DEFAULT_STEERABLE_MOTION_SETTINGS,
      ...(shotSettingsRef.current.settings?.steerableMotionSettings ?? {}),
    };
    shotSettingsRef.current.updateFields({
      steerableMotionSettings: {
        ...currentSettings,
        ...settings
      }
    });
  }, [shotSettingsRef]);

  // =============================================================================
  // PHASE CONFIG
  // =============================================================================
  const handlePhaseConfigChange = useCallback((config: PhaseConfig) => {
    // Auto-set model_switch_phase to 1 when num_phases is 2
    const adjustedConfig = config.num_phases === 2 
      ? { ...config, model_switch_phase: 1 }
      : config;
    
    // Clear preset reference when user manually edits config - the config no longer matches the preset
    shotSettingsRef.current.updateFields({
      phaseConfig: adjustedConfig,
      selectedPhasePresetId: null
    });
  }, [shotSettingsRef]);

  const handlePhasePresetSelect = useCallback((presetId: string, config: PhaseConfig, presetMetadata?: PresetMetadata) => {
    
    // DEEP CLONE: Create completely new config to prevent shared references
    // This ensures modifying LoRA strengths in one phase doesn't affect other phases
    const deepClonedConfig: PhaseConfig = {
      ...config,
      steps_per_phase: [...config.steps_per_phase],
      phases: config.phases.map(phase => ({
        ...phase,
        loras: phase.loras.map(lora => ({ ...lora })) // Deep clone each LoRA
      }))
    };
    
    // Update preset ID, phase config, and generation type mode (if preset specifies one)
    const updates: Partial<VideoTravelSettings> = {
      selectedPhasePresetId: presetId,
      phaseConfig: deepClonedConfig
    };
    
    // Also apply the preset's generation type mode if it has one
    if (presetMetadata?.generationTypeMode) {
      updates.generationTypeMode = presetMetadata.generationTypeMode;
    }
    
    shotSettingsRef.current.updateFields(updates);
  }, [shotSettingsRef]);

  const handlePhasePresetRemove = useCallback(() => {
    
    // Clear preset ID but keep the current config
    shotSettingsRef.current.updateField('selectedPhasePresetId', null);
  }, [shotSettingsRef]);

  // Handler for restoring defaults in Advanced mode - respects current I2V/VACE mode
  const handleRestoreDefaults = useCallback(() => {
    const currentSettings = shotSettingsRef.current.settings;
    const isVaceMode = currentSettings?.generationTypeMode === 'vace';
    const defaultPresetId = isVaceMode ? BUILTIN_DEFAULT_VACE_ID : BUILTIN_DEFAULT_I2V_ID;
    
    // Update preset ID to match the restored config
    shotSettingsRef.current.updateField('selectedPhasePresetId', defaultPresetId);
    
    // Force rebuild regardless of current mode (user explicitly clicked "Restore Defaults")
    rebuildPhaseConfig({ force: true });
  }, [shotSettingsRef, rebuildPhaseConfig]);

  // =============================================================================
  // GENERATION MODE (batch vs timeline)
  // =============================================================================
  const handleGenerationModeChange = useCallback((mode: 'batch' | 'timeline') => {
    
    // Optimistically update the cache for THIS shot immediately
    if (selectedShotRef.current?.id) {
      updateShotModeRef.current(selectedShotRef.current.id, mode);
    }

    // Update the actual settings (will save to DB asynchronously)
    shotSettingsRef.current.updateField('generationMode', mode);
  }, [shotSettingsRef]);

  // =============================================================================
  // LORAS
  // =============================================================================
  const handleSelectedLorasChange = useCallback((lorasToSet: ActiveLora[]) => {
    shotSettingsRef.current.updateField('loras', lorasToSet);
    rebuildPhaseConfig({
      selectedLoras: (lorasToSet || []).map(l => ({ path: l.path, strength: l.strength }))
    });
  }, [shotSettingsRef, rebuildPhaseConfig]);

  return {
    noOpCallback,
    handleVideoControlModeChange,
    handlePairConfigChange,
    handleBatchVideoPromptChange,
    handleNegativePromptChange,
    handleBatchVideoFramesChange,
    handleBatchVideoStepsChange,
    handleTextBeforePromptsChange,
    handleTextAfterPromptsChange,
    handleBlurSave,
    handleEnhancePromptChange,
    handleTurboModeChange,
    handleSmoothContinuationsChange,
    handleAmountOfMotionChange,
    handleMotionModeChange,
    handleGenerationTypeModeChange,
    handleSteerableMotionSettingsChange,
    handlePhaseConfigChange,
    handlePhasePresetSelect,
    handlePhasePresetRemove,
    handleRestoreDefaults,
    handleGenerationModeChange,
    handleSelectedLorasChange,
  };
};
