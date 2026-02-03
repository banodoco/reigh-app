/**
 * VideoEditPanel Component
 *
 * Unified video editing panel for both desktop and mobile layouts.
 * Handles Trim, Replace Portion, and Regenerate sub-modes with variant display.
 *
 * Supports props-first pattern: optional state props (coreState, videoEditState,
 * variantsState) override context values when provided. This allows the component
 * to work both within VideoLightbox (using context) and standalone (using props).
 */

import React from 'react';
import { Scissors, RefreshCw, RotateCcw, Sparkles } from 'lucide-react';

// Import video editing components
import { TrimControlsPanel } from '@/shared/components/VideoTrimEditor';
import type { TrimState } from '@/shared/types/videoTrim';
import { VideoPortionEditor } from '@/shared/components/VideoPortionEditor';
import { DEFAULT_VACE_PHASE_CONFIG } from '@/shared/lib/vaceDefaults';
import type { UseVideoEditingReturn } from '../hooks/useVideoEditing';
import { EditPanelLayout } from './EditPanelLayout';
import { ModeSelector } from './ModeSelector';
import { SegmentRegenerateForm } from './SegmentRegenerateForm';
import type { SegmentRegenerateFormProps } from './SegmentRegenerateForm';
import { VideoEnhanceForm } from './VideoEnhanceForm';
import type { VideoEnhanceSettings } from '../hooks/useVideoEnhance';
import { useLightboxCoreSafe, useLightboxVariantsSafe, type LightboxCoreState, type LightboxVariantState } from '../contexts/LightboxStateContext';
import { useVideoEditSafe, type VideoEditState } from '../contexts/VideoEditContext';

export interface VideoEditPanelProps {
  /** Layout variant */
  variant: 'desktop' | 'mobile';

  /** Whether cloud mode is enabled (shows enhance mode) */
  isCloudMode?: boolean;

  // Trim mode props (specialized - refs, handlers, save state)
  trimState: TrimState;
  onStartTrimChange: (seconds: number) => void;
  onEndTrimChange: (seconds: number) => void;
  onResetTrim: () => void;
  trimmedDuration: number;
  hasTrimChanges: boolean;
  onSaveTrim: () => void;
  isSavingTrim: boolean;
  trimSaveProgress: number;
  trimSaveError: string | null;
  trimSaveSuccess: boolean;
  videoUrl: string;
  trimCurrentTime: number;
  trimVideoRef: React.RefObject<HTMLVideoElement>;

  // Replace (portion) mode props (specialized manager)
  videoEditing: UseVideoEditingReturn;
  projectId: string | undefined;

  // Regenerate mode props - pass props instead of JSX for proper hook pattern
  regenerateFormProps?: SegmentRegenerateFormProps | null;

  // Enhance mode props (specialized handlers)
  enhanceSettings?: VideoEnhanceSettings;
  onUpdateEnhanceSetting?: <K extends keyof VideoEnhanceSettings>(
    key: K,
    value: VideoEnhanceSettings[K]
  ) => void;
  onEnhanceGenerate?: () => void;
  isEnhancing?: boolean;
  enhanceSuccess?: boolean;
  canEnhance?: boolean;

  // Task ID for copy functionality
  taskId?: string | null;

  // ========================================
  // Optional state overrides (props-first pattern)
  // When provided, these override the corresponding context values.
  // This allows VideoEditPanel to work without requiring parent providers.
  // ========================================
  coreState?: Pick<LightboxCoreState, 'onClose'>;
  videoEditState?: Pick<VideoEditState,
    | 'videoEditSubMode'
    | 'handleEnterVideoTrimMode'
    | 'handleEnterVideoReplaceMode'
    | 'handleEnterVideoRegenerateMode'
    | 'handleEnterVideoEnhanceMode'
    | 'handleExitVideoEditMode'
  >;
  variantsState?: Pick<LightboxVariantState,
    | 'variants'
    | 'activeVariant'
    | 'handleVariantSelect'
    | 'handleMakePrimary'
    | 'isLoadingVariants'
    | 'onLoadVariantSettings'
    | 'handleDeleteVariant'
  >;
}

