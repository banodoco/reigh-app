/**
 * Clip types that are authoring references owned by the managed Runtime.
 *
 * These are deliberately kept out of the browser clip registry. The Runtime
 * resolves them against its Astrid element catalog and expands/renders them
 * on the worker path before Remotion executes the frozen render snapshot.
 */
export const MANAGED_RUNTIME_CLIP_TYPES: ReadonlySet<string> = new Set([
  'shot',
  'scrolling-guide',
]);

export function isManagedRuntimeClipType(value: unknown): value is string {
  return typeof value === 'string' && MANAGED_RUNTIME_CLIP_TYPES.has(value);
}
