// deno-lint-ignore-file
import { jsonResponse } from "../_shared/http.ts";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "../_shared/rateLimit.ts";
import { bootstrapEdgeHandler, NO_SESSION_RUNTIME_OPTIONS } from "../_shared/edgeHandler.ts";
import { toErrorMessage } from "../_shared/errorMessage.ts";
import { resolveTaskStorageActor } from "../_shared/taskActorPolicy.ts";
import { ensureTaskActor } from "../_shared/requestGuards.ts";

// Import from refactored modules
import { parseCompleteTaskRequest, validateStoragePathSecurity } from './request.ts';
import { handleStorageOperations, getStoragePublicUrl, cleanupFile } from './storage.ts';
import { setThumbnailInParams } from './params.ts';
import { createGenerationFromTask } from './generation.ts';
import { checkOrchestratorCompletion } from './orchestrator.ts';
import { validateAndCleanupShotId } from './shotValidation.ts';
import { triggerCostCalculationIfNotSubTask } from './billing.ts';
import {
  completeTaskErrorResponse,
  fetchTaskContext,
  markTaskFailed,
  persistCompletionFollowUpIssues,
  type CompletionFollowUpIssue,
} from './completionHelpers.ts';

// Provide a loose Deno type for local tooling
declare const Deno: { env: { get: (key: string) => string | undefined } };

export async function completeTaskHandler(req: Request): Promise<Response> {
  const bootstrap = await bootstrapEdgeHandler(req, {
    functionName: "complete-task",
    logPrefix: "[COMPLETE-TASK]",
    parseBody: "none",
    auth: {
      required: true,
      options: { allowJwtUserAuth: true },
    },
    ...NO_SESSION_RUNTIME_OPTIONS,
  });
  if (!bootstrap.ok) {
    return bootstrap.response;
  }

  const { supabaseAdmin, logger, auth } = bootstrap.value;
  const authResult = ensureTaskActor(auth, logger);
  if (!authResult.ok) {
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
    const rateLimitDenied = await enforceRateLimit({
      supabaseAdmin,
      functionName: 'complete-task',
      userId: callerId,
      config: RATE_LIMITS.userAction,
      logger,
      logPrefix: '[COMPLETE-TASK]',
      responses: {
        serviceUnavailable: () => completeTaskErrorResponse("Rate limit service unavailable", 503, 'rate_limit_service_unavailable'),
      },
    });
    if (rateLimitDenied) return rateLimitDenied;
  }

  try {
    const completionFollowUpIssues: CompletionFollowUpIssue[] = [];

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
        error: toErrorMessage(validationError),
      });
      completionFollowUpIssues.push({
        step: 'validation',
        code: 'validation_follow_up_failed',
        message: toErrorMessage(validationError),
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
        const msg = toErrorMessage(genErr);
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
      const dbMsg = toErrorMessage(dbError);
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
        error: toErrorMessage(orchErr),
      });
      completionFollowUpIssues.push({
        step: 'orchestrator_completion',
        code: 'orchestrator_follow_up_failed',
        message: toErrorMessage(orchErr),
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
        completionFollowUpIssues.push({
          step: 'cost_calculation',
          code: billingResult.errorCode || 'cost_calculation_follow_up_failed',
          message: billingResult.message || 'Cost calculation follow-up failed',
        });
      }
    }

    if (completionFollowUpIssues.length > 0) {
      const persistenceResult = await persistCompletionFollowUpIssues(
        supabaseAdmin,
        taskIdString,
        taskContext.result_data,
        completionFollowUpIssues,
      );
      if (!persistenceResult.ok) {
        logger.error("Failed to persist completion follow-up issues", {
          task_id: taskIdString,
          error: persistenceResult.error instanceof Error
            ? persistenceResult.error.message
            : String(persistenceResult.error),
        });
        completionFollowUpIssues.push({
          step: 'follow_up_persistence',
          code: 'completion_follow_up_persistence_failed',
          message: persistenceResult.error instanceof Error
            ? persistenceResult.error.message
            : String(persistenceResult.error),
        });
      }
    }

    // 15) Return success
    const responseData = {
      success: true,
      public_url: publicUrl,
      thumbnail_url: thumbnailUrl,
      follow_up: completionFollowUpIssues.length === 0
        ? { status: 'ok' as const, issues: [] as CompletionFollowUpIssue[] }
        : { status: 'degraded' as const, issues: completionFollowUpIssues },
      message: completionFollowUpIssues.length === 0
        ? "Task completed and file uploaded successfully"
        : "Task completed with follow-up warnings",
    };

    logger.info("Task completed successfully", { 
      task_id: taskIdString,
      output_location: publicUrl,
      has_thumbnail: !!thumbnailUrl,
      follow_up_issue_count: completionFollowUpIssues.length,
    });
    await logger.flush();

    return jsonResponse(responseData, 200);

  } catch (error: unknown) {
    const errMsg = toErrorMessage(error);
    logger.critical("Unexpected error", {
      task_id: taskIdString,
      error: errMsg,
      stack: error instanceof Error ? error.stack?.substring(0, 500) : undefined
    });
    await markTaskFailed(supabaseAdmin, taskIdString, `Task completion failed: ${errMsg}`);
    await logger.flush();
    return completeTaskErrorResponse("Internal server error", 500);
  }
}
