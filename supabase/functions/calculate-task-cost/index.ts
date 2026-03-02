// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "../_shared/supabaseClient.ts";
import { SystemLogger } from "../_shared/systemLogger.ts";
import {
  getSubTaskOrchestratorId,
  lookupCompletedSubTasksForOrchestrator,
  SubTaskLookupError,
  type CompletedSubTaskRow,
} from "../_shared/billing.ts";
import { authenticateRequest, verifyTaskOwnership } from "../_shared/auth.ts";
import { edgeErrorResponse } from "../_shared/edgeRequest.ts";
import {
  asObjectRecord,
  asString,
} from "../_shared/payloadNormalization.ts";

declare const Deno: { env: { get: (key: string) => string | undefined } };

/** Billing-relevant fields from task_types, joined via FK */
interface TaskTypeConfig {
  id: string;
  billing_type: string;
  base_cost_per_second: number;
  unit_cost: number;
  cost_factors: CostFactors | null;
  is_active: boolean;
}

/** Shape returned by tasks.select('..., projects(user_id), task_types!(...)') with joined project + task type */
interface TaskWithProject {
  id: string;
  task_type: string;
  params: TaskCostParams;
  status: string;
  generation_started_at: string | null;
  generation_processed_at: string | null;
  project_id: string;
  projects: { user_id: string };
  task_type_config: TaskTypeConfig | null;
}

interface TaskParseFailure {
  errorCode: "task_shape_invalid";
  message: string;
  details: Record<string, unknown>;
}

type TaskParseResult =
  | { ok: true; task: TaskWithProject }
  | { ok: false; failure: TaskParseFailure };

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseTaskCostParams(value: unknown): TaskCostParams {
  const record = asObjectRecord(value) ?? {};
  const parsed: TaskCostParams = {};

  const resolution = asString(record.resolution);
  if (resolution) {
    parsed.resolution = resolution;
  }

  const frameCount = asNumber(record.frame_count);
  if (frameCount !== undefined) {
    parsed.frame_count = frameCount;
  }

  const modelType = asString(record.model_type);
  if (modelType) {
    parsed.model_type = modelType;
  }

  const result = asObjectRecord(record.result);
  if (result) {
    parsed.result = result as VideoEnhanceResult;
  }

  for (const [key, rawValue] of Object.entries(record)) {
    // Never re-inject known billing keys unless they pass explicit normalization.
    if (key === 'resolution' || key === 'frame_count' || key === 'model_type' || key === 'result') {
      continue;
    }
    parsed[key] = rawValue;
  }

  return parsed;
}

export const __internal = {
  parseTaskCostParams,
};

