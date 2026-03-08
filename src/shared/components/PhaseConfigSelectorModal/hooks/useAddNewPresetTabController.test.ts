import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockToastError = vi.fn();
const mockNormalizeAndPresentError = vi.fn();
const mockSubmitPreset = vi.fn();
const mockUsePresetSampleFiles = vi.fn();

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mockNormalizeAndPresentError(...args),
}));

vi.mock('./submitPreset', () => ({
  submitPreset: (...args: unknown[]) => mockSubmitPreset(...args),
}));

vi.mock('./usePresetSampleFiles', () => ({
  usePresetSampleFiles: () => mockUsePresetSampleFiles(),
}));

import { useAddNewPresetTabController } from './useAddNewPresetTabController';

function buildPhaseConfig() {
  return {
    num_phases: 2,
    steps_per_phase: [3, 4],
    flow_shift: 5,
    sample_solver: 'euler',
    model_switch_phase: 1,
    phases: [
      { phase: 1, guidance_scale: 1, loras: [] },
      { phase: 2, guidance_scale: 1, loras: [] },
    ],
  };
}

function buildProps(overrides: Record<string, unknown> = {}) {
  return {
    createResource: { mutateAsync: vi.fn(async () => undefined), isPending: false },
    updateResource: { mutateAsync: vi.fn(async () => undefined), isPending: false },
    onSwitchToBrowse: vi.fn(),
    currentPhaseConfig: buildPhaseConfig(),
    editingPreset: null,
    onClearEdit: vi.fn(),
    currentSettings: {
      basePrompt: 'current base',
      lastGeneratedVideoUrl: 'https://video/current.mp4',
      selectedLoras: [{ id: 'l1', name: 'LoRA', strength: 0.8 }],
    },
    isOverwriting: false,
    generationTypeMode: 'i2v',
    defaultIsPublic: true,
    ...overrides,
  };
}

beforeEach(() => {
  mockToastError.mockReset();
  mockNormalizeAndPresentError.mockReset();
  mockSubmitPreset.mockReset();
  mockSubmitPreset.mockResolvedValue(undefined);

  const sampleFilesHook = {
    sampleFiles: [new File(['sample'], 'sample.png', { type: 'image/png' })],
    deletedExistingSampleUrls: ['https://old/deleted.png'],
    mainGenerationIndex: 0,
    initialVideoSample: 'https://video/current.mp4',
    initialVideoDeleted: false,
    resetSampleFiles: vi.fn(),
    setInitialVideo: vi.fn(),
  };

  mockUsePresetSampleFiles.mockReset();
  mockUsePresetSampleFiles.mockReturnValue(sampleFilesHook);
});

describe('useAddNewPresetTabController', () => {
  it('hydrates from current settings and seeds initial video sample', async () => {
    const props = buildProps();

    renderHook(() => useAddNewPresetTabController(props as never));

    await waitFor(() => {
      const sampleFilesHook = mockUsePresetSampleFiles.mock.results[0].value;
      expect(sampleFilesHook.setInitialVideo).toHaveBeenCalledWith('https://video/current.mp4');
    });
  });

  it('blocks submit when name is empty and shows validation toast', async () => {
    const props = buildProps();
    const { result } = renderHook(() => useAddNewPresetTabController(props as never));

    act(() => {
      result.current.handleFormChange('name', '   ');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(mockToastError).toHaveBeenCalledWith('Name is required');
    expect(mockSubmitPreset).not.toHaveBeenCalled();
  });

  it('submits successfully, then resets form and switches tab', async () => {
    const props = buildProps();
    const { result } = renderHook(() => useAddNewPresetTabController(props as never));

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(mockSubmitPreset).toHaveBeenCalledTimes(1);
    expect(props.onSwitchToBrowse).toHaveBeenCalledTimes(1);

    const sampleFilesHook = mockUsePresetSampleFiles.mock.results[0].value;
    expect(sampleFilesHook.resetSampleFiles).toHaveBeenCalled();
    expect(result.current.isSubmitting).toBe(false);
  });

  it('normalizes and reports submit errors without switching tab', async () => {
    const props = buildProps();
    const error = new Error('submit failed');
    mockSubmitPreset.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useAddNewPresetTabController(props as never));

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(mockNormalizeAndPresentError).toHaveBeenCalledWith(error, { context: 'PhaseConfigSelectorModal' });
    expect(props.onSwitchToBrowse).not.toHaveBeenCalled();
    expect(result.current.isSubmitting).toBe(false);
  });

  it('clears edit mode and resets form when cancelling edit', () => {
    const editingPreset = {
      id: 'preset-1',
      metadata: {
        name: 'Editing Preset',
        description: 'desc',
        created_by: { is_you: true },
        is_public: true,
        created_at: '2026-01-01T00:00:00.000Z',
        phaseConfig: buildPhaseConfig(),
      },
    };

    const props = buildProps({ editingPreset, currentSettings: undefined });
    const { result } = renderHook(() => useAddNewPresetTabController(props as never));

    act(() => {
      result.current.handleCancelEdit();
    });

    expect(props.onClearEdit).toHaveBeenCalledTimes(1);
    const sampleFilesHook = mockUsePresetSampleFiles.mock.results[0].value;
    expect(sampleFilesHook.resetSampleFiles).toHaveBeenCalled();
  });
});
