import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { buildImageEditStateValue } from './buildImageEditStateValue';
import { buildImageEditStateValue as buildImageEditStateValueAlias } from '@/tools/edit-images/model/buildImageEditStateValue';

function buildParams() {
  const setEditMode = vi.fn();
  const handleExitInpaintMode = vi.fn();
  const setLoraMode = vi.fn();
  const setCustomLoraUrl = vi.fn();
  const setCreateAsGeneration = vi.fn();
  const setQwenEditModel = vi.fn();
  const setAdvancedSettings = vi.fn();

  return {
    params: {
      inpainting: {
        isInpaintMode: true,
        editMode: 'inpaint',
        setIsInpaintMode: vi.fn(),
        handleEnterInpaintMode: vi.fn(),
        brushSize: 12,
        setBrushSize: vi.fn(),
        isEraseMode: false,
        setIsEraseMode: vi.fn(),
        brushStrokes: [{ id: 'stroke-1' }],
        isAnnotateMode: true,
        setIsAnnotateMode: vi.fn(),
        annotationMode: 'rectangle',
        setAnnotationMode: vi.fn(),
        selectedShapeId: 'shape-1',
        handleUndo: vi.fn(),
        handleClearMask: vi.fn(),
        onStrokeComplete: vi.fn(),
        onStrokesChange: vi.fn(),
        onSelectionChange: vi.fn(),
        onTextModeHint: vi.fn(),
        strokeOverlayRef: { current: null },
        getDeleteButtonPosition: vi.fn().mockReturnValue({ x: 10, y: 20 }),
        handleToggleFreeForm: vi.fn(),
        handleDeleteSelected: vi.fn(),
        inpaintPrompt: 'repair the image',
        setInpaintPrompt: vi.fn(),
        inpaintNumGenerations: 3,
        setInpaintNumGenerations: vi.fn(),
        isGeneratingInpaint: true,
        inpaintGenerateSuccess: false,
      },
      magic: {
        isMagicEditMode: true,
        isSpecialEditMode: false,
        setIsMagicEditMode: vi.fn(),
        handleEnterMagicEditMode: vi.fn(),
        handleExitMagicEditMode: vi.fn(),
        toolPanelPosition: 'left',
        setToolPanelPosition: vi.fn(),
        isCreatingMagicEditTasks: false,
        magicEditTasksCreated: true,
      },
      reposition: {
        transform: { scale: 1.2, rotation: 15, flipH: true, flipV: false },
        hasTransformChanges: true,
        isDragging: true,
        dragHandlers: { onPointerDown: vi.fn() },
        getTransformStyle: vi.fn().mockReturnValue({ transform: 'scale(1.2)' }),
        setScale: vi.fn(),
        setRotation: vi.fn(),
        toggleFlipH: vi.fn(),
        toggleFlipV: vi.fn(),
        resetTransform: vi.fn(),
        isGeneratingReposition: false,
        repositionGenerateSuccess: true,
        isSavingAsVariant: true,
        saveAsVariantSuccess: false,
      },
      img2img: {
        img2imgPrompt: 'variation',
        setImg2imgPrompt: vi.fn(),
        img2imgStrength: 0.45,
        setImg2imgStrength: vi.fn(),
        enablePromptExpansion: true,
        setEnablePromptExpansion: vi.fn(),
        isGeneratingImg2Img: true,
        img2imgGenerateSuccess: true,
      },
      imageContainerRef: createRef<HTMLDivElement>(),
      handleExitInpaintMode,
      editMode: 'inpaint',
      setEditMode,
      loraMode: 'preset',
      setLoraMode,
      customLoraUrl: 'https://example.com/lora.safetensors',
      setCustomLoraUrl,
      createAsGeneration: true,
      setCreateAsGeneration,
      qwenEditModel: 'qwen-image-edit',
      setQwenEditModel,
      advancedSettings: { cfgScale: 7 },
      setAdvancedSettings,
    },
    handlers: {
      setEditMode,
      handleExitInpaintMode,
      setLoraMode,
      setCustomLoraUrl,
      setCreateAsGeneration,
      setQwenEditModel,
      setAdvancedSettings,
    },
  };
}

