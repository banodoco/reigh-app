import { ValidationError } from '@/shared/lib/errorHandling/errors';

export const DEFAULT_ASPECT_RATIO = '1:1';

export interface ProjectResolutionResult {
  resolution: string;
  aspectRatio: string;
}

/** The typed spec owned by the admitted Astrid capability. */
export interface RuntimeTaskSpec {
  family: string;
  params: Record<string, unknown>;
  output_policy: Record<string, unknown>;
}

/** Runtime's explicit storage reservation estimate for one admission. */
export interface RuntimeStorageEstimate {
  estimated_scratch_bytes: number;
  estimated_output_bytes: number;
}

/** Runtime's explicit terminal publication/lineage effect. */
export type RuntimeSettlementEffect = Record<string, unknown>;

/** HC-04 canonical producer admission DTO. */
export interface TaskCreationRequest {
  project: string;
  capability_id: string;
  capability_digest: string;
  schema_version: '1';
  /** Ordered, already-authorized Runtime CAS object IDs. */
  input_object_ids: string[];
  spec: RuntimeTaskSpec;
  storage_estimate: RuntimeStorageEstimate;
  settlement_effect: RuntimeSettlementEffect;
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
