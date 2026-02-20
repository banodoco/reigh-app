import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockCreateCharacterAnimateTask = vi.fn();
const mockAddIncomingTask = vi.fn().mockReturnValue('incoming-1');
const mockRemoveIncomingTask = vi.fn();
const mockHandleError = vi.fn();

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

vi.mock('@/shared/lib/errorHandling/handleError', () => ({
  handleError: (...args: unknown[]) => mockHandleError(...args),
}));

vi.mock('@/shared/contexts/IncomingTasksContext', () => ({
  useIncomingTasks: () => ({
    addIncomingTask: mockAddIncomingTask,
    removeIncomingTask: mockRemoveIncomingTask,
  }),
}));

import { useCharacterAnimateGenerate } from '../useCharacterAnimateGenerate';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
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
    expect(result.current.generateAnimationMutation.isPending).toBe(false);
  });

  it('creates task with correct params on mutate', async () => {
    const { result } = renderHook(
      () => useCharacterAnimateGenerate(defaultParams),
      { wrapper: createWrapper() },
    );

    act(() => {
      result.current.generateAnimationMutation.mutate();
    });

    await waitFor(() => {
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
  });

  it('uses defaultPrompt when prompt is empty', async () => {
    const params = { ...defaultParams, prompt: '' };
    const { result } = renderHook(
      () => useCharacterAnimateGenerate(params),
      { wrapper: createWrapper() },
    );

    act(() => {
      result.current.generateAnimationMutation.mutate();
    });

    await waitFor(() => {
      expect(mockCreateCharacterAnimateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'natural expression',
        }),
      );
    });
  });

  it('uses fallback prompt when both prompt and defaultPrompt are empty', async () => {
    const params = { ...defaultParams, prompt: '', defaultPrompt: undefined };
    const { result } = renderHook(
      () => useCharacterAnimateGenerate(params),
      { wrapper: createWrapper() },
    );

    act(() => {
      result.current.generateAnimationMutation.mutate();
    });

    await waitFor(() => {
      expect(mockCreateCharacterAnimateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'natural expression; preserve outfit details',
        }),
      );
    });
  });

  it('throws when characterImage is null', async () => {
    const params = { ...defaultParams, characterImage: null };
    const { result } = renderHook(
      () => useCharacterAnimateGenerate(params),
      { wrapper: createWrapper() },
    );

    act(() => {
      result.current.generateAnimationMutation.mutate();
    });

    await waitFor(() => {
      expect(mockHandleError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'No character image' }),
        expect.objectContaining({ context: 'CharacterAnimate' }),
      );
    });
  });

  it('throws when motionVideo is null', async () => {
    const params = { ...defaultParams, motionVideo: null };
    const { result } = renderHook(
      () => useCharacterAnimateGenerate(params),
      { wrapper: createWrapper() },
    );

    act(() => {
      result.current.generateAnimationMutation.mutate();
    });

    await waitFor(() => {
      expect(mockHandleError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'No motion video' }),
        expect.objectContaining({ context: 'CharacterAnimate' }),
      );
    });
  });

  it('throws when selectedProjectId is null', async () => {
    const params = { ...defaultParams, selectedProjectId: null };
    const { result } = renderHook(
      () => useCharacterAnimateGenerate(params),
      { wrapper: createWrapper() },
    );

    act(() => {
      result.current.generateAnimationMutation.mutate();
    });

    await waitFor(() => {
      expect(mockHandleError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'No project selected' }),
        expect.objectContaining({ context: 'CharacterAnimate' }),
      );
    });
  });

  it('adds and removes incoming task', async () => {
    const { result } = renderHook(
      () => useCharacterAnimateGenerate(defaultParams),
      { wrapper: createWrapper() },
    );

    act(() => {
      result.current.generateAnimationMutation.mutate();
    });

    await waitFor(() => {
      expect(mockAddIncomingTask).toHaveBeenCalledWith({
        taskType: 'character_animate',
        label: expect.any(String),
      });
    });

    await waitFor(() => {
      expect(mockRemoveIncomingTask).toHaveBeenCalledWith('incoming-1');
    });
  });

  it('shows success state briefly after task creation', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { result } = renderHook(
      () => useCharacterAnimateGenerate(defaultParams),
      { wrapper: createWrapper() },
    );

    act(() => {
      result.current.generateAnimationMutation.mutate();
    });

    await waitFor(() => {
      expect(result.current.showSuccessState).toBe(true);
    });

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
