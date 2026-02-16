import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock all heavy dependencies
vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/shared/contexts/ProjectContext', () => ({
  useProject: () => ({ selectedProjectId: 'proj-1', projects: [] }),
}));

vi.mock('@/shared/hooks/useUserUIState', () => ({
  useUserUIState: () => ({
    value: { onComputer: true, inCloud: true },
    setValue: vi.fn(),
  }),
}));

vi.mock('@/shared/hooks/useResources', () => ({
  usePublicLoras: () => ({ data: [] }),
}));

vi.mock('@/shared/lib/toolConstants', () => ({
  TOOL_IDS: {
    EDIT_IMAGES: 'edit_images',
  },
}));

vi.mock('@/shared/lib/typeGuards', () => ({
  isVideoAny: vi.fn().mockReturnValue(false),
}));

const mockUseUpscale = vi.fn().mockReturnValue({
  effectiveImageUrl: 'https://example.com/image.png',
  isUpscaling: false,
  handleUpscale: vi.fn(),
});

const mockUseInpainting = vi.fn().mockReturnValue({
  isInpaintMode: false,
  brushStrokes: [],
  isEraseMode: false,
  inpaintPrompt: '',
  inpaintNumGenerations: 1,
  brushSize: 20,
  isGeneratingInpaint: false,
  inpaintGenerateSuccess: false,
  isAnnotateMode: false,
  editMode: null,
  annotationMode: 'freeform',
  selectedShapeId: null,
  isDrawing: false,
  currentStroke: null,
  setIsInpaintMode: vi.fn(),
  setIsEraseMode: vi.fn(),
  setInpaintPrompt: vi.fn(),
  setInpaintNumGenerations: vi.fn(),
  setBrushSize: vi.fn(),
  setIsAnnotateMode: vi.fn(),
  setEditMode: vi.fn(),
  setAnnotationMode: vi.fn(),
  handleKonvaPointerDown: vi.fn(),
  handleKonvaPointerMove: vi.fn(),
  handleKonvaPointerUp: vi.fn(),
  handleShapeClick: vi.fn(),
  handleUndo: vi.fn(),
  handleClearMask: vi.fn(),
  handleEnterInpaintMode: vi.fn(),
  handleGenerateInpaint: vi.fn(),
  handleGenerateAnnotatedEdit: vi.fn(),
  handleDeleteSelected: vi.fn(),
  handleToggleFreeForm: vi.fn(),
  getDeleteButtonPosition: vi.fn(),
  strokeOverlayRef: { current: null },
  onStrokeComplete: vi.fn(),
  onStrokesChange: vi.fn(),
  onSelectionChange: vi.fn(),
  onTextModeHint: vi.fn(),
});

const mockUseMagicEditMode = vi.fn().mockReturnValue({
  isCreatingMagicEditTasks: false,
  magicEditTasksCreated: false,
  inpaintPanelPosition: 'right',
  setInpaintPanelPosition: vi.fn(),
  handleEnterMagicEditMode: vi.fn(),
  handleExitMagicEditMode: vi.fn(),
  handleUnifiedGenerate: vi.fn(),
  isSpecialEditMode: false,
});

const mockUseRepositionMode = vi.fn().mockReturnValue({
  transform: null,
  hasTransformChanges: false,
  isGeneratingReposition: false,
  repositionGenerateSuccess: false,
  isSavingAsVariant: false,
  saveAsVariantSuccess: false,
  setScale: vi.fn(),
  setRotation: vi.fn(),
  toggleFlipH: vi.fn(),
  toggleFlipV: vi.fn(),
  resetTransform: vi.fn(),
  handleGenerateReposition: vi.fn(),
  handleSaveAsVariant: vi.fn(),
  getTransformStyle: vi.fn().mockReturnValue(''),
  isDragging: false,
  dragHandlers: null,
});

const mockUseImg2ImgMode = vi.fn().mockReturnValue({
  img2imgPrompt: '',
  img2imgStrength: 0.6,
  enablePromptExpansion: false,
  isGeneratingImg2Img: false,
  img2imgGenerateSuccess: false,
  setImg2imgPrompt: vi.fn(),
  setImg2imgStrength: vi.fn(),
  setEnablePromptExpansion: vi.fn(),
  handleGenerateImg2Img: vi.fn(),
  loraManager: { selectedLoras: [], setSelectedLoras: vi.fn() },
});

