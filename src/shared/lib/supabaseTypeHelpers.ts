import type { Json } from '@/integrations/supabase/types';

function isJsonPrimitive(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));
}

function isJsonObject(value: unknown, seen: WeakSet<object>): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  for (const key of Object.keys(value)) {
    const child = (value as Record<string, unknown>)[key];
    if (!isJsonValueInternal(child, seen)) {
      return false;
    }
  }
  return true;
}

function isJsonArray(value: unknown, seen: WeakSet<object>): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  return value.every((child) => isJsonValueInternal(child, seen));
}

function isJsonValueInternal(value: unknown, seen: WeakSet<object>): boolean {
  return isJsonPrimitive(value) || isJsonObject(value, seen) || isJsonArray(value, seen);
}

export function isJsonValue(value: unknown): value is Json {
  return isJsonValueInternal(value, new WeakSet<object>());
}

function sanitizeToJson(value: unknown): Json {
  try {
    const normalized = JSON.parse(JSON.stringify(value));
    return isJsonValue(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

/**
 * Cast a value to Supabase's Json type.
 *
 * Accepts already-valid JSON structures directly. For mixed runtime shapes,
 * falls back to JSON stringify/parse sanitization (dropping non-JSON values).
 */
export function toJson<T>(value: T): Json {
  return isJsonValue(value) ? value : sanitizeToJson(value);
}
