/**
 * ControlsPanel Component
 *
 * Router component that renders the appropriate panel based on current mode:
 * - VideoEditPanel: when in video edit mode (trim/regenerate)
 * - EditModePanel: when in image edit mode (inpaint/annotate/reposition)
 * - InfoPanel: default info view with task details and variants
 *
 * Uses context hooks to determine mode and passes only specialized props to children.
 */

import React from 'react';
import { VideoEditPanel } from './VideoEditPanel';
import { EditModePanel } from './EditModePanel';
import { InfoPanel } from './InfoPanel';
import type { VideoEditPanelProps } from './VideoEditPanel';
import type { EditModePanelProps } from './EditModePanel';
import type { InfoPanelProps } from './InfoPanel';
import type { SegmentRegenerateFormProps } from './SegmentRegenerateForm';
import type { VideoEnhanceSettings } from '../hooks/useVideoEnhance';
import { useImageEditSafe } from '../contexts/ImageEditContext';
import { useVideoEditSafe } from '../contexts/VideoEditContext';

/**
 * ControlsPanel Props - Significantly reduced after context migration
 *
 * Child components (InfoPanel, VideoEditPanel, EditModePanel) now use context hooks
 * for shared state. ControlsPanel only passes specialized/deeply-nested props.
 */
export interface ControlsPanelProps {
  /** Layout variant - passed through to child panels */
  variant: 'desktop' | 'mobile';

  // ========================================
  // VideoEditPanel specialized props
  // ========================================
  isCloudMode?: boolean;
  regenerateFormProps?: SegmentRegenerateFormProps | null;
  // Trim mode (specialized refs, handlers, save state)
  trimState: VideoEditPanelProps['trimState'];
  onStartTrimChange: VideoEditPanelProps['onStartTrimChange'];
  onEndTrimChange: VideoEditPanelProps['onEndTrimChange'];
  onResetTrim: VideoEditPanelProps['onResetTrim'];
  trimmedDuration: VideoEditPanelProps['trimmedDuration'];
  hasTrimChanges: VideoEditPanelProps['hasTrimChanges'];
  onSaveTrim: VideoEditPanelProps['onSaveTrim'];
  isSavingTrim: VideoEditPanelProps['isSavingTrim'];
  trimSaveProgress: VideoEditPanelProps['trimSaveProgress'];
  trimSaveError: VideoEditPanelProps['trimSaveError'];
  trimSaveSuccess: VideoEditPanelProps['trimSaveSuccess'];
  videoUrl: VideoEditPanelProps['videoUrl'];
  trimCurrentTime: VideoEditPanelProps['trimCurrentTime'];
  trimVideoRef: VideoEditPanelProps['trimVideoRef'];
  // Replace (portion) mode (specialized manager)
  videoEditing: VideoEditPanelProps['videoEditing'];
  projectId: VideoEditPanelProps['projectId'];
  // Enhance mode (specialized handlers)
  enhanceSettings?: VideoEnhanceSettings;
  onUpdateEnhanceSetting?: <K extends keyof VideoEnhanceSettings>(
    key: K,
    value: VideoEnhanceSettings[K]
  ) => void;
  onEnhanceGenerate?: () => void;
  isEnhancing?: boolean;
  enhanceSuccess?: boolean;
  canEnhance?: boolean;

  // ========================================
  // EditModePanel specialized props
  // ========================================
  sourceGenerationData: EditModePanelProps['sourceGenerationData'];
  onOpenExternalGeneration: EditModePanelProps['onOpenExternalGeneration'];
  allShots: EditModePanelProps['allShots'];
  isCurrentMediaPositioned: EditModePanelProps['isCurrentMediaPositioned'];
  onReplaceInShot: EditModePanelProps['onReplaceInShot'];
  sourcePrimaryVariant: EditModePanelProps['sourcePrimaryVariant'];
  onMakeMainVariant: EditModePanelProps['onMakeMainVariant'];
  canMakeMainVariant: EditModePanelProps['canMakeMainVariant'];
  // Specialized async handlers
  handleUnifiedGenerate: EditModePanelProps['handleUnifiedGenerate'];
  handleGenerateAnnotatedEdit: EditModePanelProps['handleGenerateAnnotatedEdit'];
  handleGenerateReposition: EditModePanelProps['handleGenerateReposition'];
  handleSaveAsVariant: EditModePanelProps['handleSaveAsVariant'];
  handleGenerateImg2Img?: EditModePanelProps['handleGenerateImg2Img'];
  // Specialized managers
  img2imgLoraManager?: EditModePanelProps['img2imgLoraManager'];
  editLoraManager?: EditModePanelProps['editLoraManager'];
  availableLoras?: EditModePanelProps['availableLoras'];
  advancedSettings?: EditModePanelProps['advancedSettings'];
  setAdvancedSettings?: EditModePanelProps['setAdvancedSettings'];
  isLocalGeneration?: EditModePanelProps['isLocalGeneration'];

  // ========================================
  // InfoPanel specialized props
  // ========================================
  showImageEditTools: InfoPanelProps['showImageEditTools'];
  taskDetailsData: InfoPanelProps['taskDetailsData'];
  derivedItems: InfoPanelProps['derivedItems'];
  derivedGenerations: any;
  paginatedDerived: any;
  derivedPage: number;
  derivedTotalPages: number;
  onSetDerivedPage: (page: number | ((prev: number) => number)) => void;
  replaceImages: InfoPanelProps['replaceImages'];
  onReplaceImagesChange: InfoPanelProps['onReplaceImagesChange'];
  onSwitchToPrimary: InfoPanelProps['onSwitchToPrimary'];

