import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { GenerationRow } from '@/domains/generation/types';
import type { EditMode } from '../../model/editSettingsTypes';

const mockUseInpainting = vi.fn();
const mockUseMagicEditMode = vi.fn();
const mockUseRepositionMode = vi.fn();
const mockUseImg2ImgMode = vi.fn();
const mockBuildImageEditStateValue = vi.fn();

vi.mock('../useInpainting', () => ({
  useInpainting: (...args: unknown[]) => mockUseInpainting(...args),
}));

vi.mock('../useMagicEditMode', () => ({
  useMagicEditMode: (...args: unknown[]) => mockUseMagicEditMode(...args),
}));

vi.mock('../useRepositionMode', () => ({
  useRepositionMode: (...args: unknown[]) => mockUseRepositionMode(...args),
}));

vi.mock('../useImg2ImgMode', () => ({
  useImg2ImgMode: (...args: unknown[]) => mockUseImg2ImgMode(...args),
}));

vi.mock('../../model/buildImageEditStateValue', () => ({
  buildImageEditStateValue: (...args: unknown[]) => mockBuildImageEditStateValue(...args),
}));

import { useImageEditOrchestrator } from '../useImageEditOrchestrator';

const baseMedia = {
  id: 'gen-1',
  project_id: 'proj-1',
  user_id: 'user-1',
  prompt: 'test prompt',
  thumbUrl: 'https://example.com/thumb.png',
  created_at: '2026-03-30T00:00:00.000Z',
  updated_at: '2026-03-30T00:00:00.000Z',
} as GenerationRow;

function createProps(editMode: EditMode) {
  return {
    mediaContext: {
      media: baseMedia,
      selectedProjectId: 'proj-1',
      actualGenerationId: 'gen-1',
      initialActive: false,
      thumbnailUrl: 'https://example.com/thumb.png',
    },
    displayContext: {
      imageDimensions: null,
      imageContainerRef: { current: null },
      effectiveImageUrl: 'https://example.com/image.png',
    },
    variantContext: {
      activeVariant: null,
      setActiveVariantId: vi.fn(),
      refetchVariants: vi.fn(),
    },
    settingsContext: {
      loraMode: 'none' as const,
      setLoraMode: vi.fn(),
      customLoraUrl: '',
      setCustomLoraUrl: vi.fn(),
      prompt: '',
      setPrompt: vi.fn(),
      numGenerations: 1,
      setNumGenerations: vi.fn(),
      img2imgStrength: 0.6,
      setImg2imgStrength: vi.fn(),
      img2imgEnablePromptExpansion: false,
      setImg2imgEnablePromptExpansion: vi.fn(),
      img2imgPrompt: '',
      setImg2imgPrompt: vi.fn(),
      img2imgPromptHasBeenSet: false,
      createAsGeneration: false,
      setCreateAsGeneration: vi.fn(),
      advancedSettings: { enabled: false },
      setAdvancedSettings: vi.fn(),
      qwenEditModel: 'qwen-edit-2511' as const,
      setQwenEditModel: vi.fn(),
      editMode,
      setEditMode: vi.fn(),
      isReady: true,
      hasPersistedSettings: true,
    },
    loraContext: {
      effectiveEditModeLoras: [],
      availableLoras: [],
    },
  };
}

describe('useImageEditOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseInpainting.mockReturnValue({
      isInpaintMode: false,
      editMode: 'text',
      setIsInpaintMode: vi.fn(),
      brushStrokes: [],
      inpaintPrompt: '',
      setInpaintPrompt: vi.fn(),
      inpaintNumGenerations: 1,
      setInpaintNumGenerations: vi.fn(),
      handleEnterInpaintMode: vi.fn(),
      handleGenerateInpaint: vi.fn(),
      handleGenerateAnnotatedEdit: vi.fn(),
    });

    mockUseMagicEditMode.mockReturnValue({
      isMagicEditMode: false,
      isSpecialEditMode: false,
      handleEnterMagicEditMode: vi.fn(),
      handleExitMagicEditMode: vi.fn(),
      handleUnifiedGenerate: vi.fn(),
    });

    mockUseRepositionMode.mockReturnValue({
      handleGenerateReposition: vi.fn(),
      handleSaveAsVariant: vi.fn(),
    });

    mockUseImg2ImgMode.mockReturnValue({
      handleGenerateImg2Img: vi.fn(),
      loraManager: { selectedLoras: [], setSelectedLoras: vi.fn() },
    });

    mockBuildImageEditStateValue.mockImplementation(({ editMode: currentEditMode }) => ({
      editMode: currentEditMode,
    }));
  });

  it.each(['reposition', 'img2img', 'upscale'] as const)(
    'keeps %s as the orchestrator and imageEditValue edit mode',
    (editMode) => {
      const { result } = renderHook(() =>
        useImageEditOrchestrator(createProps(editMode)),
      );

      expect(result.current.editMode).toBe(editMode);
      expect(result.current.imageEditValue.editMode).toBe(editMode);
    },
  );
});
