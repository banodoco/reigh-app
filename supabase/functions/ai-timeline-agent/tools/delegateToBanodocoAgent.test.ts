import { describe, expect, it, vi } from "vitest";
import {
  buildDelegatePayload,
  enqueueBanodocoTask,
  executeDelegateToBanodocoAgent,
  pollBanodocoTaskStatus,
} from "./delegateToBanodocoAgent.ts";

const timelineState = {
  config: { clips: [], theme: "2rp" },
  configVersion: 4,
  registry: { assets: {} },
  projectId: "project-1",
} as never;

describe("retired Banodoco delegation", () => {
  it("fails closed before constructing a legacy delegation payload", () => {
    const result = buildDelegatePayload({
      args: { intent: "extend the reel", scope: "insert" },
      timelineState,
      timelineId: "timeline-1",
      userJwt: "user-jwt",
      correlationId: "corr-1",
    });

    expect(result).toEqual({
      error: "Legacy Banodoco delegation is retired; use the canonical Astrid admission path.",
    });
  });

  it("fails closed before enqueue, poll, or fetch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const payload = {
      intent: "extend the reel",
      brief_inputs: {},
      theme_id: "2rp",
      expected_version: 4,
      scope: "insert" as const,
      user_jwt: "user-jwt",
      project_id: "project-1",
      timeline_id: "timeline-1",
      correlation_id: "corr-1",
    };

    await expect(enqueueBanodocoTask(payload)).resolves.toEqual({
      status: "error",
      message: "Legacy Banodoco delegation is retired; use the canonical Astrid admission path.",
    });
    await expect(executeDelegateToBanodocoAgent(
      { intent: "extend the reel" },
      timelineState,
      "timeline-1",
      "user-jwt",
    )).resolves.toEqual({
      result: "delegateToBanodocoAgent is retired; use the canonical Astrid admission and readback paths.",
    });
    await expect(pollBanodocoTaskStatus("task-1", "user-jwt")).resolves.toEqual({
      task_id: "task-1",
      status: "unknown",
      message: "Legacy Banodoco delegation is retired; use the canonical Astrid admission path.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