  // ========================================
  // Shared props
  // ========================================
  currentMediaId: string;
  currentShotId?: string;
  taskId?: string | null;
}

export const ControlsPanel: React.FC<ControlsPanelProps> = (props) => {
  const {
    variant,
    // VideoEditPanel specialized props
    isCloudMode,
    regenerateFormProps,
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
    videoEditing,
    projectId,
    enhanceSettings,
    onUpdateEnhanceSetting,
    onEnhanceGenerate,
    isEnhancing,
    enhanceSuccess,
    canEnhance,
    // EditModePanel specialized props
    sourceGenerationData,
    onOpenExternalGeneration,
    allShots,
    isCurrentMediaPositioned,
    onReplaceInShot,
    sourcePrimaryVariant,
    onMakeMainVariant,
    canMakeMainVariant,
    handleUnifiedGenerate,
    handleGenerateAnnotatedEdit,
    handleGenerateReposition,
    handleSaveAsVariant,
    handleGenerateImg2Img,
    img2imgLoraManager,
    editLoraManager,
    availableLoras,
    advancedSettings,
    setAdvancedSettings,
    isLocalGeneration,
    // InfoPanel specialized props
    showImageEditTools,
    taskDetailsData,
    derivedItems,
    derivedGenerations,
    paginatedDerived,
    derivedPage,
    derivedTotalPages,
    onSetDerivedPage,
    replaceImages,
    onReplaceImagesChange,
    onSwitchToPrimary,
    // Shared props
    currentMediaId,
    currentShotId,
    taskId,
  } = props;

  // ========================================
  // CONTEXT STATE - Mode detection
  // ========================================
  const { isSpecialEditMode } = useImageEditSafe();
  const { isInVideoEditMode, videoEditSubMode } = useVideoEditSafe();

  // Route to VideoEditPanel (uses context for mode, variants, handlers)
  if (isInVideoEditMode && videoEditSubMode) {
    return (
      <VideoEditPanel
        variant={variant}
        isCloudMode={isCloudMode}
        // Trim specialized props
        trimState={trimState}
        onStartTrimChange={onStartTrimChange}
        onEndTrimChange={onEndTrimChange}
        onResetTrim={onResetTrim}
        trimmedDuration={trimmedDuration}
        hasTrimChanges={hasTrimChanges}
        onSaveTrim={onSaveTrim}
        isSavingTrim={isSavingTrim}
        trimSaveProgress={trimSaveProgress}
        trimSaveError={trimSaveError}
        trimSaveSuccess={trimSaveSuccess}
        videoUrl={videoUrl}
        trimCurrentTime={trimCurrentTime}
        trimVideoRef={trimVideoRef}
        // Replace specialized props
        videoEditing={videoEditing}
        projectId={projectId}
        // Regenerate specialized props
        regenerateFormProps={regenerateFormProps}
        // Enhance specialized props
        enhanceSettings={enhanceSettings}
        onUpdateEnhanceSetting={onUpdateEnhanceSetting}
        onEnhanceGenerate={onEnhanceGenerate}
        isEnhancing={isEnhancing}
        enhanceSuccess={enhanceSuccess}
        canEnhance={canEnhance}
        // Task ID
        taskId={taskId}
      />
    );
  }

  // Route to EditModePanel (uses context for edit state, form state, variants)
  if (isSpecialEditMode) {
    return (
      <EditModePanel
        variant={variant}
        // Source generation specialized props
        sourceGenerationData={sourceGenerationData}
        onOpenExternalGeneration={onOpenExternalGeneration}
        currentShotId={currentShotId}
        allShots={allShots}
        isCurrentMediaPositioned={isCurrentMediaPositioned}
        onReplaceInShot={onReplaceInShot}
        sourcePrimaryVariant={sourcePrimaryVariant}
        onMakeMainVariant={onMakeMainVariant}
        canMakeMainVariant={canMakeMainVariant}
        taskId={taskId}
        currentMediaId={currentMediaId}
        // Specialized async handlers
        handleUnifiedGenerate={handleUnifiedGenerate}
        handleGenerateAnnotatedEdit={handleGenerateAnnotatedEdit}
        handleGenerateReposition={handleGenerateReposition}
        handleSaveAsVariant={handleSaveAsVariant}
        handleGenerateImg2Img={handleGenerateImg2Img}
        // Specialized managers
        img2imgLoraManager={img2imgLoraManager}
        editLoraManager={editLoraManager}
        availableLoras={availableLoras}
        advancedSettings={advancedSettings}
        setAdvancedSettings={setAdvancedSettings}
        isLocalGeneration={isLocalGeneration}
      />
    );
  }

  // Default: InfoPanel (uses context for core, media, edit state, variants)
  return (
    <InfoPanel
      variant={variant}
      showImageEditTools={showImageEditTools}
      // TaskDetails specialized props
      taskDetailsData={taskDetailsData}
      derivedItems={derivedItems}
      derivedGenerations={derivedGenerations}
      paginatedDerived={paginatedDerived}
      derivedPage={derivedPage}
      derivedTotalPages={derivedTotalPages}
      onSetDerivedPage={onSetDerivedPage}
      onNavigateToGeneration={onOpenExternalGeneration}
      currentMediaId={currentMediaId}
      currentShotId={currentShotId}
      replaceImages={replaceImages}
      onReplaceImagesChange={onReplaceImagesChange}
      onSwitchToPrimary={onSwitchToPrimary}
      taskId={taskId}
    />
  );
};

export default ControlsPanel;
