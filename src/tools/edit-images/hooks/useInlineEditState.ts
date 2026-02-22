import {
  useRef,
  useState,
  useEffect,
} from 'react';
import { GenerationRow } from '@/types/shots';
import { isVideoAny } from '@/shared/lib/typeGuards';
import { useIsMobile } from '@/shared/hooks/use-mobile';
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
  const inpainting = useInpainting({
    media,
    selectedProjectId: env.selectedProjectId,
    isVideo: env.isVideo,
    imageDimensions: env.imageDimensions,
    imageContainerRef: env.imageContainerRef,
    handleExitInpaintMode: () => {},
    loras: env.loraState.editModeLoRAs,
    toolTypeOverride: TOOL_IDS.EDIT_IMAGES,
    activeVariantId: persistence.variants.activeVariant?.id,
    createAsGeneration: env.createAsGeneration,
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
  });

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
    setEditMode: (mode: SettingsEditMode) => inpainting.setEditMode(mode as InpaintingEditMode),
    setInpaintNumGenerations: inpainting.setInpaintNumGenerations,
    setInpaintPrompt: inpainting.setInpaintPrompt,
    setPersistedEditMode: editSettings.setEditMode,
    setPersistedNumGenerations: editSettings.setNumGenerations,
    setPersistedPrompt: editSettings.setPrompt,
  });
}

function buildImageEditValueParams(
  env: InlineEditEnvironment,
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
    setEditMode: (mode: ImageEditMode) => inpainting.setEditMode(mode as InpaintingEditMode),
    handleEnterInpaintMode: inpainting.handleEnterInpaintMode,
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

interface BuildInlineEditStateResultParams {
  env: InlineEditEnvironment;
  inpainting: InpaintingHookResult;
  magic: MagicEditHookResult;
  reposition: RepositionHookResult;
  img2img: Img2ImgHookResult;
  sourceGenerationData: SourceGenerationData;
  starToggle: StarToggleHookResult;
  availableLoras: PublicLorasData;
  imageEditValue: ImageEditValue;
  handleDownload: () => Promise<void>;
}

function buildInlineEditStateResult(params: BuildInlineEditStateResultParams) {
  const {
    env,
    inpainting,
    magic,
    reposition,
    img2img,
    sourceGenerationData,
    starToggle,
    availableLoras,
    imageEditValue,
    handleDownload,
  } = params;

  return {
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
    setIsInpaintMode: inpainting.setIsInpaintMode,
    setEditMode: inpainting.setEditMode,
    setBrushSize: inpainting.setBrushSize,
    setIsEraseMode: inpainting.setIsEraseMode,
    setAnnotationMode: inpainting.setAnnotationMode,
    isSpecialEditMode: magic.isSpecialEditMode,
    handleEnterMagicEditMode: magic.handleEnterMagicEditMode,
    repositionTransform: reposition.transform,
    setScale: reposition.setScale,
    setRotation: reposition.setRotation,
    toggleFlipH: reposition.toggleFlipH,
    toggleFlipV: reposition.toggleFlipV,
    resetTransform: reposition.resetTransform,
    handleUndo: inpainting.handleUndo,
    handleClearMask: inpainting.handleClearMask,
    inpaintPanelPosition: magic.inpaintPanelPosition,
    setInpaintPanelPosition: magic.setInpaintPanelPosition,
    getTransformStyle: reposition.getTransformStyle,
    localStarred: starToggle.localStarred,
    toggleStarMutation: starToggle.toggleStarMutation,
    handleToggleStar: starToggle.handleToggleStar,
    handleDownload,
    sourceGenerationData,
    handleUnifiedGenerate: magic.handleUnifiedGenerate,
    handleGenerateAnnotatedEdit: inpainting.handleGenerateAnnotatedEdit,
    handleGenerateReposition: reposition.handleGenerateReposition,
    handleSaveAsVariant: reposition.handleSaveAsVariant,
    handleGenerateImg2Img: img2img.handleGenerateImg2Img,
    img2imgLoraManager: img2img.loraManager,
    availableLoras,
    imageEditValue,
  };
}

export function useInlineEditState(
  media: GenerationRow,
  _onClose: () => void,
  onNavigateToGeneration?: (generationId: string) => Promise<void>,
) {
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
    buildImageEditValueParams(env, inpainting, magic, reposition, img2img)
  );

  return buildInlineEditStateResult({
    env,
    inpainting,
    magic,
    reposition,
    img2img,
    sourceGenerationData,
    starToggle,
    availableLoras,
    imageEditValue,
    handleDownload,
  });
}
