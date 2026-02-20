import {
  resolveProjectResolution,
  generateTaskId,
  generateRunId,
  createTask,
} from "../../taskCreation";
import { handleError } from '@/shared/lib/errorHandling/handleError';
import type { TravelBetweenImagesTaskParams, TravelBetweenImagesTaskResult } from './types';
import { validateTravelBetweenImagesParams, buildTravelBetweenImagesPayload } from './payloadBuilder';
import { TOOL_IDS } from '@/shared/lib/toolConstants';
import { ensureShotParentGenerationId } from '../shotParentGeneration';

/**
 * Creates a travel between images task using the unified approach.
 * This replaces the direct call to the steerable-motion edge function.
 *
 * @param params - Travel between images task parameters
 * @returns Promise resolving to the created task and parent generation ID
 */
export async function createTravelBetweenImagesTask(params: TravelBetweenImagesTaskParams): Promise<TravelBetweenImagesTaskResult> {

  try {
    // 1. Validate parameters
    validateTravelBetweenImagesParams(params);

    // 2. Resolve project resolution
    const { resolution: finalResolution } = await resolveProjectResolution(
      params.project_id,
      params.resolution
    );

    // 3. Generate IDs for orchestrator payload (not for database)
    const orchestratorTaskId = generateTaskId("sm_travel_orchestrator");
    const runId = generateRunId();

    // 4. Ensure we have a canonical parent generation for this shot.
    // If one already exists, reuse it. If none exists yet, create exactly one.
    const effectiveParentGenerationId = await ensureShotParentGenerationId({
      projectId: params.project_id,
      shotId: params.shot_id,
      parentGenerationId: params.parent_generation_id,
      context: 'TravelBetweenImages',
    });

    // 5. Build orchestrator payload (now includes parent_generation_id)
    const orchestratorPayload = buildTravelBetweenImagesPayload(
      params,
      finalResolution,
      orchestratorTaskId,
      runId,
      effectiveParentGenerationId
    );

    // 6. Determine task type based on turbo mode
    const isTurboMode = params.turbo_mode === true;
    const taskType = isTurboMode ? 'wan_2_2_i2v' : 'travel_orchestrator';

    // Create task using unified create-task function (no task_id - let DB auto-generate)
    const result = await createTask({
      project_id: params.project_id,
      task_type: taskType,
      params: {
        tool_type: TOOL_IDS.TRAVEL_BETWEEN_IMAGES, // Override tool_type for proper generation tagging
        orchestrator_details: orchestratorPayload,
        // Also store parent_generation_id at top level for easy access
        ...(effectiveParentGenerationId ? { parent_generation_id: effectiveParentGenerationId } : {}),
        // Also store at top level for direct access by worker (not just in orchestrator_details)
        ...(params.generation_name ? { generation_name: params.generation_name } : {}),
      }
    });

    return {
      task: result,
      parentGenerationId: effectiveParentGenerationId,
    };

  } catch (error) {
    throw handleError(error, { context: 'TravelBetweenImages', showToast: false });
  }
}
