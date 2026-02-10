/**
 * useSegmentSettingsForm - Combines useSegmentSettings with form-ready props
 *
 * This hook wraps useSegmentSettings and returns props that can be spread
 * directly onto SegmentSettingsForm, reducing duplication across the 3+
 * components that render segment settings forms.
 *
 * Usage:
 * ```tsx
 * const { formProps, getSettingsForTaskCreation, saveSettings } = useSegmentSettingsForm({
 *   pairShotGenerationId,
 *   shotId,
 *   defaults: { prompt: '', negativePrompt: '', numFrames: 25 },
 * });
 *
 * const handleSubmit = async () => {
 *   await saveSettings();
 *   const settings = getSettingsForTaskCreation();
 *   const taskParams = buildTaskParams(settings, context);
 *   await createTask(taskParams);
 * };
 *
 * return <SegmentSettingsForm {...formProps} onSubmit={handleSubmit} />;
 * ```
 */

import { useMemo, useRef, useCallback } from 'react';
import { useSegmentSettings, UseSegmentSettingsOptions } from './useSegmentSettings';
import type { SegmentSettingsFormProps } from '@/shared/components/SegmentSettingsForm';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';

interface UseSegmentSettingsFormOptions extends UseSegmentSettingsOptions {
  // These are passed through to the form
  segmentIndex?: number;
  startImageUrl?: string;
  endImageUrl?: string;
  modelName?: string;
  resolution?: string;
  isRegeneration?: boolean;
  buttonLabel?: string;
  showHeader?: boolean;
  queryKeyPrefix?: string;
  maxFrames?: number;
  // Structure video context
  structureVideoType?: 'uni3c' | 'flow' | 'canny' | 'depth' | null;
  structureVideoUrl?: string;
  structureVideoFrameRange?: {
    segmentStart: number;
    segmentEnd: number;
    videoTotalFrames: number;
    videoFps: number;
  };
  /**
   * Callback to update structure video defaults when "Save as Shot Defaults" is clicked.
   * Structure videos are stored separately from tool settings, so the parent must provide this.
   * Returns a Promise so we can await it before showing success.
   */
  onUpdateStructureVideoDefaults?: (updates: {
    motionStrength?: number;
    treatment?: 'adjust' | 'clip';
    uni3cEndPercent?: number;
  }) => Promise<void>;

  // Per-segment structure video management (Timeline Mode only)
  /** Whether in timeline mode (shows structure video upload) vs batch mode (preview only) */
  isTimelineMode?: boolean;
  /** Callback to add a structure video for this segment */
  onAddSegmentStructureVideo?: (video: StructureVideoConfigWithMetadata) => void;
  /** Callback to update this segment's structure video */
  onUpdateSegmentStructureVideo?: (updates: Partial<StructureVideoConfigWithMetadata>) => void;
  /** Callback to remove this segment's structure video */
  onRemoveSegmentStructureVideo?: () => void;

  // Navigation to constituent images
  /** Shot generation ID for the start image (for navigation) */
  startImageShotGenerationId?: string;
  /** Shot generation ID for the end image (for navigation) */
  endImageShotGenerationId?: string;
  /** Callback to navigate to a constituent image by shot_generation.id */
  onNavigateToImage?: (shotGenerationId: string) => void;
}

interface UseSegmentSettingsFormReturn {
  /**
   * Props to spread onto SegmentSettingsForm.
   * Includes: settings, onChange, hasOverride, shotDefaults,
   * onRestoreDefaults, onSaveAsShotDefaults, and display props.
   *
   * Does NOT include: onSubmit, isSubmitting, onFrameCountChange
   * (these are context-specific and must be provided by the parent)
   */
  formProps: Omit<SegmentSettingsFormProps, 'onSubmit' | 'isSubmitting' | 'onFrameCountChange'>;

  /**
   * Get effective settings for task creation (merged with shot defaults).
   * Call this when building task params.
   */
  getSettingsForTaskCreation: ReturnType<typeof useSegmentSettings>['getSettingsForTaskCreation'];

  /**
   * Save current settings to database.
   * Call this before creating a task.
   */
  saveSettings: ReturnType<typeof useSegmentSettings>['saveSettings'];

  /**
   * Update settings (for external triggers like loading variant params).
   */
  updateSettings: ReturnType<typeof useSegmentSettings>['updateSettings'];

  /**
   * Current settings (for reading values outside the form).
   */
  settings: ReturnType<typeof useSegmentSettings>['settings'];

  /**
   * Loading state.
   */
  isLoading: boolean;

  /**
   * Whether settings have been modified.
   */
  isDirty: boolean;

  /**
   * Effective enhance prompt enabled value (persisted preference ?? false).
   * Use this for display. For submit handlers, use enhancePromptRef.current
   * to avoid stale closure issues.
   */
  effectiveEnhanceEnabled: boolean;

  /**
   * Ref for synchronous access to enhance prompt state in submit handlers.
   * Avoids stale closure when user toggles and immediately submits.
   */
  enhancePromptRef: React.MutableRefObject<boolean>;

  /**
   * Handle enhance prompt toggle. Updates ref synchronously and persists to DB.
   */
  handleEnhancePromptChange: (enabled: boolean) => void;

  /**
   * @deprecated Use effectiveEnhanceEnabled instead
   * Persisted enhance prompt preference (undefined = not yet set)
   */
  persistedEnhancePromptEnabled: boolean | undefined;

