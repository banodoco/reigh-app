import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createGenerationTask: vi.fn(),
  createShotWithGenerations: vi.fn(),
  findShotForGenerations: vi.fn(),
  resolveClipGenerationIds: vi.fn(),
}));

vi.mock("./generation.ts", () => ({
  createGenerationTask: (...args: unknown[]) => mocks.createGenerationTask(...args),
}));

vi.mock("./clips.ts", () => ({
  createShotWithGenerations: (...args: unknown[]) => mocks.createShotWithGenerations(...args),
  findShotForGenerations: (...args: unknown[]) => mocks.findShotForGenerations(...args),
  resolveClipGenerationIds: (...args: unknown[]) => mocks.resolveClipGenerationIds(...args),
}));

import { executeCreateTask } from "./create-task.ts";

describe("executeCreateTask", () => {
  const originalDeno = globalThis.Deno;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveClipGenerationIds.mockReturnValue([]);
    mocks.findShotForGenerations.mockResolvedValue(null);
    mocks.createGenerationTask.mockResolvedValue({ result: "Queued text-to-image task task-1." });
    vi.stubGlobal("Deno", {
      env: {
        get: vi.fn((key: string) => {
          if (key === "SUPABASE_URL") return "https://example.supabase.co";
          if (key === "SUPABASE_SERVICE_ROLE_KEY") return "service-role-key";
          return undefined;
        }),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
    if (originalDeno) {
      vi.stubGlobal("Deno", originalDeno);
    }
  });

  it("creates all requested variants up to 16 even when prompt generation returns duplicates", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        prompts: Array.from({ length: 16 }, () => "same prompt"),
      }),
    }) as typeof fetch;

    const result = await executeCreateTask(
      {
        task_type: "text-to-image",
        prompt: "same prompt",
        count: 16,
        model: "qwen-image",
      },
      {
        config: { clips: [] },
        configVersion: 1,
        registry: { assets: {} },
        projectId: "project-1",
      } as never,
      undefined,
      {} as never,
      {
        image: { defaultModelName: "qwen-image", activeReference: null, selectedLorasByCategory: {} },
        travel: null,
      },
    );

    expect(result.result).toContain("Queued 16 tasks with varied prompts.");
    expect(mocks.createGenerationTask).toHaveBeenCalledTimes(16);

    const idempotencyKeys = mocks.createGenerationTask.mock.calls.map(([args]) => (args as { idempotency_key?: string }).idempotency_key);
    expect(new Set(idempotencyKeys).size).toBe(16);
  });

  it("reports the real queued count instead of the requested count when some creates fail", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        prompts: ["one", "two", "three"],
      }),
    }) as typeof fetch;

    mocks.createGenerationTask
      .mockResolvedValueOnce({ result: "Queued text-to-image task task-1." })
      .mockResolvedValueOnce({ result: "Failed to create task: boom" })
      .mockResolvedValueOnce({ result: "Queued text-to-image task task-3." });

    const result = await executeCreateTask(
      {
        task_type: "text-to-image",
        prompt: "base",
        count: 3,
        model: "qwen-image",
      },
      {
        config: { clips: [] },
        configVersion: 1,
        registry: { assets: {} },
        projectId: "project-1",
      } as never,
      undefined,
      {} as never,
      {
        image: { defaultModelName: "qwen-image", activeReference: null, selectedLorasByCategory: {} },
        travel: null,
      },
    );

    expect(result.result).toContain("Queued 2 tasks with varied prompts.");
    expect(result.result).toContain("1 failed.");
  });
});
