// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { bootstrapEdgeHandler } from "../_shared/edgeHandler.ts";
import { jsonResponse } from "../_shared/http.ts";

/**
 * Edge Function: get-completed-segments
 * Retrieves all completed travel_segment tasks for a given run_id.
 *
 * Auth rules:
 * - Service-role key: full access.
 * - Personal access token (PAT): must resolve via user_api_tokens and caller must own the project_id supplied.
 *
 * Request (POST):
 * {
 *   "run_id": "string",            // required
 *   "project_id": "uuid"           // required for PAT tokens
 * }
 *
 * Returns 200 with: [{ segment_index, output_location }]
 */
serve(async (req) => {
  const bootstrap = await bootstrapEdgeHandler(req, {
    functionName: "get-completed-segments",
    logPrefix: "[GET-COMPLETED-SEGMENTS]",
    parseBody: "strict",
  });
  if (!bootstrap.ok) {
    return bootstrap.response;
  }

  const { supabaseAdmin, logger, body: requestBody, auth } = bootstrap.value;
  const run_id = typeof requestBody.run_id === "string" ? requestBody.run_id : null;
  const project_id = typeof requestBody.project_id === "string" ? requestBody.project_id : null;

  if (!run_id) {
    logger.error("Missing run_id");
    await logger.flush();
    return jsonResponse({ error: "run_id is required" }, 400);
  }

  logger.info("Processing request", { run_id, project_id: project_id || "(none)" });

  const isServiceRole = auth!.isServiceRole;
  const callerId = auth!.userId;

  try {
    // Authorization for non-service callers
    const effectiveProjectId = project_id;

    if (!isServiceRole) {
      if (!effectiveProjectId) {
        logger.error("Missing project_id for authenticated user");
        await logger.flush();
        return jsonResponse({ error: "project_id required for user tokens" }, 400);
      }

      // Ensure caller owns the project
      const { data: proj, error: projErr } = await supabaseAdmin
        .from("projects")
        .select("user_id")
        .eq("id", effectiveProjectId)
        .single();

      if (projErr || !proj) {
        logger.error("Project not found", { project_id: effectiveProjectId, error: projErr?.message });
        await logger.flush();
        return jsonResponse({ error: "Project not found" }, 404);
      }

      if (proj.user_id !== callerId) {
        logger.error("Access denied - user doesn't own project", {
          user_id: callerId,
          project_owner: proj.user_id
        });
        await logger.flush();
        return jsonResponse({ error: "Forbidden: You don't own this project" }, 403);
      }

      logger.debug("Project ownership verified");
    }

    // Query completed segments
    let query = supabaseAdmin
      .from("tasks")
      .select("params, output_location")
      .eq("task_type", "travel_segment")
      .eq("status", "Complete")
      .or([
        `params->orchestration_contract->>run_id.eq.${run_id}`,
        `params->>orchestrator_run_id.eq.${run_id}`,
      ].join(','))
      .limit(1000);

    if (!isServiceRole) {
      query = query.eq("project_id", effectiveProjectId);
    }

    const { data: rows, error: qErr } = await query;

    if (qErr) {
      logger.error("Database query error", { error: qErr.message });
      await logger.flush();
      return jsonResponse({ error: "Database query error" }, 500);
    }

    const results: { segment_index: number; output_location: string }[] = [];

    for (const row of rows ?? []) {
      const paramsObj = typeof row.params === "string" ? JSON.parse(row.params) : row.params;

      if (typeof paramsObj.segment_index === "number" && row.output_location) {
        results.push({
          segment_index: paramsObj.segment_index,
          output_location: row.output_location
        });
      }
    }

    results.sort((a, b) => a.segment_index - b.segment_index);

    logger.info("Returning completed segments", {
      run_id,
      total_found: rows?.length || 0,
      valid_results: results.length
    });
    await logger.flush();

    return jsonResponse(results, 200);

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    logger.critical("Unexpected error", { error: message });
    await logger.flush();
    return jsonResponse({ error: message }, 500);
  }
});
