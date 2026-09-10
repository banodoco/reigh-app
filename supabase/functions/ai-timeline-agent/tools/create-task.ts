import type { ToolResult } from "../types.ts";

/**
 * Retired compatibility surface. Generation admission is owned by the
 * canonical Astrid Runtime/CAS producer, not the timeline agent.
 */
export async function executeCreateTask(
  ...args: unknown[]
): Promise<Pick<ToolResult, "result">> {
  void args;
  return { result: "create_task is retired; use the canonical Astrid admission and readback paths." };
}
