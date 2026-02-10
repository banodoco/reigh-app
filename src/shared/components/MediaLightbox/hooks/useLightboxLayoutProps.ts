/**
 * useLightboxLayoutProps - Builds layout props for the unified LightboxLayout
 *
 * Centralizes the building of props for LightboxLayout.
 * Outputs a single `layoutProps` object with `showPanel` included.
 */

import React, { useMemo, RefObject, ReactNode } from 'react';
import type { GenerationRow } from '@/types/shots';
import type { GenerationVariant } from '@/shared/hooks/useVariants';
import type { VideoEnhanceSettings } from './useVideoEnhance';
import type { BrushStroke, AnnotationMode } from './inpainting/types';
import type { StrokeOverlayHandle } from '../components/StrokeOverlay';
import type { SegmentRegenerateFormProps } from '../components/SegmentRegenerateForm';
import type { PortionSelection } from '@/shared/components/VideoPortionTimeline';
import type { ImageTransform } from './useRepositionMode';
import type { EditAdvancedSettings } from './useGenerationEditSettings';
import type { SourceVariantData } from './useSourceGeneration';
import type { AdjacentSegmentsData, SegmentSlotModeData } from '../types';
import type { LightboxLayoutProps } from '../components/layouts/types';

// Input types - all the values needed to build layout props
interface UseLightboxLayoutPropsInput {
  // Core
  onClose: () => void;
  readOnly: boolean;
  selectedProjectId: string | null;
  isMobile: boolean;
  actualGenerationId: string;

  // Media
  media: GenerationRow;
  isVideo: boolean;
  effectiveMediaUrl: string;
  effectiveVideoUrl: string;
  imageDimensions: { width: number; height: number } | null;
  setImageDimensions: (dims: { width: number; height: number }) => void;

  // Variants
  variants: GenerationVariant[] | undefined;
  activeVariant: GenerationVariant | null;
  primaryVariant: GenerationVariant | null;
  isLoadingVariants: boolean;
  setActiveVariantId: (id: string) => void;
  setPrimaryVariant: (id: string) => void;
  deleteVariant: (id: string) => void;
  promoteSuccess: boolean;
  isPromoting: boolean;
  handlePromoteToGeneration: (variantId: string) => Promise<void>;
  isMakingMainVariant: boolean;
  canMakeMainVariant: boolean;
  handleMakeMainVariant: () => Promise<void>;
  variantParamsToLoad: Record<string, unknown> | null;
  setVariantParamsToLoad: (params: Record<string, unknown> | null) => void;
  variantsSectionRef: RefObject<HTMLDivElement>;

  // Video edit
  isVideoTrimModeActive: boolean;
  isVideoEditModeActive: boolean;
  isInVideoEditMode: boolean;
  trimVideoRef: RefObject<HTMLVideoElement>;
  trimState: {
    videoDuration: number;
    startTime: number;
    endTime: number;
    setStartTime: (time: number) => void;
    setEndTime: (time: number) => void;
  };
  setStartTrim: (value: number) => void;
  setEndTrim: (value: number) => void;
  resetTrim: () => void;
  trimmedDuration: number;
  hasTrimChanges: boolean;
  saveTrimmedVideo: () => Promise<void>;
  isSavingTrim: boolean;
  trimSaveProgress: number;
  trimSaveError: string | null;
  trimSaveSuccess: boolean;
  setVideoDuration: (duration: number) => void;
  setTrimCurrentTime: (time: number) => void;
  trimCurrentTime: number;
  videoEditing: {
    videoRef: RefObject<HTMLVideoElement>;
    selections: PortionSelection[];
    activeSelectionId: string | null;
    handleUpdateSelection: (id: string, start: number, end: number) => void;
    setActiveSelectionId: (id: string | null) => void;
    handleRemoveSelection: (id: string) => void;
    handleAddSelection: () => void;
  } | null;
  handleEnterVideoTrimMode: () => void;
  handleEnterVideoReplaceMode: () => void;
  handleEnterVideoRegenerateMode: () => void;
  handleEnterVideoEnhanceMode: () => void;
  handleExitVideoEditMode: () => void;
  handleEnterVideoEditMode: () => void;
  regenerateFormProps: SegmentRegenerateFormProps | null;
  // Video enhance
  isCloudMode: boolean;
  enhanceSettings: VideoEnhanceSettings;
  onUpdateEnhanceSetting: <K extends keyof VideoEnhanceSettings>(key: K, value: VideoEnhanceSettings[K]) => void;
  onEnhanceGenerate: () => void;
  isEnhancing: boolean;
  enhanceSuccess: boolean;
  canEnhance: boolean;
  // Image upscale (cloud mode only)
  handleUpscale?: () => Promise<void>;
  isUpscaling?: boolean;
  upscaleSuccess?: boolean;

