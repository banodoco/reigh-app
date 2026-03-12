import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMaskedEditTask } from './maskedEditTaskBuilder';

const mocks = vi.hoisted(() => ({
  buildHiresFixParams: vi.fn(),
  processBatchResults: vi.fn(),
  runTaskCreationPipeline: vi.fn(),
  composeTaskParams: vi.fn(),
  composeTaskRequest: vi.fn(),
}));

vi.mock('../../taskCreation', () => ({
  buildHiresFixParams: (...args: unknown[]) => mocks.buildHiresFixParams(...args),
  processBatchResults: (...args: unknown[]) => mocks.processBatchResults(...args),
}));

vi.mock('../core/taskCreatorPipeline', () => ({
  runTaskCreationPipeline: (...args: unknown[]) => mocks.runTaskCreationPipeline(...args),
}));

vi.mock('../core/taskRequestComposer', () => ({
  composeTaskParams: (...args: unknown[]) => mocks.composeTaskParams(...args),
  composeTaskRequest: (...args: unknown[]) => mocks.composeTaskRequest(...args),
}));

describe('createMaskedEditTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildHiresFixParams.mockReturnValue({ hires_scale: 2 });
    mocks.composeTaskParams.mockReturnValue({ composed: true });
    mocks.composeTaskRequest.mockImplementation(({ source, taskType, params }) => ({
      project_id: source.project_id,
      task_type: taskType,
      params,
    }));
  });

  it('builds and runs a single masked-edit task when num_generations is 1', async () => {
    mocks.runTaskCreationPipeline.mockImplementation(async ({ params, buildTaskRequest }) => {
      await buildTaskRequest(params);
      return { task_id: 'task-single', status: 'pending' };
    });

    const result = await createMaskedEditTask(
      {
        taskType: 'image_inpaint',
        context: 'MaskedEdit.single',
        batchOperationName: 'masked-edit batch',
      },
      {
        project_id: 'project-1',
        image_url: 'https://example.com/image.png',
        mask_url: 'https://example.com/mask.png',
        prompt: 'remove object',
        num_generations: 1,
        generation_id: 'gen-1',
        shot_id: 'shot-1',
        tool_type: 'edit-images',
        create_as_generation: true,
        source_variant_id: 'variant-1',
        qwen_edit_model: 'qwen-edit',
        hires_fix: { hires_scale: 2 },
      },
    );

    expect(result).toBe('task-single');
    expect(mocks.runTaskCreationPipeline).toHaveBeenCalledTimes(1);
    expect(mocks.buildHiresFixParams).toHaveBeenCalledWith({ hires_scale: 2 });
    expect(mocks.composeTaskParams).toHaveBeenCalledTimes(1);
    expect(mocks.composeTaskRequest).toHaveBeenCalledWith({
      source: expect.objectContaining({ project_id: 'project-1' }),
      taskType: 'image_inpaint',
      params: { composed: true },
    });
  });

  it('creates a batch and returns the first successful task id when num_generations > 1', async () => {
    mocks.runTaskCreationPipeline
      .mockResolvedValueOnce({ task_id: 'task-a', status: 'pending' })
      .mockResolvedValueOnce({ task_id: 'task-b', status: 'pending' })
      .mockResolvedValueOnce({ task_id: 'task-c', status: 'pending' });

    mocks.processBatchResults.mockImplementation((results: PromiseSettledResult<{ task_id: string; status: string }>[]) => {
      return results
        .filter((entry): entry is PromiseFulfilledResult<{ task_id: string; status: string }> => entry.status === 'fulfilled')
        .map((entry) => entry.value);
    });

    const result = await createMaskedEditTask(
      {
        taskType: 'annotated_image_edit',
        context: 'MaskedEdit.batch',
        batchOperationName: 'annotated edit batch',
      },
      {
        project_id: 'project-2',
        image_url: 'https://example.com/image.png',
        mask_url: 'https://example.com/mask.png',
        prompt: 'enhance details',
        num_generations: 3,
      },
    );

    expect(mocks.runTaskCreationPipeline).toHaveBeenCalledTimes(3);
    expect(mocks.processBatchResults).toHaveBeenCalledTimes(1);
    expect(mocks.processBatchResults).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ status: 'fulfilled' }),
      ]),
      'annotated edit batch',
    );
    expect(result).toBe('task-a');
  });
});
