import { TaskValidationError } from "./validation.ts";

interface LoraValidationOptions<
  T extends Record<string, unknown>,
  TPathField extends keyof T,
  TStrengthField extends keyof T,
> {
  pathField: TPathField;
  strengthField: TStrengthField;
  strengthLabel: string;
  min: number;
  max: number;
}

export interface PathLoraConfig {
  path: string;
  strength: number;
}

export function validateLoraConfigs<
  T extends Record<string, unknown>,
  TPathField extends keyof T,
  TStrengthField extends keyof T,
>(
  loras: T[] | undefined,
  options: LoraValidationOptions<T, TPathField, TStrengthField>,
): void {
  if (!loras?.length) {
    return;
  }

  const {
    pathField,
    strengthField,
    strengthLabel,
    min,
    max,
  } = options;

  loras.forEach((lora, index) => {
    const pathValue = lora[pathField];
    if (typeof pathValue !== "string" || pathValue.trim() === "") {
      throw new TaskValidationError(
        `LoRA ${index + 1}: path is required`,
        `loras[${index}].${String(pathField)}`,
      );
    }

    const strengthValue = lora[strengthField];
    if (typeof strengthValue !== "number") {
      throw new TaskValidationError(
        `LoRA ${index + 1}: ${strengthLabel} is required`,
        `loras[${index}].${String(strengthField)}`,
      );
    }

    if (!Number.isFinite(strengthValue) || strengthValue < min || strengthValue > max) {
      throw new TaskValidationError(
        `LoRA ${index + 1}: ${strengthLabel} must be between ${min} and ${max}`,
        `loras[${index}].${String(strengthField)}`,
      );
    }
  });
}

export function mapPathLorasToStrengthRecord(
  loras: PathLoraConfig[] | undefined,
): Record<string, number> {
  if (!loras?.length) {
    return {};
  }

  return loras.reduce<Record<string, number>>((acc, lora) => {
    if (lora.path) {
      acc[lora.path] = lora.strength;
    }
    return acc;
  }, {});
}
