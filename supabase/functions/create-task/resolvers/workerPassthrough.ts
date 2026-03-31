/**
 * Passthrough resolver for worker-created child tasks.
 *
 * Worker orchestrators (e.g., join_clips_orchestrator) create child tasks
 * with internal params (file paths, orchestrator refs, etc.) that don't
 * need frontend-style validation. This resolver passes the input through
 * as-is, preserving the original task_type from the family name.
 */
import type { ResolverResult, TaskFamilyResolver } from "./types.ts";

export function createWorkerPassthroughResolver(taskType: string): TaskFamilyResolver {
  return (request, context): ResolverResult => {
    const params = request.input as Record<string, unknown>;
    const dependantOn = Array.isArray(params.dependant_on) ? params.dependant_on as string[] : null;
    // Workers pre-generate a task UUID and pass it as input.task_id.
    // Honor it so the returned ID matches dependant_on references from sibling tasks.
    const workerTaskId = typeof params.task_id === "string" ? params.task_id : undefined;

    return {
      tasks: [{
        ...(workerTaskId ? { id: workerTaskId } : {}),
        project_id: context.projectId,
        task_type: taskType,
        params,
        status: "Queued",
        created_at: new Date().toISOString(),
        dependant_on: dependantOn,
      }],
    };
  };
}
