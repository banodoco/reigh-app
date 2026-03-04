import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { authenticateRequest } from "../_shared/auth.ts";
import { SystemLogger } from "../_shared/systemLogger.ts";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "../_shared/rateLimit.ts";
import { buildTaskInsertObject, getErrorMessage, parseCreateTaskBody } from "./request.ts";

declare const Deno: { env: { get: (key: string) => string | undefined } };

function createCorsResponse(body: string, status: number = 200) {
  return new Response(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  });
}

serve(async (req) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!serviceKey || !supabaseUrl) {
    console.error("[CREATE-TASK] Missing required environment variables");
    return createCorsResponse("Server configuration error", 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  const logger = new SystemLogger(supabaseAdmin, "create-task");

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    logger.warn("Method not allowed", { method: req.method });
    await logger.flush();
    return createCorsResponse("Method not allowed", 405);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    logger.error("Invalid JSON body");
    await logger.flush();
    return createCorsResponse("Invalid JSON body", 400);
  }

  const parsedBody = parseCreateTaskBody(rawBody);
  if (!parsedBody.ok) {
    logger.error("Invalid request body", { error: parsedBody.error });
    await logger.flush();
    return createCorsResponse(parsedBody.error, 400);
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

  const auth = await authenticateRequest(req, supabaseAdmin, "[CREATE-TASK]", { allowJwtUserAuth: true });

  if (!auth.success) {
    logger.error("Authentication failed", { error: auth.error });
    await logger.flush();
    return createCorsResponse(auth.error || "Authentication failed", auth.statusCode || 403);
  }

  const isServiceRole = auth.isServiceRole;
  const callerId = auth.userId;

  if (isServiceRole) {
    logger.debug("Authenticated via service-role key");
  } else if (auth.isJwtAuth) {
    logger.debug("Authenticated via JWT", { user_id: callerId });
  } else {
    logger.debug("Authenticated via PAT", { user_id: callerId });
  }

  if (!isServiceRole && callerId) {
    const rateLimitDenied = await enforceRateLimit(
      supabaseAdmin, 'create-task', callerId, RATE_LIMITS.taskCreation, logger, '[CREATE-TASK]',
      () => createCorsResponse("Rate limit service unavailable", 503),
    );
    if (rateLimitDenied) return rateLimitDenied;
  }

  let finalProjectId: string;
  if (isServiceRole) {
    if (!requestBody.project_id) {
      logger.error("project_id required for service role");
      await logger.flush();
      return createCorsResponse("project_id required for service role", 400);
    }
    finalProjectId = requestBody.project_id;
  } else {
    if (!callerId) {
      logger.error("Could not determine user ID");
      await logger.flush();
      return createCorsResponse("Could not determine user ID", 401);
    }

    if (!requestBody.project_id) {
      logger.error("project_id required", { user_id: callerId });
      await logger.flush();
      return createCorsResponse("project_id required", 400);
    }

    const { data: projectData, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("user_id")
      .eq("id", requestBody.project_id)
      .single();

    if (projectError) {
      logger.error("Project lookup error", { project_id: requestBody.project_id, error: projectError.message });
      await logger.flush();
      return createCorsResponse("Project not found", 404);
    }

    const ownerId = projectData?.user_id;
    if (typeof ownerId !== "string") {
      logger.error("Project missing owner", { project_id: requestBody.project_id });
      await logger.flush();
      return createCorsResponse("Project not found", 404);
    }

    if (ownerId !== callerId) {
      logger.error("User doesn't own project", {
        user_id: callerId,
        project_id: requestBody.project_id,
        owner_id: ownerId,
      });
      await logger.flush();
      return createCorsResponse("Forbidden: You don't own this project", 403);
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
          .select("id, status")
          .eq("idempotency_key", requestBody.idempotency_key)
          .single();

        if (fetchError || typeof existingTask?.id !== "string") {
          logger.error("Failed to fetch existing task for idempotency key", {
            idempotency_key: requestBody.idempotency_key,
            error: fetchError?.message,
          });
          await logger.flush();
          return createCorsResponse("Duplicate task detected but could not retrieve it", 500);
        }

        logger.setDefaultTaskId(existingTask.id);
        await logger.flush();
        return createCorsResponse(
          JSON.stringify({
            task_id: existingTask.id,
            status: "Task queued",
            deduplicated: true,
          }),
          200
        );
      }

      logger.error("Task creation failed", { error: error.message, code: error.code });
      await logger.flush();
      return createCorsResponse(error.message, 500);
    }

    if (!insertedTask || typeof insertedTask.id !== "string") {
      logger.error("Task creation returned invalid payload", { insertedTask });
      await logger.flush();
      return createCorsResponse("Task creation failed", 500);
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
    return createCorsResponse(
      JSON.stringify({
        task_id: insertedTask.id,
        status: "Task queued",
      }),
      200
    );
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.critical("Unexpected error", { error: message });
    await logger.flush();
    return createCorsResponse(`Internal server error: ${message}`, 500);
  }
});
