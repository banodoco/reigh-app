interface NumericRangeOptions {
  field: string;
  label: string;
  min: number;
  max: number;
}

export class TaskValidationError extends Error {
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "TaskValidationError";
    this.field = field;
  }
}

export function validateRequiredFields(
  params: Record<string, unknown>,
  requiredFields: readonly string[],
): void {
  for (const field of requiredFields) {
    const value = params[field];

    if (value === undefined || value === null) {
      throw new TaskValidationError(`${field} is required`, field);
    }

    if (Array.isArray(value) && value.length === 0) {
      throw new TaskValidationError(`${field} cannot be empty`, field);
    }

    if (typeof value === "string" && value.trim() === "") {
      throw new TaskValidationError(`${field} cannot be empty`, field);
    }
  }
}

export function validateNonEmptyString(
  value: string,
  field: string,
  label: string,
): void {
  if (value.trim() === "") {
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

  if (!Number.isFinite(value) || value < min || value > max) {
    throw new TaskValidationError(`${label} must be between ${min} and ${max}`, field);
  }
}
