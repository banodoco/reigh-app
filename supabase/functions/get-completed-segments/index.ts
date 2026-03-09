// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { withEdgeRequest } from "../_shared/edgeHandler.ts";
import { verifyProjectOwnership } from "../_shared/auth.ts";
import { jsonResponse } from "../_shared/http.ts";
import { toErrorMessage } from "../_shared/errorMessage.ts";
import { ensureUserAuth } from "../_shared/requestGuards.ts";

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
serve((req) => {
  return withEdgeRequest(req, {
    functionName: "get-completed-segments",
    logPrefix: "[GET-COMPLETED-SEGMENTS]",
    parseBody: "strict",
    auth: {
      required: true,
    },
  }, async ({ supabaseAdmin, logger, body: requestBody, auth }) => {
    const run_id = typeof requestBody.run_id === "string" ? requestBody.run_id : null;
    const project_id = typeof requestBody.project_id === "string" ? requestBody.project_id : null;

    if (!run_id) {
      logger.error("Missing run_id");
      return jsonResponse({ error: "run_id is required" }, 400);
    }

    logger.info("Processing request", { run_id, project_id: project_id || "(none)" });

    const isServiceRole = auth?.isServiceRole ?? false;
    const userGuard = isServiceRole ? null : ensureUserAuth(auth, logger);
    if (userGuard && !userGuard.ok) {
      return userGuard.response;
    }
    const callerId = userGuard?.ok ? userGuard.userId : null;

    try {
    // Authorization for non-service callers
    const effectiveProjectId = project_id;

    if (!isServiceRole) {
      if (!effectiveProjectId) {
        logger.error("Missing project_id for authenticated user");
        return jsonResponse({ error: "project_id required for user tokens" }, 400);
      }

      const ownership = await verifyProjectOwnership(
        supabaseAdmin,
        effectiveProjectId,
        callerId!,
        "[GET-COMPLETED-SEGMENTS]",
      );
      if (!ownership.success) {
        logger.error("Project ownership verification failed", {
          project_id: effectiveProjectId,
          user_id: callerId,
          error: ownership.error,
        });
        return jsonResponse(
          { error: ownership.error || "Forbidden: You don't own this project" },
          ownership.statusCode || 403,
        );
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

    return jsonResponse(results, 200);

  } catch (e: unknown) {
    const message = toErrorMessage(e);
    logger.critical("Unexpected error", { error: message });
    return jsonResponse({ error: message }, 500);
  }});
});