export const VideoEditPanel: React.FC<VideoEditPanelProps> = ({
  variant,
  isCloudMode,
  // Trim props (specialized)
  trimState,
  onStartTrimChange,
  onEndTrimChange,
  onResetTrim,
  trimmedDuration,
  hasTrimChanges,
  onSaveTrim,
  isSavingTrim,
  trimSaveProgress,
  trimSaveError,
  trimSaveSuccess,
  videoUrl,
  trimCurrentTime,
  trimVideoRef,
  // Replace (portion) props (specialized)
  videoEditing,
  projectId,
  // Regenerate props (specialized)
  regenerateFormProps,
  // Enhance props (specialized)
  enhanceSettings,
  onUpdateEnhanceSetting,
  onEnhanceGenerate,
  isEnhancing,
  enhanceSuccess,
  canEnhance,
  // Task ID
  taskId,
  // Optional state overrides
  coreState,
  videoEditState,
  variantsState,
}) => {
  // ========================================
  // STATE: Props-first with context fallback
  // When state props are provided, use them directly.
  // Otherwise, read from context (for use within MediaLightbox).
  // ========================================
  const contextCore = useLightboxCoreSafe();
  const contextVideoEdit = useVideoEditSafe();
  const contextVariants = useLightboxVariantsSafe();

  // Core state
  const { onClose } = coreState ?? contextCore;

  // Video edit state
  const {
    videoEditSubMode,
    handleEnterVideoTrimMode: onEnterTrimMode,
    handleEnterVideoReplaceMode: onEnterReplaceMode,
    handleEnterVideoRegenerateMode: onEnterRegenerateMode,
    handleEnterVideoEnhanceMode: onEnterEnhanceMode,
    handleExitVideoEditMode: onExitVideoEditMode,
  } = videoEditState ?? contextVideoEdit;

  // Variants state
  const {
    variants,
    activeVariant,
    handleVariantSelect: onVariantSelect,
    handleMakePrimary: onMakePrimary,
    isLoadingVariants,
    onLoadVariantSettings,
    handleDeleteVariant: onDeleteVariant,
  } = variantsState ?? contextVariants;

  const activeVariantId = activeVariant?.id || null;
  // Mode selector items for video editing
  const modeSelectorItems = [
    {
      id: 'trim',
      label: 'Trim',
      icon: <Scissors />,
      onClick: onEnterTrimMode,
    },
    {
      id: 'replace',
      label: 'Replace',
      icon: <RefreshCw />,
      onClick: onEnterReplaceMode,
    },
    ...(regenerateFormProps ? [{
      id: 'regenerate',
      label: 'Regenerate',
      icon: <RotateCcw />,
      onClick: onEnterRegenerateMode,
    }] : []),
    // Enhance mode - only shown when cloud mode is enabled
    ...(isCloudMode ? [{
      id: 'enhance',
      label: 'Enhance',
      icon: <Sparkles />,
      onClick: onEnterEnhanceMode,
    }] : []),
  ];

  const modeSelector = (
    <ModeSelector
      items={modeSelectorItems}
      activeId={videoEditSubMode}
    />
  );

  return (
    <EditPanelLayout
      variant={variant}
      onClose={onClose}
      onExitEditMode={onExitVideoEditMode}
      modeSelector={modeSelector}
      taskId={taskId}
      variants={variants}
      activeVariantId={activeVariantId}
      onVariantSelect={onVariantSelect}
      onMakePrimary={onMakePrimary}
      isLoadingVariants={isLoadingVariants}
      onLoadVariantSettings={onLoadVariantSettings}
      onDeleteVariant={onDeleteVariant}
    >
      {/* Sub-mode content */}
      {videoEditSubMode === 'trim' && (
        <TrimControlsPanel
          trimState={trimState}
          onStartTrimChange={onStartTrimChange}
          onEndTrimChange={onEndTrimChange}
          onResetTrim={onResetTrim}
          trimmedDuration={trimmedDuration}
          hasTrimChanges={hasTrimChanges}
          onSave={onSaveTrim}
          isSaving={isSavingTrim}
          saveProgress={trimSaveProgress}
          saveError={trimSaveError}
          saveSuccess={trimSaveSuccess}
          onClose={onClose}
          variant={variant}
          videoUrl={videoUrl}
          currentTime={trimCurrentTime}
          videoRef={trimVideoRef}
          hideHeader
        />
      )}
      {videoEditSubMode === 'replace' && (
        <VideoPortionEditor
          gapFrames={videoEditing.editSettings.settings.gapFrameCount || 12}
          setGapFrames={(val) => videoEditing.editSettings.updateField('gapFrameCount', val)}
          contextFrames={videoEditing.editSettings.settings.contextFrameCount || 8}
          setContextFrames={(val) => {
            const maxGap = Math.max(1, 81 - (val * 2));
            const gapFrames = videoEditing.editSettings.settings.gapFrameCount || 12;
            const newGapFrames = gapFrames > maxGap ? maxGap : gapFrames;
            videoEditing.editSettings.updateFields({
              contextFrameCount: val,
              gapFrameCount: newGapFrames
            });
          }}
          maxContextFrames={videoEditing.maxContextFrames}
          negativePrompt={videoEditing.editSettings.settings.negativePrompt || ''}
          setNegativePrompt={(val) => videoEditing.editSettings.updateField('negativePrompt', val)}
          enhancePrompt={videoEditing.editSettings.settings.enhancePrompt}
          setEnhancePrompt={(val) => videoEditing.editSettings.updateField('enhancePrompt', val)}
          selections={videoEditing.selections}
          onUpdateSelectionSettings={videoEditing.handleUpdateSelectionSettings}
          onAddSelection={videoEditing.handleAddSelection}
          onRemoveSelection={videoEditing.handleRemoveSelection}
          videoUrl={videoUrl}
          fps={16}
          availableLoras={videoEditing.availableLoras}
          projectId={projectId}
          loraManager={videoEditing.loraManager}
          // Motion settings
          motionMode={(videoEditing.editSettings.settings.motionMode || 'basic') as 'basic' | 'advanced'}
          onMotionModeChange={(mode) => videoEditing.editSettings.updateField('motionMode', mode)}
          phaseConfig={videoEditing.editSettings.settings.phaseConfig ?? DEFAULT_VACE_PHASE_CONFIG}
          onPhaseConfigChange={(config) => videoEditing.editSettings.updateField('phaseConfig', config)}
          randomSeed={videoEditing.editSettings.settings.randomSeed ?? true}
          onRandomSeedChange={(val) => videoEditing.editSettings.updateField('randomSeed', val)}
          selectedPhasePresetId={videoEditing.editSettings.settings.selectedPhasePresetId ?? null}
          onPhasePresetSelect={(presetId, config) => {
            videoEditing.editSettings.updateFields({
              selectedPhasePresetId: presetId,
              phaseConfig: config,
            });
          }}
          onPhasePresetRemove={() => {
            videoEditing.editSettings.updateField('selectedPhasePresetId', null);
          }}
          // Actions
          onGenerate={videoEditing.handleGenerate}
          isGenerating={videoEditing.isGenerating}
          generateSuccess={videoEditing.generateSuccess}
          isGenerateDisabled={!videoEditing.isValid}
          validationErrors={videoEditing.validationErrors}
          hideHeader
        />
      )}
      {videoEditSubMode === 'regenerate' && regenerateFormProps && (
        <SegmentRegenerateForm {...regenerateFormProps} />
      )}
      {videoEditSubMode === 'enhance' && enhanceSettings && onUpdateEnhanceSetting && onEnhanceGenerate && (
        <VideoEnhanceForm
          settings={enhanceSettings}
          onUpdateSetting={onUpdateEnhanceSetting}
          onGenerate={onEnhanceGenerate}
          isGenerating={isEnhancing ?? false}
          generateSuccess={enhanceSuccess ?? false}
          canSubmit={canEnhance ?? false}
          variant={variant}
          videoUrl={videoUrl}
        />
      )}
    </EditPanelLayout>
  );
};
