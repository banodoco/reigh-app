const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Runtime UUID v1-v5 validator for IDs persisted in Supabase UUID columns. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

/**
 * Filters unknown string IDs down to valid UUIDs only.
 * Uses Set() to avoid duplicate query parameters.
 */
export function filterUuidStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => isUuid(value))));
}

