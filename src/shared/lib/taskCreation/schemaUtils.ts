import { TaskValidationError } from './types';
import type { PathLoraConfig } from '@/domains/lora/types/lora';

interface NumericRangeOptions {
  field: string;
  label: string;
  min: number;
  max: number;
}

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

interface ResolveSeed32BitOptions {
  seed?: number;
  randomize?: boolean;
  fallbackSeed?: number;
  field?: string;
}

const MAX_SEED_32_BIT = 0x7fffffff;

export function validateNonEmptyString(
  value: string,
  field: string,
  label: string,
): void {
  if (value.trim() === '') {
    throw new TaskValidationError(`${label} cannot be empty`, field);
  }
}

export function validateUrlString(
  value: string,
  field: string,
  label: string,
): void {
  try {
    new URL(value);
  } catch {
    throw new TaskValidationError(`${label} must be a valid URL`, field);
  }
}

export function validateNumericRange(
  value: number | undefined,
  { field, label, min, max }: NumericRangeOptions,
): void {
  if (value === undefined) {
    return;
  }
  if (value < min || value > max) {
    throw new TaskValidationError(`${label} must be between ${min} and ${max}`, field);
  }
}

export function validateSeed32Bit(seed: number | undefined, field = 'seed'): void {
  validateNumericRange(seed, {
    field,
    label: 'Seed',
    min: 0,
    max: MAX_SEED_32_BIT,
  });
}

function generateSeed32Bit(): number {
  return Math.floor(Math.random() * MAX_SEED_32_BIT);
}

export function resolveSeed32Bit({
  seed,
  randomize = false,
  fallbackSeed,
  field = 'seed',
}: ResolveSeed32BitOptions): number {
  if (randomize) {
    return generateSeed32Bit();
  }

  const resolvedSeed = seed ?? fallbackSeed;
  if (resolvedSeed !== undefined) {
    validateSeed32Bit(resolvedSeed, field);
    return resolvedSeed;
  }

  return generateSeed32Bit();
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
    if (typeof pathValue !== 'string' || pathValue.trim() === '') {
      throw new TaskValidationError(`LoRA ${index + 1}: path is required`, `loras[${index}].${String(pathField)}`);
    }

    const strengthValue = lora[strengthField];
    if (typeof strengthValue !== 'number') {
      throw new TaskValidationError(`LoRA ${index + 1}: ${strengthLabel} is required`, `loras[${index}].${String(strengthField)}`);
    }
    if (strengthValue < min || strengthValue > max) {
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
