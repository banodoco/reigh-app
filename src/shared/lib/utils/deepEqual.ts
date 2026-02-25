/**
 * Type guard for plain objects.
 * @internal Used by deepMerge.
 */
function isPlainObject(item: unknown): item is Record<string, unknown> {
  return item !== null && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Sanitize settings by removing undefined values recursively
 */
export function sanitizeSettings<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeSettings) as T;
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v === undefined) continue;
    cleaned[k] = sanitizeSettings(v);
  }
  return cleaned as T;
}

/**
 * Deep equality check for settings objects
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(sanitizeSettings(a)) === JSON.stringify(sanitizeSettings(b));
  } catch {
    // JSON.stringify can throw on circular references or other edge cases
    return false;
  }
}

/**
 * Deep merge objects. Returns a new object with source properties merged into target.
 * Arrays are replaced entirely (deep cloned), objects are merged recursively.
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  ...sources: Array<Partial<T> | undefined | null>
): T {
  if (!sources.length) return target;
  const source = sources.shift();

  if (!source) return deepMerge(target, ...sources);
  if (!target) return deepMerge(source as T, ...sources);

  const output = { ...target } as Record<string, unknown>;

  Object.keys(source).forEach(key => {
    const sourceValue = (source as Record<string, unknown>)[key];
    if (sourceValue === undefined) return;

    // Special handling for arrays - always deep clone to prevent reference sharing
    if (Array.isArray(sourceValue)) {
      // For arrays, we replace entirely but deep clone to prevent mutations
      output[key] = JSON.parse(JSON.stringify(sourceValue));
    } else if (isPlainObject(sourceValue)) {
      // For objects (but not arrays), merge recursively
      output[key] = deepMerge(
        (output[key] as Record<string, unknown>) ?? {},
        sourceValue as Record<string, unknown>
      );
    } else {
      // For primitives, just assign the value
      output[key] = sourceValue;
    }
  });

  return deepMerge(output as T, ...sources);
}
