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
import { Scissors, RefreshCw, RotateCcw, ArrowUp } from 'lucide-react';

// Import video editing components
import { TrimControlsPanel } from '@/shared/components/VideoTrimEditor/components/TrimControlsPanel';
import type { TrimState } from '@/shared/types/videoTrim';
import { VideoPortionEditor } from '@/shared/components/VideoPortionEditor';
import { DEFAULT_VACE_PHASE_CONFIG } from '@/shared/lib/vaceDefaults';
import type { UseVideoEditingReturn } from '../hooks/modes/types';
import { EditPanelLayout } from './EditPanelLayout';
import { ModeSelector } from './ModeSelector';
import { SegmentRegenerateForm } from './SegmentRegenerateForm';
import type { SegmentRegenerateFormProps } from './SegmentRegenerateForm';
import { VideoEnhanceForm } from './VideoEnhanceForm';
import type { VideoEnhanceSettings } from '../hooks/useVideoEnhance';
import { useLightboxCoreSafe, useLightboxVariantsSafe, type LightboxCoreState, type LightboxVariantState } from '../contexts/LightboxStateContext';
import { useVideoEditSafe, type VideoEditState } from '../contexts/VideoEditContext';

interface VideoEditTrimControls {
  // Trim mode controls (refs, handlers, save state)
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
}

interface VideoEditReplaceControls {
  // Replace (portion) mode controls
  videoEditing: UseVideoEditingReturn;
  projectId: string | undefined;
}

interface VideoEditEnhanceControls {
  settings: VideoEnhanceSettings;
  onUpdateSetting: <K extends keyof VideoEnhanceSettings>(
    key: K,
    value: VideoEnhanceSettings[K]
  ) => void;
  onGenerate: () => void;
  isGenerating?: boolean;
  generateSuccess?: boolean;
  canSubmit?: boolean;
}

interface VideoEditPanelStateOverrides {
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

interface VideoEditPanelProps {
  /** Layout variant */
  variant: 'desktop' | 'mobile';

  /** Whether cloud mode is enabled (shows enhance mode) */
  isCloudMode?: boolean;

  trim: VideoEditTrimControls;
  replace: VideoEditReplaceControls;

  // Regenerate mode props - pass props instead of JSX for proper hook pattern
  regenerateFormProps?: SegmentRegenerateFormProps | null;

  // Enhance mode props (shown only when cloud mode is enabled)
  enhance?: VideoEditEnhanceControls;

  // Task ID for copy functionality
  taskId?: string | null;

