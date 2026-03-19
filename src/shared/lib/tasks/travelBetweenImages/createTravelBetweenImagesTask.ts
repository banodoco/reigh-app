import {
  resolveProjectResolution,
  generateTaskId,
  generateRunId,
  createTask,
  type BaseTaskParams,
  type TaskCreationResult,
} from "../../taskCreation";
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type {
  TravelBetweenImagesTaskInput,
  TravelBetweenImagesTaskWithParentGenerationResult,
} from './taskTypes';
import { validateTravelBetweenImagesParams, buildTravelBetweenImagesPayload } from './payloadBuilder';
import { TOOL_IDS } from '@/shared/lib/tooling/toolIds';
import { ensureShotParentGenerationId } from '../shotParentGeneration';

interface PreparedTravelBetweenImagesTaskRequest {
  taskRequest: BaseTaskParams;
  parentGenerationId: string | undefined;
}

async function prepareTravelBetweenImagesTaskRequest(
  params: TravelBetweenImagesTaskInput,
): Promise<PreparedTravelBetweenImagesTaskRequest> {
  const normalizedParams = params.model_name?.includes('ltx2')
    ? { ...params, turbo_mode: false }
    : params;

  validateTravelBetweenImagesParams(normalizedParams);

  const { resolution: finalResolution } = await resolveProjectResolution(
    normalizedParams.project_id,
    normalizedParams.resolution
  );

  const orchestratorTaskId = generateTaskId("sm_travel_orchestrator");
  const runId = generateRunId();

  const effectiveParentGenerationId = await ensureShotParentGenerationId({
    projectId: normalizedParams.project_id,
    shotId: normalizedParams.shot_id,
    parentGenerationId: normalizedParams.parent_generation_id,
    context: 'TravelBetweenImages',
  });

  const orchestratorPayload = buildTravelBetweenImagesPayload(
    normalizedParams,
    finalResolution,
    orchestratorTaskId,
    runId,
    effectiveParentGenerationId
  );

  const isTurboMode = normalizedParams.turbo_mode === true;
  const taskType = isTurboMode ? 'wan_2_2_i2v' : 'travel_orchestrator';

  return {
    taskRequest: {
      project_id: normalizedParams.project_id,
      task_type: taskType,
      params: {
        tool_type: TOOL_IDS.TRAVEL_BETWEEN_IMAGES,
        orchestrator_details: orchestratorPayload,
        ...(effectiveParentGenerationId ? { parent_generation_id: effectiveParentGenerationId } : {}),
        ...(normalizedParams.generation_name ? { generation_name: normalizedParams.generation_name } : {}),
      },
    },
    parentGenerationId: effectiveParentGenerationId,
  };
}

/**
 * Creates a travel between images task using the unified approach.
 * This replaces the direct call to the steerable-motion edge function.
 *
 * @param params - Travel between images task parameters
 * @returns Promise resolving to the created task
 */
export async function createTravelBetweenImagesTask(
  params: TravelBetweenImagesTaskInput,
): Promise<TaskCreationResult> {
  try {
    const { taskRequest } = await prepareTravelBetweenImagesTaskRequest(params);
    return await createTask(taskRequest);
  } catch (error) {
    throw normalizeAndPresentError(error, { context: 'TravelBetweenImages', showToast: false });
  }
}

/**
 * Explicit outlier for callers that need the created task and ensured parent generation id.
 */
export async function createTravelBetweenImagesTaskWithParentGeneration(
  params: TravelBetweenImagesTaskInput,
): Promise<TravelBetweenImagesTaskWithParentGenerationResult> {
  try {
    const prepared = await prepareTravelBetweenImagesTaskRequest(params);
    const result = await createTask(prepared.taskRequest);

    return {
      task: result,
      parentGenerationId: prepared.parentGenerationId,
    };
  } catch (error) {
    throw normalizeAndPresentError(error, { context: 'TravelBetweenImages', showToast: false });
  }
}
