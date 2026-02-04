/**
 * useLightboxLayoutProps - Builds all layout props for MediaLightbox
 *
 * Centralizes the building of props objects for layout components
 * (DesktopSidePanelLayout, MobileStackedLayout, CenteredLayout).
 * This reduces duplication and keeps the main component cleaner.
 */

import React, { useMemo, RefObject, ReactNode } from 'react';
import type { GenerationRow } from '@/types/shots';
import type { GenerationVariant } from '@/shared/hooks/useVariants';
import type { VideoEnhanceSettings } from './useVideoEnhance';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { BrushStroke, AnnotationMode } from './inpainting/types';
import type { StrokeOverlayHandle } from '../components/StrokeOverlay';
import type { SegmentRegenerateFormProps } from '../components/SegmentRegenerateForm';
import type { PortionSelection } from '@/shared/components/VideoPortionTimeline';
import type { ImageTransform } from './useRepositionMode';
import type { EditAdvancedSettings } from './useGenerationEditSettings';
import type { SourceVariantData } from './useSourceGeneration';
import type { AdjacentSegmentsData, SegmentSlotModeData } from '../types';

// Input types - all the values needed to build layout props
export interface UseLightboxLayoutPropsInput {
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
  effectiveImageDimensions: { width: number; height: number } | null;

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
  videoEditSubMode: 'trim' | 'replace' | 'regenerate' | 'enhance' | null;
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
  isPendingUpscale?: boolean;
  hasUpscaledVersion?: boolean;

