import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  runPlaceholder: vi.fn(),
  createTask: vi.fn(),
}));

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: { error: mocks.toastError },
}));

vi.mock('@/shared/lib/taskCreation', () => ({
  generateRunId: () => 'run-1',
  createTask: (...args: unknown[]) => mocks.createTask(...args),
}));

vi.mock('@/shared/hooks/tasks/useTaskPlaceholder', () => ({
  useTaskPlaceholder: () => mocks.runPlaceholder,
}));

vi.mock('@/shared/settings/hooks/useEditVideoSettings', () => ({
  useEditVideoSettings: () => ({
    settings: {
      prompt: 'replace this portion',
      negativePrompt: '',
      gapFrameCount: 12,
      contextFrameCount: 8,
      enhancePrompt: false,
      priority: 0,
      model: 'wan_2_2_test',
      seed: 1,
      numInferenceSteps: 6,
      guidanceScale: 3,
    },
  }),
}));

vi.mock('@/domains/lora/hooks/useLoraManager', () => ({
  useLoraManager: () => ({ selectedLoras: [] }),
}));

vi.mock('@/features/resources/hooks/useResources', () => ({
  usePublicLoras: () => ({ data: [] }),
}));

vi.mock('./useVideoEditingSelections', () => ({
  useVideoEditingSelections: () => ({
    selections: [{ id: 'selection-1', start: 1, end: 2, gapFrameCount: 12, prompt: '' }],
    activeSelectionId: null,
    setActiveSelectionId: vi.fn(),
    handleUpdateSelection: vi.fn(),
    handleAddSelection: vi.fn(),
    handleRemoveSelection: vi.fn(),
    handleUpdateSelectionSettings: vi.fn(),
    validation: { isValid: true, errors: [] },
    maxContextFrames: 8,
    selectionsToFrameRanges: vi.fn(() => []),
  }),
}));

import { useVideoEditing } from './useVideoEditing';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => React.createElement(
    QueryClientProvider,
    { client: queryClient },
    children,
  );
}

describe('useVideoEditing legacy boundary', () => {
  it('rejects valid lightbox replacement before placeholder or payload work', async () => {
    const { result } = renderHook(
      () => useVideoEditing({
        media: { id: 'generation-1' } as never,
        selectedProjectId: 'project-1',
        projectAspectRatio: '16:9',
        isVideo: true,
        videoDuration: 10,
        videoUrl: 'https://cdn.example/source.mp4',
      }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('Legacy task family edit_video_orchestrator is unsupported'));
    expect(mocks.runPlaceholder).not.toHaveBeenCalled();
    expect(mocks.createTask).not.toHaveBeenCalled();
    expect(result.current.isGenerating).toBe(false);
  });
});
