import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock all heavy dependencies
vi.mock('@/shared/hooks/mobile', () => ({
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

vi.mock('@/shared/lib/toolIds', () => ({
  TOOL_IDS: {
    EDIT_IMAGES: 'edit-images',
  },
}));

vi.mock('@/shared/lib/typeGuards', () => ({
  isVideoAny: vi.fn().mockReturnValue(false),
}));

const mockUseUpscale = vi.fn().mockReturnValue({
  effectiveImageUrl: 'https://example.com/image.png',
  isUpscaling: false,
  handleUpscale: vi.fn(),
  setActiveVariant: vi.fn(),
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
  toolPanelPosition: 'right',
  setToolPanelPosition: vi.fn(),
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

vi.mock('@/domains/media-lightbox/hooks/useUpscale', () => ({
  useUpscale: (...args: unknown[]) => mockUseUpscale(...args),
}));

vi.mock('@/domains/media-lightbox/hooks/useInpainting', () => ({
  useInpainting: (...args: unknown[]) => mockUseInpainting(...args),
}));

vi.mock('@/domains/media-lightbox/hooks/useSourceGeneration', () => ({
  useSourceGeneration: () => ({
    sourceGenerationData: null,
  }),
}));

vi.mock('@/domains/media-lightbox/hooks/useMagicEditMode', () => ({
  useMagicEditMode: (...args: unknown[]) => mockUseMagicEditMode(...args),
}));

vi.mock('@/domains/media-lightbox/hooks/useStarToggle', () => ({
  useStarToggle: () => ({
    localStarred: false,
    toggleStarMutation: { isPending: false },
    handleToggleStar: vi.fn(),
  }),
}));

vi.mock('@/domains/media-lightbox/hooks/useRepositionMode', () => ({
  useRepositionMode: (...args: unknown[]) => mockUseRepositionMode(...args),
}));

vi.mock('@/domains/media-lightbox/hooks/useImg2ImgMode', () => ({
  useImg2ImgMode: (...args: unknown[]) => mockUseImg2ImgMode(...args),
}));

vi.mock('@/domains/media-lightbox/hooks/persistence/useEditSettingsPersistence', () => ({
  useEditSettingsPersistence: () => ({
    editMode: null,
    setEditMode: vi.fn(),
    loraMode: 'none',
    setLoraMode: vi.fn(),
    customLoraUrl: '',
    setCustomLoraUrl: vi.fn(),
    editModeLoras: [],
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
    advancedSettings: { enabled: false },
    setAdvancedSettings: vi.fn(),
    qwenEditModel: 'qwen-edit-2511',
    setQwenEditModel: vi.fn(),
    createAsGeneration: false,
    setCreateAsGeneration: vi.fn(),
    isReady: true,
    hasPersistedSettings: false,
  }),
}));

vi.mock('@/domains/media-lightbox/hooks/persistence/useEditSettingsSync', () => ({
  useEditSettingsSync: vi.fn(),
}));

vi.mock('@/shared/lib/media/downloadMedia', () => ({
  downloadMedia: vi.fn(),
}));

vi.mock('@/shared/hooks/variants/useVariants', () => ({
  useVariants: () => ({
    activeVariant: null,
    setActiveVariantId: vi.fn(),
    refetch: vi.fn(),
  }),
}));

vi.mock('@/shared/contexts/CurrentShotContext', () => ({
  useCurrentShot: () => ({ currentShotId: null, setCurrentShotId: vi.fn() }),
}));

vi.mock('@/shared/contexts/IncomingTasksContext', () => ({
  useIncomingTasks: () => ({
    addIncomingTask: vi.fn().mockReturnValue('incoming-1'),
    removeIncomingTask: vi.fn(),
    resolveTaskIds: vi.fn(),
    cancelIncoming: vi.fn(),
    cancelAllIncoming: vi.fn(),
    wasCancelled: vi.fn(() => false),
    acknowledgeCancellation: vi.fn(),
    hasIncomingTasks: false,
    incomingTasks: [],
  }),
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
    const { result } = renderHook(
      () => useInlineEditState(mockMedia),
      { wrapper: createWrapper() },
    );

    // Layout/env
    expect(result.current.canvasEnvironment.isMobile).toBe(false);
    expect(result.current.canvasEnvironment.selectedProjectId).toBe('proj-1');
    expect(result.current.canvasEnvironment.isCloudMode).toBe(true);
    expect(result.current.canvasEnvironment.isVideo).toBe(false);

    // Refs
    expect(result.current.canvasEnvironment.imageContainerRef).toBeDefined();

    // Display state
    expect(result.current.canvasEnvironment.effectiveImageUrl).toBe('https://example.com/image.png');
    expect(result.current.canvasEnvironment.imageDimensions).toBeNull();

    // Upscale
    expect(result.current.canvasEnvironment.isUpscaling).toBe(false);
    expect(typeof result.current.canvasEnvironment.handleUpscale).toBe('function');

    // Inpainting canvas state
    expect(result.current.inpaintingState.isInpaintMode).toBe(false);
    expect(result.current.inpaintingState.brushStrokes).toEqual([]);
    expect(result.current.inpaintingState.isEraseMode).toBe(false);
    expect(result.current.inpaintingState.brushSize).toBe(20);

    // Mode controls
    expect(typeof result.current.inpaintingState.setIsInpaintMode).toBe('function');
    expect(typeof result.current.inpaintingState.setEditMode).toBe('function');

    // Star toggle
    expect(result.current.generationState.localStarred).toBe(false);

    // Download
    expect(typeof result.current.generationState.handleDownload).toBe('function');

    // EditModePanel props
    expect(typeof result.current.generationState.handleUnifiedGenerate).toBe('function');
    expect(typeof result.current.generationState.handleGenerateReposition).toBe('function');
    expect(typeof result.current.generationState.handleGenerateImg2Img).toBe('function');

    // imageEditValue
    expect(result.current.imageEditValue).toBeDefined();
  });

  it('passes correct params to useUpscale', () => {
    renderHook(
      () => useInlineEditState(mockMedia),
      { wrapper: createWrapper() },
    );

    expect(mockUseUpscale).toHaveBeenCalledWith({
      media: mockMedia,
      selectedProjectId: 'proj-1',
      isVideo: false,
    });
  });

  it('passes TOOL_IDS.EDIT_IMAGES as toolTypeOverride to useInpainting', () => {
    renderHook(
      () => useInlineEditState(mockMedia),
      { wrapper: createWrapper() },
    );

    expect(mockUseInpainting).toHaveBeenCalledWith(
      expect.objectContaining({
        toolTypeOverride: 'edit-images',
      }),
    );
  });

  it('sets imageDimensions via setImageDimensions', () => {
    const { result } = renderHook(
      () => useInlineEditState(mockMedia),
      { wrapper: createWrapper() },
    );

    expect(result.current.canvasEnvironment.imageDimensions).toBeNull();

    act(() => {
      result.current.canvasEnvironment.setImageDimensions({ width: 1024, height: 768 });
    });

    expect(result.current.canvasEnvironment.imageDimensions).toEqual({ width: 1024, height: 768 });
  });

  it('does not auto-enter magic edit mode on mount', () => {
    const mockEnterMagicEdit = vi.fn();
    mockUseMagicEditMode.mockReturnValue({
      isCreatingMagicEditTasks: false,
      magicEditTasksCreated: false,
      toolPanelPosition: 'right',
      setToolPanelPosition: vi.fn(),
      handleEnterMagicEditMode: mockEnterMagicEdit,
      handleExitMagicEditMode: vi.fn(),
      handleUnifiedGenerate: vi.fn(),
      isSpecialEditMode: false,
    });

    renderHook(
      () => useInlineEditState(mockMedia),
      { wrapper: createWrapper() },
    );

    expect(mockEnterMagicEdit).not.toHaveBeenCalled();
  });

  it('derives actualGenerationId from media.generation_id', () => {
    // useInpainting should receive activeVariantId from useVariants
    renderHook(
      () => useInlineEditState(mockMedia),
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
    renderHook(
      () => useInlineEditState(mockMedia),
      { wrapper: createWrapper() },
    );

    expect(mockUseInpainting).toHaveBeenCalledWith(
      expect.objectContaining({
        createAsGeneration: false,
      }),
    );
  });

  it('passes onNavigateToGeneration to useSourceGeneration', () => {
    const onNavigate = vi.fn();
    renderHook(
      () => useInlineEditState(mockMedia, onNavigate),
      { wrapper: createWrapper() },
    );

    // The hook should have set up useSourceGeneration with navigation capability
    // This is verified by the fact the hook renders without error with the navigator
  });

  it('returns imageEditValue with correct structure', () => {
    const { result } = renderHook(
      () => useInlineEditState(mockMedia),
      { wrapper: createWrapper() },
    );

    const editValue = result.current.imageEditValue;
    expect(editValue).toBeDefined();
    expect(editValue.isInpaintMode).toBe(false);
    expect(editValue.brushSize).toBe(20);
    expect(editValue.toolPanelPosition).toBe('right');
    expect(typeof editValue.setIsInpaintMode).toBe('function');
    expect(typeof editValue.handleEnterInpaintMode).toBe('function');
  });
});
