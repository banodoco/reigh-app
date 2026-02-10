/**
 * Type-safe camelCase → snake_case key conversion for objects.
 *
 * Used to derive backend task params from frontend settings defaults,
 * eliminating manual key-by-key mapping that can drift.
 */

// Type-level: convert a camelCase string to snake_case
type CamelToSnakeCase<S extends string> =
  S extends `${infer T}${infer U}`
    ? U extends Uncapitalize<U>
      ? `${Lowercase<T>}${CamelToSnakeCase<U>}`
      : `${Lowercase<T>}_${CamelToSnakeCase<U>}`
    : S;

// Type-level: convert all keys of an object from camelCase to snake_case
type SnakeCaseKeys<T> = {
  [K in keyof T as K extends string ? CamelToSnakeCase<K> : K]: T[K];
};

// Runtime: convert a single camelCase string to snake_case
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Convert all keys of an object from camelCase to snake_case.
 * Values are preserved as-is (no recursive conversion).
 *
 * @example
 * ```ts
 * const settings = { numInferenceSteps: 6, guidanceScale: 3.0 };
 * const taskParams = camelToSnakeKeys(settings);
 * // { num_inference_steps: 6, guidance_scale: 3.0 }
 * // TypeScript knows the exact key names
 * ```
 */
export function camelToSnakeKeys<T extends Record<string, unknown>>(obj: T): SnakeCaseKeys<T> {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[camelToSnake(key)] = obj[key];
    }
  }
  return result as SnakeCaseKeys<T>;
}
