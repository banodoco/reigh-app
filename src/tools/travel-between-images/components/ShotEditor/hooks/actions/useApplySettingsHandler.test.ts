// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useApplySettingsHandler } from './useApplySettingsHandler';
import type { ApplySettingsHandlerContexts } from './useApplySettingsHandler';

const mocks = vi.hoisted(() => ({
  fetchTask: vi.fn(),
  extractSettings: vi.fn(),
  replaceImagesIfRequested: vi.fn(),
  applyModelSettings: vi.fn(),
  applyPromptSettings: vi.fn(),
  applyGenerationSettings: vi.fn(),
  applyModeSettings: vi.fn(),
  applyAdvancedModeSettings: vi.fn(),
  applyTextPromptAddons: vi.fn(),
  applyMotionSettings: vi.fn(),
  applyLoRAs: vi.fn(),
  applyStructureVideo: vi.fn(),
  normalizeAndPresentError: vi.fn(),
  enqueueGenerationsInvalidation: vi.fn(),
  useQueryClient: vi.fn(),
}));

vi.mock('../../services/applySettingsService', () => ({
  fetchTask: (...args: unknown[]) => mocks.fetchTask(...args),
  extractSettings: (...args: unknown[]) => mocks.extractSettings(...args),
  replaceImagesIfRequested: (...args: unknown[]) => mocks.replaceImagesIfRequested(...args),
  applyModelSettings: (...args: unknown[]) => mocks.applyModelSettings(...args),
  applyPromptSettings: (...args: unknown[]) => mocks.applyPromptSettings(...args),
  applyGenerationSettings: (...args: unknown[]) => mocks.applyGenerationSettings(...args),
  applyModeSettings: (...args: unknown[]) => mocks.applyModeSettings(...args),
  applyAdvancedModeSettings: (...args: unknown[]) => mocks.applyAdvancedModeSettings(...args),
  applyTextPromptAddons: (...args: unknown[]) => mocks.applyTextPromptAddons(...args),
  applyMotionSettings: (...args: unknown[]) => mocks.applyMotionSettings(...args),
  applyLoRAs: (...args: unknown[]) => mocks.applyLoRAs(...args),
  applyStructureVideo: (...args: unknown[]) => mocks.applyStructureVideo(...args),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mocks.normalizeAndPresentError(...args),
}));

vi.mock('@/shared/hooks/invalidation/useGenerationInvalidation', () => ({
  enqueueGenerationsInvalidation: (...args: unknown[]) => mocks.enqueueGenerationsInvalidation(...args),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mocks.useQueryClient(),
}));

function createContexts(): ApplySettingsHandlerContexts {
  return {
    model: {} as never,
    prompts: {} as never,
    generation: {} as never,
    modes: {} as never,
    advanced: {} as never,
    textAddons: {} as never,
    motion: {} as never,
    loras: {} as never,
    structureVideo: {} as never,
  };
}

function createHandlerState(overrides: Record<string, unknown> = {}) {
  return {
    core: {
      projectId: 'project-1',
      selectedShot: { id: 'shot-1' },
      simpleFilteredImages: [{ id: 'img-1' }, { id: 'img-2' }],
    },
    contexts: createContexts(),
    mutations: {
      addImageToShotMutation: { mutateAsync: vi.fn() },
      removeImageFromShotMutation: { mutateAsync: vi.fn() },
      loadPositions: vi.fn(),
    },
    ...overrides,
  } as never;
}

