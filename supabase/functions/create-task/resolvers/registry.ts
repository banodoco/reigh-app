import type { TaskFamilyResolver } from "./types.ts";

// Legacy dimensional families are deliberately absent. Canonical task
// admission is owned by Runtime; the edge index keeps a 410 guard so stale
// callers cannot fall through to task_types passthrough.
const TASK_FAMILY_RESOLVERS: Record<string, TaskFamilyResolver> = {};

export function getTaskFamilyResolver(family: string): TaskFamilyResolver | undefined {
  return TASK_FAMILY_RESOLVERS[family];
}
