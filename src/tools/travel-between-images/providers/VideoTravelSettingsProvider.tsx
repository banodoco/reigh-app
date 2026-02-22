/**
 * VideoTravelSettingsProvider - Centralized settings context for Video Travel tool
 *
 * This provider owns all shot-specific settings state, making it accessible to
 * any child component without prop drilling. Settings are persisted via useShotSettings.
 *
 * Architecture:
 * - Wraps useShotSettings (state + persistence)
 * - Wraps useVideoTravelSettingsHandlers (all update handlers)
 * - Exposes focused hooks for each settings domain
 *
 * Usage:
 * ```tsx
 * // In VideoTravelToolPage
 * <VideoTravelSettingsProvider projectId={projectId} shotId={shotId}>
 *   <ShotSettingsEditor />
 * </VideoTravelSettingsProvider>
 *
 * // In any child component
 * const { prompt, setPrompt } = usePromptSettings();
 * const { motionMode, setMotionMode } = useMotionSettings();
 * ```
 */

import React, {
  createContext,
  useContext,
  useMemo,
  useRef
} from 'react';
import { Shot } from '@/types/shots';
import { useShotSettings, UseShotSettingsReturn } from '../hooks/useShotSettings';
import { useVideoTravelSettingsHandlers, VideoTravelSettingsHandlers } from '../hooks/useVideoTravelSettingsHandlers';
import { VideoTravelSettings, PhaseConfig } from '../settings';
import { LoraModel } from '@/shared/components/LoraSelectorModal';

// =============================================================================
// CONTEXT TYPES
// =============================================================================

interface VideoTravelSettingsContextValue {
  // Core state
  settings: VideoTravelSettings;
  status: 'idle' | 'loading' | 'ready' | 'saving' | 'error';
  isDirty: boolean;
  isLoading: boolean;

  // Shot info
  shotId: string | null;
  projectId: string | null;

  // All handlers from useVideoTravelSettingsHandlers
  handlers: VideoTravelSettingsHandlers;

  // Direct access to updateField/updateFields for custom updates
  updateField: UseShotSettingsReturn['updateField'];
  updateFields: UseShotSettingsReturn['updateFields'];

  // Save operations
  save: () => Promise<void>;
  saveImmediate: () => Promise<void>;

  // LoRAs (passed through from parent)
  availableLoras: LoraModel[];
}

// Export the context for direct useContext access in bridge hooks
export const VideoTravelSettingsContext = createContext<VideoTravelSettingsContextValue | null>(null);

// =============================================================================
// PROVIDER COMPONENT
// =============================================================================

interface VideoTravelSettingsProviderProps {
  projectId: string | null | undefined;
  shotId: string | null | undefined;
  selectedShot: Shot | null;
  availableLoras: LoraModel[];
  /** Function to optimistically update generation mode cache (from useProjectGenerationModesCache) */
  updateShotMode: (shotId: string, mode: 'batch' | 'timeline' | 'by-pair') => void;
  children: React.ReactNode;
}

export const VideoTravelSettingsProvider: React.FC<VideoTravelSettingsProviderProps> = ({
  projectId,
  shotId,
  selectedShot,
  availableLoras,
  updateShotMode,
  children,
}) => {
  // Core settings hook - manages state + persistence
  const shotSettings = useShotSettings(shotId, projectId);

  // Create ref for handlers (they need ref to avoid recreation)
  const shotSettingsRef = useRef(shotSettings);
  shotSettingsRef.current = shotSettings;

  // All handlers
  const handlers = useVideoTravelSettingsHandlers({
    shotSettingsRef,
    currentShotId: shotId || null,
    selectedShot,
    updateShotMode,
  });

  // Memoize context value
  const contextValue = useMemo<VideoTravelSettingsContextValue>(() => ({
    settings: shotSettings.settings,
    status: shotSettings.status,
    isDirty: shotSettings.isDirty,
    isLoading: shotSettings.status === 'loading' || shotSettings.status === 'idle',
    shotId: shotSettings.shotId,
    projectId: projectId || null,
    handlers,
    updateField: shotSettings.updateField,
    updateFields: shotSettings.updateFields,
    save: shotSettings.save,
    saveImmediate: shotSettings.saveImmediate,
    availableLoras,
  }), [
    shotSettings.settings,
    shotSettings.status,
    shotSettings.isDirty,
    shotSettings.shotId,
    shotSettings.updateField,
    shotSettings.updateFields,
    shotSettings.save,
    shotSettings.saveImmediate,
    projectId,
    handlers,
    availableLoras,
  ]);

  return (
    <VideoTravelSettingsContext.Provider value={contextValue}>
      {children}
    </VideoTravelSettingsContext.Provider>
  );
};

// =============================================================================
// BASE HOOK - Full context access
// =============================================================================

export function useVideoTravelSettings(): VideoTravelSettingsContextValue {
  const ctx = useContext(VideoTravelSettingsContext);
  if (!ctx) {
    throw new Error('useVideoTravelSettings must be used within VideoTravelSettingsProvider');
  }
  return ctx;
}

