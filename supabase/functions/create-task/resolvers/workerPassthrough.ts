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

    return {
      tasks: [{
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
