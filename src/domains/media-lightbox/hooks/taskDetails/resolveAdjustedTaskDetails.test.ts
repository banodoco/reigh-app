// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { buildTaskDetailsData } from '../../../../shared/lib/taskDetails/taskDetailsContract';
import type { Task } from '../../../../types/tasks';
import { resolveAdjustedTaskDetails } from './resolveAdjustedTaskDetails';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    taskType: 'image_edit',
    params: {},
    status: 'Complete',
    createdAt: '2026-03-11T00:00:00.000Z',
    projectId: 'project-1',
    ...overrides,
  } as Task;
}

describe('resolveAdjustedTaskDetails', () => {
  it('prefers matching task details params over variant fallback data', () => {
    const taskDetailsData = buildTaskDetailsData({
      task: makeTask({
        id: 'source-task',
        params: { input_image: 'from-task.png' },
      }),
      taskId: 'source-task',
      onApplySettingsFromTask: vi.fn(),
      onClose: vi.fn(),
    });
    const variantSourceTaskError = new Error('fetch failed');

    const result = resolveAdjustedTaskDetails({
      activeVariant: {
        id: 'variant-1',
        params: { source_task_id: 'source-task', input_image: 'from-variant.png' },
        variant_type: 'edit',
        created_at: '2026-03-11T01:00:00.000Z',
      },
      taskDetailsData,
      variantSourceTask: { params: JSON.stringify({ input_image: 'from-source-task.png' }) },
      variantSourceTaskError,
      isLoadingVariantTask: false,
      isLoadingVariants: false,
      initialVariantId: undefined,
    });

    expect(result).toEqual(
      expect.objectContaining({
        taskId: 'source-task',
        status: 'ok',
        error: null,
        inputImages: ['from-task.png'],
      }),
    );
    expect(result?.task).toEqual(
      expect.objectContaining({
        id: 'variant-1',
        params: { input_image: 'from-task.png' },
      }),
    );
    expect(result?.onApplySettingsFromTask).toBe(taskDetailsData.onApplySettingsFromTask);
    expect(result?.onClose).toBe(taskDetailsData.onClose);
  });

  it('parses source task params and surfaces source-task errors when needed', () => {
    const variantSourceTaskError = new Error('fetch failed');

    const result = resolveAdjustedTaskDetails({
      activeVariant: {
        id: 'variant-2',
        params: { source_task_id: 'source-task', input_image: 'from-variant.png' },
        variant_type: 'variant',
        created_at: '2026-03-11T02:00:00.000Z',
      },
      taskDetailsData: undefined,
      variantSourceTask: { params: JSON.stringify({ input_image: 'from-source-task.png' }) },
      variantSourceTaskError,
      isLoadingVariantTask: true,
      isLoadingVariants: false,
      initialVariantId: undefined,
    });

    expect(result).toEqual(
      expect.objectContaining({
        taskId: 'source-task',
        status: 'error',
        error: variantSourceTaskError,
        isLoading: true,
        inputImages: ['from-source-task.png'],
      }),
    );
    expect(result?.task).toEqual(
      expect.objectContaining({
        id: 'variant-2',
        params: { input_image: 'from-source-task.png' },
      }),
    );
  });

  it('keeps task details in a loading state while waiting for the requested initial variant', () => {
    const taskDetailsData = buildTaskDetailsData({
      task: makeTask(),
      taskId: 'task-1',
      isLoading: false,
    });

    const result = resolveAdjustedTaskDetails({
      activeVariant: null,
      taskDetailsData,
      variantSourceTask: null,
      variantSourceTaskError: null,
      isLoadingVariantTask: false,
      isLoadingVariants: true,
      initialVariantId: 'variant-expected',
    });

    expect(result).toEqual(
      expect.objectContaining({
        taskId: 'task-1',
        isLoading: true,
        status: 'ok',
      }),
    );
  });
});
