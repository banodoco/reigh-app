// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { buildOrchestratorRefOrFilter } from "../_shared/orchestratorReference.ts";
import { bootstrapEdgeHandler } from "../_shared/edgeHandler.ts";

/**
 * Edge function: get-orchestrator-children
 *
 * Fetches all child tasks for a given orchestrator task ID.
 * Used by workers to get segment, stitch, and join tasks for an orchestrator.
 *
 * - Service-role key: can fetch any orchestrator's children
 * - User token: can only fetch tasks from their own projects
 *
 * POST /functions/v1/get-orchestrator-children
 * Headers: Authorization: Bearer <service-key or PAT>
 * Body: { "orchestrator_task_id": "uuid" }
 *
 * Returns:
 * - 200 OK with { tasks: [...] }
 * - 400 Bad Request if orchestrator_task_id missing
 * - 401 Unauthorized if no valid token
 * - 403 Forbidden if user doesn't own the tasks' project
 * - 500 Internal Server Error
 */
serve(async (req) => {
  const bootstrap = await bootstrapEdgeHandler(req, {
    functionName: "get-orchestrator-children",
    logPrefix: "[GET-ORCHESTRATOR-CHILDREN]",
    parseBody: "strict",
    errorResponseFormat: "text",
    auth: {
      required: true,
    },
  });
  if (!bootstrap.ok) {
    return bootstrap.response;
  }

  const { supabaseAdmin, logger, body: requestBody, auth } = bootstrap.value;
  if (!auth || (!auth.userId && !auth.isServiceRole)) {
    logger.error("Authentication failed");
    await logger.flush();
    return new Response("Authentication failed", { status: 401 });
  }

  const orchestratorTaskId = typeof requestBody.orchestrator_task_id === "string"
    ? requestBody.orchestrator_task_id
    : null;
  if (!orchestratorTaskId) {
    logger.error("Missing orchestrator_task_id");
    await logger.flush();
    return new Response("orchestrator_task_id is required", { status: 400 });
  }

  // Set orchestrator task_id for logs
  logger.setDefaultTaskId(orchestratorTaskId);

  const isServiceRole = auth!.isServiceRole;
  const callerId = auth!.userId;

  try {
    // Query child tasks by orchestration contract + legacy orchestrator reference fields.
    const { data: tasks, error: tasksError } = await supabaseAdmin
      .from("tasks")
      .select("id, task_type, status, params, output_location, project_id")
      .or([
        buildOrchestratorRefOrFilter(orchestratorTaskId),
        `params->>orchestrator_task_id.eq.${orchestratorTaskId}`,
        `params->orchestrator_details->>orchestrator_task_id.eq.${orchestratorTaskId}`,
      ].join(','))
      .order("created_at", { ascending: true });

    if (tasksError) {
      logger.error("Error fetching child tasks", { error: tasksError.message });
      await logger.flush();
      return new Response(`Error fetching tasks: ${tasksError.message}`, { status: 500 });
    }

    // If no tasks found, return empty array
    if (!tasks || tasks.length === 0) {
      logger.info("No child tasks found", { orchestrator_task_id: orchestratorTaskId });
      await logger.flush();
      return new Response(JSON.stringify({ tasks: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // If user token (not service role), verify ownership of all tasks
    if (!isServiceRole && callerId) {
      // Get unique project IDs from the tasks
      const projectIds = [...new Set(tasks.map(t => t.project_id))];

      // Check if user owns all the projects
      const { data: projects, error: projectError } = await supabaseAdmin
        .from("projects")
        .select("id, user_id")
        .in("id", projectIds);

      if (projectError) {
        logger.error("Error checking project ownership", { error: projectError.message });
        await logger.flush();
        return new Response("Error verifying access", { status: 500 });
      }

      // Verify user owns all projects
      for (const project of projects || []) {
        if (project.user_id !== callerId) {
          logger.error("Access denied - user doesn't own project", {
            user_id: callerId,
            project_id: project.id
          });
          await logger.flush();
          return new Response("Access denied - you don't own these tasks' project", { status: 403 });
        }
      }
    }

    // Remove project_id from response (not needed by caller)
    const tasksWithoutProjectId = tasks.map(({ project_id, ...rest }) => rest);

    logger.info("Returning child tasks", { count: tasks.length });
    await logger.flush();
    return new Response(JSON.stringify({
      tasks: tasksWithoutProjectId
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: unknown) {
    logger.critical("Unexpected error", { error: error?.message });
    await logger.flush();
    return new Response(`Internal server error: ${error?.message}`, { status: 500 });
  }
});
