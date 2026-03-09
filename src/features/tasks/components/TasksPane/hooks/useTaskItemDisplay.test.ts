import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationRow } from '@/domains/generation/types';
import type { Task } from '@/types/tasks';
import { useTaskItemDisplay } from './useTaskItemDisplay';

const mocks = vi.hoisted(() => ({
  useTaskTimestamp: vi.fn(() => 'created-ts'),
  useRelativeTimestamp: vi.fn(({ preset }: { preset: string }) => `${preset}-ts`),
  getTaskDisplayName: vi.fn((taskType: string) => `display:${taskType}`),
  getAbbreviatedTaskName: vi.fn((name: string) => `abbr:${name}`),
}));

vi.mock('@/shared/hooks/useUpdatingTimestamp', () => ({
  useTaskTimestamp: (...args: unknown[]) => mocks.useTaskTimestamp(...args),
  useRelativeTimestamp: (...args: unknown[]) => mocks.useRelativeTimestamp(...args),
}));

vi.mock('@/shared/lib/taskConfig', () => ({
  getTaskDisplayName: (...args: unknown[]) => mocks.getTaskDisplayName(...args),
}));

vi.mock('@/features/tasks/components/TasksPane/utils/task-utils', () => ({
  getAbbreviatedTaskName: (...args: unknown[]) => mocks.getAbbreviatedTaskName(...args),
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    status: 'Complete',
    taskType: 'image_generation',
    ...overrides,
  } as unknown as Task;
}

describe('useTaskItemDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds prompt preview, variant name, timestamps, and status badge for non-video tasks', () => {
    const longPrompt = 'a'.repeat(60);
    const task = makeTask({
      createdAt: undefined,
      generationStartedAt: undefined,
      generationProcessedAt: undefined,
    }) as Task & {
      created_at?: string;
      generation_started_at?: string;
      generation_processed_at?: string;
    };
    task.created_at = '2026-01-01T00:00:00Z';
    task.generation_started_at = '2026-01-01T00:01:00Z';
    task.generation_processed_at = '2026-01-01T00:02:00Z';

    const { result } = renderHook(() =>
      useTaskItemDisplay({
        task,
        parsedTaskParams: {},
        promptText: longPrompt,
        taskTypeDisplayName: null,
        isVideoTask: false,
        generationData: { name: 'Variant A' } as unknown as GenerationRow,
        videoOutputs: null,
      }),
    );

    expect(mocks.useTaskTimestamp).toHaveBeenCalledWith('2026-01-01T00:00:00Z');
    expect(mocks.useRelativeTimestamp).toHaveBeenNthCalledWith(1, {
      date: '2026-01-01T00:01:00Z',
      preset: 'processing',
    });
    expect(mocks.useRelativeTimestamp).toHaveBeenNthCalledWith(2, {
      date: '2026-01-01T00:02:00Z',
      preset: 'completed',
    });
    expect(mocks.getTaskDisplayName).toHaveBeenCalledWith('image_generation');
    expect(mocks.getAbbreviatedTaskName).toHaveBeenCalledWith('display:image_generation');

    expect(result.current.createdTimeAgo).toBe('created-ts');
    expect(result.current.processingTime).toBe('processing-ts');
    expect(result.current.completedTime).toBe('completed-ts');
    expect(result.current.abbreviatedTaskType).toBe('abbr:display:image_generation');
    expect(result.current.shouldShowPromptPreview).toBe(true);
    expect(result.current.promptPreviewText).toBe(`${'a'.repeat(50)}...`);
    expect(result.current.variantName).toBe('Variant A');
    expect(result.current.statusBadgeClass).toBe('bg-green-500 text-green-100');
    expect(result.current.travelImageUrls).toEqual([]);
  });

  it('derives travel image previews and video variant name for video tasks', () => {
    const segmentImages = [
      'https://img/1.png',
      'https://img/2.png',
      'https://img/3.png',
      'https://img/4.png',
      'https://img/5.png',
    ];

    const { result } = renderHook(() =>
      useTaskItemDisplay({
        task: makeTask({
          status: 'In Progress',
          taskType: 'individual_travel_segment',
        }),
        parsedTaskParams: {
          orchestrator_details: {
            input_image_paths_resolved: ['https://img/wrong.png'],
          },
          input_image_paths_resolved: segmentImages,
        },
        promptText: 'video prompt',
        taskTypeDisplayName: 'Travel Between Images',
        isVideoTask: true,
        generationData: null,
        videoOutputs: [{ name: 'Video Variant 1' }] as unknown as GenerationRow[],
      }),
    );

    expect(result.current.travelImageUrls).toEqual(segmentImages);
    expect(result.current.imagesToShow).toEqual(segmentImages.slice(0, 4));
    expect(result.current.extraImageCount).toBe(1);
    expect(result.current.shouldShowPromptPreview).toBe(false);
    expect(result.current.variantName).toBe('Video Variant 1');
    expect(result.current.statusBadgeClass).toBe('bg-blue-500 text-blue-100');
    expect(result.current.abbreviatedTaskType).toBe('abbr:Travel Between Images');
  });
});
