import {
  useRef,
  useState,
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import { GenerationRow } from '@/domains/generation/types';
import { isVideoAny } from '@/shared/lib/typeGuards';
import { useIsMobile } from '@/shared/hooks/mobile';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { usePublicLoras } from '@/shared/hooks/useResources';
import { TOOL_IDS } from '@/shared/lib/toolIds';

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
  type SettingsEditMode,
  type InpaintingEditMode,
  type ImageEditMode,
  type ImageEditState,
  downloadMedia,
} from '@/features/image-edit';
import { useVariants } from '@/shared/hooks/useVariants';

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
type ImageEditValue = ImageEditState;

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

  const { effectiveImageUrl, isUpscaling, handleUpscale, setActiveVariant } = useUpscale({
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
    setUpscaleActiveVariant: setActiveVariant,
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
    activeVariantLocation: persistence.variants.activeVariant?.location,
    createAsGeneration: env.createAsGeneration,
    advancedSettings: persistence.editSettings.advancedSettings,
    qwenEditModel: persistence.editSettings.qwenEditModel,
    initialActive: true,
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
    activeVariantLocation: persistence.variants.activeVariant?.location,
    createAsGeneration: env.createAsGeneration,
    advancedSettings: persistence.editSettings.advancedSettings,
    qwenEditModel: persistence.editSettings.qwenEditModel,
    initialActive: true,
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
    activeVariantLocation: persistence.variants.activeVariant?.location,
    activeVariantId: persistence.variants.activeVariant?.id,
    activeVariantParams: persistence.variants.activeVariant?.params,
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
    activeVariantLocation: persistence.variants.activeVariant?.location,
    activeVariantId: persistence.variants.activeVariant?.id,
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

interface InlineEditStateModelsInput {
  env: InlineEditEnvironment;
  persistence: InlineEditPersistence;
  inpainting: InpaintingHookResult;
  magic: MagicEditHookResult;
  reposition: RepositionHookResult;
  img2img: Img2ImgHookResult;
  starToggle: StarToggleHookResult;
  handleDownload: () => Promise<void>;
}

function buildInlineEditStateModels(input: InlineEditStateModelsInput) {
  const { env, persistence, inpainting, magic, reposition, img2img, starToggle, handleDownload } = input;

  const inpaintingState: InlineEditStateResult['inpaintingState'] = {
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
  };

  const transformState: InlineEditStateResult['transformState'] = {
    repositionTransform: reposition.transform,
    setScale: reposition.setScale,
    setRotation: reposition.setRotation,
    toggleFlipH: reposition.toggleFlipH,
    toggleFlipV: reposition.toggleFlipV,
    resetTransform: reposition.resetTransform,
    getTransformStyle: reposition.getTransformStyle,
  };

  const generationState: InlineEditStateResult['generationState'] = {
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
  };

  const isFlippedHorizontally = Boolean(transformState.repositionTransform?.flipH);
  const isSaving = reposition.isGeneratingReposition || reposition.isSavingAsVariant;

  const imageEditValue: ImageEditState = {
    isInpaintMode: inpainting.isInpaintMode,
    isMagicEditMode: magic.isSpecialEditMode,
    isSpecialEditMode: magic.isSpecialEditMode,
    editMode: inpainting.editMode,
    setIsInpaintMode: inpainting.setIsInpaintMode,
    setIsMagicEditMode: magic.setIsMagicEditMode,
    setEditMode: (mode: ImageEditMode) => inpainting.setEditMode(toInpaintingEditMode(mode)),
    handleEnterInpaintMode: inpainting.handleEnterInpaintMode,
    handleExitInpaintMode: () => inpainting.setIsInpaintMode(false),
    handleEnterMagicEditMode: magic.handleEnterMagicEditMode,
    handleExitMagicEditMode: magic.handleExitMagicEditMode,
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
    getTransformStyle: reposition.getTransformStyle,
    setScale: reposition.setScale,
    setRotation: reposition.setRotation,
    toggleFlipH: reposition.toggleFlipH,
    toggleFlipV: reposition.toggleFlipV,
    resetTransform: reposition.resetTransform,
    imageContainerRef: env.imageContainerRef,
    isFlippedHorizontally,
    isSaving,
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
    qwenEditModel: persistence.editSettings.qwenEditModel,
    setQwenEditModel: persistence.editSettings.setQwenEditModel,
    advancedSettings: persistence.editSettings.advancedSettings,
    setAdvancedSettings: persistence.editSettings.setAdvancedSettings,
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

  return {
    inpaintingState,
    transformState,
    generationState,
    imageEditValue,
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
  variants: {
    variants: InlineEditPersistence['variants']['variants'];
    activeVariant: InlineEditPersistence['variants']['activeVariant'];
    isLoading: boolean;
    setActiveVariantId: InlineEditPersistence['variants']['setActiveVariantId'];
    setPrimaryVariant: InlineEditPersistence['variants']['setPrimaryVariant'];
    deleteVariant: InlineEditPersistence['variants']['deleteVariant'];
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
  const activeVariant = persistence.variants.activeVariant;
  const effectiveImageUrl = activeVariant?.location || env.effectiveImageUrl;

  useEffect(() => {
    env.setUpscaleActiveVariant(activeVariant?.location, activeVariant?.id);
  }, [env, activeVariant?.location, activeVariant?.id]);

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

  const handleDownload = async () => {
    await downloadMedia(effectiveImageUrl, media.id, env.isVideo, media.contentType);
  };

  const {
    inpaintingState,
    transformState,
    generationState,
    imageEditValue,
  } = buildInlineEditStateModels({
    env,
    persistence,
    inpainting,
    magic,
    reposition,
    img2img,
    starToggle,
    handleDownload,
  });

  return {
    media,
    canvasEnvironment: {
      isMobile: env.isMobile,
      selectedProjectId: env.selectedProjectId,
      isCloudMode: env.isCloudMode,
      isVideo: env.isVideo,
      imageContainerRef: env.imageContainerRef,
      effectiveImageUrl,
      imageDimensions: env.imageDimensions,
      setImageDimensions: env.setImageDimensions,
      isUpscaling: env.isUpscaling,
      handleUpscale: env.handleUpscale,
    },
    inpaintingState,
    transformState,
    generationState,
    variants: {
      variants: persistence.variants.variants,
      activeVariant: persistence.variants.activeVariant,
      isLoading: persistence.variants.isLoading,
      setActiveVariantId: persistence.variants.setActiveVariantId,
      setPrimaryVariant: persistence.variants.setPrimaryVariant,
      deleteVariant: persistence.variants.deleteVariant,
    },
    sourceGenerationData,
    availableLoras,
    imageEditValue,
  } satisfies InlineEditStateResult;
}
