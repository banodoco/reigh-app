import type { TimelineState, ToolResult } from "../types.ts";

export type DelegateScope = "full" | "insert" | "replace_range";

export interface DelegateToBanodocoAgentArgs {
  intent: string;
  brief_inputs?: Record<string, unknown>;
  theme_id?: string;
  scope?: DelegateScope;
  current_timeline_snapshot?: boolean;
}

export interface BanodocoTaskPayload {
  intent: string;
  brief_inputs: Record<string, unknown>;
  theme_id: string;
  expected_version: number;
  scope: DelegateScope;
  user_jwt: string;
  project_id: string;
  timeline_id: string;
  correlation_id: string;
  current_timeline?: unknown;
}

export interface BuildPayloadInput {
  args: Record<string, unknown>;
  timelineState: TimelineState;
  timelineId: string;
  userJwt: string;
  correlationId?: string;
}

export interface BuildPayloadResult {
  payload?: BanodocoTaskPayload;
  error?: string;
}

export function buildDelegatePayload(input: BuildPayloadInput): BuildPayloadResult {
  void input;
  return { error: "Legacy Banodoco delegation is retired; use the canonical Astrid admission path." };
}

export interface EnqueueResult {
  status: "queued" | "error";
  task_id?: string;
  correlation_id?: string;
  message: string;
}

export async function enqueueBanodocoTask(
  payload: BanodocoTaskPayload,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<EnqueueResult> {
  void payload;
  void options;
  return {
    status: "error",
    message: "Legacy Banodoco delegation is retired; use the canonical Astrid admission path.",
  };
}

export async function executeDelegateToBanodocoAgent(
  args: Record<string, unknown>,
  timelineState: TimelineState,
  timelineId: string,
  userJwt: string | undefined,
  options: { fetchImpl?: typeof fetch; correlationId?: string } = {},
): Promise<ToolResult> {
  void args;
  void timelineState;
  void timelineId;
  void userJwt;
  void options;
  return { result: "delegateToBanodocoAgent is retired; use the canonical Astrid admission and readback paths." };
}

export interface BanodocoTaskStatusSnapshot {
  task_id: string;
  status: "Queued" | "In Progress" | "Complete" | "Failed" | "worker_unavailable" | "unknown";
  failure_code?: string;
  message?: string;
  config_version?: number;
  correlation_id?: string;
}

export async function pollBanodocoTaskStatus(
  taskId: string,
  userJwt: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<BanodocoTaskStatusSnapshot> {
  void userJwt;
  void options;
  return {
    task_id: taskId,
    status: "unknown",
    message: "Legacy Banodoco delegation is retired; use the canonical Astrid admission path.",
  };
}

export function findLatestPendingDelegate(
  turns: ReadonlyArray<{ role: string; tool_name?: string; content: string }>,
): { task_id: string; correlation_id: string } | null {
  void turns;
  return null;
}

export function summariseTaskStatusForChat(snapshot: BanodocoTaskStatusSnapshot): string {
  void snapshot;
  return "Legacy Banodoco delegation is retired; use the canonical Astrid admission path.";
}
