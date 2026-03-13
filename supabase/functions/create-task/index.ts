import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { bootstrapEdgeHandler, NO_SESSION_RUNTIME_OPTIONS } from "../_shared/edgeHandler.ts";
import { edgeErrorResponse } from "../_shared/edgeRequest.ts";
import { jsonResponse } from "../_shared/http.ts";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "../_shared/rateLimit.ts";
import { buildTaskInsertObject, getErrorMessage, parseCreateTaskBody } from "./request.ts";
import { JWT_AUTH_REQUIRED } from "../_shared/requestGuards.ts";

function createErrorResponse(
  message: string,
  status: number,
  errorCode: string,
  recoverable = status >= 500 || status === 429,
) {
  return edgeErrorResponse({ errorCode, message, recoverable }, status);
}

function isAuthorizedIdempotentRecoveryProject(
  existingProjectId: unknown,
  requestedProjectId: string,
): boolean {
  return typeof existingProjectId === "string" && existingProjectId === requestedProjectId;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  const bootstrap = await bootstrapEdgeHandler(req, {
    functionName: "create-task",
    logPrefix: "[CREATE-TASK]",
    method: "POST",
    parseBody: "strict",
    corsPreflight: false,
    auth: JWT_AUTH_REQUIRED,
    ...NO_SESSION_RUNTIME_OPTIONS,
  });
  if (!bootstrap.ok) {
    return bootstrap.response;
  }

  const { supabaseAdmin, logger, auth, body: rawBody } = bootstrap.value;

  const parsedBody = parseCreateTaskBody(rawBody);
  if (!parsedBody.ok) {
    logger.error("Invalid request body", { error: parsedBody.error });
    await logger.flush();
    return createErrorResponse(parsedBody.error, 400, "invalid_request_body", false);
  }

  const requestBody = parsedBody.value;

  if (requestBody.task_id) {
    logger.setDefaultTaskId(requestBody.task_id);
  }

  logger.info("Creating task", {
    task_type: requestBody.task_type,
    project_id: requestBody.project_id,
    has_dependant_on: !!requestBody.normalizedDependantOn,
    dependency_count: requestBody.normalizedDependantOn?.length ?? 0,
    client_provided_id: !!requestBody.task_id,
  });

  const isServiceRole = auth?.isServiceRole === true;
  const callerId = auth?.userId ?? null;

  if (isServiceRole) {
    logger.debug("Authenticated via service-role key");
  } else if (auth?.isJwtAuth) {
    logger.debug("Authenticated via JWT", { user_id: callerId });
  } else {
    logger.debug("Authenticated via PAT", { user_id: callerId });
  }

  if (!isServiceRole && callerId) {
    const rateLimitDenied = await enforceRateLimit({
      supabaseAdmin,
      functionName: 'create-task',
      userId: callerId,
      config: RATE_LIMITS.taskCreation,
      logger,
      logPrefix: '[CREATE-TASK]',
      responses: {
        serviceUnavailable: () => createErrorResponse(
          "Rate limit service unavailable",
          503,
          "rate_limit_service_unavailable",
        ),
      },
    });
    if (rateLimitDenied) return rateLimitDenied;
  }

  let finalProjectId: string;
  if (isServiceRole) {
    if (!requestBody.project_id) {
      logger.error("project_id required for service role");
      await logger.flush();
      return createErrorResponse("project_id required for service role", 400, "project_id_required", false);
    }
    finalProjectId = requestBody.project_id;
  } else {
    if (!callerId) {
      logger.error("Could not determine user ID");
      await logger.flush();
      return createErrorResponse("Could not determine user ID", 401, "authentication_failed", false);
    }

    if (!requestBody.project_id) {
      logger.error("project_id required", { user_id: callerId });
      await logger.flush();
      return createErrorResponse("project_id required", 400, "project_id_required", false);
    }

    const { data: projectData, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("user_id")
      .eq("id", requestBody.project_id)
      .single();

    if (projectError) {
      logger.error("Project lookup error", { project_id: requestBody.project_id, error: projectError.message });
      await logger.flush();
      return createErrorResponse("Project not found", 404, "project_not_found", false);
    }

    const ownerId = projectData?.user_id;
    if (typeof ownerId !== "string") {
      logger.error("Project missing owner", { project_id: requestBody.project_id });
      await logger.flush();
      return createErrorResponse("Project not found", 404, "project_not_found", false);
    }

    if (ownerId !== callerId) {
      logger.error("User doesn't own project", {
        user_id: callerId,
        project_id: requestBody.project_id,
        owner_id: ownerId,
      });
      await logger.flush();
      return createErrorResponse("Forbidden: You don't own this project", 403, "project_forbidden", false);
    }

    finalProjectId = requestBody.project_id;
  }

  try {
    const insertObject = buildTaskInsertObject({
      request: requestBody,
      finalProjectId,
    });

    const { data: insertedTask, error } = await supabaseAdmin
      .from("tasks")
      .insert(insertObject)
      .select("id")
      .single();

    if (error) {
      if (
        error.code === "23505" &&
        requestBody.idempotency_key &&
        error.message?.includes("idempotency_key")
      ) {
        logger.info("Idempotent duplicate detected, returning existing task", {
          idempotency_key: requestBody.idempotency_key,
        });

        const { data: existingTask, error: fetchError } = await supabaseAdmin
          .from("tasks")
          .select("id, status, project_id")
          .eq("idempotency_key", requestBody.idempotency_key)
          .single();

        if (fetchError || typeof existingTask?.id !== "string") {
          logger.error("Failed to fetch existing task for idempotency key", {
            idempotency_key: requestBody.idempotency_key,
            error: fetchError?.message,
          });
          await logger.flush();
          return createErrorResponse(
            "Duplicate task detected but could not retrieve it",
            500,
            "duplicate_task_lookup_failed",
          );
        }

        if (
          !isServiceRole &&
          !isAuthorizedIdempotentRecoveryProject(existingTask.project_id, finalProjectId)
        ) {
          logger.error("Idempotent duplicate belongs to a different project", {
            idempotency_key: requestBody.idempotency_key,
            requested_project_id: finalProjectId,
            existing_project_id: existingTask.project_id,
          });
          await logger.flush();
          return createErrorResponse(
            "Forbidden: duplicate task belongs to a different project",
            403,
            "project_forbidden",
            false,
          );
        }

        logger.setDefaultTaskId(existingTask.id);
        await logger.flush();
        return jsonResponse({
          task_id: existingTask.id,
          status: "Task queued",
          deduplicated: true,
        });
      }

      logger.error("Task creation failed", { error: error.message, code: error.code });
      await logger.flush();
      return createErrorResponse(error.message, 500, "task_insert_failed");
    }

    if (!insertedTask || typeof insertedTask.id !== "string") {
      logger.error("Task creation returned invalid payload", { insertedTask });
      await logger.flush();
      return createErrorResponse("Task creation failed", 500, "invalid_task_insert_payload");
    }

    logger.setDefaultTaskId(insertedTask.id);
    logger.info("Task created successfully", {
      task_id: insertedTask.id,
      task_type: requestBody.task_type,
      project_id: finalProjectId,
      created_by: isServiceRole ? "service-role" : callerId,
      has_dependency: !!requestBody.normalizedDependantOn,
      dependency_count: requestBody.normalizedDependantOn?.length ?? 0,
      has_idempotency_key: !!requestBody.idempotency_key,
    });

    await logger.flush();
    return jsonResponse({
      task_id: insertedTask.id,
      status: "Task queued",
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.critical("Unexpected error", { error: message });
    await logger.flush();
    return createErrorResponse("Internal server error", 500, "internal_server_error");
  }
});
