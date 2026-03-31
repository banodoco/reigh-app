/**
 * buildImageEditStateValue — shared factory for constructing ImageEditState.
 *
 * Both useImageEditOrchestrator (lightbox) and useInlineEditState (inline editor)
 * build the same ~60-field ImageEditState from the same four hooks.
 * This factory eliminates that duplication.
 */

import type { ImageEditState } from '../contexts/ImageEditContext';
import type { EditAdvancedSettings, EditMode, LoraMode, QwenEditModel } from './editSettingsTypes';
import type { useInpainting } from '../hooks/useInpainting';
import type { useMagicEditMode } from '../hooks/useMagicEditMode';
import type { useRepositionMode } from '../hooks/useRepositionMode';
import type { useImg2ImgMode } from '../hooks/useImg2ImgMode';

interface BuildImageEditStateParams {
  // Hook results (provide all canvas/status fields)
  inpainting: ReturnType<typeof useInpainting>;
  magic: ReturnType<typeof useMagicEditMode>;
  reposition: ReturnType<typeof useRepositionMode>;
  img2img: ReturnType<typeof useImg2ImgMode>;

  // Display
  imageContainerRef: React.RefObject<HTMLDivElement | null>;

  // Overrides (where orchestrator and inline callers diverge)
  handleExitInpaintMode: () => void;
  editMode: EditMode | null;
  setEditMode: (mode: EditMode | null) => void;

  // Settings (sourced from different places per caller)
  loraMode: LoraMode;
  setLoraMode: (mode: LoraMode) => void;
  customLoraUrl: string;
  setCustomLoraUrl: (url: string) => void;
  createAsGeneration: boolean;
  setCreateAsGeneration: (value: boolean) => void;
  qwenEditModel: QwenEditModel;
  setQwenEditModel: (model: QwenEditModel) => void;
  advancedSettings: EditAdvancedSettings;
  setAdvancedSettings: (updates: Partial<EditAdvancedSettings>) => void;
}

export function buildImageEditStateValue(p: BuildImageEditStateParams): ImageEditState {
  const { inpainting, magic, reposition, img2img } = p;

  return {
    // Mode state
    isInpaintMode: inpainting.isInpaintMode,
    isMagicEditMode: magic.isMagicEditMode,
    isSpecialEditMode: magic.isSpecialEditMode,
    editMode: p.editMode,

    // Mode setters
    setIsInpaintMode: inpainting.setIsInpaintMode,
    setIsMagicEditMode: magic.setIsMagicEditMode,
    setEditMode: p.setEditMode,

    // Mode entry/exit
    handleEnterInpaintMode: inpainting.handleEnterInpaintMode,
    handleExitInpaintMode: p.handleExitInpaintMode,
    handleEnterMagicEditMode: magic.handleEnterMagicEditMode,
    handleExitMagicEditMode: magic.handleExitMagicEditMode,

    // Brush/Inpaint
    brushSize: inpainting.brushSize,
    setBrushSize: inpainting.setBrushSize,
    isEraseMode: inpainting.isEraseMode,
    setIsEraseMode: inpainting.setIsEraseMode,
    brushStrokes: inpainting.brushStrokes,

    // Annotation
    isAnnotateMode: inpainting.isAnnotateMode,
    setIsAnnotateMode: inpainting.setIsAnnotateMode,
    annotationMode: inpainting.annotationMode,
    setAnnotationMode: inpainting.setAnnotationMode,
    selectedShapeId: inpainting.selectedShapeId,

    // Undo/Clear
    handleUndo: inpainting.handleUndo,
    handleClearMask: inpainting.handleClearMask,

    // Canvas interaction
    onStrokeComplete: inpainting.onStrokeComplete,
    onStrokesChange: inpainting.onStrokesChange,
    onSelectionChange: inpainting.onSelectionChange,
    onTextModeHint: inpainting.onTextModeHint,
    strokeOverlayRef: inpainting.strokeOverlayRef,
    getDeleteButtonPosition: inpainting.getDeleteButtonPosition,
    handleToggleFreeForm: inpainting.handleToggleFreeForm,
    handleDeleteSelected: inpainting.handleDeleteSelected,

    // Reposition
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

    // Display
    imageContainerRef: p.imageContainerRef,
    isFlippedHorizontally: Boolean(reposition.transform?.flipH),
    isSaving: reposition.isGeneratingReposition || reposition.isSavingAsVariant,

    // Panel UI
    toolPanelPosition: magic.toolPanelPosition,
    setToolPanelPosition: magic.setToolPanelPosition,

    // Inpaint form
    inpaintPrompt: inpainting.inpaintPrompt,
    setInpaintPrompt: inpainting.setInpaintPrompt,
    inpaintNumGenerations: inpainting.inpaintNumGenerations,
    setInpaintNumGenerations: inpainting.setInpaintNumGenerations,

    // Img2Img form
    img2imgPrompt: img2img.img2imgPrompt,
    setImg2imgPrompt: img2img.setImg2imgPrompt,
    img2imgStrength: img2img.img2imgStrength,
    setImg2imgStrength: img2img.setImg2imgStrength,
    enablePromptExpansion: img2img.enablePromptExpansion,
    setEnablePromptExpansion: img2img.setEnablePromptExpansion,

    // LoRA
    loraMode: p.loraMode,
    setLoraMode: p.setLoraMode,
    customLoraUrl: p.customLoraUrl,
    setCustomLoraUrl: p.setCustomLoraUrl,

    // Generation options
    createAsGeneration: p.createAsGeneration,
    setCreateAsGeneration: p.setCreateAsGeneration,

    // Model selection
    qwenEditModel: p.qwenEditModel,
    setQwenEditModel: p.setQwenEditModel,

    // Advanced settings
    advancedSettings: p.advancedSettings,
    setAdvancedSettings: p.setAdvancedSettings,

    // Generation status
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
