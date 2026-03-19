import {
  TaskValidationError,
  resolveProjectResolution,
} from '../../../taskCreation';
import type { TaskCreationResult } from '../../../taskCreation';
import { composeTaskRequest } from '../../core/taskRequestComposer';
import { runTaskCreationPipeline } from '../../core/taskCreatorPipeline';
import { asString, toRecordOrEmpty } from '../../taskParamParsers';
import { buildIndividualTravelSegmentParams } from '../../segmentTaskPayload';
import { MAX_SEGMENT_FRAMES } from '../../segmentStateResolvers';
import type { IndividualTravelSegmentParams } from './types';
import { resolveSegmentGenerationRoute } from '../../segmentGenerationPersistence';
import { resolveSelectedModelFromModelName, getModelSpec } from '@/tools/travel-between-images/modelCapabilities';

export type { IndividualTravelSegmentParams } from './types';

/**
 * Validates individual travel segment parameters
 */
function validateIndividualTravelSegmentParams(params: IndividualTravelSegmentParams): void {
  const errors: string[] = [];

  if (!params.project_id) {
    errors.push('project_id is required');
  }

  if (!params.parent_generation_id && !params.shot_id) {
    errors.push('Either parent_generation_id or shot_id is required');
  }

  if (typeof params.segment_index !== 'number' || params.segment_index < 0) {
    errors.push('segment_index must be a non-negative number');
  }

  if (!params.start_image_url) {
    errors.push('start_image_url is required');
  }

  const numFrames = (
    typeof params.num_frames === 'number'
      ? params.num_frames
      : (typeof params.originalParams?.num_frames === 'number' ? params.originalParams.num_frames : undefined)
  ) ?? 49;

  const modelMaxFrames = getModelSpec(
    resolveSelectedModelFromModelName(params.model_name)
  ).maxFrames ?? MAX_SEGMENT_FRAMES;

  if (numFrames > modelMaxFrames) {
    errors.push(`num_frames (${numFrames}) exceeds maximum of ${modelMaxFrames} frames per segment`);
  }

  if (errors.length > 0) {
    throw new TaskValidationError(errors.join(', '));
  }
}

/**
 * Creates an individual travel segment regeneration task
 */
export async function createIndividualTravelSegmentTask(
  params: IndividualTravelSegmentParams,
): Promise<TaskCreationResult> {
  return runTaskCreationPipeline({
    params,
    context: 'IndividualTravelSegment',
    validate: validateIndividualTravelSegmentParams,
    buildTaskRequest: async (requestParams) => {
      const { parentGenerationId: effectiveParentGenerationId, childGenerationId } = await resolveSegmentGenerationRoute({
        projectId: requestParams.project_id,
        shotId: requestParams.shot_id,
        parentGenerationId: requestParams.parent_generation_id,
        childGenerationId: requestParams.child_generation_id,
        pairShotGenerationId: requestParams.pair_shot_generation_id,
        segmentIndex: requestParams.segment_index,
        context: 'IndividualTravelSegment',
      });

      const paramsWithIds = {
        ...requestParams,
        parent_generation_id: effectiveParentGenerationId,
        child_generation_id: childGenerationId,
      };

      const directResolution = asString(requestParams.parsed_resolution_wh);
      const originalParams = toRecordOrEmpty(requestParams.originalParams);
      const originalOrchestratorDetails = toRecordOrEmpty(originalParams.orchestrator_details);
      const origResolutionValue =
        originalParams.parsed_resolution_wh ?? originalOrchestratorDetails.parsed_resolution_wh;
      const origResolution = directResolution
        ?? (typeof origResolutionValue === 'string' ? origResolutionValue : undefined);
      const { resolution: finalResolution } = await resolveProjectResolution(
        requestParams.project_id,
        origResolution,
      );

      const taskParams = buildIndividualTravelSegmentParams(paramsWithIds, finalResolution);

      return composeTaskRequest({
        source: requestParams,
        taskType: 'individual_travel_segment',
        params: taskParams,
      });
    },
  });
}