describe('useApplySettingsHandler', () => {
  const fakeQueryClient = { invalidateQueries: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useQueryClient.mockReturnValue(fakeQueryClient);
    mocks.fetchTask.mockResolvedValue({
      status: 'found',
      taskData: { id: 'task-1', params: {} },
    });
    mocks.extractSettings.mockReturnValue({
      generation: {},
      images: [],
      prompts: {},
      modes: {},
      advanced: {},
      textAddons: {},
      motion: {},
      loras: {},
      structure: {},
    });
    mocks.replaceImagesIfRequested.mockResolvedValue(undefined);
    mocks.applyModelSettings.mockResolvedValue(undefined);
    mocks.applyPromptSettings.mockResolvedValue(undefined);
    mocks.applyGenerationSettings.mockResolvedValue(undefined);
    mocks.applyModeSettings.mockResolvedValue(undefined);
    mocks.applyAdvancedModeSettings.mockResolvedValue(undefined);
    mocks.applyTextPromptAddons.mockResolvedValue(undefined);
    mocks.applyMotionSettings.mockResolvedValue(undefined);
    mocks.applyLoRAs.mockResolvedValue(undefined);
    mocks.applyStructureVideo.mockResolvedValue(undefined);
  });

  it('returns a stable callback across re-renders', () => {
    const handlerState = createHandlerState();
    const { result, rerender } = renderHook(() => useApplySettingsHandler(handlerState));

    const firstCallback = result.current;
    rerender();
    expect(result.current).toBe(firstCallback);
  });

  it('calls applySettingsFromTask with the latest handler state via ref', async () => {
    const initialState = createHandlerState();
    const updatedContexts = createContexts();
    updatedContexts.model = { updated: true } as never;
    const updatedState = createHandlerState({ contexts: updatedContexts });

    const { result, rerender } = renderHook(
      ({ state }) => useApplySettingsHandler(state),
      { initialProps: { state: initialState } },
    );

    // Update the state (simulates a re-render with new props)
    rerender({ state: updatedState });

    await act(async () => {
      await result.current('task-42', false, ['img-a']);
    });

    // Should have fetched the task
    expect(mocks.fetchTask).toHaveBeenCalledWith('project-1', 'task-42');

    // Should apply model settings with the UPDATED contexts (from the ref)
    expect(mocks.applyModelSettings).toHaveBeenCalledWith(
      expect.anything(),
      updatedContexts.model,
    );
  });

  it('shows an error toast when simpleFilteredImages has missing IDs and replaceImages is true', async () => {
    const handlerState = createHandlerState({
      core: {
        projectId: 'project-1',
        selectedShot: { id: 'shot-1' },
        simpleFilteredImages: [{ id: 'img-1' }, { id: undefined }],
      },
    });

    const { result } = renderHook(() => useApplySettingsHandler(handlerState));

    await act(async () => {
      await result.current('task-99', true, ['img-x']);
    });

    // Should show toast error (showToast: true) and NOT proceed with applySettingsFromTask
    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        showToast: true,
        toastTitle: 'Loading shot data',
      }),
    );
    expect(mocks.fetchTask).not.toHaveBeenCalled();
  });

  it('does not show error toast when replaceImages is false even with missing IDs', async () => {
    const handlerState = createHandlerState({
      core: {
        projectId: 'project-1',
        selectedShot: { id: 'shot-1' },
        simpleFilteredImages: [{ id: undefined }],
      },
    });

    const { result } = renderHook(() => useApplySettingsHandler(handlerState));

    await act(async () => {
      await result.current('task-99', false, []);
    });

    // Should NOT show the loading toast - missing IDs only matter when replaceImages is true
    expect(mocks.normalizeAndPresentError).not.toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ toastTitle: 'Loading shot data' }),
    );
    // Should proceed to fetch the task
    expect(mocks.fetchTask).toHaveBeenCalledWith('project-1', 'task-99');
  });

  it('bails out with silent error when task is not found', async () => {
    mocks.fetchTask.mockResolvedValue({ status: 'missing' });

    const handlerState = createHandlerState();
    const { result } = renderHook(() => useApplySettingsHandler(handlerState));

    await act(async () => {
      await result.current('task-gone', false, []);
    });

    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        showToast: false,
        toastTitle: 'Failed to apply settings from task',
      }),
    );
    // Should NOT proceed to extract or apply settings
    expect(mocks.extractSettings).not.toHaveBeenCalled();
  });

  it('catches errors from applySettingsFromTask and presents them', async () => {
    const taskError = new Error('Network failure');
    mocks.fetchTask.mockRejectedValue(taskError);

    const handlerState = createHandlerState();
    const { result } = renderHook(() => useApplySettingsHandler(handlerState));

    await act(async () => {
      await result.current('task-fail', false, []);
    });

    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      taskError,
      expect.objectContaining({
        context: 'useApplySettingsHandler',
        toastTitle: 'Failed to apply settings from task',
      }),
    );
  });
});