  // Optional state overrides for props-first pattern
  stateOverrides?: VideoEditPanelStateOverrides;
}

export const VideoEditPanel: React.FC<VideoEditPanelProps> = ({
  variant,
  isCloudMode,
  trim,
  replace,
  // Regenerate props (specialized)
  regenerateFormProps,
  enhance,
  // Task ID
  taskId,
  // Optional state overrides
  stateOverrides,
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
  const { onClose } = stateOverrides?.coreState ?? contextCore;

  // Video edit state
  const {
    videoEditSubMode,
    handleEnterVideoTrimMode: onEnterTrimMode,
    handleEnterVideoReplaceMode: onEnterReplaceMode,
    handleEnterVideoRegenerateMode: onEnterRegenerateMode,
    handleEnterVideoEnhanceMode: onEnterEnhanceMode,
    handleExitVideoEditMode: onExitVideoEditMode,
  } = stateOverrides?.videoEditState ?? contextVideoEdit;

  // Variants state
  const {
    variants,
    activeVariant,
    handleVariantSelect: onVariantSelect,
    handleMakePrimary: onMakePrimary,
    isLoadingVariants,
    onLoadVariantSettings,
    handleDeleteVariant: onDeleteVariant,
  } = stateOverrides?.variantsState ?? contextVariants;

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
      icon: <ArrowUp />,
      onClick: onEnterEnhanceMode,
    }] : []),
  ];

  const modeSelector = (
    <ModeSelector
      items={modeSelectorItems}
      activeId={videoEditSubMode ?? 'trim'}
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
          trimState={trim.trimState}
          onStartTrimChange={trim.onStartTrimChange}
          onEndTrimChange={trim.onEndTrimChange}
          onResetTrim={trim.onResetTrim}
          trimmedDuration={trim.trimmedDuration}
          hasTrimChanges={trim.hasTrimChanges}
          onSave={trim.onSaveTrim}
          isSaving={trim.isSavingTrim}
          saveProgress={trim.trimSaveProgress}
          saveError={trim.trimSaveError}
          saveSuccess={trim.trimSaveSuccess}
          onClose={onClose}
          variant={variant}
          videoUrl={trim.videoUrl}
          currentTime={trim.trimCurrentTime}
          videoRef={trim.trimVideoRef}
          hideHeader
        />
      )}
      {videoEditSubMode === 'replace' && (
        <VideoPortionEditor
          settings={{
            gapFrames: replace.videoEditing.editSettings.settings.gapFrameCount,
            setGapFrames: (val) => replace.videoEditing.editSettings.updateField('gapFrameCount', val),
            contextFrames: replace.videoEditing.editSettings.settings.contextFrameCount,
            setContextFrames: (val) => {
              const maxGap = Math.max(1, 81 - (val * 2));
              const gapFrames = replace.videoEditing.editSettings.settings.gapFrameCount;
              const newGapFrames = gapFrames > maxGap ? maxGap : gapFrames;
              replace.videoEditing.editSettings.updateFields({
                contextFrameCount: val,
                gapFrameCount: newGapFrames
              });
            },
            maxContextFrames: replace.videoEditing.maxContextFrames,
            negativePrompt: replace.videoEditing.editSettings.settings.negativePrompt || '',
            setNegativePrompt: (val) => replace.videoEditing.editSettings.updateField('negativePrompt', val),
            enhancePrompt: replace.videoEditing.editSettings.settings.enhancePrompt,
            setEnhancePrompt: (val) => replace.videoEditing.editSettings.updateField('enhancePrompt', val),
          }}
          selections={{
            selections: replace.videoEditing.selections,
            onUpdateSelectionSettings: replace.videoEditing.handleUpdateSelectionSettings,
            onAddSelection: replace.videoEditing.handleAddSelection,
            onRemoveSelection: replace.videoEditing.handleRemoveSelection,
            videoUrl: trim.videoUrl,
            fps: 16,
          }}
          lora={{
            availableLoras: replace.videoEditing.availableLoras,
            projectId: replace.projectId ?? null,
            loraManager: replace.videoEditing.loraManager,
          }}
          motion={{
            motionMode: (replace.videoEditing.editSettings.settings.motionMode || 'basic') as 'basic' | 'advanced',
            onMotionModeChange: (mode) => replace.videoEditing.editSettings.updateField('motionMode', mode),
            phaseConfig: replace.videoEditing.editSettings.settings.phaseConfig ?? DEFAULT_VACE_PHASE_CONFIG,
            onPhaseConfigChange: (config) => replace.videoEditing.editSettings.updateField('phaseConfig', config),
            randomSeed: replace.videoEditing.editSettings.settings.randomSeed ?? true,
            onRandomSeedChange: (val) => replace.videoEditing.editSettings.updateField('randomSeed', val),
            selectedPhasePresetId: replace.videoEditing.editSettings.settings.selectedPhasePresetId ?? null,
            onPhasePresetSelect: (presetId, config) => {
              replace.videoEditing.editSettings.updateFields({
                selectedPhasePresetId: presetId,
                phaseConfig: config,
              });
            },
            onPhasePresetRemove: () => {
              replace.videoEditing.editSettings.updateField('selectedPhasePresetId', null);
            },
          }}
          actions={{
            onGenerate: replace.videoEditing.handleGenerate,
            isGenerating: replace.videoEditing.isGenerating,
            generateSuccess: replace.videoEditing.generateSuccess,
            isGenerateDisabled: !replace.videoEditing.isValid,
            validationErrors: replace.videoEditing.validationErrors,
          }}
          stateOverrides={{ hideHeader: true }}
        />
      )}
      {videoEditSubMode === 'regenerate' && regenerateFormProps && (
        <SegmentRegenerateForm {...regenerateFormProps} />
      )}
      {videoEditSubMode === 'enhance' && enhance && (
        <VideoEnhanceForm
          settings={enhance.settings}
          onUpdateSetting={enhance.onUpdateSetting}
          onGenerate={enhance.onGenerate}
          isGenerating={enhance.isGenerating ?? false}
          generateSuccess={enhance.generateSuccess ?? false}
          canSubmit={enhance.canSubmit ?? false}
          variant={variant}
          videoUrl={trim.videoUrl}
        />
      )}
    </EditPanelLayout>
  );
};
