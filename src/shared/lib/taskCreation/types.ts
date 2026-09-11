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
  scratch_bytes: number;
  output_bytes: number;
}

/** Producer-validated GEN intent carried alongside the admitted task. */
export type RuntimeGenerationIntent = Record<string, unknown>;

/** Runtime's explicit terminal publication effect. */
export type RuntimeSettlementEffect =
  | Record<string, never>
  | {
      effect_type: 'project.update';
      target_id: string;
      expected_version: number;
      payload?: {
        name?: string;
        metadata?: unknown;
      };
    }
  | {
      effect_type: 'generation.variant.append';
      target_id: string;
      expected_version: number;
      payload: {
        source_variant_id: string;
        source_object_id: string;
        variant_type: string;
        output_name: string;
        output_ordinal: 0;
        primary_policy: 'preserve';
      };
    }
  | {
      /** Runtime creates the project generation and its first primary variant atomically. */
      effect_type: 'generation.create_with_variant';
      target_id: string;
      payload: {
        generation_type: string;
        metadata: Record<string, unknown>;
        variant_type: string;
        output_name: string;
        output_ordinal: 0;
        primary_policy: 'preserve';
      };
    };

export type RuntimeInput = Blob | Uint8Array | ArrayBuffer;

export interface RuntimeInputIngestOptions {
  mediaType?: string;
  originalName?: string;
  maxBytes?: number;
  /** Field to associate with bounded local-input failures. */
  field?: string;
  /** Validate common image signatures before committing producer bytes. */
  requireImage?: boolean;
}

export interface RuntimeObjectReceipt {
  object_id: string;
  media_type: string;
  size: number;
  filename: string;
  receipt: Record<string, unknown>;
}

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
  /** Composed and validated by the GEN/UE producer; Reigh does not rebuild it. */
  generation_intent?: RuntimeGenerationIntent;
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
