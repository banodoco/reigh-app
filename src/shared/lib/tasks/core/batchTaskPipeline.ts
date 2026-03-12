import { processBatchResults, type TaskCreationResult } from '../../taskCreation';

interface BatchTaskPipelineConfig<TBatchParams, TSingleTaskParams> {
  batchParams: TBatchParams;
  validateBatchParams: (params: TBatchParams) => void;
  buildSingleTaskParams: (
    params: TBatchParams,
  ) => Promise<TSingleTaskParams[]> | TSingleTaskParams[];
  createSingleTask: (params: TSingleTaskParams) => Promise<TaskCreationResult>;
  operationName: string;
  onSettledResults?: (results: PromiseSettledResult<TaskCreationResult>[]) => void;
}

export async function runBatchTaskPipeline<TBatchParams, TSingleTaskParams>(
  config: BatchTaskPipelineConfig<TBatchParams, TSingleTaskParams>,
): Promise<TaskCreationResult[]> {
  config.validateBatchParams(config.batchParams);

  const taskParamsList = await config.buildSingleTaskParams(config.batchParams);
  const results = await Promise.allSettled(
    taskParamsList.map((taskParams) => config.createSingleTask(taskParams)),
  );

  config.onSettledResults?.(results);
  return processBatchResults(results, config.operationName);
}
