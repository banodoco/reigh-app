import { describe, expect, it, vi } from 'vitest';
import { runBatchTaskPipeline } from './batchTaskPipeline';
import type { TaskCreationResult } from '../../taskCreation';

function createResult(taskId: string): TaskCreationResult {
  return {
    task_id: taskId,
    status: 'queued',
  };
}

describe('runBatchTaskPipeline', () => {
  it('validates, builds params, creates tasks, and reports settled results', async () => {
    const batchParams = { ids: ['a', 'b', 'c'] };
    const validateBatchParams = vi.fn();
    const buildSingleTaskParams = vi.fn().mockResolvedValue(['a', 'b', 'c']);
    const createSingleTask = vi
      .fn<[string], Promise<TaskCreationResult>>()
      .mockResolvedValueOnce(createResult('task-a'))
      .mockRejectedValueOnce(new Error('failed-b'))
      .mockResolvedValueOnce(createResult('task-c'));
    const onSettledResults = vi.fn();

    const output = await runBatchTaskPipeline({
      batchParams,
      validateBatchParams,
      buildSingleTaskParams,
      createSingleTask,
      operationName: 'batch-test',
      onSettledResults,
    });

    expect(validateBatchParams).toHaveBeenCalledTimes(1);
    expect(validateBatchParams).toHaveBeenCalledWith(batchParams);
    expect(buildSingleTaskParams).toHaveBeenCalledTimes(1);
    expect(buildSingleTaskParams).toHaveBeenCalledWith(batchParams);
    expect(createSingleTask).toHaveBeenCalledTimes(3);
    expect(createSingleTask).toHaveBeenNthCalledWith(1, 'a');
    expect(createSingleTask).toHaveBeenNthCalledWith(2, 'b');
    expect(createSingleTask).toHaveBeenNthCalledWith(3, 'c');

    expect(onSettledResults).toHaveBeenCalledTimes(1);
    const settled = onSettledResults.mock.calls[0][0] as PromiseSettledResult<TaskCreationResult>[];
    expect(settled).toHaveLength(3);
    expect(settled.map((result) => result.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);

    expect(output).toEqual([createResult('task-a'), createResult('task-c')]);
  });

  it('throws when every task fails', async () => {
    await expect(runBatchTaskPipeline({
      batchParams: { ids: ['x'] },
      validateBatchParams: () => {},
      buildSingleTaskParams: async () => ['x'],
      createSingleTask: async () => {
        throw new Error('boom');
      },
      operationName: 'all-fail',
    })).rejects.toThrow('All batch tasks failed');
  });
});
