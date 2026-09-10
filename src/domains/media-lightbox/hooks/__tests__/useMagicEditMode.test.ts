import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationRow } from '@/domains/generation/types';

const mockCreateBoundedImageEditTask = vi.fn();
const mockRun = vi.fn();

vi.mock('@/shared/lib/tasks/imageEditing/imageInpaint', () => ({
  createBoundedImageEditTask: (...args: unknown[]) => mockCreateBoundedImageEditTask(...args),
}));

vi.mock('@/shared/hooks/tasks/useTaskPlaceholder', () => ({
  useTaskPlaceholder: () => mockRun,
}));

vi.mock('@/shared/state/selectionStore', () => ({
  useCurrentShot: () => ({ currentShotId: null }),
}));

vi.mock('@/shared/hooks/shots/useShotGenerationMetadata', () => ({
  useShotGenerationMetadata: () => ({
    addMagicEditPrompt: vi.fn(),
    getLastMagicEditPrompt: () => '',
    getLastSettings: () => ({ numImages: 1, isInSceneBoostEnabled: false }),
    isLoading: false,
  }),
}));

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: { error: vi.fn() },
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
}));

import { useMagicEditMode } from '../useMagicEditMode';

const media = {
  id: 'generation-1',
  generation_id: 'generation-1',
} as GenerationRow;

describe('useMagicEditMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateBoundedImageEditTask.mockResolvedValue({ task_id: 'task-1' });
    mockRun.mockImplementation(async (options: { create: () => Promise<unknown> }) => {
      await options.create();
    });
  });

  it('allows the supported edit-images tool routing to reach typed Astrid admission', async () => {
    const { result } = renderHook(() => useMagicEditMode({
      media,
      selectedProjectId: 'project-1',
      isInpaintMode: false,
      setIsInpaintMode: vi.fn(),
      handleEnterInpaintMode: vi.fn(),
      handleGenerateInpaint: vi.fn(),
      brushStrokes: [],
      inpaintPrompt: 'remove the sign',
      setInpaintPrompt: vi.fn(),
      inpaintNumGenerations: 1,
      setInpaintNumGenerations: vi.fn(),
      editModeLoras: [],
      loraMode: 'none',
      setLoraMode: vi.fn(),
      sourceUrlForTasks: 'https://example.com/source.png',
      imageDimensions: null,
      toolTypeOverride: 'edit-images',
      activeVariantId: null,
      activeVariantLocation: null,
      createAsGeneration: false,
      qwenEditModel: 'qwen-edit-2511',
      initialActive: true,
    }));

    await act(async () => {
      await result.current.handleUnifiedGenerate();
    });

    expect(mockCreateBoundedImageEditTask).toHaveBeenCalledWith('project-1', expect.objectContaining({
      sourceUrl: 'https://example.com/source.png',
      prompt: 'remove the sign',
      count: 1,
      qwenEditModel: 'qwen-edit-2511',
      basedOn: 'generation-1',
    }));
  });
});