function parseTaskWithProject(value: unknown): TaskParseResult {
  const task = asObjectRecord(value);
  if (!task) {
    return {
      ok: false,
      failure: {
        errorCode: "task_shape_invalid",
        message: "Task payload is not an object",
        details: { received_type: typeof value },
      },
    };
  }

  const id = asString(task.id);
  const taskType = asString(task.task_type);
  const projectId = asString(task.project_id);
  if (!id || !taskType || !projectId) {
    return {
      ok: false,
      failure: {
        errorCode: "task_shape_invalid",
        message: "Task payload missing required fields: id, task_type, or project_id",
        details: {
          has_id: !!id,
          has_task_type: !!taskType,
          has_project_id: !!projectId,
        },
      },
    };
  }

  const projectsRaw = task.projects;
  const projectRecord = asObjectRecord(projectsRaw)
    ?? (Array.isArray(projectsRaw) ? asObjectRecord(projectsRaw[0]) : null);
  const userId = asString(projectRecord?.user_id);
  if (!userId) {
    return {
      ok: false,
      failure: {
        errorCode: "task_shape_invalid",
        message: "Task payload missing projects.user_id",
        details: {
          projects_type: Array.isArray(projectsRaw) ? "array" : typeof projectsRaw,
          has_projects_user_id: false,
        },
      },
    };
  }

  const params = parseTaskCostParams(task.params);
  const status = asString(task.status) ?? "unknown";

  // Extract task_types FK join (PostgREST returns object or null)
  let taskTypeConfig: TaskTypeConfig | null = null;
  const ttRaw = asObjectRecord(task.task_types);
  if (ttRaw) {
    const ttId = asString(ttRaw.id);
    const billingType = asString(ttRaw.billing_type);
    if (ttId && billingType) {
      taskTypeConfig = {
        id: ttId,
        billing_type: billingType,
        base_cost_per_second: typeof ttRaw.base_cost_per_second === 'number' ? ttRaw.base_cost_per_second : 0,
        unit_cost: typeof ttRaw.unit_cost === 'number' ? ttRaw.unit_cost : 0,
        cost_factors: asObjectRecord(ttRaw.cost_factors) as CostFactors | null,
        is_active: ttRaw.is_active === true,
      };
    }
  }

  return {
    ok: true,
    task: {
      id,
      task_type: taskType,
      params,
      status,
      generation_started_at: asString(task.generation_started_at),
      generation_processed_at: asString(task.generation_processed_at),
      project_id: projectId,
      projects: { user_id: userId },
      task_type_config: taskTypeConfig,
    },
  };
}

// Helper for standard JSON responses with CORS headers
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
    }
  });
}

