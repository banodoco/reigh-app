import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TaskValidationError } from '@/shared/lib/taskCreation';

const { mockCreateTask, mockNormalizeAndPresentError } = vi.hoisted(() => ({
  mockCreateTask: vi.fn(),
  mockNormalizeAndPresentError: vi.fn((error: unknown) => error),
}));

vi.mock('@/shared/lib/taskCreation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/taskCreation')>();
  return {
    ...actual,
    createTask: (...args: unknown[]) => mockCreateTask(...args),
  };
});

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mockNormalizeAndPresentError(...args),
}));

import { runTaskCreationPipeline } from '../taskCreatorPipeline';

describe('runTaskCreationPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs validate, builds request, and delegates to createTask', async () => {
    const validate = vi.fn();
    const buildTaskRequest = vi.fn().mockResolvedValue({
      project_id: 'project-1',
      task_type: 'image',
      params: { prompt: 'hello' },
    });
    mockCreateTask.mockResolvedValue({ task_id: 'task-1', status: 'pending' });

    const result = await runTaskCreationPipeline({
      params: { prompt: 'hello' },
      context: 'task-pipeline',
      validate,
      buildTaskRequest,
    });

    expect(validate).toHaveBeenCalledWith({ prompt: 'hello' });
    expect(buildTaskRequest).toHaveBeenCalledWith({ prompt: 'hello' });
    expect(mockCreateTask).toHaveBeenCalledWith({
      project_id: 'project-1',
      task_type: 'image',
      params: { prompt: 'hello' },
    });
    expect(result).toEqual({ task_id: 'task-1', status: 'pending' });
  });

  it('preserves task validation errors without normalization', async () => {
    const validationError = new TaskValidationError('invalid params', 'prompt');

    await expect(
      runTaskCreationPipeline({
        params: { prompt: '' },
        context: 'task-pipeline',
        validate: () => {
          throw validationError;
        },
        buildTaskRequest: () => ({
          project_id: 'project-1',
          task_type: 'image',
          params: {},
        }),
      }),
    ).rejects.toThrow('invalid params');

    expect(mockCreateTask).not.toHaveBeenCalled();
    expect(mockNormalizeAndPresentError).not.toHaveBeenCalled();
  });

  it('normalizes and rethrows createTask failures', async () => {
    const createTaskError = new Error('insert failed');
    mockCreateTask.mockRejectedValue(createTaskError);

    await expect(
      runTaskCreationPipeline({
        params: { prompt: 'hello' },
        context: 'task-pipeline',
        buildTaskRequest: () => ({
          project_id: 'project-1',
          task_type: 'image',
          params: { prompt: 'hello' },
        }),
      }),
    ).rejects.toThrow('insert failed');

    expect(mockNormalizeAndPresentError).toHaveBeenCalledWith(createTaskError, {
      context: 'task-pipeline',
      showToast: false,
    });
  });
});