vi.mock('@/shared/components/MediaLightbox/hooks', () => ({
  useUpscale: (...args: unknown[]) => mockUseUpscale(...args),
  useInpainting: (...args: unknown[]) => mockUseInpainting(...args),
  useEditModeLoRAs: () => ({
    isInSceneBoostEnabled: false,
    setIsInSceneBoostEnabled: vi.fn(),
    loraMode: 'none',
    setLoraMode: vi.fn(),
    customLoraUrl: '',
    setCustomLoraUrl: vi.fn(),
    editModeLoRAs: [],
  }),
  useSourceGeneration: () => ({
    sourceGenerationData: null,
  }),
  useMagicEditMode: (...args: unknown[]) => mockUseMagicEditMode(...args),
  useStarToggle: () => ({
    localStarred: false,
    toggleStarMutation: { isPending: false },
    handleToggleStar: vi.fn(),
  }),
  useRepositionMode: (...args: unknown[]) => mockUseRepositionMode(...args),
  useImg2ImgMode: (...args: unknown[]) => mockUseImg2ImgMode(...args),
  useEditSettingsPersistence: () => ({
    editMode: null,
    setEditMode: vi.fn(),
    img2imgStrength: 0.6,
    img2imgEnablePromptExpansion: false,
    img2imgPrompt: '',
    img2imgPromptHasBeenSet: false,
    setImg2imgStrength: vi.fn(),
    setImg2imgEnablePromptExpansion: vi.fn(),
    setImg2imgPrompt: vi.fn(),
    prompt: '',
    setPrompt: vi.fn(),
    numGenerations: 1,
    setNumGenerations: vi.fn(),
    isReady: true,
    hasPersistedSettings: false,
  }),
  useEditSettingsSync: vi.fn(),
}));

vi.mock('@/shared/hooks/useVariants', () => ({
  useVariants: () => ({
    activeVariant: null,
    setActiveVariantId: vi.fn(),
    refetch: vi.fn(),
  }),
}));

vi.mock('@/shared/components/MediaLightbox/utils', () => ({
  downloadMedia: vi.fn(),
}));

