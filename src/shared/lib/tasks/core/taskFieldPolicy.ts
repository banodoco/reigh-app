export { resolveByPrecedence } from '../taskParamContract';

interface ComposeOptionalFieldsEntry {
  key: string;
  value: unknown;
  include?: (value: unknown) => boolean;
}

export function composeOptionalFields(
  entries: readonly ComposeOptionalFieldsEntry[],
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const entry of entries) {
    if (entry.value === undefined) {
      continue;
    }
    if (entry.include && !entry.include(entry.value)) {
      continue;
    }
    payload[entry.key] = entry.value;
  }
  return payload;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
