import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useImageEditValue } from '../useImageEditValue';

function createMockParams() {
  return {
    // Mode state
    isInpaintMode: false,
    isSpecialEditMode: false,
    editMode: null as string | null,

    // Mode setters
    setIsInpaintMode: vi.fn(),
    setIsMagicEditMode: vi.fn(),
    setEditMode: vi.fn(),

    // Mode entry/exit handlers
    handleEnterInpaintMode: vi.fn(),
    handleExitInpaintMode: vi.fn(),
    handleExitMagicEditMode: vi.fn(),
    handleEnterMagicEditMode: vi.fn(),

    // Brush/Inpaint state
    brushSize: 20,
    setBrushSize: vi.fn(),
    isEraseMode: false,
    setIsEraseMode: vi.fn(),
    brushStrokes: [],

    // Annotation state
    isAnnotateMode: false,
    setIsAnnotateMode: vi.fn(),
    annotationMode: 'freeform' as const,
    setAnnotationMode: vi.fn(),
    selectedShapeId: null,

    // Canvas interaction
    onStrokeComplete: vi.fn(),
    onStrokesChange: vi.fn(),
    onSelectionChange: vi.fn(),
    onTextModeHint: vi.fn(),
    strokeOverlayRef: { current: null },
    getDeleteButtonPosition: vi.fn().mockReturnValue(null),
    handleToggleFreeForm: vi.fn(),
    handleDeleteSelected: vi.fn(),

    // Undo/Clear
    handleUndo: vi.fn(),
    handleClearMask: vi.fn(),

    // Reposition state
    repositionTransform: null,
    hasTransformChanges: false,
    isRepositionDragging: false,
    repositionDragHandlers: null,
    getTransformStyle: vi.fn().mockReturnValue(''),
    setScale: vi.fn(),
    setRotation: vi.fn(),
    toggleFlipH: vi.fn(),
    toggleFlipV: vi.fn(),
    resetTransform: vi.fn(),

    // Display refs
    imageContainerRef: { current: null },

    // Panel UI state
    inpaintPanelPosition: 'right' as const,
    setInpaintPanelPosition: vi.fn(),

    // Inpaint form
    inpaintPrompt: '',
    setInpaintPrompt: vi.fn(),
    inpaintNumGenerations: 1,
    setInpaintNumGenerations: vi.fn(),

    // Img2Img form
    img2imgPrompt: '',
    setImg2imgPrompt: vi.fn(),
    img2imgStrength: 0.6,
    setImg2imgStrength: vi.fn(),
    enablePromptExpansion: false,
    setEnablePromptExpansion: vi.fn(),

    // LoRA mode
    loraMode: 'none' as const,
    setLoraMode: vi.fn(),
    customLoraUrl: '',
    setCustomLoraUrl: vi.fn(),

    // Generation options
    createAsGeneration: false,
    setCreateAsGeneration: vi.fn(),
    qwenEditModel: 'qwen-edit-2511' as const,
    setQwenEditModel: vi.fn(),
    advancedSettings: {
      enabled: false,
      num_inference_steps: 12,
      resolution_scale: 1.5,
      base_steps: 8,
      hires_scale: 1.1,
      hires_steps: 8,
      hires_denoise: 0.5,
      lightning_lora_strength_phase_1: 0.9,
      lightning_lora_strength_phase_2: 0.5,
    },
    setAdvancedSettings: vi.fn(),

    // Generation status
    isGeneratingInpaint: false,
    inpaintGenerateSuccess: false,
    isGeneratingImg2Img: false,
    img2imgGenerateSuccess: false,
    isGeneratingReposition: false,
    repositionGenerateSuccess: false,
    isSavingAsVariant: false,
    saveAsVariantSuccess: false,
    isCreatingMagicEditTasks: false,
    magicEditTasksCreated: false,
  };
}

