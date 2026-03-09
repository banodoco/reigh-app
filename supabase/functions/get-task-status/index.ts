// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { withEdgeRequest } from "../_shared/edgeHandler.ts";
import { jsonResponse } from "../_shared/http.ts";
import { ensureTaskActor, normalizeTaskId } from "../_shared/requestGuards.ts";
import { authorizeTaskActor } from "../_shared/taskActorPolicy.ts";

/**
 * Edge function: get-task-status
 *
 * Returns the current status of a task by ID.
 *
 * - Service-role key: can fetch any task
 * - User token: can only fetch tasks from their own projects
 */
serve((req) => {

  return withEdgeRequest(req, {
    functionName: "get-task-status",
    logPrefix: "[GET-TASK-STATUS]",
    parseBody: "strict",
    auth: {
      required: true,
    },
  }, async ({ supabaseAdmin, logger, body, auth }) => {
    const authResult = ensureTaskActor(auth, logger);
    if (!authResult.ok) return authResult.response;

    const taskId = normalizeTaskId(body.task_id);
    if (!taskId) {
      logger.error("Missing task_id");
      return jsonResponse({ error: "task_id is required" }, 400);
    }

    logger.setDefaultTaskId(taskId);

    const actor = await authorizeTaskActor({
      supabaseAdmin,
      taskId,
      auth: auth!,
      logPrefix: "[GET-TASK-STATUS]",
    });
    if (!actor.ok) {
      logger.error("Task access denied", {
        task_id: taskId,
        error: actor.error,
        status_code: actor.statusCode,
      });
      return jsonResponse({ error: actor.error }, actor.statusCode);
    }

    const { data: task, error: taskError } = await supabaseAdmin
      .from("tasks")
      .select("id, status")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      logger.error("Task not found", { error: taskError?.message });
      return jsonResponse({ error: "Task not found" }, 404);
    }

    logger.info("Returning task status", { status: task.status });
    return jsonResponse({ status: task.status }, 200);
  });
});
