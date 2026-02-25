/** Type-safe camelCase -> snake_case key conversion for flat objects. */
type CamelToSnakeCase<S extends string> =
  S extends `${infer T}${infer U}`
    ? U extends Uncapitalize<U>
      ? `${Lowercase<T>}${CamelToSnakeCase<U>}`
      : `${Lowercase<T>}_${CamelToSnakeCase<U>}`
    : S;

type SnakeCaseKeys<T> = {
  [K in keyof T as K extends string ? CamelToSnakeCase<K> : K]: T[K];
};

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Convert top-level keys from camelCase to snake_case.
 * Values are copied as-is (no deep transformation).
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