describe('useImageEditValue', () => {
  it('returns an ImageEditState with all required fields', () => {
    const params = createMockParams();
    const { result } = renderHook(() => useImageEditValue(params));

    // Mode state
    expect(result.current.isInpaintMode).toBe(false);
    expect(result.current.isMagicEditMode).toBe(false);
    expect(result.current.isSpecialEditMode).toBe(false);
    expect(result.current.editMode).toBeNull();

    // Mode setters exist
    expect(typeof result.current.setIsInpaintMode).toBe('function');
    expect(typeof result.current.setEditMode).toBe('function');

    // Brush state
    expect(result.current.brushSize).toBe(20);
    expect(result.current.isEraseMode).toBe(false);
    expect(result.current.brushStrokes).toEqual([]);

    // Panel state
    expect(result.current.inpaintPanelPosition).toBe('right');

    // Form state
    expect(result.current.inpaintPrompt).toBe('');
    expect(result.current.inpaintNumGenerations).toBe(1);
    expect(result.current.img2imgPrompt).toBe('');
    expect(result.current.img2imgStrength).toBe(0.6);
    expect(result.current.enablePromptExpansion).toBe(false);

    // LoRA state
    expect(result.current.loraMode).toBe('none');
    expect(result.current.customLoraUrl).toBe('');

    // Generation options
    expect(result.current.createAsGeneration).toBe(false);

    // Generation status
    expect(result.current.isGeneratingInpaint).toBe(false);
    expect(result.current.inpaintGenerateSuccess).toBe(false);
    expect(result.current.isGeneratingImg2Img).toBe(false);
    expect(result.current.img2imgGenerateSuccess).toBe(false);
    expect(result.current.isGeneratingReposition).toBe(false);
    expect(result.current.repositionGenerateSuccess).toBe(false);
    expect(result.current.isSavingAsVariant).toBe(false);
    expect(result.current.saveAsVariantSuccess).toBe(false);
    expect(result.current.isCreatingMagicEditTasks).toBe(false);
    expect(result.current.magicEditTasksCreated).toBe(false);
  });

  it('maps isSpecialEditMode to isMagicEditMode', () => {
    const params = createMockParams();
    params.isSpecialEditMode = true;

    const { result } = renderHook(() => useImageEditValue(params));

    expect(result.current.isMagicEditMode).toBe(true);
    expect(result.current.isSpecialEditMode).toBe(true);
  });

  it('uses the provided handleExitInpaintMode callback', () => {
    const params = createMockParams();
    const { result } = renderHook(() => useImageEditValue(params));

    result.current.handleExitInpaintMode();
    expect(params.handleExitInpaintMode).toHaveBeenCalled();
  });

  it('passes through external mutators and settings', () => {
    const params = createMockParams();
    const { result } = renderHook(() => useImageEditValue(params));

    expect(result.current.isFlippedHorizontally).toBe(false);
    expect(result.current.isSaving).toBe(false);
    expect(result.current.qwenEditModel).toBe(params.qwenEditModel);
    expect(result.current.advancedSettings).toEqual(params.advancedSettings);

    result.current.setIsMagicEditMode(true);
    result.current.setQwenEditModel('qwen-edit-2509');
    result.current.setAdvancedSettings(params.advancedSettings);

    expect(params.setIsMagicEditMode).toHaveBeenCalledWith(true);
    expect(params.setQwenEditModel).toHaveBeenCalledWith('qwen-edit-2509');
    expect(params.setAdvancedSettings).toHaveBeenCalledWith(params.advancedSettings);
  });

  it('returns memoized value when params have not changed', () => {
    const params = createMockParams();
    const { result, rerender } = renderHook(() => useImageEditValue(params));

    const firstResult = result.current;
    rerender();
    const secondResult = result.current;

    // Due to useMemo, should be referentially identical
    expect(firstResult).toBe(secondResult);
  });

  it('updates when mode state changes', () => {
    const params = createMockParams();
    const { result, rerender } = renderHook(
      ({ p }) => useImageEditValue(p),
      { initialProps: { p: params } },
    );

    expect(result.current.isInpaintMode).toBe(false);

    const updatedParams = { ...params, isInpaintMode: true };
    rerender({ p: updatedParams });

    expect(result.current.isInpaintMode).toBe(true);
  });

  it('passes through reposition state correctly', () => {
    const params = createMockParams();
    const mockTransform = { x: 10, y: 20, scale: 1.5, rotation: 45, flipH: false, flipV: false };
    params.repositionTransform = mockTransform as unknown;
    params.hasTransformChanges = true;
    params.isRepositionDragging = true;

    const { result } = renderHook(() => useImageEditValue(params));

    expect(result.current.repositionTransform).toEqual(mockTransform);
    expect(result.current.hasTransformChanges).toBe(true);
    expect(result.current.isRepositionDragging).toBe(true);
  });

  it('passes through generation status flags', () => {
    const params = createMockParams();
    params.isGeneratingInpaint = true;
    params.inpaintGenerateSuccess = true;

    const { result } = renderHook(() => useImageEditValue(params));

    expect(result.current.isGeneratingInpaint).toBe(true);
    expect(result.current.inpaintGenerateSuccess).toBe(true);
  });
});
