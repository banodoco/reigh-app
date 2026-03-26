import type { ResolverResult, TaskFamilyResolver, TaskInsertObject } from "./types.ts";
import { validateRequiredFields } from "./shared/validation.ts";

interface EditVideoOrchestratorInput {
  orchestrator_details: Record<string, unknown>;
  tool_type?: string;
  parent_generation_id?: string;
  based_on?: string;
}

function buildQueuedTask(
  projectId: string,
  taskType: string,
  params: Record<string, unknown>,
): TaskInsertObject {
  return {
    project_id: projectId,
    task_type: taskType,
    params,
    status: "Queued",
    created_at: new Date().toISOString(),
    dependant_on: null,
  };
}

export const editVideoOrchestratorResolver: TaskFamilyResolver = (request, context): ResolverResult => {
  const input = request.input as unknown as EditVideoOrchestratorInput;
  validateRequiredFields(input, ["orchestrator_details"]);

  return {
    tasks: [
      buildQueuedTask(context.projectId, "edit_video_orchestrator", {
        orchestrator_details: input.orchestrator_details,
        ...(input.tool_type ? { tool_type: input.tool_type } : {}),
        ...(input.parent_generation_id ? { parent_generation_id: input.parent_generation_id } : {}),
        ...(input.based_on ? { based_on: input.based_on } : {}),
      }),
    ],
  };
};
