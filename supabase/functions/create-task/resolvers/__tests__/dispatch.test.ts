import { beforeEach, describe, expect, it, vi } from "vitest";
import { __getServeHandler, __resetServeHandler } from "../../../_tests/mocks/denoHttpServer.ts";

const mocks = vi.hoisted(() => ({
  bootstrapEdgeHandler: vi.fn(),
}));

vi.mock("../../../_shared/edgeHandler.ts", () => ({
  bootstrapEdgeHandler: (...args: unknown[]) => mocks.bootstrapEdgeHandler(...args),
  NO_SESSION_RUNTIME_OPTIONS: {},
}));

function createLogger() {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
    setDefaultTaskId: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  };
}

async function loadHandler() {
  await import("../../index.ts");
  return __getServeHandler();
}

describe("create-task resolver dispatch boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    __resetServeHandler();
  });

  it("does not dispatch CORS preflight into task resolution", async () => {
    const handler = await loadHandler();
    const response = await handler(new Request("https://edge.test/create-task", { method: "OPTIONS" }));

    expect(response.status).toBe(200);
    expect(mocks.bootstrapEdgeHandler).not.toHaveBeenCalled();
  });

  it("preserves bootstrap authentication failures", async () => {
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: false,
      response: new Response("blocked", { status: 401 }),
    });

    const handler = await loadHandler();
    const response = await handler(new Request("https://edge.test/create-task", { method: "POST" }));

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("blocked");
  });

  it.each([
    "image_generation",
    "video_enhance",
    "character_animate",
    "travel_between_images",
    "arbitrary_active_task_type",
  ])("tombstones %s before resolver, route, materialization, or insert work", async (family) => {
    const logger = createLogger();
    const from = vi.fn(() => { throw new Error("task authority must not be reached"); });
    const rpc = vi.fn(() => { throw new Error("route authority must not be reached"); });
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: { from, rpc },
        logger,
        auth: { isServiceRole: true, userId: null },
        body: {
          family,
          project_id: "project-1",
          idempotency_key: "idem-1",
          materialized_inputs: [{ generation_id: "gen-1", kind: "remote", target: "https://example.test/input" }],
          input: { prompt: "retired" },
        },
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request("https://edge.test/create-task", { method: "POST" }));

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: "legacy_task_endpoint_removed",
      recoverable: false,
    });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(logger.flush).toHaveBeenCalledTimes(1);
  });
});
