// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { NO_SESSION_RUNTIME_OPTIONS, withEdgeRequest } from "../_shared/edgeHandler.ts";
import { verifyProjectOwnership } from "../_shared/auth.ts";
import { jsonResponse } from "../_shared/http.ts";
import { ensureUserAuth, JWT_AUTH_REQUIRED } from "../_shared/requestGuards.ts";

serve((req) => {
  return withEdgeRequest(req, {
    functionName: "tasks-list",
    logPrefix: "[TASKS-LIST]",
    parseBody: "strict",
    auth: JWT_AUTH_REQUIRED,
    ...NO_SESSION_RUNTIME_OPTIONS,
  }, async ({ supabaseAdmin, logger, auth, body }) => {
    const projectId = typeof body.projectId === "string" ? body.projectId : "";
    const statusFilter = Array.isArray(body.status)
      ? body.status.filter((value): value is string => typeof value === "string")
      : [];

    if (!projectId) {
      return jsonResponse({ error: "projectId is required" }, 400);
    }

    const userGuard = auth?.isServiceRole ? null : ensureUserAuth(auth, logger);
    if (userGuard && !userGuard.ok) {
      return userGuard.response;
    }
    const userId = userGuard?.ok ? userGuard.userId : null;

    if (!auth?.isServiceRole && userId) {
      const ownership = await verifyProjectOwnership(
        supabaseAdmin,
        projectId,
        userId,
        "[TASKS-LIST]",
      );
      if (!ownership.success) {
        return jsonResponse(
          { error: ownership.error || "Forbidden: You do not own this project" },
          ownership.statusCode || 403,
        );
      }
    }

    try {
    // Build query
    let query = supabaseAdmin
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    // Apply status filter if provided
    if (statusFilter.length > 0) {
      query = query.in("status", statusFilter);
    }

    const { data: tasks, error } = await query;

    if (error) {
      logger.error("Query error", { error: error.message });
      return jsonResponse({ error: "Failed to fetch tasks", details: error.message }, 500);
    }

    return jsonResponse(tasks || []);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error("Unexpected error", { error: message });
    return jsonResponse({ error: "Internal server error", details: message }, 500);
  }});
});
