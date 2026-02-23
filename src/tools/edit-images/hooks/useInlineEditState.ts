import {
  useRef,
  useState,
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import { GenerationRow } from '@/types/shots';
import { isVideoAny } from '@/shared/lib/typeGuards';
import { useIsMobile } from '@/shared/hooks/useMobile';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { usePublicLoras } from '@/shared/hooks/useResources';
import { TOOL_IDS } from '@/shared/lib/toolConstants';

import {
  useUpscale,
  useInpainting,
  useEditModeLoRAs,
  useSourceGeneration,
  useMagicEditMode,
  useStarToggle,
  useRepositionMode,
  useImg2ImgMode,
  useEditSettingsPersistence,
  useEditSettingsSync,
} from '@/shared/components/MediaLightbox/hooks';
import type { EditMode as SettingsEditMode } from '@/shared/components/MediaLightbox/hooks/editSettingsTypes';
import type { EditMode as InpaintingEditMode } from '@/shared/components/MediaLightbox/hooks/inpainting/types';
import type { ImageEditMode } from '@/shared/components/MediaLightbox/contexts/ImageEditContext';

import { downloadMedia } from '@/shared/components/MediaLightbox/utils';
import { useVariants } from '@/shared/hooks/useVariants';
import { useImageEditValue } from './useImageEditValue';

// ============================================================================
// useInlineEditState — all hook orchestration + persistence sync + memo
// ============================================================================

type InpaintingHookResult = ReturnType<typeof useInpainting>;
type MagicEditHookResult = ReturnType<typeof useMagicEditMode>;
type RepositionHookResult = ReturnType<typeof useRepositionMode>;
type Img2ImgHookResult = ReturnType<typeof useImg2ImgMode>;
type StarToggleHookResult = ReturnType<typeof useStarToggle>;
type SourceGenerationData = ReturnType<typeof useSourceGeneration>['sourceGenerationData'];
type PublicLorasData = ReturnType<typeof usePublicLoras>['data'];
type ImageEditValue = ReturnType<typeof useImageEditValue>;

function toInpaintingEditMode(
  mode: SettingsEditMode | ImageEditMode
): InpaintingEditMode {
  if (mode === 'text' || mode === 'inpaint' || mode === 'annotate') {
    return mode;
  }
  return 'text';
}

function resolveActualGenerationId(media: GenerationRow): string | null {
  const isShotGenerationRecord = media.shotImageEntryId === media.id ||
    media.shot_generation_id === media.id;
  return media.generation_id || (!isShotGenerationRecord ? media.id : null);
}

function useInlineEditEnvironment(media: GenerationRow) {
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [createAsGeneration, setCreateAsGeneration] = useState(false);

  const isMobile = useIsMobile();
  const { selectedProjectId } = useProject();
  const { value: generationMethods } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
  const isCloudMode = generationMethods.inCloud;
  const isVideo = isVideoAny(media);
  const actualGenerationId = resolveActualGenerationId(media);

  const { effectiveImageUrl, isUpscaling, handleUpscale } = useUpscale({
    media,
    selectedProjectId,
    isVideo,
  });

  const loraState = useEditModeLoRAs();

  return {
    displayCanvasRef,
    maskCanvasRef,
    imageContainerRef,
    imageDimensions,
    setImageDimensions,
    createAsGeneration,
    setCreateAsGeneration,
    isMobile,
    selectedProjectId,
    isCloudMode,
    isVideo,
    actualGenerationId,
    effectiveImageUrl,
    isUpscaling,
    handleUpscale,
    loraState,
  };
}

type InlineEditEnvironment = ReturnType<typeof useInlineEditEnvironment>;

function useInlineEditPersistence(actualGenerationId: string | null, projectId: string | null | undefined) {
  const editSettings = useEditSettingsPersistence({
    generationId: actualGenerationId,
    projectId: projectId ?? null,
  });

  const variants = useVariants({
    generationId: actualGenerationId,
    enabled: true,
  });

  return { editSettings, variants };
}

type InlineEditPersistence = ReturnType<typeof useInlineEditPersistence>;

function useInlineEditInpaintingAndMagic(
  media: GenerationRow,
  env: InlineEditEnvironment,
  persistence: InlineEditPersistence,
) {
  const handleExitInpaintModeRef = useRef<() => void>(() => {});

  const inpainting = useInpainting({
    media,
    selectedProjectId: env.selectedProjectId,
    isVideo: env.isVideo,
    imageDimensions: env.imageDimensions,
    imageContainerRef: env.imageContainerRef,
    handleExitInpaintMode: () => handleExitInpaintModeRef.current(),
    loras: env.loraState.editModeLoRAs,
    toolTypeOverride: TOOL_IDS.EDIT_IMAGES,
    activeVariantId: persistence.variants.activeVariant?.id,
    createAsGeneration: env.createAsGeneration,
    advancedSettings: persistence.editSettings.advancedSettings,
    qwenEditModel: persistence.editSettings.qwenEditModel,
  });

  const magic = useMagicEditMode({
    media,
    selectedProjectId: env.selectedProjectId,
    isVideo: env.isVideo,
    isInpaintMode: inpainting.isInpaintMode,
    setIsInpaintMode: (v: boolean) => inpainting.setIsInpaintMode(v),
    handleEnterInpaintMode: inpainting.handleEnterInpaintMode,
    handleGenerateInpaint: inpainting.handleGenerateInpaint,
    brushStrokes: inpainting.brushStrokes,
    inpaintPrompt: inpainting.inpaintPrompt,
    setInpaintPrompt: inpainting.setInpaintPrompt,
    inpaintNumGenerations: inpainting.inpaintNumGenerations,
    setInpaintNumGenerations: inpainting.setInpaintNumGenerations,
    editModeLoRAs: env.loraState.editModeLoRAs,
    sourceUrlForTasks: env.effectiveImageUrl,
    imageDimensions: env.imageDimensions,
    isInSceneBoostEnabled: env.loraState.isInSceneBoostEnabled,
    setIsInSceneBoostEnabled: env.loraState.setIsInSceneBoostEnabled,
    toolTypeOverride: TOOL_IDS.EDIT_IMAGES,
    createAsGeneration: env.createAsGeneration,
    autoEnterInpaint: false,
    advancedSettings: persistence.editSettings.advancedSettings,
    qwenEditModel: persistence.editSettings.qwenEditModel,
  });

  handleExitInpaintModeRef.current = () => {
    inpainting.setIsInpaintMode(false);
    magic.setIsMagicEditMode(false);
  };

  return { inpainting, magic };
}

function useInlineEditReposition(
  media: GenerationRow,
  env: InlineEditEnvironment,
  inpainting: InpaintingHookResult,
  magic: MagicEditHookResult,
  persistence: InlineEditPersistence,
) {
  return useRepositionMode({
    media,
    selectedProjectId: env.selectedProjectId,
    imageDimensions: env.imageDimensions,
    imageContainerRef: env.imageContainerRef,
    loras: env.loraState.editModeLoRAs,
    inpaintPrompt: inpainting.inpaintPrompt,
    inpaintNumGenerations: inpainting.inpaintNumGenerations,
    toolTypeOverride: TOOL_IDS.EDIT_IMAGES,
    onVariantCreated: persistence.variants.setActiveVariantId,
    refetchVariants: persistence.variants.refetch,
    createAsGeneration: env.createAsGeneration,
  });
}

function useInlineEditImg2Img(
  media: GenerationRow,
  env: InlineEditEnvironment,
  persistence: InlineEditPersistence,
  availableLoras: PublicLorasData,
) {
  return useImg2ImgMode({
    media,
    selectedProjectId: env.selectedProjectId,
    isVideo: env.isVideo,
    sourceUrlForTasks: env.effectiveImageUrl,
    toolTypeOverride: TOOL_IDS.EDIT_IMAGES,
    createAsGeneration: env.createAsGeneration,
    availableLoras,
    img2imgStrength: persistence.editSettings.img2imgStrength,
    setImg2imgStrength: persistence.editSettings.setImg2imgStrength,
    enablePromptExpansion: persistence.editSettings.img2imgEnablePromptExpansion,
    setEnablePromptExpansion: persistence.editSettings.setImg2imgEnablePromptExpansion,
    img2imgPrompt: persistence.editSettings.img2imgPrompt,
    setImg2imgPrompt: persistence.editSettings.setImg2imgPrompt,
    img2imgPromptHasBeenSet: persistence.editSettings.img2imgPromptHasBeenSet,
    numGenerations: persistence.editSettings.numGenerations,
  });
}

function useInlineEditSettingsSync(
  actualGenerationId: string | null,
  editSettings: InlineEditPersistence['editSettings'],
  inpainting: InpaintingHookResult,
) {
  useEditSettingsSync({
    actualGenerationId: actualGenerationId ?? undefined,
    isEditSettingsReady: editSettings.isReady,
    hasPersistedSettings: editSettings.hasPersistedSettings,
    persistedEditMode: editSettings.editMode,
    persistedNumGenerations: editSettings.numGenerations,
    persistedPrompt: editSettings.prompt,
    editMode: inpainting.editMode,
    inpaintNumGenerations: inpainting.inpaintNumGenerations,
    inpaintPrompt: inpainting.inpaintPrompt,
    setEditMode: (mode: SettingsEditMode) => inpainting.setEditMode(toInpaintingEditMode(mode)),
    setInpaintNumGenerations: inpainting.setInpaintNumGenerations,
    setInpaintPrompt: inpainting.setInpaintPrompt,
    setPersistedEditMode: editSettings.setEditMode,
    setPersistedNumGenerations: editSettings.setNumGenerations,
    setPersistedPrompt: editSettings.setPrompt,
  });
}

function buildImageEditValueParams(
  env: InlineEditEnvironment,
  editSettings: InlineEditPersistence['editSettings'],
  inpainting: InpaintingHookResult,
  magic: MagicEditHookResult,
  reposition: RepositionHookResult,
  img2img: Img2ImgHookResult,
) {
  return {
    isInpaintMode: inpainting.isInpaintMode,
    isSpecialEditMode: magic.isSpecialEditMode,
    editMode: inpainting.editMode,
    setIsInpaintMode: inpainting.setIsInpaintMode,
    setIsMagicEditMode: magic.setIsMagicEditMode,
    setEditMode: (mode: ImageEditMode) => inpainting.setEditMode(toInpaintingEditMode(mode)),
    handleEnterInpaintMode: inpainting.handleEnterInpaintMode,
    handleExitInpaintMode: () => inpainting.setIsInpaintMode(false),
    handleExitMagicEditMode: magic.handleExitMagicEditMode,
    handleEnterMagicEditMode: magic.handleEnterMagicEditMode,
    brushSize: inpainting.brushSize,
    setBrushSize: inpainting.setBrushSize,
    isEraseMode: inpainting.isEraseMode,
    setIsEraseMode: inpainting.setIsEraseMode,
    brushStrokes: inpainting.brushStrokes,
    isAnnotateMode: inpainting.isAnnotateMode,
    setIsAnnotateMode: inpainting.setIsAnnotateMode,
    annotationMode: inpainting.annotationMode,
    setAnnotationMode: inpainting.setAnnotationMode,
    selectedShapeId: inpainting.selectedShapeId,
    onStrokeComplete: inpainting.onStrokeComplete,
    onStrokesChange: inpainting.onStrokesChange,
    onSelectionChange: inpainting.onSelectionChange,
    onTextModeHint: inpainting.onTextModeHint,
    strokeOverlayRef: inpainting.strokeOverlayRef,
    getDeleteButtonPosition: inpainting.getDeleteButtonPosition,
    handleToggleFreeForm: inpainting.handleToggleFreeForm,
    handleDeleteSelected: inpainting.handleDeleteSelected,
    handleUndo: inpainting.handleUndo,
    handleClearMask: inpainting.handleClearMask,
    repositionTransform: reposition.transform,
    hasTransformChanges: reposition.hasTransformChanges,
    isRepositionDragging: reposition.isDragging,
    repositionDragHandlers: reposition.dragHandlers,
    getTransformStyle: () => (reposition.getTransformStyle().transform ?? '') as string,
    setScale: reposition.setScale,
    setRotation: reposition.setRotation,
    toggleFlipH: reposition.toggleFlipH,
    toggleFlipV: reposition.toggleFlipV,
    resetTransform: reposition.resetTransform,
    imageContainerRef: env.imageContainerRef,
    inpaintPanelPosition: magic.inpaintPanelPosition,
    setInpaintPanelPosition: magic.setInpaintPanelPosition,
    inpaintPrompt: inpainting.inpaintPrompt,
    setInpaintPrompt: inpainting.setInpaintPrompt,
    inpaintNumGenerations: inpainting.inpaintNumGenerations,
    setInpaintNumGenerations: inpainting.setInpaintNumGenerations,
    img2imgPrompt: img2img.img2imgPrompt,
    setImg2imgPrompt: img2img.setImg2imgPrompt,
    img2imgStrength: img2img.img2imgStrength,
    setImg2imgStrength: img2img.setImg2imgStrength,
    enablePromptExpansion: img2img.enablePromptExpansion,
    setEnablePromptExpansion: img2img.setEnablePromptExpansion,
    loraMode: env.loraState.loraMode,
    setLoraMode: env.loraState.setLoraMode,
    customLoraUrl: env.loraState.customLoraUrl,
    setCustomLoraUrl: env.loraState.setCustomLoraUrl,
    createAsGeneration: env.createAsGeneration,
    setCreateAsGeneration: env.setCreateAsGeneration,
    qwenEditModel: editSettings.qwenEditModel,
    setQwenEditModel: editSettings.setQwenEditModel,
    advancedSettings: editSettings.advancedSettings,
    setAdvancedSettings: (settings: typeof editSettings.advancedSettings) => {
      editSettings.setAdvancedSettings(settings);
    },
    isGeneratingInpaint: inpainting.isGeneratingInpaint,
    inpaintGenerateSuccess: inpainting.inpaintGenerateSuccess,
    isGeneratingImg2Img: img2img.isGeneratingImg2Img,
    img2imgGenerateSuccess: img2img.img2imgGenerateSuccess,
    isGeneratingReposition: reposition.isGeneratingReposition,
    repositionGenerateSuccess: reposition.repositionGenerateSuccess,
    isSavingAsVariant: reposition.isSavingAsVariant,
    saveAsVariantSuccess: reposition.saveAsVariantSuccess,
    isCreatingMagicEditTasks: magic.isCreatingMagicEditTasks,
    magicEditTasksCreated: magic.magicEditTasksCreated,
  };
}

export interface InlineEditStateResult {
  media: GenerationRow;
  canvasEnvironment: {
    isMobile: boolean;
    selectedProjectId: string | null | undefined;
    isCloudMode: boolean;
    isVideo: boolean;
    imageContainerRef: RefObject<HTMLDivElement>;
    effectiveImageUrl: string;
    imageDimensions: { width: number; height: number } | null;
    setImageDimensions: Dispatch<SetStateAction<{ width: number; height: number } | null>>;
    isUpscaling: boolean;
    handleUpscale: () => Promise<void>;
  };
  inpaintingState: {
    isInpaintMode: boolean;
    editMode: InpaintingHookResult['editMode'];
    brushStrokes: InpaintingHookResult['brushStrokes'];
    currentStroke: InpaintingHookResult['currentStroke'];
    isDrawing: boolean;
    isEraseMode: boolean;
    brushSize: number;
    annotationMode: InpaintingHookResult['annotationMode'];
    selectedShapeId: string | null;
    isAnnotateMode: boolean;
    handleKonvaPointerDown: InpaintingHookResult['handleKonvaPointerDown'];
    handleKonvaPointerMove: InpaintingHookResult['handleKonvaPointerMove'];
    handleKonvaPointerUp: InpaintingHookResult['handleKonvaPointerUp'];
    handleShapeClick: InpaintingHookResult['handleShapeClick'];
    strokeOverlayRef: InpaintingHookResult['strokeOverlayRef'];
    getDeleteButtonPosition: InpaintingHookResult['getDeleteButtonPosition'];
    handleToggleFreeForm: InpaintingHookResult['handleToggleFreeForm'];
    handleDeleteSelected: InpaintingHookResult['handleDeleteSelected'];
    handleUndo: InpaintingHookResult['handleUndo'];
    handleClearMask: InpaintingHookResult['handleClearMask'];
    setIsInpaintMode: InpaintingHookResult['setIsInpaintMode'];
    setEditMode: InpaintingHookResult['setEditMode'];
    setBrushSize: InpaintingHookResult['setBrushSize'];
    setIsEraseMode: InpaintingHookResult['setIsEraseMode'];
    setAnnotationMode: InpaintingHookResult['setAnnotationMode'];
    isSpecialEditMode: boolean;
    handleEnterMagicEditMode: MagicEditHookResult['handleEnterMagicEditMode'];
  };
  transformState: {
    repositionTransform: RepositionHookResult['transform'];
    setScale: RepositionHookResult['setScale'];
    setRotation: RepositionHookResult['setRotation'];
    toggleFlipH: RepositionHookResult['toggleFlipH'];
    toggleFlipV: RepositionHookResult['toggleFlipV'];
    resetTransform: RepositionHookResult['resetTransform'];
    getTransformStyle: RepositionHookResult['getTransformStyle'];
  };
  generationState: {
    localStarred: StarToggleHookResult['localStarred'];
    toggleStarMutation: StarToggleHookResult['toggleStarMutation'];
    handleToggleStar: StarToggleHookResult['handleToggleStar'];
    handleDownload: () => Promise<void>;
    handleUnifiedGenerate: MagicEditHookResult['handleUnifiedGenerate'];
    handleGenerateAnnotatedEdit: InpaintingHookResult['handleGenerateAnnotatedEdit'];
    handleGenerateReposition: RepositionHookResult['handleGenerateReposition'];
    handleSaveAsVariant: RepositionHookResult['handleSaveAsVariant'];
    handleGenerateImg2Img: Img2ImgHookResult['handleGenerateImg2Img'];
    img2imgLoraManager: Img2ImgHookResult['loraManager'];
  };
  sourceGenerationData: SourceGenerationData;
  availableLoras: PublicLorasData;
  imageEditValue: ImageEditValue;
}

export function useInlineEditState(
  media: GenerationRow,
  onNavigateToGeneration?: (generationId: string) => Promise<void>,
): InlineEditStateResult {
  const env = useInlineEditEnvironment(media);
  const persistence = useInlineEditPersistence(env.actualGenerationId, env.selectedProjectId);
  const { data: availableLoras } = usePublicLoras();
  const { inpainting, magic } = useInlineEditInpaintingAndMagic(media, env, persistence);
  const reposition = useInlineEditReposition(media, env, inpainting, magic, persistence);
  const img2img = useInlineEditImg2Img(media, env, persistence, availableLoras);

  useInlineEditSettingsSync(env.actualGenerationId, persistence.editSettings, inpainting);

  const { sourceGenerationData } = useSourceGeneration({
    media,
    onOpenExternalGeneration: onNavigateToGeneration
      ? async (id) => onNavigateToGeneration(id)
      : undefined,
  });

  const starToggle = useStarToggle({ media });
  const { isSpecialEditMode, handleEnterMagicEditMode } = magic;

  const handleDownload = async () => {
    await downloadMedia(env.effectiveImageUrl, media.id, env.isVideo, media.contentType);
  };

  useEffect(() => {
    if (!isSpecialEditMode) {
      handleEnterMagicEditMode();
    }
  }, [isSpecialEditMode, handleEnterMagicEditMode]);

  const imageEditValue = useImageEditValue(
    buildImageEditValueParams(env, persistence.editSettings, inpainting, magic, reposition, img2img)
  );

  return {
    media,
    canvasEnvironment: {
      isMobile: env.isMobile,
      selectedProjectId: env.selectedProjectId,
      isCloudMode: env.isCloudMode,
      isVideo: env.isVideo,
      imageContainerRef: env.imageContainerRef,
      effectiveImageUrl: env.effectiveImageUrl,
      imageDimensions: env.imageDimensions,
      setImageDimensions: env.setImageDimensions,
      isUpscaling: env.isUpscaling,
      handleUpscale: env.handleUpscale,
    },
    inpaintingState: {
      isInpaintMode: inpainting.isInpaintMode,
      editMode: inpainting.editMode,
      brushStrokes: inpainting.brushStrokes,
      currentStroke: inpainting.currentStroke,
      isDrawing: inpainting.isDrawing,
      isEraseMode: inpainting.isEraseMode,
      brushSize: inpainting.brushSize,
      annotationMode: inpainting.annotationMode,
      selectedShapeId: inpainting.selectedShapeId,
      isAnnotateMode: inpainting.isAnnotateMode,
      handleKonvaPointerDown: inpainting.handleKonvaPointerDown,
      handleKonvaPointerMove: inpainting.handleKonvaPointerMove,
      handleKonvaPointerUp: inpainting.handleKonvaPointerUp,
      handleShapeClick: inpainting.handleShapeClick,
      strokeOverlayRef: inpainting.strokeOverlayRef,
      getDeleteButtonPosition: inpainting.getDeleteButtonPosition,
      handleToggleFreeForm: inpainting.handleToggleFreeForm,
      handleDeleteSelected: inpainting.handleDeleteSelected,
      handleUndo: inpainting.handleUndo,
      handleClearMask: inpainting.handleClearMask,
      setIsInpaintMode: inpainting.setIsInpaintMode,
      setEditMode: inpainting.setEditMode,
      setBrushSize: inpainting.setBrushSize,
      setIsEraseMode: inpainting.setIsEraseMode,
      setAnnotationMode: inpainting.setAnnotationMode,
      isSpecialEditMode: magic.isSpecialEditMode,
      handleEnterMagicEditMode: magic.handleEnterMagicEditMode,
    },
    transformState: {
      repositionTransform: reposition.transform,
      setScale: reposition.setScale,
      setRotation: reposition.setRotation,
      toggleFlipH: reposition.toggleFlipH,
      toggleFlipV: reposition.toggleFlipV,
      resetTransform: reposition.resetTransform,
      getTransformStyle: reposition.getTransformStyle,
    },
    generationState: {
      localStarred: starToggle.localStarred,
      toggleStarMutation: starToggle.toggleStarMutation,
      handleToggleStar: starToggle.handleToggleStar,
      handleDownload,
      handleUnifiedGenerate: magic.handleUnifiedGenerate,
      handleGenerateAnnotatedEdit: inpainting.handleGenerateAnnotatedEdit,
      handleGenerateReposition: reposition.handleGenerateReposition,
      handleSaveAsVariant: reposition.handleSaveAsVariant,
      handleGenerateImg2Img: img2img.handleGenerateImg2Img,
      img2imgLoraManager: img2img.loraManager,
    },
    sourceGenerationData,
    availableLoras,
    imageEditValue,
  } satisfies InlineEditStateResult;
}
