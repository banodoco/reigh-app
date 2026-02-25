import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockCreateCharacterAnimateTask = vi.fn();
const mockAddIncomingTask = vi.fn().mockReturnValue('incoming-1');
const mockRemoveIncomingTask = vi.fn();
const mockResolveTaskIds = vi.fn();
const mockHandleError = vi.fn();
const mockRefetchQueries = vi.fn(() => Promise.resolve());

vi.mock('../../lib/characterAnimate', () => ({
  createCharacterAnimateTask: (...args: unknown[]) => mockCreateCharacterAnimateTask(...args),
}));

vi.mock('@/shared/lib/queryKeys', () => ({
  queryKeys: {
    tasks: {
      all: ['tasks'],
      paginatedAll: ['tasks', 'paginated'],
      statusCountsAll: ['tasks', 'statusCounts'],
    },
    unified: {
      projectPrefix: (id: string | null) => ['unified', id],
    },
  },
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mockHandleError(...args),
}));

vi.mock('@/shared/contexts/IncomingTasksContext', () => ({
  useIncomingTasks: () => ({
    addIncomingTask: mockAddIncomingTask,
    removeIncomingTask: mockRemoveIncomingTask,
    resolveTaskIds: mockResolveTaskIds,
    cancelIncoming: vi.fn(),
    cancelAllIncoming: vi.fn(),
    wasCancelled: vi.fn(() => false),
    acknowledgeCancellation: vi.fn(),
  }),
}));

vi.mock('@/shared/lib/queryKeys/tasks', () => ({
  taskQueryKeys: {
    paginatedAll: ['tasks', 'paginated'],
    statusCountsAll: ['tasks', 'statusCounts'],
  },
}));

import { useCharacterAnimateGenerate } from '../useCharacterAnimateGenerate';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  // Override refetchQueries to track calls
  queryClient.refetchQueries = mockRefetchQueries as unknown as typeof queryClient.refetchQueries;
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useCharacterAnimateGenerate', () => {
  const defaultParams = {
    selectedProjectId: 'proj-1',
    characterImage: { url: 'https://example.com/character.png' },
    motionVideo: { url: 'https://example.com/motion.mp4', posterUrl: 'poster.jpg' },
    prompt: 'dancing character',
    localMode: 'animate' as const,
    defaultPrompt: 'natural expression',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCharacterAnimateTask.mockResolvedValue({ task_id: 'task-1' });
  });

  it('returns initial state', () => {
    const { result } = renderHook(
      () => useCharacterAnimateGenerate(defaultParams),
      { wrapper: createWrapper() },
    );

    expect(result.current.showSuccessState).toBe(false);
    expect(result.current.videosViewJustEnabled).toBe(false);
    expect(result.current.isGenerating).toBe(false);
  });

  it('creates task with correct params on generate', async () => {
    const { result } = renderHook(
      () => useCharacterAnimateGenerate(defaultParams),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(mockCreateCharacterAnimateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'proj-1',
        character_image_url: 'https://example.com/character.png',
        motion_video_url: 'https://example.com/motion.mp4',
        prompt: 'dancing character',
        mode: 'animate',
        resolution: '480p',
        random_seed: true,
      }),
    );
  });

  it('uses defaultPrompt when prompt is empty', async () => {
    const params = { ...defaultParams, prompt: '' };
    const { result } = renderHook(
      () => useCharacterAnimateGenerate(params),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(mockCreateCharacterAnimateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'natural expression',
      }),
    );
  });

  it('uses fallback prompt when both prompt and defaultPrompt are empty', async () => {
    const params = { ...defaultParams, prompt: '', defaultPrompt: undefined };
    const { result } = renderHook(
      () => useCharacterAnimateGenerate(params),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(mockCreateCharacterAnimateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'natural expression; preserve outfit details',
      }),
    );
  });

  it('handles error when characterImage is null', async () => {
    const params = { ...defaultParams, characterImage: null };
    const { result } = renderHook(
      () => useCharacterAnimateGenerate(params),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      // handleGenerate throws for null characterImage before calling run()
      try {
        await result.current.handleGenerate();
      } catch {
        // Expected - validation throws before run()
      }
    });
  });

  it('adds and removes incoming task', async () => {
    const { result } = renderHook(
      () => useCharacterAnimateGenerate(defaultParams),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(mockAddIncomingTask).toHaveBeenCalledWith({
      taskType: 'character_animate',
      label: expect.any(String),
      expectedCount: undefined,
    });

    expect(mockRemoveIncomingTask).toHaveBeenCalledWith('incoming-1');
  });

  it('shows success state briefly after task creation', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { result } = renderHook(
      () => useCharacterAnimateGenerate(defaultParams),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.handleGenerate();
    });

    expect(result.current.showSuccessState).toBe(true);
    expect(result.current.videosViewJustEnabled).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(result.current.showSuccessState).toBe(false);

    vi.useRealTimers();
  });

  it('setVideosViewJustEnabled allows external control', () => {
    const { result } = renderHook(
      () => useCharacterAnimateGenerate(defaultParams),
      { wrapper: createWrapper() },
    );

    act(() => {
      result.current.setVideosViewJustEnabled(true);
    });

    expect(result.current.videosViewJustEnabled).toBe(true);

    act(() => {
      result.current.setVideosViewJustEnabled(false);
    });

    expect(result.current.videosViewJustEnabled).toBe(false);
  });
});
