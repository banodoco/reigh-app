export interface HiresFixApiParams {
  num_inference_steps?: number;
  hires_scale?: number;
  hires_steps?: number;
  hires_denoise?: number;
  lightning_lora_strength_phase_1?: number;
  lightning_lora_strength_phase_2?: number;
  additional_loras?: Record<string, number>;
}

export function buildHiresFixParams(
  hiresFix: HiresFixApiParams | undefined,
): Record<string, unknown> {
  if (!hiresFix) {
    return {};
  }

  const params: Record<string, unknown> = {};

  if (hiresFix.num_inference_steps !== undefined) {
    params.num_inference_steps = hiresFix.num_inference_steps;
  }
  if (hiresFix.hires_scale !== undefined) {
    params.hires_scale = hiresFix.hires_scale;
  }
  if (hiresFix.hires_steps !== undefined) {
    params.hires_steps = hiresFix.hires_steps;
  }
  if (hiresFix.hires_denoise !== undefined) {
    params.hires_denoise = hiresFix.hires_denoise;
  }
  if (hiresFix.lightning_lora_strength_phase_1 !== undefined) {
    params.lightning_lora_strength_phase_1 = hiresFix.lightning_lora_strength_phase_1;
  }
  if (hiresFix.lightning_lora_strength_phase_2 !== undefined) {
    params.lightning_lora_strength_phase_2 = hiresFix.lightning_lora_strength_phase_2;
  }
  if (hiresFix.additional_loras && Object.keys(hiresFix.additional_loras).length > 0) {
    params.additional_loras = hiresFix.additional_loras;
  }

  return params;
}