  // Edit mode
  isInpaintMode: boolean;
  isAnnotateMode: boolean;
  isSpecialEditMode: boolean;
  editMode: string;
  setEditMode: (mode: string) => void;
  setIsInpaintMode: (value: boolean) => void;
  brushStrokes: BrushStroke[];
  currentStroke: BrushStroke | null;
  isDrawing: boolean;
  isEraseMode: boolean;
  setIsEraseMode: (value: boolean) => void;
  brushSize: number;
  setBrushSize: (value: number) => void;
  annotationMode: string | null;
  setAnnotationMode: (mode: string | null) => void;
  selectedShapeId: string | null;
  handleKonvaPointerDown: (point: { x: number; y: number }, e: KonvaEventObject<PointerEvent>) => void;
  handleKonvaPointerMove: (point: { x: number; y: number }, e: KonvaEventObject<PointerEvent>) => void;
  handleKonvaPointerUp: (e: KonvaEventObject<PointerEvent>) => void;
  handleShapeClick: (strokeId: string, point: { x: number; y: number }) => void;
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
  canvasRef: RefObject<HTMLCanvasElement>;
  maskCanvasRef: RefObject<HTMLCanvasElement>;
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

export interface UseLightboxLayoutPropsReturn {
  controlsPanelProps: Record<string, unknown>;
  workflowBarProps: Record<string, unknown>;
  floatingToolProps: Record<string, unknown>;
  sidePanelLayoutProps: Record<string, unknown>;
  centeredLayoutProps: Record<string, unknown>;
}

export function useLightboxLayoutProps(
  input: UseLightboxLayoutPropsInput
): UseLightboxLayoutPropsReturn {
  // Build ControlsPanel props (used by DesktopSidePanelLayout and MobileStackedLayout)
  // SIGNIFICANTLY REDUCED after context migration - child components now read from context
  const controlsPanelProps = useMemo(() => ({
    // ========================================
    // VideoEditPanel specialized props
    // ========================================
    isCloudMode: input.isCloudMode,
    regenerateFormProps: input.regenerateFormProps,
    // Trim mode (specialized refs, handlers, save state)
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
    // Replace (portion) mode (specialized manager)
    videoEditing: input.videoEditing,
    projectId: input.selectedProjectId,
    // Enhance mode (specialized handlers)
    enhanceSettings: input.enhanceSettings,
    onUpdateEnhanceSetting: input.onUpdateEnhanceSetting,
    onEnhanceGenerate: input.onEnhanceGenerate,
    isEnhancing: input.isEnhancing,
    enhanceSuccess: input.enhanceSuccess,
    canEnhance: input.canEnhance,
    // Image upscale mode (cloud only)
    handleUpscale: input.handleUpscale,
    isUpscaling: input.isUpscaling,
    isPendingUpscale: input.isPendingUpscale,
    hasUpscaledVersion: input.hasUpscaledVersion,

    // ========================================
    // EditModePanel specialized props
    // ========================================
    sourceGenerationData: input.sourceGenerationData,
    onOpenExternalGeneration: input.onOpenExternalGeneration,
    allShots: input.allShots,
    isCurrentMediaPositioned: input.isAlreadyPositionedInSelectedShot,
    onReplaceInShot: input.handleReplaceInShot,
    sourcePrimaryVariant: input.sourcePrimaryVariant,
    onMakeMainVariant: input.handleMakeMainVariant,
    canMakeMainVariant: input.canMakeMainVariant,
    // Specialized async handlers
    handleUnifiedGenerate: input.handleUnifiedGenerate,
    handleGenerateAnnotatedEdit: input.handleGenerateAnnotatedEdit,
    handleGenerateReposition: input.handleGenerateReposition,
    handleSaveAsVariant: input.handleSaveAsVariant,
    handleGenerateImg2Img: input.handleGenerateImg2Img,
    // Specialized managers
    img2imgLoraManager: input.img2imgLoraManager,
    editLoraManager: input.editLoraManager,
    availableLoras: input.availableLoras,
    advancedSettings: input.advancedSettings,
    setAdvancedSettings: input.setAdvancedSettings,
    isLocalGeneration: input.isLocalGeneration,

    // ========================================
    // InfoPanel specialized props
    // ========================================
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

    // ========================================
    // Shared props
    // ========================================
    currentMediaId: input.media.id,
    currentShotId: input.selectedShotId || input.shotId,
    taskId: input.adjustedTaskDetailsData?.taskId || (input.media as unknown as Record<string, unknown>)?.source_task_id as string | null || null,
  }), [
    // VideoEditPanel deps
    input.isCloudMode, input.regenerateFormProps, input.trimState, input.setStartTrim,
    input.setEndTrim, input.resetTrim, input.trimmedDuration, input.hasTrimChanges,
    input.saveTrimmedVideo, input.isSavingTrim, input.trimSaveProgress, input.trimSaveError,
    input.trimSaveSuccess, input.effectiveVideoUrl, input.trimCurrentTime, input.trimVideoRef,
    input.videoEditing, input.selectedProjectId, input.enhanceSettings, input.onUpdateEnhanceSetting,
    input.onEnhanceGenerate, input.isEnhancing, input.enhanceSuccess, input.canEnhance,
    input.handleUpscale, input.isUpscaling, input.isPendingUpscale, input.hasUpscaledVersion,
    // EditModePanel deps
    input.sourceGenerationData, input.onOpenExternalGeneration, input.allShots,
    input.isAlreadyPositionedInSelectedShot, input.handleReplaceInShot, input.sourcePrimaryVariant,
    input.handleMakeMainVariant, input.canMakeMainVariant, input.handleUnifiedGenerate,
    input.handleGenerateAnnotatedEdit, input.handleGenerateReposition, input.handleSaveAsVariant,
    input.handleGenerateImg2Img, input.img2imgLoraManager, input.editLoraManager,
    input.availableLoras, input.advancedSettings, input.setAdvancedSettings, input.isLocalGeneration,
    // InfoPanel deps
    input.showImageEditTools, input.adjustedTaskDetailsData, input.derivedItems,
    input.derivedGenerations, input.paginatedDerived, input.derivedPage, input.derivedTotalPages,
    input.setDerivedPage, input.replaceImages, input.setReplaceImages, input.primaryVariant,
    input.setActiveVariantId,
    // Shared deps
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

  // Build floating tool props (for edit mode controls)
  // Now simplified - most state comes from ImageEditContext, only specialized handlers here
  const floatingToolProps = useMemo(() => ({
    // Specialized reposition handlers (not contextual state)
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

  // Build side panel layout props (for Desktop and Mobile stacked layouts)
  const sidePanelLayoutProps = useMemo(() => ({
    // Core
    onClose: input.onClose,
    readOnly: input.readOnly,
    selectedProjectId: input.selectedProjectId,
    isMobile: input.isMobile,
    actualGenerationId: input.actualGenerationId,
    // Media
    media: input.media,
    isVideo: input.isVideo,
    effectiveMediaUrl: input.effectiveMediaUrl,
    effectiveVideoUrl: input.effectiveVideoUrl,
    imageDimensions: input.imageDimensions,
    setImageDimensions: input.setImageDimensions,
    effectiveImageDimensions: input.effectiveImageDimensions,
    // Variants
    variants: input.variants,
    activeVariant: input.activeVariant,
    primaryVariant: input.primaryVariant,
    isLoadingVariants: input.isLoadingVariants,
    setActiveVariantId: input.setActiveVariantId,
    setPrimaryVariant: input.setPrimaryVariant,
    deleteVariant: input.deleteVariant,
    promoteSuccess: input.promoteSuccess,
    isPromoting: input.isPromoting,
    handlePromoteToGeneration: input.handlePromoteToGeneration,
    isMakingMainVariant: input.isMakingMainVariant,
    canMakeMainVariant: input.canMakeMainVariant,
    handleMakeMainVariant: input.handleMakeMainVariant,
    variantParamsToLoad: input.variantParamsToLoad,
    setVariantParamsToLoad: input.setVariantParamsToLoad,
    variantsSectionRef: input.variantsSectionRef,
    // Video edit
    isVideoTrimModeActive: input.isVideoTrimModeActive,
    isVideoEditModeActive: input.isVideoEditModeActive,
    videoEditSubMode: input.videoEditSubMode,
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
    currentStroke: input.currentStroke,
    isDrawing: input.isDrawing,
    isEraseMode: input.isEraseMode,
    setIsEraseMode: input.setIsEraseMode,
    brushSize: input.brushSize,
    setBrushSize: input.setBrushSize,
    annotationMode: input.annotationMode,
    setAnnotationMode: input.setAnnotationMode,
    selectedShapeId: input.selectedShapeId,
    handleKonvaPointerDown: input.handleKonvaPointerDown,
    handleKonvaPointerMove: input.handleKonvaPointerMove,
    handleKonvaPointerUp: input.handleKonvaPointerUp,
    handleShapeClick: input.handleShapeClick,
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
    canvasRef: input.canvasRef,
    maskCanvasRef: input.maskCanvasRef,
    isFlippedHorizontally: input.isFlippedHorizontally,
    isSaving: input.isSaving,
    // Navigation
    showNavigation: input.showNavigation,
    hasNext: input.hasNext,
    hasPrevious: input.hasPrevious,
    handleSlotNavNext: input.handleSlotNavNext,
    handleSlotNavPrev: input.handleSlotNavPrev,
    swipeNavigation: input.swipeNavigation,
    // Panel
    effectiveTasksPaneOpen: input.effectiveTasksPaneOpen,
    effectiveTasksPaneWidth: input.effectiveTasksPaneWidth,
    // Composed props
    buttonGroupProps: input.buttonGroupProps,
    workflowBarProps,
    floatingToolProps,
    controlsPanelProps,
    // Adjacent segment navigation
    adjacentSegments: input.adjacentSegments,
    // Segment slot mode (for constituent image navigation)
    segmentSlotMode: input.segmentSlotMode,
  }), [
    input.onClose, input.readOnly, input.selectedProjectId, input.isMobile,
    input.actualGenerationId, input.media, input.isVideo, input.effectiveMediaUrl,
    input.effectiveVideoUrl, input.imageDimensions, input.setImageDimensions,
    input.effectiveImageDimensions, input.variants, input.activeVariant, input.primaryVariant,
    input.isLoadingVariants, input.setActiveVariantId, input.setPrimaryVariant,
    input.deleteVariant, input.promoteSuccess, input.isPromoting, input.handlePromoteToGeneration,
    input.isMakingMainVariant, input.canMakeMainVariant, input.handleMakeMainVariant,
    input.variantParamsToLoad, input.setVariantParamsToLoad, input.variantsSectionRef,
    input.isVideoTrimModeActive, input.isVideoEditModeActive, input.videoEditSubMode,
    input.trimVideoRef, input.trimState, input.setVideoDuration, input.setTrimCurrentTime,
    input.videoEditing, input.isInpaintMode, input.isAnnotateMode, input.isSpecialEditMode,
    input.editMode, input.brushStrokes, input.currentStroke, input.isDrawing, input.isEraseMode,
    input.setIsEraseMode, input.brushSize, input.setBrushSize, input.annotationMode,
    input.setAnnotationMode, input.selectedShapeId, input.handleKonvaPointerDown,
    input.handleKonvaPointerMove, input.handleKonvaPointerUp, input.handleShapeClick,
    input.strokeOverlayRef, input.handleUndo, input.handleClearMask, input.getDeleteButtonPosition,
    input.handleToggleFreeForm, input.handleDeleteSelected, input.isRepositionDragging,
    input.repositionDragHandlers, input.getTransformStyle, input.imageContainerRef,
    input.canvasRef, input.maskCanvasRef, input.isFlippedHorizontally, input.isSaving,
    input.showNavigation, input.hasNext, input.hasPrevious, input.handleSlotNavNext,
    input.handleSlotNavPrev, input.swipeNavigation, input.effectiveTasksPaneOpen,
    input.effectiveTasksPaneWidth, input.buttonGroupProps, workflowBarProps,
    floatingToolProps, controlsPanelProps, input.adjacentSegments, input.segmentSlotMode,
  ]);

  // Build centered layout props (simpler, no controls panel)
  const centeredLayoutProps = useMemo(() => ({
    // Core
    onClose: input.onClose,
    readOnly: input.readOnly,
    selectedProjectId: input.selectedProjectId,
    isMobile: input.isMobile,
    actualGenerationId: input.actualGenerationId,
    // Media
    media: input.media,
    isVideo: input.isVideo,
    effectiveMediaUrl: input.effectiveMediaUrl,
    effectiveVideoUrl: input.effectiveVideoUrl,
    imageDimensions: input.imageDimensions,
    setImageDimensions: input.setImageDimensions,
    effectiveImageDimensions: input.effectiveImageDimensions,
    // Variants
    variants: input.variants,
    activeVariant: input.activeVariant,
    primaryVariant: input.primaryVariant,
    isLoadingVariants: input.isLoadingVariants,
    setActiveVariantId: input.setActiveVariantId,
    setPrimaryVariant: input.setPrimaryVariant,
    deleteVariant: input.deleteVariant,
    promoteSuccess: input.promoteSuccess,
    isPromoting: input.isPromoting,
    handlePromoteToGeneration: input.handlePromoteToGeneration,
    isMakingMainVariant: input.isMakingMainVariant,
    canMakeMainVariant: input.canMakeMainVariant,
    handleMakeMainVariant: input.handleMakeMainVariant,
    variantParamsToLoad: input.variantParamsToLoad,
    setVariantParamsToLoad: input.setVariantParamsToLoad,
    variantsSectionRef: input.variantsSectionRef,
    // Video edit (minimal for centered)
    isVideoTrimModeActive: input.isVideoTrimModeActive,
    isVideoEditModeActive: input.isVideoEditModeActive,
    videoEditSubMode: input.videoEditSubMode,
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
    currentStroke: input.currentStroke,
    isDrawing: input.isDrawing,
    isEraseMode: input.isEraseMode,
    setIsEraseMode: input.setIsEraseMode,
    brushSize: input.brushSize,
    setBrushSize: input.setBrushSize,
    annotationMode: input.annotationMode,
    setAnnotationMode: input.setAnnotationMode,
    selectedShapeId: input.selectedShapeId,
    handleKonvaPointerDown: input.handleKonvaPointerDown,
    handleKonvaPointerMove: input.handleKonvaPointerMove,
    handleKonvaPointerUp: input.handleKonvaPointerUp,
    handleShapeClick: input.handleShapeClick,
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
    canvasRef: input.canvasRef,
    maskCanvasRef: input.maskCanvasRef,
    isFlippedHorizontally: input.isFlippedHorizontally,
    isSaving: input.isSaving,
    // Navigation
    showNavigation: input.showNavigation,
    hasNext: input.hasNext,
    hasPrevious: input.hasPrevious,
    handleSlotNavNext: input.handleSlotNavNext,
    handleSlotNavPrev: input.handleSlotNavPrev,
    swipeNavigation: input.swipeNavigation,
    // Composed props
    buttonGroupProps: input.buttonGroupProps,
    workflowBarProps,
    // Workflow controls (below media)
    workflowControlsProps: {
      ...workflowBarProps,
      isDeleting: input.isDeleting,
      handleDelete: input.handleDelete,
    },
    // Adjacent segment navigation
    adjacentSegments: input.adjacentSegments,
    // Segment slot mode (for constituent image navigation)
    segmentSlotMode: input.segmentSlotMode,
  }), [
    input.onClose, input.readOnly, input.selectedProjectId, input.isMobile,
    input.actualGenerationId, input.media, input.isVideo, input.effectiveMediaUrl,
    input.effectiveVideoUrl, input.imageDimensions, input.setImageDimensions,
    input.effectiveImageDimensions, input.variants, input.activeVariant, input.primaryVariant,
    input.isLoadingVariants, input.setActiveVariantId, input.setPrimaryVariant,
    input.deleteVariant, input.promoteSuccess, input.isPromoting, input.handlePromoteToGeneration,
    input.isMakingMainVariant, input.canMakeMainVariant, input.handleMakeMainVariant,
    input.variantParamsToLoad, input.setVariantParamsToLoad, input.variantsSectionRef,
    input.isVideoTrimModeActive, input.isVideoEditModeActive, input.videoEditSubMode,
    input.trimVideoRef, input.trimState, input.setVideoDuration, input.setTrimCurrentTime,
    input.videoEditing, input.isInpaintMode, input.isAnnotateMode, input.isSpecialEditMode,
    input.editMode, input.brushStrokes, input.currentStroke, input.isDrawing, input.isEraseMode,
    input.setIsEraseMode, input.brushSize, input.setBrushSize, input.annotationMode,
    input.setAnnotationMode, input.selectedShapeId, input.handleKonvaPointerDown,
    input.handleKonvaPointerMove, input.handleKonvaPointerUp, input.handleShapeClick,
    input.strokeOverlayRef, input.handleUndo, input.handleClearMask, input.getDeleteButtonPosition,
    input.handleToggleFreeForm, input.handleDeleteSelected, input.isRepositionDragging,
    input.repositionDragHandlers, input.getTransformStyle, input.imageContainerRef,
    input.canvasRef, input.maskCanvasRef, input.isFlippedHorizontally, input.isSaving,
    input.showNavigation, input.hasNext, input.hasPrevious, input.handleSlotNavNext,
    input.handleSlotNavPrev, input.swipeNavigation, input.buttonGroupProps,
    workflowBarProps, input.isDeleting, input.handleDelete, input.adjacentSegments, input.segmentSlotMode,
  ]);

  return {
    controlsPanelProps,
    workflowBarProps,
    floatingToolProps,
    sidePanelLayoutProps,
    centeredLayoutProps,
  };
}