  // Edit mode
  isInpaintMode: boolean;
  isAnnotateMode: boolean;
  isSpecialEditMode: boolean;
  editMode: string;
  setEditMode: (mode: string) => void;
  setIsInpaintMode: (value: boolean) => void;
  brushStrokes: BrushStroke[];
  isEraseMode: boolean;
  setIsEraseMode: (value: boolean) => void;
  brushSize: number;
  setBrushSize: (value: number) => void;
  annotationMode: string | null;
  setAnnotationMode: (mode: string | null) => void;
  selectedShapeId: string | null;
  onStrokeComplete: (stroke: BrushStroke) => void;
  onStrokesChange: (strokes: BrushStroke[]) => void;
  onSelectionChange: (shapeId: string | null) => void;
  onTextModeHint: () => void;
  strokeOverlayRef: RefObject<StrokeOverlayHandle>;
  handleUndo: () => void;
  handleClearMask: () => void;
  getDeleteButtonPosition: () => { x: number; y: number } | null;
  handleToggleFreeForm: () => void;
  handleDeleteSelected: () => void;
  isRepositionDragging: boolean;
  repositionDragHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
    onWheel: (e: React.WheelEvent) => void;
  } | null;
  getTransformStyle: () => string;
  repositionTransform: ImageTransform;
  setTranslateX: (value: number) => void;
  setTranslateY: (value: number) => void;
  setScale: (value: number) => void;
  setRotation: (value: number) => void;
  toggleFlipH: () => void;
  toggleFlipV: () => void;
  resetTransform: () => void;
  imageContainerRef: RefObject<HTMLDivElement>;
  isFlippedHorizontally: boolean;
  isSaving: boolean;
  handleExitInpaintMode: () => void;
  inpaintPanelPosition: string;
  setInpaintPanelPosition: (position: string) => void;

  // Edit form props
  inpaintPrompt: string;
  setInpaintPrompt: (value: string) => void;
  inpaintNumGenerations: number;
  setInpaintNumGenerations: (value: number) => void;
  loraMode: string;
  setLoraMode: (mode: string) => void;
  customLoraUrl: string;
  setCustomLoraUrl: (url: string) => void;
  isGeneratingInpaint: boolean;
  inpaintGenerateSuccess: boolean;
  isCreatingMagicEditTasks: boolean;
  magicEditTasksCreated: boolean;
  handleExitMagicEditMode: () => void;
  handleUnifiedGenerate: () => Promise<void>;
  handleGenerateAnnotatedEdit: () => Promise<void>;
  handleGenerateReposition: () => Promise<void>;
  isGeneratingReposition: boolean;
  repositionGenerateSuccess: boolean;
  hasTransformChanges: boolean;
  handleSaveAsVariant: () => Promise<void>;
  isSavingAsVariant: boolean;
  saveAsVariantSuccess: boolean;
  createAsGeneration: boolean;
  setCreateAsGeneration: (value: boolean) => void;

  // Img2Img props
  img2imgPrompt: string;
  setImg2imgPrompt: (value: string) => void;
  img2imgStrength: number;
  setImg2imgStrength: (value: number) => void;
  enablePromptExpansion: boolean;
  setEnablePromptExpansion: (value: boolean) => void;
  isGeneratingImg2Img: boolean;
  img2imgGenerateSuccess: boolean;
  handleGenerateImg2Img: () => Promise<void>;
  img2imgLoraManager: Record<string, unknown>;
  availableLoras: Array<{ id: string; name: string; [key: string]: unknown }>;
  editLoraManager: Record<string, unknown>;
  advancedSettings: EditAdvancedSettings;
  setAdvancedSettings: (settings: Partial<EditAdvancedSettings>) => void;
  isLocalGeneration: boolean;
  qwenEditModel: string;
  setQwenEditModel: (model: string) => void;

  // Info panel props
  showImageEditTools: boolean;
  adjustedTaskDetailsData: { taskId?: string | null; [key: string]: unknown } | null;
  generationName: string;
  handleGenerationNameChange: (name: string) => void;
  isEditingGenerationName: boolean;
  setIsEditingGenerationName: (value: boolean) => void;
  derivedItems: GenerationRow[];
  derivedGenerations: GenerationRow[];
  paginatedDerived: GenerationRow[];
  derivedPage: number;
  derivedTotalPages: number;
  setDerivedPage: (page: number) => void;
  replaceImages: boolean;
  setReplaceImages: (value: boolean) => void;
  sourceGenerationData: GenerationRow | null;
  sourcePrimaryVariant: SourceVariantData | null;
  onOpenExternalGeneration?: (id: string, derivedContext?: string[]) => Promise<void>;

  // Navigation
  showNavigation: boolean;
  hasNext: boolean;
  hasPrevious: boolean;
  handleSlotNavNext: () => void;
  handleSlotNavPrev: () => void;
  swipeNavigation: {
    swipeHandlers: Record<string, unknown>;
    isSwiping: boolean;
    swipeOffset: number;
  };

  // Panel
  effectiveTasksPaneOpen: boolean;
  effectiveTasksPaneWidth: number;

  // showPanel - whether the controls panel should render
  showPanel: boolean;
  // shouldShowSidePanel - true when panel should be side-by-side (tablet+ landscape)
  shouldShowSidePanel: boolean;

  // Button group props (pre-built)
  buttonGroupProps: {
    topLeft: ReactNode;
    topRight: ReactNode;
    bottomLeft: ReactNode;
    bottomRight: ReactNode;
  };

  // Workflow props
  allShots: Array<{ id: string; name: string }>;
  selectedShotId?: string;
  shotId?: string;
  onAddToShot?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onDelete?: (id: string) => void;
  onApplySettings?: (metadata: Record<string, unknown>) => void;
  onShotChange?: (shotId: string) => void;
  onCreateShot?: (shotName: string, files: File[]) => Promise<{ shotId?: string; shotName?: string } | void>;
  showTickForImageId?: string | null;
  showTickForSecondaryImageId?: string | null;
  onShowTick?: (imageId: string) => void;
  onShowSecondaryTick?: (imageId: string) => void;
  onOptimisticPositioned?: (mediaId: string, shotId: string) => void;
  onOptimisticUnpositioned?: (mediaId: string, shotId: string) => void;
  isAlreadyPositionedInSelectedShot: boolean;
  isAlreadyAssociatedWithoutPosition: boolean;
  contentRef: RefObject<HTMLDivElement>;
  handleApplySettings: () => void;
  handleNavigateToShotFromSelector: (shot: { id: string; name: string }) => void;
  handleAddVariantAsNewGenerationToShot: (shotId: string, variantId: string, currentTimelineFrame?: number) => Promise<boolean>;
  handleReplaceInShot: () => Promise<void>;
  isDeleting?: string | null;
  handleDelete: () => void;

  // Adjacent segment navigation
  adjacentSegments?: AdjacentSegmentsData;

  // Segment slot mode (for constituent image navigation)
  segmentSlotMode?: SegmentSlotModeData;
}

