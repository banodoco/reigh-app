// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { withEdgeRequest } from "../_shared/edgeHandler.ts";
import { jsonResponse } from "../_shared/http.ts";
import { authorizeTaskActor } from "../_shared/taskActorPolicy.ts";

/**
 * Edge function: get-task-output
 *
 * Fetches the output_location and status for a specific task.
 * Used by workers to get outputs from dependency tasks (e.g., final_stitch getting transition outputs).
 *
 * - Service-role key: can fetch any task
 * - User token: can only fetch tasks from their own projects
 *
 * POST /functions/v1/get-task-output
 * Headers: Authorization: Bearer <service-key or PAT>
 * Body: { "task_id": "uuid" }
 *
 * Returns:
 * - 200 OK with { status, output_location }
 * - 400 Bad Request if task_id missing
 * - 401 Unauthorized if no valid token
 * - 403 Forbidden if user doesn't own the task's project
 * - 404 Not Found if task doesn't exist
 * - 500 Internal Server Error
 */
serve((req) => withEdgeRequest(req, {
  functionName: "get-task-output",
  logPrefix: "[GET-TASK-OUTPUT]",
  parseBody: "strict",
}, async ({ supabaseAdmin, logger, body, auth }) => {
  const taskId = typeof body.task_id === 'string' || typeof body.task_id === 'number'
    ? String(body.task_id)
    : '';
  if (!taskId) {
    logger.error("Missing task_id");
    return jsonResponse({ error: "task_id is required" }, 400);
  }

  logger.setDefaultTaskId(taskId);

  const actor = await authorizeTaskActor({
    supabaseAdmin,
    taskId,
    auth: auth!,
    logPrefix: "[GET-TASK-OUTPUT]",
  });
  if (!actor.ok) {
    logger.error("Task access denied", {
      task_id: taskId,
      error: actor.error,
      status_code: actor.statusCode,
    });
    return jsonResponse({ error: actor.error }, actor.statusCode);
  }

  // Fetch the task with all needed fields
  const { data: task, error: taskError } = await supabaseAdmin
    .from("tasks")
    .select("id, status, output_location, project_id, params, dependant_on")
    .eq("id", taskId)
    .single();

  if (taskError || !task) {
    logger.error("Task not found", { error: taskError?.message });
    return jsonResponse({ error: "Task not found" }, 404);
  }

  logger.info("Returning task output", { status: task.status, has_output: !!task.output_location });
  return jsonResponse({
    status: task.status,
    output_location: task.output_location,
    params: task.params,
    dependant_on: task.dependant_on,
  }, 200);
}));
