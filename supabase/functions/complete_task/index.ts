// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { jsonResponse } from "../_shared/http.ts";
import { edgeErrorResponse } from "../_shared/edgeRequest.ts";
import {
  checkRateLimit,
  isRateLimitExceededFailure,
  rateLimitFailureResponse,
  RATE_LIMITS,
} from "../_shared/rateLimit.ts";
import { bootstrapEdgeHandler } from "../_shared/edgeHandler.ts";
import { resolveTaskStorageActor } from "../_shared/taskActorPolicy.ts";

// Import from refactored modules
import { parseCompleteTaskRequest, validateStoragePathSecurity } from './request.ts';
import { handleStorageOperations, getStoragePublicUrl, cleanupFile } from './storage.ts';
import { setThumbnailInParams } from './params.ts';
import { createGenerationFromTask } from './generation.ts';
import { checkOrchestratorCompletion } from './orchestrator.ts';
import { validateAndCleanupShotId } from './shotValidation.ts';
import { triggerCostCalculationIfNotSubTask } from './billing.ts';

// Provide a loose Deno type for local tooling
declare const Deno: { env: { get: (key: string) => string | undefined } };

/**
 * Best-effort mark a task as Failed so the UI can update immediately.
 * Swallows errors — callers still return their own HTTP error response.
 */
async function markTaskFailed(
  supabase: SupabaseClient,
  taskId: string,
  errorMessage: string,
): Promise<void> {
  try {
    await supabase.from("tasks").update({
      status: "Failed",
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    }).eq("id", taskId).in("status", ["Queued", "In Progress"]);
  } catch {
    // Best-effort — don't mask the original error
  }
}

interface TaskContext {
  id: string;
  task_type: string;
  project_id: string;
  params: Record<string, unknown>;
  tool_type: string;
  category: string;
  content_type: 'image' | 'video';
  variant_type: string | null;
}

function defaultErrorCode(status: number): string {
  if (status === 401) return 'authentication_failed';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 405) return 'method_not_allowed';
  if (status === 429) return 'rate_limited';
  if (status === 503) return 'service_unavailable';
  if (status >= 500) return 'internal_server_error';
  return 'request_failed';
}

function completeTaskErrorResponse(
  message: string,
  status: number,
  errorCode = defaultErrorCode(status),
): Response {
  return edgeErrorResponse(
    {
      errorCode,
      message,
      recoverable: status >= 500 || status === 429,
    },
    status,
  );
}

/**
 * Fetch task context with all required fields for the completion flow.
 * Uses a single query with FK join (tasks.task_type -> task_types.name).
 * Returns null if task not found or on error.
 */