interface UseLightboxLayoutPropsReturn {
  layoutProps: LightboxLayoutProps;
}

export function useLightboxLayoutProps(
  input: UseLightboxLayoutPropsInput
): UseLightboxLayoutPropsReturn {
  // Build ControlsPanel props (only used when showPanel=true)
  const controlsPanelProps = useMemo(() => ({
    // VideoEditPanel specialized props
    isCloudMode: input.isCloudMode,
    regenerateFormProps: input.regenerateFormProps,
    trimState: input.trimState,
    onStartTrimChange: input.setStartTrim,
    onEndTrimChange: input.setEndTrim,
    onResetTrim: input.resetTrim,
    trimmedDuration: input.trimmedDuration,
    hasTrimChanges: input.hasTrimChanges,
    onSaveTrim: input.saveTrimmedVideo,
    isSavingTrim: input.isSavingTrim,
    trimSaveProgress: input.trimSaveProgress,
    trimSaveError: input.trimSaveError,
    trimSaveSuccess: input.trimSaveSuccess,
    videoUrl: input.effectiveVideoUrl,
    trimCurrentTime: input.trimCurrentTime,
    trimVideoRef: input.trimVideoRef,
    videoEditing: input.videoEditing,
    projectId: input.selectedProjectId,
    enhanceSettings: input.enhanceSettings,
    onUpdateEnhanceSetting: input.onUpdateEnhanceSetting,
    onEnhanceGenerate: input.onEnhanceGenerate,
    isEnhancing: input.isEnhancing,
    enhanceSuccess: input.enhanceSuccess,
    canEnhance: input.canEnhance,
    handleUpscale: input.handleUpscale,
    isUpscaling: input.isUpscaling,
    upscaleSuccess: input.upscaleSuccess,
    // EditModePanel specialized props
    sourceGenerationData: input.sourceGenerationData,
    onOpenExternalGeneration: input.onOpenExternalGeneration,
    allShots: input.allShots,
    isCurrentMediaPositioned: input.isAlreadyPositionedInSelectedShot,
    onReplaceInShot: input.handleReplaceInShot,
    sourcePrimaryVariant: input.sourcePrimaryVariant,
    onMakeMainVariant: input.handleMakeMainVariant,
    canMakeMainVariant: input.canMakeMainVariant,
    handleUnifiedGenerate: input.handleUnifiedGenerate,
    handleGenerateAnnotatedEdit: input.handleGenerateAnnotatedEdit,
    handleGenerateReposition: input.handleGenerateReposition,
    handleSaveAsVariant: input.handleSaveAsVariant,
    handleGenerateImg2Img: input.handleGenerateImg2Img,
    img2imgLoraManager: input.img2imgLoraManager,
    editLoraManager: input.editLoraManager,
    availableLoras: input.availableLoras,
    advancedSettings: input.advancedSettings,
    setAdvancedSettings: input.setAdvancedSettings,
    isLocalGeneration: input.isLocalGeneration,
    // InfoPanel specialized props
    showImageEditTools: input.showImageEditTools,
    taskDetailsData: input.adjustedTaskDetailsData,
    derivedItems: input.derivedItems,
    derivedGenerations: input.derivedGenerations,
    paginatedDerived: input.paginatedDerived,
    derivedPage: input.derivedPage,
    derivedTotalPages: input.derivedTotalPages,
    onSetDerivedPage: input.setDerivedPage,
    replaceImages: input.replaceImages,
    onReplaceImagesChange: input.setReplaceImages,
    onSwitchToPrimary: input.primaryVariant ? () => input.setActiveVariantId(input.primaryVariant.id) : undefined,
    // Shared props
    currentMediaId: input.media.id,
    currentShotId: input.selectedShotId || input.shotId,
    taskId: input.adjustedTaskDetailsData?.taskId || (input.media as unknown as Record<string, unknown>)?.source_task_id as string | null || null,
  }), [
    input.isCloudMode, input.regenerateFormProps, input.trimState, input.setStartTrim,
    input.setEndTrim, input.resetTrim, input.trimmedDuration, input.hasTrimChanges,
    input.saveTrimmedVideo, input.isSavingTrim, input.trimSaveProgress, input.trimSaveError,
    input.trimSaveSuccess, input.effectiveVideoUrl, input.trimCurrentTime, input.trimVideoRef,
    input.videoEditing, input.selectedProjectId, input.enhanceSettings, input.onUpdateEnhanceSetting,
    input.onEnhanceGenerate, input.isEnhancing, input.enhanceSuccess, input.canEnhance,
    input.handleUpscale, input.isUpscaling, input.upscaleSuccess,
    input.sourceGenerationData, input.onOpenExternalGeneration, input.allShots,
    input.isAlreadyPositionedInSelectedShot, input.handleReplaceInShot, input.sourcePrimaryVariant,
    input.handleMakeMainVariant, input.canMakeMainVariant, input.handleUnifiedGenerate,
    input.handleGenerateAnnotatedEdit, input.handleGenerateReposition, input.handleSaveAsVariant,
    input.handleGenerateImg2Img, input.img2imgLoraManager, input.editLoraManager,
    input.availableLoras, input.advancedSettings, input.setAdvancedSettings, input.isLocalGeneration,
    input.showImageEditTools, input.adjustedTaskDetailsData, input.derivedItems,
    input.derivedGenerations, input.paginatedDerived, input.derivedPage, input.derivedTotalPages,
    input.setDerivedPage, input.replaceImages, input.setReplaceImages, input.primaryVariant,
    input.setActiveVariantId,
    input.media.id, input.selectedShotId, input.shotId,
  ]);

  // Build workflow bar props (shared across all layouts)
  const workflowBarProps = useMemo(() => ({
    onAddToShot: input.onAddToShot,
    onDelete: input.onDelete,
    onApplySettings: input.onApplySettings,
    allShots: input.allShots,
    selectedShotId: input.selectedShotId,
    onShotChange: input.onShotChange,
    onCreateShot: input.onCreateShot,
    isAlreadyPositionedInSelectedShot: input.isAlreadyPositionedInSelectedShot,
    isAlreadyAssociatedWithoutPosition: input.isAlreadyAssociatedWithoutPosition,
    showTickForImageId: input.showTickForImageId,
    showTickForSecondaryImageId: input.showTickForSecondaryImageId,
    onAddToShotWithoutPosition: input.onAddToShotWithoutPosition,
    onShowTick: input.onShowTick,
    onShowSecondaryTick: input.onShowSecondaryTick,
    onOptimisticPositioned: input.onOptimisticPositioned,
    onOptimisticUnpositioned: input.onOptimisticUnpositioned,
    contentRef: input.contentRef,
    handleApplySettings: input.handleApplySettings,
    handleNavigateToShotFromSelector: input.handleNavigateToShotFromSelector,
    handleAddVariantAsNewGenerationToShot: input.handleAddVariantAsNewGenerationToShot,
  }), [
    input.onAddToShot, input.onDelete, input.onApplySettings, input.allShots,
    input.selectedShotId, input.onShotChange, input.onCreateShot,
    input.isAlreadyPositionedInSelectedShot, input.isAlreadyAssociatedWithoutPosition,
    input.showTickForImageId, input.showTickForSecondaryImageId,
    input.onAddToShotWithoutPosition, input.onShowTick, input.onShowSecondaryTick,
    input.onOptimisticPositioned, input.onOptimisticUnpositioned, input.contentRef,
    input.handleApplySettings, input.handleNavigateToShotFromSelector,
    input.handleAddVariantAsNewGenerationToShot,
  ]);

  // Build floating tool props (for edit mode controls, panel layouts only)
  const floatingToolProps = useMemo(() => ({
    repositionTransform: input.repositionTransform,
    onRepositionScaleChange: input.setScale,
    onRepositionRotationChange: input.setRotation,
    onRepositionFlipH: input.toggleFlipH,
    onRepositionFlipV: input.toggleFlipV,
    onRepositionReset: input.resetTransform,
  }), [
    input.repositionTransform, input.setScale, input.setRotation,
    input.toggleFlipH, input.toggleFlipV, input.resetTransform,
  ]);

  // Build workflow controls props (below-media, centered layout only)
  const workflowControlsProps = useMemo(() => ({
    ...workflowBarProps,
    isDeleting: input.isDeleting,
    handleDelete: input.handleDelete,
  }), [workflowBarProps, input.isDeleting, input.handleDelete]);

  // Build unified layout props
  const layoutProps: LightboxLayoutProps = useMemo(() => ({
    showPanel: input.showPanel,
    shouldShowSidePanel: input.shouldShowSidePanel,
    // Video edit
    isVideoTrimModeActive: input.isVideoTrimModeActive,
    isVideoEditModeActive: input.isVideoEditModeActive,
    trimVideoRef: input.trimVideoRef,
    trimState: input.trimState,
    setVideoDuration: input.setVideoDuration,
    setTrimCurrentTime: input.setTrimCurrentTime,
    videoEditing: input.videoEditing,
    // Edit mode
    isInpaintMode: input.isInpaintMode,
    isAnnotateMode: input.isAnnotateMode,
    isSpecialEditMode: input.isSpecialEditMode,
    editMode: input.editMode,
    brushStrokes: input.brushStrokes,
    isEraseMode: input.isEraseMode,
    setIsEraseMode: input.setIsEraseMode,
    brushSize: input.brushSize,
    setBrushSize: input.setBrushSize,
    annotationMode: input.annotationMode,
    setAnnotationMode: input.setAnnotationMode,
    selectedShapeId: input.selectedShapeId,
    onStrokeComplete: input.onStrokeComplete,
    onStrokesChange: input.onStrokesChange,
    onSelectionChange: input.onSelectionChange,
    onTextModeHint: input.onTextModeHint,
    strokeOverlayRef: input.strokeOverlayRef,
    handleUndo: input.handleUndo,
    handleClearMask: input.handleClearMask,
    getDeleteButtonPosition: input.getDeleteButtonPosition,
    handleToggleFreeForm: input.handleToggleFreeForm,
    handleDeleteSelected: input.handleDeleteSelected,
    isRepositionDragging: input.isRepositionDragging,
    repositionDragHandlers: input.repositionDragHandlers,
    getTransformStyle: input.getTransformStyle,
    imageContainerRef: input.imageContainerRef,
    isFlippedHorizontally: input.isFlippedHorizontally,
    isSaving: input.isSaving,
    // Panel
    effectiveTasksPaneOpen: input.effectiveTasksPaneOpen,
    effectiveTasksPaneWidth: input.effectiveTasksPaneWidth,
    // Reposition rotation (for corner handles)
    onRepositionRotationChange: input.setRotation,
    repositionRotation: input.repositionTransform?.rotation ?? 0,
    // Reposition scale (for +/- zoom buttons on image)
    onRepositionScaleChange: input.setScale,
    repositionScale: input.repositionTransform?.scale ?? 1,
    // Composed props
    buttonGroupProps: input.buttonGroupProps,
    workflowBarProps,
    floatingToolProps: input.showPanel ? floatingToolProps : undefined,
    controlsPanelProps: input.showPanel ? controlsPanelProps : undefined,
    workflowControlsProps: input.showPanel ? undefined : workflowControlsProps,
    // Navigation
    adjacentSegments: input.adjacentSegments,
    segmentSlotMode: input.segmentSlotMode,
  }), [
    input.showPanel, input.shouldShowSidePanel,
    input.isVideoTrimModeActive, input.isVideoEditModeActive,
    input.trimVideoRef, input.trimState, input.setVideoDuration, input.setTrimCurrentTime,
    input.videoEditing, input.isInpaintMode, input.isAnnotateMode, input.isSpecialEditMode,
    input.editMode, input.brushStrokes, input.isEraseMode,
    input.setIsEraseMode, input.brushSize, input.setBrushSize, input.annotationMode,
    input.setAnnotationMode, input.selectedShapeId, input.onStrokeComplete,
    input.onStrokesChange, input.onSelectionChange, input.onTextModeHint,
    input.strokeOverlayRef, input.handleUndo, input.handleClearMask, input.getDeleteButtonPosition,
    input.handleToggleFreeForm, input.handleDeleteSelected, input.isRepositionDragging,
    input.repositionDragHandlers, input.getTransformStyle, input.imageContainerRef,
    input.isFlippedHorizontally, input.isSaving,
    input.effectiveTasksPaneOpen, input.effectiveTasksPaneWidth,
    input.setRotation, input.repositionTransform,
    input.buttonGroupProps, workflowBarProps, floatingToolProps, controlsPanelProps,
    workflowControlsProps, input.adjacentSegments, input.segmentSlotMode,
  ]);

  return { layoutProps };
}