function errorResponse(
  errorCode: string,
  message: string,
  status: number,
  recoverable: boolean = false,
) {
  return edgeErrorResponse(
    { errorCode, message, recoverable },
    status,
    {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  );
}

// Pricing constants for video_enhance task (fal.ai rates)
const VIDEO_ENHANCE_PRICING = {
  // FILM (interpolation): $0.0013 per compute second
  FILM_COST_PER_SECOND: 0.0013,
  // FlashVSR (upscale): $0.0005 per megapixel (width × height × frames / 1,000,000)
  FLASHVSR_COST_PER_MEGAPIXEL: 0.0005,
};

interface VideoEnhanceResult {
  interpolation_compute_seconds?: number;
  output_width?: number;
  output_height?: number;
  output_frames?: number;
  result?: VideoEnhanceResult;
}

interface VideoEnhanceBreakdown {
  interpolation?: { compute_seconds: number; cost_per_second: number; cost: number };
  upscale?: { output_width: number; output_height: number; output_frames: number; megapixels: number; cost_per_megapixel: number; cost: number };
}

// Special cost calculation for video_enhance task
// Combines FILM (time-based) and FlashVSR (megapixel-based) pricing
function calculateVideoEnhanceCost(taskParams: VideoEnhanceResult): { cost: number; breakdown: VideoEnhanceBreakdown } {
  let totalCost = 0;
  const breakdown: VideoEnhanceBreakdown = {};

  // Get result data from task params (worker should populate this)
  const result = taskParams?.result || taskParams;

  // FILM interpolation cost: $0.0013 per compute second
  if (result?.interpolation_compute_seconds && result.interpolation_compute_seconds > 0) {
    const filmCost = VIDEO_ENHANCE_PRICING.FILM_COST_PER_SECOND * result.interpolation_compute_seconds;
    totalCost += filmCost;
    breakdown.interpolation = {
      compute_seconds: result.interpolation_compute_seconds,
      cost_per_second: VIDEO_ENHANCE_PRICING.FILM_COST_PER_SECOND,
      cost: Math.round(filmCost * 1000000) / 1000000,
    };
  }

  // FlashVSR upscale cost: $0.0005 per megapixel
  if (result?.output_width && result?.output_height && result?.output_frames) {
    const megapixels = (result.output_width * result.output_height * result.output_frames) / 1_000_000;
    const upscaleCost = VIDEO_ENHANCE_PRICING.FLASHVSR_COST_PER_MEGAPIXEL * megapixels;
    totalCost += upscaleCost;
    breakdown.upscale = {
      output_width: result.output_width,
      output_height: result.output_height,
      output_frames: result.output_frames,
      megapixels: Math.round(megapixels * 100) / 100,
      cost_per_megapixel: VIDEO_ENHANCE_PRICING.FLASHVSR_COST_PER_MEGAPIXEL,
      cost: Math.round(upscaleCost * 1000000) / 1000000,
    };
  }

  return {
    cost: Math.round(totalCost * 1000000) / 1000000,
    breakdown,
  };
}

interface CostFactors {
  resolution?: Record<string, number>;
  frameCount?: number;
  modelType?: Record<string, number>;
}

interface TaskCostParams {
  resolution?: string;
  frame_count?: number;
  model_type?: string;
  result?: VideoEnhanceResult;
  [key: string]: unknown;
}

// Calculate cost based on billing type and task configuration
function calculateTaskCost(
  taskType: string,
  billingType: string,
  baseCostPerSecond: number,
  unitCost: number,
  durationSeconds: number,
  costFactors: CostFactors | null,
  taskParams: TaskCostParams
): { cost: number; breakdown?: VideoEnhanceBreakdown } {
  // Special case: video_enhance has compound pricing (FILM + FlashVSR)
  if (taskType === 'video_enhance') {
    return calculateVideoEnhanceCost(taskParams);
  }

  let totalCost;
  if (billingType === 'per_unit') {
    totalCost = unitCost || 0;
  } else {
    totalCost = baseCostPerSecond * durationSeconds;
  }

  // Apply cost factors regardless of billing type
  if (costFactors) {
    if (costFactors.resolution && taskParams.resolution) {
      const resolutionMultiplier = costFactors.resolution[taskParams.resolution] || 1;
      totalCost *= resolutionMultiplier;
    }
    if (costFactors.frameCount && taskParams.frame_count) {
      if (billingType === 'per_unit') {
        totalCost += costFactors.frameCount * taskParams.frame_count;
      } else {
        totalCost += costFactors.frameCount * taskParams.frame_count * durationSeconds;
      }
    }
    if (costFactors.modelType && taskParams.model_type) {
      const modelMultiplier = costFactors.modelType[taskParams.model_type] || 1;
      totalCost *= modelMultiplier;
    }
  }

  return { cost: Math.round(totalCost * 1000) / 1000 };
}

serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceKey) {
    console.error("[CALCULATE-TASK-COST] Missing required environment variables");
    return errorResponse('server_configuration_error', 'Server configuration error', 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Create logger (task_id will be set after parsing body)
  const logger = new SystemLogger(supabaseAdmin, 'calculate-task-cost');

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return jsonResponse({ ok: true });
  }

  if (req.method !== 'POST') {
    logger.warn("Method not allowed", { method: req.method });
    await logger.flush();
    return errorResponse('method_not_allowed', 'Method not allowed', 405);
  }

  // Authenticated endpoint: service-role or owner-verified user token.
  const auth = await authenticateRequest(req, supabaseAdmin, "[CALCULATE-TASK-COST]");
  if (!auth.success) {
    logger.warn(auth.error || "Authentication failed");
    await logger.flush();
    return errorResponse('authentication_failed', auth.error || "Authentication failed", auth.statusCode || 401);
  }

  let requestBody: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      logger.warn("Invalid JSON body shape");
      await logger.flush();
      return errorResponse('invalid_json', 'Request body must be a JSON object', 400);
    }
    requestBody = parsed as Record<string, unknown>;
  } catch (jsonError) {
    logger.warn("Invalid JSON body", {
      error: jsonError instanceof Error ? jsonError.message : String(jsonError),
    });
    await logger.flush();
    return errorResponse('invalid_json', 'Request body must be valid JSON', 400);
  }

  try {
    const task_id = typeof requestBody.task_id === 'string' ? requestBody.task_id : undefined;

    if (!task_id) {
      logger.error("Missing task_id in request");
      await logger.flush();
      return errorResponse('missing_task_id', 'task_id is required', 400);
    }

    if (!auth.isServiceRole) {
      if (!auth.userId) {
        logger.warn("Missing authenticated user id for non-service request");
        await logger.flush();
        return errorResponse('authentication_failed', 'Authentication failed', 401);
      }
      const ownership = await verifyTaskOwnership(
        supabaseAdmin,
        task_id,
        auth.userId,
        "[CALCULATE-TASK-COST]",
      );
      if (!ownership.success) {
        logger.warn("Task ownership verification failed", {
          task_id,
          user_id: auth.userId,
          reason: ownership.error,
        });
        await logger.flush();
        return errorResponse(
          ownership.statusCode === 404 ? 'task_not_found' : 'forbidden',
          ownership.error || "Forbidden",
          ownership.statusCode || 403,
        );
      }
    }

    // Set task_id for all subsequent logs
    logger.setDefaultTaskId(task_id);
    logger.info("Calculating task cost", { task_id });

    // Get task details with task_types joined via FK (eliminates separate task_types query)
    const { data: task, error: taskError } = await supabaseAdmin
      .from('tasks')
      .select(`
        id,
        task_type,
        params,
        status,
        generation_started_at,
        generation_processed_at,
        project_id,
        projects(user_id),
        task_types!tasks_task_type_fkey(id, billing_type, base_cost_per_second, unit_cost, cost_factors, is_active)
      `)
      .eq('id', task_id)
      .single();

    if (taskError) {
      logger.error("Task not found", { error: taskError?.message });
      await logger.flush();
      return errorResponse('task_not_found', 'Task not found', 404);
    }

    const typedTaskResult = parseTaskWithProject(task);
    if (!typedTaskResult.ok) {
      logger.error("Task payload shape invalid", {
        failure: typedTaskResult.failure,
        task_id,
      });
      await logger.flush();
      return errorResponse(
        typedTaskResult.failure.errorCode,
        typedTaskResult.failure.message,
        422,
      );
    }
    const typedTask = typedTaskResult.task;

    logger.debug("Task found", {
      task_type: typedTask.task_type,
      status: typedTask.status,
      has_timestamps: !!(typedTask.generation_started_at && typedTask.generation_processed_at)
    });

    // Check if task has both start and end times
    if (!typedTask.generation_started_at || !typedTask.generation_processed_at) {
      logger.error("Missing timestamps", {
        has_started_at: !!typedTask.generation_started_at,
        has_processed_at: !!typedTask.generation_processed_at
      });
      await logger.flush();
      return errorResponse(
        'missing_generation_timestamps',
        'Task must have both generation_started_at and generation_processed_at timestamps',
        400,
      );
    }

    // Check if task is a sub-task of an orchestrator - skip billing if so (parent will be billed)
    // Uses shared detection: checks all param paths, validates UUID, guards against self-reference
    const subTaskOrchestratorId = getSubTaskOrchestratorId(typedTask.params, typedTask.id);

    if (subTaskOrchestratorId) {
      logger.info("Skipping cost calculation (sub-task)", {
        orchestrator_task_id: subTaskOrchestratorId
      });
      await logger.flush();
      return jsonResponse({
        success: true,
        skipped: true,
        reason: 'Task is sub-task of orchestrator, parent task will be billed',
        orchestrator_task_id: subTaskOrchestratorId,
        task_id: typedTask.id
      });
    }

    // Check if this is an orchestrator task - calculate cost based on sub-task durations
    let subTasks: CompletedSubTaskRow[] = [];
    try {
      subTasks = await lookupCompletedSubTasksForOrchestrator(supabaseAdmin, task_id);
    } catch (subTaskLookupError) {
      const stage = subTaskLookupError instanceof SubTaskLookupError
        ? subTaskLookupError.stage
        : 'unknown';
      const errorCode = stage === 'canonical'
        ? 'subtask_query_failed_canonical'
        : stage === 'legacy'
          ? 'subtask_query_failed_legacy'
          : 'subtask_query_failed';
      logger.error("Failed to query sub-task references", {
        error: subTaskLookupError instanceof Error
          ? subTaskLookupError.message
          : String(subTaskLookupError),
        stage,
      });
      await logger.flush();
      return errorResponse(errorCode, 'Failed to query sub-task references', 500, true);
    }

    let durationSeconds;
    if (subTasks && subTasks.length > 0) {
      // This is an orchestrator task with sub-tasks - sum their durations
      logger.info("Orchestrator task detected", { sub_task_count: subTasks.length });

      let totalSubTaskDuration = 0;
      for (const subTask of subTasks) {
        if (subTask.generation_started_at && subTask.generation_processed_at) {
          const subStartTime = new Date(subTask.generation_started_at);
          const subEndTime = new Date(subTask.generation_processed_at);
          const subDuration = Math.max(1, Math.ceil((subEndTime.getTime() - subStartTime.getTime()) / 1000));
          totalSubTaskDuration += subDuration;
        }
      }

      durationSeconds = totalSubTaskDuration;
      logger.debug("Orchestrator duration calculated", { 
        sub_task_count: subTasks.length, 
        total_duration_seconds: durationSeconds 
      });
    } else {
      // Regular task - use its own duration
      const startTime = new Date(typedTask.generation_started_at);
      const endTime = new Date(typedTask.generation_processed_at);
      durationSeconds = Math.max(1, Math.ceil((endTime.getTime() - startTime.getTime()) / 1000));
    }

    // Idempotency: avoid double-billing if this function is called multiple times for the same task.
    // The credits ledger is intended to be immutable, so we should skip if a spend entry already exists.
    const { data: existingSpendEntries, error: existingSpendError } = await supabaseAdmin
      .from('credits_ledger')
      .select('id, amount, created_at')
      .eq('task_id', typedTask.id)
      .eq('type', 'spend')
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingSpendError) {
      logger.error("Failed to check existing credit ledger entries", { error: existingSpendError.message });
      await logger.flush();
      return errorResponse('cost_record_check_failed', 'Failed to check existing cost records', 500, true);
    }

    if (existingSpendEntries && existingSpendEntries.length > 0) {
      const existing = existingSpendEntries[0];
      logger.info("Cost already recorded - skipping", {
        ledger_id: existing.id,
        existing_amount: existing.amount
      });
      await logger.flush();
      return jsonResponse({
        success: true,
        skipped: true,
        reason: 'Cost already recorded for this task',
        task_id: typedTask.id,
        ledger_id: existing.id,
        existing_amount: existing.amount
      });
    }

    // Get task type configuration (already joined via FK in the task query)
    const taskType = typedTask.task_type_config;

    if (!taskType || !taskType.is_active) {
      logger.error("No task type config found, using defaults", { task_type: typedTask.task_type });

      // Use default cost if no config found — must match DB-level get_task_cost() default of 0.0278
      const defaultCostPerSecond = 0.0278;
      const cost = defaultCostPerSecond * durationSeconds;

      const { error: ledgerError } = await supabaseAdmin.from('credits_ledger').insert({
        user_id: typedTask.projects.user_id,
        task_id: typedTask.id,
        amount: -cost,
        type: 'spend',
        metadata: {
          task_type: typedTask.task_type,
          duration_seconds: durationSeconds,
          base_cost_per_second: defaultCostPerSecond,
          billing_type: 'per_second',
          calculated_at: new Date().toISOString(),
          cost_fallback_used: true,
          note: 'Default cost used - no task type configuration found'
        }
      });

      if (ledgerError) {
        logger.error("Failed to insert into credit ledger (default)", { error: ledgerError.message });
        await logger.flush();
        return errorResponse('ledger_write_failed', 'Failed to record cost in ledger', 500, true);
      }

      logger.info("Cost calculated (default rates)", { 
        cost,
        duration_seconds: durationSeconds,
        billing_type: 'per_second'
      });
      await logger.flush();

      return jsonResponse({
        success: true,
        cost: cost,
        duration_seconds: durationSeconds,
        base_cost_per_second: defaultCostPerSecond,
        billing_type: 'per_second',
        note: 'Default cost used - no task type configuration found'
      });
    }

    // Calculate cost based on task type configuration
    const costResult = calculateTaskCost(
      typedTask.task_type,
      taskType.billing_type,
      taskType.base_cost_per_second,
      taskType.unit_cost,
      durationSeconds,
      taskType.cost_factors,
      typedTask.params
    );
    const cost = costResult.cost;
    const costBreakdown = costResult.breakdown;

    // Validate cost calculation
    if (isNaN(cost) || cost < 0) {
      logger.error("Invalid cost calculated", {
        cost,
        billing_type: taskType.billing_type,
        base_cost_per_second: taskType.base_cost_per_second,
        unit_cost: taskType.unit_cost,
        duration: durationSeconds,
        breakdown: costBreakdown
      });
      await logger.flush();
      return errorResponse('invalid_cost_calculation', 'Invalid cost calculation', 500);
    }

    // Ensure user exists before inserting credit ledger entry
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', typedTask.projects.user_id)
      .single();

    if (userError || !user) {
      logger.error("User not found for credit ledger", { 
        user_id: typedTask.projects.user_id, 
        error: userError?.message 
      });
      await logger.flush();
      return errorResponse('billing_user_not_found', 'User not found for credit calculation', 400);
    }

    // Insert cost into credit ledger
    const { error: ledgerError } = await supabaseAdmin.from('credits_ledger').insert({
      user_id: typedTask.projects.user_id,
      task_id: typedTask.id,
      amount: -cost,
      type: 'spend',
      metadata: {
        task_type: typedTask.task_type,
        billing_type: taskType.billing_type,
        duration_seconds: durationSeconds,
        base_cost_per_second: taskType.base_cost_per_second,
        unit_cost: taskType.unit_cost,
        cost_factors: taskType.cost_factors,
        task_params: typedTask.params,
        calculated_at: new Date().toISOString(),
        task_type_id: taskType.id,
        // Include breakdown for compound pricing (e.g., video_enhance)
        ...(costBreakdown ? { cost_breakdown: costBreakdown } : {})
      }
    });

    if (ledgerError) {
      logger.error("Failed to insert into credit ledger", { 
        error: ledgerError.message,
        user_id: typedTask.projects.user_id,
        cost
      });
      await logger.flush();
      return errorResponse('ledger_write_failed', 'Failed to record cost in ledger', 500, true);
    }

    logger.info("Cost calculated and recorded", {
      cost,
      billing_type: taskType.billing_type,
      duration_seconds: durationSeconds,
      user_id: typedTask.projects.user_id,
      ...(costBreakdown ? { breakdown: costBreakdown } : {})
    });
    await logger.flush();

    return jsonResponse({
      success: true,
      cost: cost,
      billing_type: taskType.billing_type,
      duration_seconds: durationSeconds,
      base_cost_per_second: taskType.base_cost_per_second,
      unit_cost: taskType.unit_cost,
      cost_factors: taskType.cost_factors,
      task_type: typedTask.task_type,
      task_id: typedTask.id,
      // Include breakdown for compound pricing (e.g., video_enhance)
      ...(costBreakdown ? { cost_breakdown: costBreakdown } : {})
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack?.substring(0, 500) : undefined;
    logger.critical("Unexpected error", { error: errorMessage, stack: errorStack });
    await logger.flush();
    return errorResponse('internal_server_error', 'Internal server error', 500, false);
  }
});