// =============================================================================
// FOCUSED HOOKS - Domain-specific slices
// =============================================================================

/**
 * Prompt-related settings
 */
export function usePromptSettings() {
  const { settings, handlers } = useVideoTravelSettings();
  return useMemo(() => ({
    prompt: settings.prompt || '',
    negativePrompt: settings.negativePrompt || '',
    textBeforePrompts: settings.textBeforePrompts || '',
    textAfterPrompts: settings.textAfterPrompts || '',
    enhancePrompt: settings.enhancePrompt,
    setPrompt: handlers.handleBatchVideoPromptChange,
    setNegativePrompt: handlers.handleNegativePromptChange,
    setTextBeforePrompts: handlers.handleTextBeforePromptsChange,
    setTextAfterPrompts: handlers.handleTextAfterPromptsChange,
    setEnhancePrompt: handlers.handleEnhancePromptChange,
  }), [settings.prompt, settings.negativePrompt, settings.textBeforePrompts, settings.textAfterPrompts, settings.enhancePrompt, handlers]);
}

/**
 * Motion-related settings
 */
export function useMotionSettings() {
  const { settings, handlers, availableLoras } = useVideoTravelSettings();
  return useMemo(() => ({
    amountOfMotion: settings.amountOfMotion ?? 50,
    motionMode: settings.motionMode || 'basic',
    turboMode: settings.turboMode ?? false,
    smoothContinuations: settings.smoothContinuations ?? false,
    setAmountOfMotion: handlers.handleAmountOfMotionChange,
    setMotionMode: handlers.handleMotionModeChange,
    setTurboMode: handlers.handleTurboModeChange,
    setSmoothContinuations: handlers.handleSmoothContinuationsChange,
    availableLoras,
  }), [settings.amountOfMotion, settings.motionMode, settings.turboMode, settings.smoothContinuations, handlers, availableLoras]);
}

/**
 * Frame/duration settings
 */
export function useFrameSettings() {
  const { settings, handlers } = useVideoTravelSettings();
  return useMemo(() => ({
    batchVideoFrames: settings.batchVideoFrames ?? 61,
    batchVideoSteps: settings.batchVideoSteps ?? 6,
    setFrames: handlers.handleBatchVideoFramesChange,
    setSteps: handlers.handleBatchVideoStepsChange,
  }), [settings.batchVideoFrames, settings.batchVideoSteps, handlers]);
}

/**
 * Phase config (advanced mode) settings
 */
export function usePhaseConfigSettings() {
  const { settings, handlers } = useVideoTravelSettings();
  return useMemo(() => ({
    phaseConfig: settings.phaseConfig,
    selectedPhasePresetId: settings.selectedPhasePresetId,
    generationTypeMode: settings.generationTypeMode || 'i2v',
    advancedMode: settings.advancedMode ?? false,
    setPhaseConfig: handlers.handlePhaseConfigChange,
    selectPreset: handlers.handlePhasePresetSelect,
    removePreset: handlers.handlePhasePresetRemove,
    setGenerationTypeMode: handlers.handleGenerationTypeModeChange,
    restoreDefaults: handlers.handleRestoreDefaults,
  }), [settings.phaseConfig, settings.selectedPhasePresetId, settings.generationTypeMode, settings.advancedMode, handlers]);
}

/**
 * Steerable motion settings (seed, model, etc.)
 */
export function useSteerableMotionSettings() {
  const { settings, handlers } = useVideoTravelSettings();
  return useMemo(() => ({
    steerableMotionSettings: settings.steerableMotionSettings,
    setSteerableMotionSettings: handlers.handleSteerableMotionSettingsChange,
  }), [settings.steerableMotionSettings, handlers]);
}

/**
 * LoRA settings
 */
export function useLoraSettings() {
  const { settings, handlers, availableLoras } = useVideoTravelSettings();
  return useMemo(() => ({
    selectedLoras: settings.loras || [],
    availableLoras,
    setSelectedLoras: handlers.handleSelectedLorasChange,
  }), [settings.loras, availableLoras, handlers]);
}

/**
 * Generation mode (batch vs timeline)
 */
export function useGenerationModeSettings() {
  const { settings, handlers } = useVideoTravelSettings();
  return useMemo(() => ({
    generationMode: settings.generationMode || 'timeline',
    videoControlMode: settings.videoControlMode || 'batch',
    setGenerationMode: handlers.handleGenerationModeChange,
    setVideoControlMode: handlers.handleVideoControlModeChange,
  }), [settings.generationMode, settings.videoControlMode, handlers]);
}

/**
 * Save operations
 */
export function useSettingsSave() {
  const { save, saveImmediate, handlers, isDirty, status } = useVideoTravelSettings();
  return useMemo(() => ({
    save,
    saveImmediate,
    onBlurSave: handlers.handleBlurSave,
    isDirty,
    isSaving: status === 'saving',
  }), [save, saveImmediate, handlers, isDirty, status]);
}

// =============================================================================
// RE-EXPORT TYPES
// =============================================================================

export type { VideoTravelSettings, PhaseConfig };