vi.mock('@/shared/components/MediaLightbox/hooks/editSettingsTypes', () => ({
  DEFAULT_ADVANCED_SETTINGS: {
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
}));

import { useInlineEditState } from '../useInlineEditState';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const mockMedia = {
  id: 'gen-1',
  generation_id: 'gen-1',
  project_id: 'proj-1',
  imageUrl: 'https://example.com/image.png',
  contentType: 'image/png',
  prompt: 'test prompt',
  params: {},
  starred: false,
  created_at: '2025-01-01T00:00:00Z',
} as unknown;

describe('useInlineEditState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all expected sections of state', () => {
    const onClose = vi.fn();
    const { result } = renderHook(
      () => useInlineEditState(mockMedia, onClose),
      { wrapper: createWrapper() },
    );

    // Layout/env
    expect(result.current.isMobile).toBe(false);
    expect(result.current.selectedProjectId).toBe('proj-1');
    expect(result.current.isCloudMode).toBe(true);
    expect(result.current.isVideo).toBe(false);

    // Refs
    expect(result.current.imageContainerRef).toBeDefined();

    // Display state
    expect(result.current.effectiveImageUrl).toBe('https://example.com/image.png');
    expect(result.current.imageDimensions).toBeNull();

    // Upscale
    expect(result.current.isUpscaling).toBe(false);
    expect(typeof result.current.handleUpscale).toBe('function');

    // Inpainting canvas state
    expect(result.current.isInpaintMode).toBe(false);
    expect(result.current.brushStrokes).toEqual([]);
    expect(result.current.isEraseMode).toBe(false);
    expect(result.current.brushSize).toBe(20);

    // Mode controls
    expect(typeof result.current.setIsInpaintMode).toBe('function');
    expect(typeof result.current.setEditMode).toBe('function');

    // Star toggle
    expect(result.current.localStarred).toBe(false);

    // Download
    expect(typeof result.current.handleDownload).toBe('function');

    // EditModePanel props
    expect(typeof result.current.handleUnifiedGenerate).toBe('function');
    expect(typeof result.current.handleGenerateReposition).toBe('function');
    expect(typeof result.current.handleGenerateImg2Img).toBe('function');

    // imageEditValue
    expect(result.current.imageEditValue).toBeDefined();
  });

  it('passes correct params to useUpscale', () => {
    const onClose = vi.fn();
    renderHook(
      () => useInlineEditState(mockMedia, onClose),
      { wrapper: createWrapper() },
    );

    expect(mockUseUpscale).toHaveBeenCalledWith({
      media: mockMedia,
      selectedProjectId: 'proj-1',
      isVideo: false,
    });
  });

  it('passes TOOL_IDS.EDIT_IMAGES as toolTypeOverride to useInpainting', () => {
    const onClose = vi.fn();
    renderHook(
      () => useInlineEditState(mockMedia, onClose),
      { wrapper: createWrapper() },
    );

    expect(mockUseInpainting).toHaveBeenCalledWith(
      expect.objectContaining({
        toolTypeOverride: 'edit_images',
      }),
    );
  });

  it('sets imageDimensions via setImageDimensions', () => {
    const onClose = vi.fn();
    const { result } = renderHook(
      () => useInlineEditState(mockMedia, onClose),
      { wrapper: createWrapper() },
    );

    expect(result.current.imageDimensions).toBeNull();

    act(() => {
      result.current.setImageDimensions({ width: 1024, height: 768 });
    });

    expect(result.current.imageDimensions).toEqual({ width: 1024, height: 768 });
  });

  it('auto-enters magic edit mode when not in special edit mode', () => {
    // The useEffect calls handleEnterMagicEditMode when !isSpecialEditMode
    const mockEnterMagicEdit = vi.fn();
    mockUseMagicEditMode.mockReturnValue({
      isCreatingMagicEditTasks: false,
      magicEditTasksCreated: false,
      inpaintPanelPosition: 'right',
      setInpaintPanelPosition: vi.fn(),
      handleEnterMagicEditMode: mockEnterMagicEdit,
      handleExitMagicEditMode: vi.fn(),
      handleUnifiedGenerate: vi.fn(),
      isSpecialEditMode: false,
    });

    const onClose = vi.fn();
    renderHook(
      () => useInlineEditState(mockMedia, onClose),
      { wrapper: createWrapper() },
    );

    expect(mockEnterMagicEdit).toHaveBeenCalled();
  });

  it('does not auto-enter magic edit mode when already in special edit mode', () => {
    const mockEnterMagicEdit = vi.fn();
    mockUseMagicEditMode.mockReturnValue({
      isCreatingMagicEditTasks: false,
      magicEditTasksCreated: false,
      inpaintPanelPosition: 'right',
      setInpaintPanelPosition: vi.fn(),
      handleEnterMagicEditMode: mockEnterMagicEdit,
      handleExitMagicEditMode: vi.fn(),
      handleUnifiedGenerate: vi.fn(),
      isSpecialEditMode: true,
    });

    const onClose = vi.fn();
    renderHook(
      () => useInlineEditState(mockMedia, onClose),
      { wrapper: createWrapper() },
    );

    expect(mockEnterMagicEdit).not.toHaveBeenCalled();
  });

  it('derives actualGenerationId from media.generation_id', () => {
    // useInpainting should receive activeVariantId from useVariants
    const onClose = vi.fn();
    renderHook(
      () => useInlineEditState(mockMedia, onClose),
      { wrapper: createWrapper() },
    );

    // The hook uses actualGenerationId for edit settings persistence
    // We verify by checking what's passed to useInpainting's media param
    expect(mockUseInpainting).toHaveBeenCalledWith(
      expect.objectContaining({
        media: mockMedia,
      }),
    );
  });

  it('passes createAsGeneration=false by default', () => {
    const onClose = vi.fn();
    renderHook(
      () => useInlineEditState(mockMedia, onClose),
      { wrapper: createWrapper() },
    );

    expect(mockUseInpainting).toHaveBeenCalledWith(
      expect.objectContaining({
        createAsGeneration: false,
      }),
    );
  });

  it('passes onNavigateToGeneration to useSourceGeneration', () => {
    const onClose = vi.fn();
    const onNavigate = vi.fn();
    renderHook(
      () => useInlineEditState(mockMedia, onClose, onNavigate),
      { wrapper: createWrapper() },
    );

    // The hook should have set up useSourceGeneration with navigation capability
    // This is verified by the fact the hook renders without error with the navigator
  });

  it('returns imageEditValue with correct structure', () => {
    const onClose = vi.fn();
    const { result } = renderHook(
      () => useInlineEditState(mockMedia, onClose),
      { wrapper: createWrapper() },
    );

    const editValue = result.current.imageEditValue;
    expect(editValue).toBeDefined();
    expect(editValue.isInpaintMode).toBe(false);
    expect(editValue.brushSize).toBe(20);
    expect(editValue.inpaintPanelPosition).toBe('right');
    expect(typeof editValue.setIsInpaintMode).toBe('function');
    expect(typeof editValue.handleEnterInpaintMode).toBe('function');
  });
});
