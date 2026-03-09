import { edgeErrorResponse } from "../_shared/edgeRequest.ts";
import {
  asObjectRecord,
  asString,
} from "../_shared/payloadNormalization.ts";

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

function parseStringNumberMap(value: unknown): Record<string, number> | undefined {
  const record = asObjectRecord(value);
  if (!record) {
    return undefined;
  }

  const parsed: Record<string, number> = {};
  for (const [key, rawValue] of Object.entries(record)) {
    const numericValue = asNumber(rawValue);
    if (numericValue !== undefined) {
      parsed[key] = numericValue;
    }
  }

  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

function parseVideoEnhanceMetrics(value: unknown): VideoEnhanceMetrics | undefined {
  const record = asObjectRecord(value);
  if (!record) {
    return undefined;
  }

  const parsed: VideoEnhanceMetrics = {};
  const interpolationSeconds = asNumber(record.interpolation_compute_seconds);
  if (interpolationSeconds !== undefined) {
    parsed.interpolation_compute_seconds = interpolationSeconds;
  }

  const outputWidth = asNumber(record.output_width);
  if (outputWidth !== undefined) {
    parsed.output_width = outputWidth;
  }

  const outputHeight = asNumber(record.output_height);
  if (outputHeight !== undefined) {
    parsed.output_height = outputHeight;
  }

  const outputFrames = asNumber(record.output_frames);
  if (outputFrames !== undefined) {
    parsed.output_frames = outputFrames;
  }

  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

function parseCostFactors(value: unknown): CostFactors | null {
  const record = asObjectRecord(value);
  if (!record) {
    return null;
  }

  const parsed: CostFactors = {};
  const resolution = parseStringNumberMap(record.resolution);
  if (resolution) {
    parsed.resolution = resolution;
  }

  const frameCount = asNumber(record.frameCount);
  if (frameCount !== undefined) {
    parsed.frameCount = frameCount;
  }

  const modelType = parseStringNumberMap(record.modelType);
  if (modelType) {
    parsed.modelType = modelType;
  }

  return Object.keys(parsed).length > 0 ? parsed : null;
}

export function parseTaskCostParams(value: unknown): TaskCostParams {
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

  const result = parseVideoEnhanceMetrics(record.result);
  if (result) {
    parsed.result = result;
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

export function parseTaskWithProject(value: unknown): TaskParseResult {
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
        cost_factors: parseCostFactors(ttRaw.cost_factors),
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
export function jsonResponse(body: unknown, status = 200) {
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

export function errorResponse(
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

interface VideoEnhanceMetrics {
  interpolation_compute_seconds?: number;
  output_width?: number;
  output_height?: number;
  output_frames?: number;
}

interface VideoEnhanceBreakdown {
  interpolation?: { compute_seconds: number; cost_per_second: number; cost: number };
  upscale?: { output_width: number; output_height: number; output_frames: number; megapixels: number; cost_per_megapixel: number; cost: number };
}

// Special cost calculation for video_enhance task
// Combines FILM (time-based) and FlashVSR (megapixel-based) pricing
function calculateVideoEnhanceCost(taskParams: TaskCostParams): { cost: number; breakdown: VideoEnhanceBreakdown } {
  let totalCost = 0;
  const breakdown: VideoEnhanceBreakdown = {};

  // Get result data from task params (worker should populate this)
  const result = taskParams.result ?? (taskParams as VideoEnhanceMetrics);

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
  result?: VideoEnhanceMetrics;
  [key: string]: unknown;
}

// Calculate cost based on billing type and task configuration
export function calculateTaskCost(
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
