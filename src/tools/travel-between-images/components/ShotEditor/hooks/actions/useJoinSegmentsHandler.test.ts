import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  supabaseFrom: vi.fn(),
  runPlaceholder: vi.fn(),
  createTask: vi.fn(),
}));

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: { error: mocks.toastError },
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({ from: mocks.supabaseFrom }),
}));

vi.mock('@/shared/hooks/tasks/useTaskPlaceholder', () => ({
  useTaskPlaceholder: () => mocks.runPlaceholder,
}));

vi.mock('@/shared/lib/taskCreation', () => ({
  createTask: (...args: unknown[]) => mocks.createTask(...args),
}));

import { useJoinSegmentsHandler } from './useJoinSegmentsHandler';

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

function createSettings() {
  return {
    prompt: 'bridge these segments',
    negativePrompt: '',
    contextFrameCount: 8,
    gapFrameCount: 12,
    replaceMode: true,
    keepBridgingImages: false,
    enhancePrompt: false,
    model: 'wan_2_2_test',
    numInferenceSteps: 6,
    guidanceScale: 3,
    seed: 1,
    motionMode: 'basic' as const,
    phaseConfig: undefined,
    selectedPhasePresetId: null,
    randomSeed: false,
    updateField: vi.fn(),
    updateFields: vi.fn(),
  };
}

const completedSlots = [
  {
    type: 'child' as const,
    index: 0,
    child: { id: 'segment-1', location: 'https://cdn.example/1.mp4', params: {} },
  },
  {
    type: 'child' as const,
    index: 1,
    child: { id: 'segment-2', location: 'https://cdn.example/2.mp4', params: {} },
  },
];

describe('useJoinSegmentsHandler legacy boundary', () => {
  it('rejects valid ordered joins before relationship reads or placeholder work', async () => {
    const { result } = renderHook(
      () => useJoinSegmentsHandler({
        projectId: 'project-1',
        selectedShotId: 'shot-1',
        effectiveAspectRatio: '16:9',
        audioUrl: 'https://cdn.example/audio.mp3',
        joinSegmentSlots: completedSlots as never,
        joinSelectedParent: null,
        joinLoraManager: { selectedLoras: [] },
        joinSettings: createSettings(),
      }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.handleJoinSegments();
    });

    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('Legacy task family join_clips is unsupported'));
    expect(mocks.supabaseFrom).not.toHaveBeenCalled();
    expect(mocks.runPlaceholder).not.toHaveBeenCalled();
    expect(mocks.createTask).not.toHaveBeenCalled();
    expect(result.current.isJoiningClips).toBe(false);
  });
});
