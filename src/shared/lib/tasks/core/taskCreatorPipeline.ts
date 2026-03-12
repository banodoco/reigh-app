import { createTask, type BaseTaskParams, type TaskCreationResult } from '@/shared/lib/taskCreation';
import { rethrowTaskCreationError } from './taskCreationError';

interface TaskCreationPipelineConfig<TParams, TResult = TaskCreationResult> {
  params: TParams;
  context: string;
  validate?: (params: TParams) => void;
  buildTaskRequest: (params: TParams) => Promise<BaseTaskParams> | BaseTaskParams;
  onCreated?: (result: TaskCreationResult, params: TParams) => Promise<TResult> | TResult;
}

export async function runTaskCreationPipeline<TParams, TResult = TaskCreationResult>(
  config: TaskCreationPipelineConfig<TParams, TResult>,
): Promise<TResult> {
  const { params, context, validate, buildTaskRequest, onCreated } = config;

  try {
    validate?.(params);
    const taskRequest = await buildTaskRequest(params);
    const createdTask = await createTask(taskRequest);
    if (!onCreated) {
      return createdTask as TResult;
    }
    return await onCreated(createdTask, params);
  } catch (error) {
    rethrowTaskCreationError(error, { context, showToast: false });
  }
}
