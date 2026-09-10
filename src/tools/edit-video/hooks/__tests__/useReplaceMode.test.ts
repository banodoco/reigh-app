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

vi.mock('@/shared/contexts/ProjectContext', () => ({
  useProjectSelectionContext: () => ({ selectedProjectId: 'project-1' }),
  useProjectCrudContext: () => ({ projects: [{ id: 'project-1', aspectRatio: '16:9' }] }),
}));

vi.mock('@/shared/settings/hooks/useEditVideoSettings', () => ({
  useEditVideoSettings: () => ({
    settings: {
      prompt: 'replace this portion',
      negativePrompt: '',
      contextFrameCount: 8,
      gapFrameCount: 12,
      enhancePrompt: false,
      motionMode: 'simple',
      phaseConfig: null,
      randomSeed: false,
      selectedPhasePresetId: null,
      model: 'wan_2_2_test',
      seed: 1,
      numInferenceSteps: 6,
      guidanceScale: 3,
      priority: 0,
    },
  }),
}));

vi.mock('@/domains/lora/hooks/useLoraManager', () => ({
  useLoraManager: () => ({ selectedLoras: [] }),
}));

vi.mock('@/features/resources/hooks/useResources', () => ({
  usePublicLoras: () => ({ data: [] }),
}));

vi.mock('@/shared/hooks/tasks/useTaskPlaceholder', () => ({
  useTaskPlaceholder: () => mocks.runPlaceholder,
}));

vi.mock('@/shared/lib/taskCreation', () => ({
  generateUUID: () => 'selection-1',
  generateRunId: () => 'run-1',
  createTask: (...args: unknown[]) => mocks.createTask(...args),
}));

import { useReplaceMode } from '../useReplaceMode';

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

describe('useReplaceMode legacy boundary', () => {
  it('rejects a valid replacement before placeholder or orchestration work', async () => {
    const { result } = renderHook(
      () => useReplaceMode({
        media: { id: 'generation-1' } as never,
        videoUrl: 'https://cdn.example/source.mp4',
        videoDuration: 10,
        videoFps: 16,
        initialSegments: [{ id: 'segment-1', start: 1, end: 2, gapFrameCount: 12, prompt: 'replace' }],
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
