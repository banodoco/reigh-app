import type { ToolHandler, ToolResult } from "../types.ts";

/**
 * The timeline agent no longer owns generation admission. Browser producers
 * use the canonical Astrid Runtime/CAS path; this compatibility export is a
 * fail-closed tombstone for stale imports and persisted prompts.
 */
export interface CreateGenerationTaskArgs {
  [key: string]: unknown;
  project_id?: string;
  prompt?: string;
  task_type?: string;
}

export async function createGenerationTask(
  args: CreateGenerationTaskArgs,
): Promise<ToolResult> {
  void args;
  return { result: "Legacy timeline generation is retired; use the canonical Astrid admission path." };
}

export const handlers: Record<string, ToolHandler> = {
  create_generation_task: (args) => createGenerationTask(args),
};
