export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function asObjectRecord(value: unknown): Record<string, unknown> | null {
  return isObjectRecord(value) ? value : null;
}

export function asObjectOrEmpty(value: unknown): Record<string, unknown> {
  return asObjectRecord(value) ?? {};
}

export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

interface NonNegativeIntParseResult {
  value: number | null;
  invalid: boolean;
}

export function parseNonNegativeIntCandidate(value: unknown): NonNegativeIntParseResult {
  if (value === null || value === undefined) {
    return { value: null, invalid: false };
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      return { value: null, invalid: true };
    }
    return { value, invalid: false };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return { value: null, invalid: true };
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
      return { value: null, invalid: true };
    }
    return { value: parsed, invalid: false };
  }
  return { value: null, invalid: true };
}
