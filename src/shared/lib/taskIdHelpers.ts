/**
 * Task ID resolution helpers
 *
 * Centralizes the logic for extracting task IDs from variant params,
 * handling legacy field names consistently.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CANONICAL_SOURCE_TASK_ID_PATHS = [
  ['source_task_id'],
  ['orchestration_contract', 'orchestrator_task_id'],
];
const LEGACY_SOURCE_TASK_ID_PATHS = [
  ['orchestrator_task_id'],
  ['task_id'],
] as const;

function readStringPath(
  value: unknown,
  path: readonly string[],
): string | null {
  let current: unknown = value;
  for (const segment of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' && current.length > 0 ? current : null;
}

function resolveTaskIdFromPaths(
  value: unknown,
  paths: readonly (readonly string[])[],
): string | null {
  return paths
    .map((path) => readStringPath(value, path))
    .find((candidate): candidate is string => Boolean(candidate)) ?? null;
}

function asValidUuid(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return UUID_REGEX.test(value) ? value : null;
}

/**
 * Extract the source task ID from variant params.
 *
 * Variants can have their source task ID stored under different field names
 * due to historical evolution of the param structure:
 * - `source_task_id` - Current standard (preferred)
 * - `orchestration_contract.orchestrator_task_id` - Canonical orchestrator contract
 *
 * @param params - Variant params object (typically from variant.params)
 * @returns Valid UUID task ID, or null if not found/invalid
 */
export function getSourceTaskId(
  params: Record<string, unknown> | null | undefined
): string | null {
  return asValidUuid(resolveTaskIdFromPaths(params, CANONICAL_SOURCE_TASK_ID_PATHS));
}

/**
 * Legacy-compatible source task ID extraction.
 * This helper is only for migration paths that still need to read old keys.
 */
export function getSourceTaskIdLegacyCompatible(
  params: Record<string, unknown> | null | undefined,
): string | null {
  const canonicalTaskId = getSourceTaskId(params);
  if (canonicalTaskId) {
    return canonicalTaskId;
  }
  return asValidUuid(resolveTaskIdFromPaths(params, LEGACY_SOURCE_TASK_ID_PATHS));
}

/**
 * Check if params contain orchestrator details.
 * Used to determine if variant already has full task context.
 */
export function hasOrchestratorDetails(
  params: Record<string, unknown> | null | undefined
): boolean {
  return !!params?.orchestrator_details;
}