  /**
   * @deprecated Use handleEnhancePromptChange instead
   * Save the enhance prompt enabled preference to metadata.
   */
  saveEnhancePromptEnabled: (enabled: boolean) => Promise<boolean>;
}

export function useSegmentSettingsForm(
  options: UseSegmentSettingsFormOptions
): UseSegmentSettingsFormReturn {
  const {
    // useSegmentSettings options
    pairShotGenerationId,
    shotId,
    defaults,
    structureVideoDefaults,
    onUpdateStructureVideoDefaults,
    // Form display options
    segmentIndex,
    startImageUrl,
    endImageUrl,
    modelName,
    resolution,
    isRegeneration = false,
    buttonLabel,
    showHeader = false,
    queryKeyPrefix,
    maxFrames,
    structureVideoType,
    structureVideoUrl,
    structureVideoFrameRange,
    // Per-segment structure video management
    isTimelineMode,
    onAddSegmentStructureVideo,
    onUpdateSegmentStructureVideo,
    onRemoveSegmentStructureVideo,
    // Navigation
    startImageShotGenerationId,
    endImageShotGenerationId,
    onNavigateToImage,
  } = options;

  // Get all segment settings data
  const {
    settings,
    updateSettings,
    saveSettings,
    resetSettings,
    saveAsShotDefaults,
    saveFieldAsDefault,
    getSettingsForTaskCreation,
    isLoading,
    isDirty,
    hasOverride,
    shotDefaults,
    enhancedPrompt,
    basePromptForEnhancement,
    clearEnhancedPrompt,
    enhancePromptEnabled,
    saveEnhancePromptEnabled,
  } = useSegmentSettings({
    pairShotGenerationId,
    shotId,
    defaults,
    structureVideoDefaults,
    onUpdateStructureVideoDefaults,
  });

  // Enhance prompt toggle: compute effective value (persisted ?? false)
  const effectiveEnhanceEnabled = enhancePromptEnabled ?? false;

  // Ref for synchronous access in submit handlers (avoids stale closure when user
  // toggles and immediately submits before React re-renders with new persisted value)
  const enhancePromptRef = useRef(effectiveEnhanceEnabled);
  // Keep ref in sync with computed value on each render
  enhancePromptRef.current = effectiveEnhanceEnabled;

  // Handler that updates ref synchronously AND persists to DB
  const handleEnhancePromptChange = useCallback((enabled: boolean) => {
    enhancePromptRef.current = enabled; // Synchronous update for submit handlers
    saveEnhancePromptEnabled(enabled); // Persist to DB (async, but ref is already updated)
  }, [saveEnhancePromptEnabled]);

  // Build form props that can be spread onto SegmentSettingsForm
  const formProps = useMemo(() => ({
    // Core controlled form props
    settings,
    onChange: updateSettings,

    // Override indicators
    hasOverride,
    shotDefaults,
    isDirty,

    // Actions
    onRestoreDefaults: resetSettings,
    onSaveAsShotDefaults: saveAsShotDefaults,
    onSaveFieldAsDefault: saveFieldAsDefault,

    // Enhanced prompt (AI-generated, stored separately)
    enhancedPrompt,
    basePromptForEnhancement,
    onClearEnhancedPrompt: clearEnhancedPrompt,

    // Enhance prompt toggle (controlled by hook)
    enhancePromptEnabled: effectiveEnhanceEnabled,
    onEnhancePromptChange: handleEnhancePromptChange,

    // Display context
    segmentIndex,
    startImageUrl,
    endImageUrl,
    modelName,
    resolution,
    isRegeneration,
    buttonLabel,
    showHeader,
    queryKeyPrefix,
    maxFrames,

    // Structure video
    structureVideoType,
    structureVideoDefaults,
    structureVideoUrl,
    structureVideoFrameRange,

    // Per-segment structure video management
    isTimelineMode,
    onAddSegmentStructureVideo,
    onUpdateSegmentStructureVideo,
    onRemoveSegmentStructureVideo,

    // Navigation to constituent images
    startImageShotGenerationId,
    endImageShotGenerationId,
    onNavigateToImage,
  }), [
    settings,
    updateSettings,
    hasOverride,
    shotDefaults,
    isDirty,
    resetSettings,
    saveAsShotDefaults,
    saveFieldAsDefault,
    enhancedPrompt,
    basePromptForEnhancement,
    clearEnhancedPrompt,
    effectiveEnhanceEnabled,
    handleEnhancePromptChange,
    segmentIndex,
    startImageUrl,
    endImageUrl,
    modelName,
    resolution,
    isRegeneration,
    buttonLabel,
    showHeader,
    queryKeyPrefix,
    maxFrames,
    structureVideoType,
    structureVideoDefaults,
    structureVideoUrl,
    structureVideoFrameRange,
    isTimelineMode,
    onAddSegmentStructureVideo,
    onUpdateSegmentStructureVideo,
    onRemoveSegmentStructureVideo,
    startImageShotGenerationId,
    endImageShotGenerationId,
    onNavigateToImage,
  ]);

  return {
    formProps,
    getSettingsForTaskCreation,
    saveSettings,
    updateSettings,
    settings,
    isLoading,
    isDirty,
    // New consolidated API
    effectiveEnhanceEnabled,
    enhancePromptRef,
    handleEnhancePromptChange,
    // Deprecated (kept for backwards compatibility during migration)
    persistedEnhancePromptEnabled: enhancePromptEnabled,
    saveEnhancePromptEnabled,
  };
}
