import { ValidationError } from '@/shared/lib/errorHandling/errors';

export const DEFAULT_ASPECT_RATIO = '1:1';

export interface ProjectResolutionResult {
  resolution: string;
  aspectRatio: string;
}

export interface TaskCreationRequest {
  project_id: string;
  family: string;
  input: Record<string, unknown>;
}

export type BaseTaskParams = TaskCreationRequest;

/**
 * Successful task-creation response shape.
 * `task_ids` is present for batched responses. `task_id` remains populated
 * with the first id so existing single-task call sites keep working.
 */
export interface TaskCreationResult {
  task_id: string;
  task_ids?: string[];
  status: string;
  meta?: Record<string, unknown>;
}

export class TaskValidationError extends ValidationError {
  constructor(message: string, field?: string) {
    super(message, { field });
    this.name = 'TaskValidationError';
  }
}

/**
 * Hires fix API parameters for image generation/edit tasks.
 * Uses snake_case to match API directly.
 */
export interface HiresFixApiParams {
  /** Number of inference steps (used for single-pass or base pass in two-pass mode) */
  num_inference_steps?: number;
  hires_scale?: number;
  hires_steps?: number;
  hires_denoise?: number;
  /** Lightning LoRA strength for phase 1 (initial generation) */
  lightning_lora_strength_phase_1?: number;
  /** Lightning LoRA strength for phase 2 (hires/refinement pass) */
  lightning_lora_strength_phase_2?: number;
  additional_loras?: Record<string, string>;
}
