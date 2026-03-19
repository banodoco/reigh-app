// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { withEdgeRequest } from "../_shared/edgeHandler.ts";
import { jsonResponse } from "../_shared/http.ts";
import { ensureTaskActor, normalizeTaskId } from "../_shared/requestGuards.ts";
import { authorizeTaskActor } from "../_shared/taskActorPolicy.ts";

/**
 * Edge function: get-predecessor-output
 *
 * Gets the output locations of a task's dependencies in a single call.
 * Supports both single and multiple dependencies (dependant_on is now an array).
 *
 * POST /functions/v1/get-predecessor-output
 * Headers: Authorization: Bearer <service-key or PAT>
 * Body: { task_id: "uuid" }
 *
 * Returns:
 * - 200 OK with:
 *   - No dependencies: { predecessors: [] }
 *   - Single dependency (backward compat): { predecessor_id, output_location, predecessors: [...] }
 *   - Multiple dependencies: { predecessors: [{ predecessor_id, output_location, status }, ...] }
 * - 400 Bad Request if task_id missing
 * - 401 Unauthorized if no valid token
 * - 403 Forbidden if token invalid or user not authorized
 * - 404 Not Found if task not found
 * - 500 Internal Server Error
 */
serve((req) => {
  return withEdgeRequest(req, {
    functionName: "get-predecessor-output",
    logPrefix: "[GET-PREDECESSOR-OUTPUT]",
    parseBody: "strict",
    auth: {
      required: true,
    },
  }, async ({ supabaseAdmin, logger, auth, body }) => {
    const authResult = ensureTaskActor(auth, logger);
    if (!authResult.ok) {
      return authResult.response;
    }

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
      logPrefix: "[GET-PREDECESSOR-OUTPUT]",
    });
    if (!actor.ok) {
      logger.error("Task access denied", {
        task_id: taskId,
        error: actor.error,
        status_code: actor.statusCode,
      });
      return jsonResponse({ error: actor.error }, actor.statusCode);
    }

    const { data: taskData, error: taskError } = await supabaseAdmin
      .from("tasks")
      .select("id, project_id, dependant_on")
      .eq("id", taskId)
      .single();

    if (taskError) {
      logger.error("Task lookup error", { error: taskError.message });
      return jsonResponse({ error: "Task not found" }, 404);
    }

    if (typeof taskData?.project_id !== "string" || taskData.project_id.length === 0) {
      logger.error("Task project scope missing", { task_id: taskId });
      return jsonResponse({ error: "Task not found" }, 404);
    }

    // --- Path 1: dependant_on chain (orchestrator-created tasks) ---
    const dependantOnArray: string[] = taskData.dependant_on || [];
    if (dependantOnArray.length > 0) {
      const { data: predecessorsData, error: predecessorError } = await supabaseAdmin
        .from("tasks")
        .select("id, status, output_location")
        .eq("project_id", taskData.project_id)
        .in("id", dependantOnArray);

      if (predecessorError) {
        logger.error("Predecessors lookup error", { error: predecessorError.message });
        return jsonResponse({
          predecessor_id: dependantOnArray[0],
          output_location: null,
          status: "error",
          predecessors: dependantOnArray.map((id) => ({
            predecessor_id: id,
            output_location: null,
            status: "error",
          })),
        });
      }

      const predecessors = dependantOnArray.map((depId) => {
        const pred = predecessorsData?.find((candidate) => candidate.id === depId);
        if (!pred) {
          return { predecessor_id: depId, output_location: null, status: "not_found" };
        }
        return {
          predecessor_id: pred.id,
          output_location: pred.status === "Complete" ? pred.output_location : null,
          status: pred.status,
        };
      });

      const allComplete = predecessors.every(
        (predecessor) => predecessor.status === "Complete" && predecessor.output_location,
      );
      const firstPred = predecessors[0];

      logger.info("Returning predecessor info (dependant_on)", {
        predecessor_count: predecessors.length,
        all_complete: allComplete,
      });

      return jsonResponse({
        predecessor_id: firstPred?.predecessor_id || null,
        output_location: allComplete ? firstPred?.output_location : null,
        status: allComplete ? "Complete" : (firstPred?.status || null),
        predecessors,
        all_complete: allComplete,
      });
    }

    // --- Path 2: generation-based sibling lookup (individual segment regens) ---
    // When there's no dependant_on chain, find the previous segment by
    // parent_generation_id + child_order (the segment before this one).
    const parentGenerationId = typeof body.parent_generation_id === "string" ? body.parent_generation_id : null;
    const childOrder = typeof body.child_order === "number" ? body.child_order : null;
    const predecessorOrder = childOrder !== null ? childOrder - 1 : null;

    if (!parentGenerationId || predecessorOrder === null || predecessorOrder < 0) {
      logger.info("No dependencies found");
      return jsonResponse({
        predecessor_id: null,
        output_location: null,
        predecessors: [],
      });
    }

    // Find the generation at the predecessor child_order under the same parent
    const { data: predGenData } = await supabaseAdmin
      .from("generations")
      .select("id, output_location, child_order")
      .eq("parent_id", parentGenerationId)
      .eq("child_order", predecessorOrder)
      .order("created_at", { ascending: false })
      .limit(1);

    const predGen = predGenData?.[0];
    if (predGen && predGen.output_location) {
      logger.info("Found predecessor via generation sibling", {
        predecessor_generation_id: predGen.id,
        predecessor_order: predecessorOrder,
      });
      return jsonResponse({
        predecessor_id: predGen.id,
        output_location: predGen.output_location,
        status: "Complete",
        predecessors: [{
          predecessor_id: predGen.id,
          output_location: predGen.output_location,
          status: "Complete",
        }],
        all_complete: true,
        lookup_method: "generation_sibling",
      });
    }

    logger.info("No predecessor found (no dependant_on, no generation sibling)");
    return jsonResponse({
      predecessor_id: null,
      output_location: null,
      predecessors: [],
    });
  });
});