async function fetchTaskContext(
  supabase: SupabaseClient,
  taskId: string,
  logger?: {
    error: (message: string, context?: Record<string, unknown>) => void;
  },
): Promise<TaskContext | null> {
  const { data: task, error } = await supabase
    .from("tasks")
    .select(`id, task_type, project_id, params, task_types!tasks_task_type_fkey(tool_type, category, content_type, variant_type)`)
    .eq("id", taskId)
    .single();

  if (error || !task) {
    logger?.error('Failed to fetch task context', {
      task_id: taskId,
      fetch_error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  const taskTypeInfo = task.task_types || {};

  return {
    id: task.id,
    task_type: task.task_type,
    project_id: task.project_id,
    params: task.params || {},
    tool_type: taskTypeInfo.tool_type || 'unknown',
    category: taskTypeInfo.category || 'unknown',
    content_type: taskTypeInfo.content_type || 'image',
    variant_type: taskTypeInfo.variant_type || null,
  };
}

/**
 * Edge function: complete-task
 * 
 * Completes a task by uploading file data and updating task status.
 * - Service-role key: can complete any task
 * - User token: can only complete tasks they own
 * 
 * POST /functions/v1/complete-task
 * Headers: Authorization: Bearer <JWT or PAT>
 * 
 * SUPPORTS THREE UPLOAD MODES:
 * 
 * MODE 1 (LEGACY - JSON with base64): 
 *   Body: { task_id, file_data: "base64...", filename: "image.png", ... }
 * 
 * MODE 3 (PRE-SIGNED URL - Zero Memory):
 *   Body: { task_id, storage_path: "user_id/tasks/{task_id}/filename", ... }
 * 
 * MODE 4 (REFERENCE EXISTING PATH):
 *   Body: { task_id, storage_path: "user_id/filename", ... }
 */
export async function completeTaskHandler(req: Request): Promise<Response> {
  const bootstrap = await bootstrapEdgeHandler(req, {
    functionName: "complete-task",
    logPrefix: "[COMPLETE-TASK]",
    parseBody: "none",
    auth: {
      required: true,
      options: { allowJwtUserAuth: true },
    },
    runtimeOptions: {
      clientOptions: {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    },
  });
  if (!bootstrap.ok) {
    return bootstrap.response;
  }

  const { supabaseAdmin, logger, auth } = bootstrap.value;
  if (!auth || (!auth.userId && !auth.isServiceRole)) {
    logger.error("Authentication failed");
    await logger.flush();
    return completeTaskErrorResponse("Authentication failed", 401);
  }

  // 1) Parse and validate request
  const parseResult = await parseCompleteTaskRequest(req);
  if (!parseResult.success) {
    return parseResult.response;
  }
  const parsedRequest = parseResult.data;
  const taskIdString = parsedRequest.taskId;

  logger.setDefaultTaskId?.(taskIdString);
  logger.info("Processing task", {
    task_id: taskIdString,
    mode: parsedRequest.mode,
    filename: parsedRequest.filename,
  });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

  // 3) Security check: Validate storage path for orchestrator references
  if (parsedRequest.requiresOrchestratorCheck && parsedRequest.storagePath) {
    const securityResult = await validateStoragePathSecurity(
      supabaseAdmin,
      taskIdString,
      parsedRequest.storagePath,
      parsedRequest.storagePathTaskId
    );
    if (!securityResult.allowed) {
      logger.error("Storage path security check failed", { error: securityResult.error });
      await logger.flush();
      return completeTaskErrorResponse(
        securityResult.error || "Access denied",
        403,
        'storage_path_access_denied',
      );
    }
  }

  // 4) Authentication is handled by bootstrapEdgeHandler.
  const isServiceRole = auth!.isServiceRole;
  const callerId = auth!.userId;

  // 4b) Rate limit non-service-role callers (workers use service-role and are not rate limited)
  if (!isServiceRole && callerId) {
    const rateLimitResult = await checkRateLimit(
      supabaseAdmin,
      'complete-task',
      callerId,
      RATE_LIMITS.userAction,
      '[COMPLETE-TASK]'
    );
    if (!rateLimitResult.ok) {
      if (isRateLimitExceededFailure(rateLimitResult)) {
        logger.warn("Rate limit exceeded", { user_id: callerId });
        await logger.flush();
        return rateLimitFailureResponse(rateLimitResult, RATE_LIMITS.userAction);
      }

      logger.error("Rate limit check failed", {
        user_id: callerId,
        error_code: rateLimitResult.errorCode,
        message: rateLimitResult.message,
      });
      await logger.flush();
      return completeTaskErrorResponse(
        "Rate limit service unavailable",
        503,
        'rate_limit_service_unavailable',
      );
    }

    if (rateLimitResult.policy === 'fail_open') {
      logger.warn("Rate limit check degraded; allowing request", {
        user_id: callerId,
        reason: rateLimitResult.value.degraded?.reason,
        message: rateLimitResult.value.degraded?.message,
      });
    }
  }

  try {
    // 5) Resolve actor policy once (ownership + task user resolution).
    const taskActor = await resolveTaskStorageActor({
      supabaseAdmin,
      taskId: taskIdString,
      auth: auth!,
      logPrefix: "[COMPLETE-TASK]",
    });
    if (!taskActor.ok) {
      logger.error("Task actor resolution failed", {
        task_id: taskIdString,
        error: taskActor.error,
        status_code: taskActor.statusCode,
      });
      await logger.flush();
      return completeTaskErrorResponse(
        taskActor.error,
        taskActor.statusCode,
        'task_actor_resolution_failed',
      );
    }

    const completionAuthContext = {
      isServiceRole: taskActor.value.isServiceRole,
      taskOwnerVerified: taskActor.value.taskOwnerVerified,
      actorId: taskActor.value.callerId,
    };

    // 6) MODE 4: Verify referenced file exists
    if (parsedRequest.storagePath) {
      const pathParts = parsedRequest.storagePath.split('/');
      const isMode3Format = pathParts.length >= 4 && pathParts[1] === 'tasks';

      if (!isMode3Format) {
        const fileCheck = await getStoragePublicUrl(supabaseAdmin, parsedRequest.storagePath);
        if (!fileCheck.exists) {
          return completeTaskErrorResponse(
            "Referenced file does not exist or is not accessible in storage",
            404,
            'storage_reference_not_found',
          );
        }
      }
    }

    // 7) Determine user ID for storage path from shared actor policy.
    const userId = taskActor.value.taskUserId;

    // 8) Fetch task context once (used by validation, generation creation, orchestrator check)
    const taskContext = await fetchTaskContext(supabaseAdmin, taskIdString, logger);
    if (!taskContext) {
      logger.error("Failed to fetch task context", { task_id: taskIdString });
      await logger.flush();
      return completeTaskErrorResponse("Task not found", 404, 'task_not_found');
    }

    // 9) Handle storage operations
    const storageResult = await handleStorageOperations(supabaseAdmin, parsedRequest, userId, isServiceRole);
    const { publicUrl, objectPath, thumbnailUrl } = storageResult;

    // 10) Validate shot references and update params if needed
    try {
      let updatedParams = { ...taskContext.params };
      let needsParamsUpdate = false;

      // Validate and cleanup invalid shot_id references
      const shotValidation = await validateAndCleanupShotId(supabaseAdmin, updatedParams, taskContext.tool_type);
      if (shotValidation.needsUpdate) {
        needsParamsUpdate = true;
        updatedParams = shotValidation.updatedParams;
      }

      // Add thumbnail URL if available
      if (thumbnailUrl) {
        needsParamsUpdate = true;
        updatedParams = setThumbnailInParams(updatedParams, taskContext.task_type, thumbnailUrl);
      }

      if (needsParamsUpdate) {
        await supabaseAdmin.from("tasks").update({ params: updatedParams }).eq("id", taskIdString);
        
        // Keep in-memory context in sync so downstream steps (generation creation) use updated params
        taskContext.params = updatedParams;
      }
    } catch (validationError) {
      logger.warn("Validation follow-up failed; continuing completion flow", {
        task_id: taskIdString,
        error: validationError instanceof Error ? validationError.message : String(validationError),
      });
      // Continue anyway - don't fail task completion due to validation errors
    }

    // 11) Create generation (if applicable)
    const CREATE_GENERATION_IN_EDGE = Deno.env.get("CREATE_GENERATION_IN_EDGE") !== "false";
    if (CREATE_GENERATION_IN_EDGE) {
      try {
        const generationOutcome = await createGenerationFromTask(
          supabaseAdmin,
          taskContext.id,
          {
            id: taskContext.id,
            task_type: taskContext.task_type,
            project_id: taskContext.project_id,
            params: taskContext.params,
            tool_type: taskContext.tool_type,
            content_type: taskContext.content_type,
            variant_type: taskContext.variant_type,
            category: taskContext.category,
          },
          publicUrl,
          thumbnailUrl,
          logger,
          completionAuthContext,
        );

        if (generationOutcome.status === 'skipped') {
          logger.info('Generation creation skipped', {
            task_id: taskContext.id,
            reason: generationOutcome.reason,
          });
        }
      } catch (genErr: unknown) {
        const msg = genErr?.message || String(genErr);
        logger.error("Generation creation failed", { error: msg });
        await markTaskFailed(supabaseAdmin, taskIdString, `Generation creation failed: ${msg}`);
        await logger.flush();
        return completeTaskErrorResponse("Internal server error", 500);
      }
    }

    // 12) Update task to Complete
    const { error: dbError } = await supabaseAdmin.from("tasks").update({
      status: "Complete",
      output_location: publicUrl,
      generation_processed_at: new Date().toISOString()
    }).eq("id", taskIdString).eq("status", "In Progress");

    if (dbError) {
      const dbMsg = dbError instanceof Error ? dbError.message : String(dbError);
      logger.error("Database update failed", {
        task_id: taskIdString,
        error: dbMsg,
      });
      await markTaskFailed(supabaseAdmin, taskIdString, `Task completion DB update failed: ${dbMsg}`);
      await logger.flush();
      await cleanupFile(supabaseAdmin, objectPath);
      return completeTaskErrorResponse("Internal server error", 500);
    }

    // 13) Check orchestrator completion (for segment tasks) - uses task context
    try {
      await checkOrchestratorCompletion(
        {
          supabase: supabaseAdmin,
          taskIdString,
          completedTask: taskContext, // Pass context instead of fetching again
          publicUrl,
          supabaseUrl,
          serviceKey,
          authContext: completionAuthContext,
          logger,
        },
      );
    } catch (orchErr) {
      logger.warn("Orchestrator completion follow-up failed", {
        task_id: taskIdString,
        error: orchErr instanceof Error ? orchErr.message : String(orchErr),
      });
    }

    // 14) Calculate cost (service role only)
    if (isServiceRole) {
      const billingResult = await triggerCostCalculationIfNotSubTask(
        supabaseAdmin,
        supabaseUrl,
        serviceKey,
        taskIdString,
      );
      if (!billingResult.ok) {
        logger.warn("Cost calculation follow-up failed", {
          task_id: taskIdString,
          billing_result: billingResult,
        });
      }
    }

    // 15) Return success
    const responseData = {
      success: true,
      public_url: publicUrl,
      thumbnail_url: thumbnailUrl,
      message: "Task completed and file uploaded successfully"
    };

    logger.info("Task completed successfully", { 
      task_id: taskIdString,
      output_location: publicUrl,
      has_thumbnail: !!thumbnailUrl
    });
    await logger.flush();

    return jsonResponse(responseData, 200);

  } catch (error: unknown) {
    const errMsg = error?.message || String(error);
    logger.critical("Unexpected error", {
      task_id: taskIdString,
      error: errMsg,
      stack: error?.stack?.substring(0, 500)
    });
    await markTaskFailed(supabaseAdmin, taskIdString, `Task completion failed: ${errMsg}`);
    await logger.flush();
    return completeTaskErrorResponse("Internal server error", 500);
  }
}

// Some TS envs don't know about import.meta.main; Deno does.
if ((import.meta as unknown).main) {
  serve((req) => completeTaskHandler(req));
}