describe('buildImageEditStateValue', () => {
  it('maps the composed hook state into the shared image edit contract', () => {
    const { params, handlers } = buildParams();

    const state = buildImageEditStateValue(params as never);

    expect(state.isInpaintMode).toBe(true);
    expect(state.isMagicEditMode).toBe(true);
    expect(state.editMode).toBe('inpaint');
    expect(state.handleExitInpaintMode).toBe(handlers.handleExitInpaintMode);
    expect(state.setEditMode).toBe(handlers.setEditMode);
    expect(state.brushSize).toBe(12);
    expect(state.annotationMode).toBe('rectangle');
    expect(state.repositionTransform).toEqual(params.reposition.transform);
    expect(state.isFlippedHorizontally).toBe(true);
    expect(state.isSaving).toBe(true);
    expect(state.inpaintPrompt).toBe('repair the image');
    expect(state.img2imgPrompt).toBe('variation');
    expect(state.loraMode).toBe('preset');
    expect(state.customLoraUrl).toBe('https://example.com/lora.safetensors');
    expect(state.createAsGeneration).toBe(true);
    expect(state.qwenEditModel).toBe('qwen-image-edit');
    expect(state.advancedSettings).toEqual({ cfgScale: 7 });
    expect(state.isGeneratingImg2Img).toBe(true);
    expect(state.magicEditTasksCreated).toBe(true);
  });

  it('preserves the mode setters and transform handlers from the source hooks', () => {
    const { params } = buildParams();

    const state = buildImageEditStateValue(params as never);

    expect(state.setIsInpaintMode).toBe(params.inpainting.setIsInpaintMode);
    expect(state.setIsMagicEditMode).toBe(params.magic.setIsMagicEditMode);
    expect(state.repositionDragHandlers).toBe(params.reposition.dragHandlers);
    expect(state.getTransformStyle).toBe(params.reposition.getTransformStyle);
    expect(state.setScale).toBe(params.reposition.setScale);
    expect(state.toggleFlipH).toBe(params.reposition.toggleFlipH);
    expect(state.setLoraMode).toBe(params.setLoraMode);
    expect(state.setAdvancedSettings).toBe(params.setAdvancedSettings);
  });

  it('reflects the active editing mode signals from each source hook result', () => {
    const inpaintCase = buildParams();
    inpaintCase.params.editMode = 'inpaint';
    inpaintCase.params.inpainting.isInpaintMode = true;
    inpaintCase.params.magic.isMagicEditMode = false;
    inpaintCase.params.magic.isSpecialEditMode = false;
    inpaintCase.params.reposition.isGeneratingReposition = false;
    inpaintCase.params.reposition.isSavingAsVariant = false;

    const magicCase = buildParams();
    magicCase.params.editMode = 'text';
    magicCase.params.inpainting.isInpaintMode = false;
    magicCase.params.magic.isMagicEditMode = true;
    magicCase.params.magic.isSpecialEditMode = true;

    const repositionCase = buildParams();
    repositionCase.params.editMode = 'reposition';
    repositionCase.params.inpainting.isInpaintMode = false;
    repositionCase.params.magic.isMagicEditMode = false;
    repositionCase.params.reposition.isGeneratingReposition = true;
    repositionCase.params.reposition.isSavingAsVariant = false;

    const img2imgCase = buildParams();
    img2imgCase.params.editMode = 'img2img';
    img2imgCase.params.inpainting.isInpaintMode = false;
    img2imgCase.params.magic.isMagicEditMode = false;
    img2imgCase.params.img2img.isGeneratingImg2Img = true;
    img2imgCase.params.img2img.img2imgGenerateSuccess = false;
    img2imgCase.params.reposition.isGeneratingReposition = false;
    img2imgCase.params.reposition.isSavingAsVariant = false;

    const inpaintState = buildImageEditStateValue(inpaintCase.params as never);
    const magicState = buildImageEditStateValue(magicCase.params as never);
    const repositionState = buildImageEditStateValue(repositionCase.params as never);
    const img2imgState = buildImageEditStateValue(img2imgCase.params as never);

    expect(inpaintState.editMode).toBe('inpaint');
    expect(inpaintState.isInpaintMode).toBe(true);
    expect(inpaintState.isMagicEditMode).toBe(false);

    expect(magicState.editMode).toBe('text');
    expect(magicState.isMagicEditMode).toBe(true);
    expect(magicState.isSpecialEditMode).toBe(true);

    expect(repositionState.editMode).toBe('reposition');
    expect(repositionState.isGeneratingReposition).toBe(true);
    expect(repositionState.isSaving).toBe(true);

    expect(img2imgState.editMode).toBe('img2img');
    expect(img2imgState.isGeneratingImg2Img).toBe(true);
    expect(img2imgState.img2imgGenerateSuccess).toBe(false);
  });

  it('keeps the tool-path export wired to the shared factory', () => {
    expect(buildImageEditStateValueAlias).toBe(buildImageEditStateValue);
  });
});
