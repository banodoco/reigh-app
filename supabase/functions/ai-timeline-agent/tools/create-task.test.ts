import { describe, expect, it, vi } from "vitest";

vi.mock("./clips.ts", () => ({
  createShotWithGenerations: vi.fn(),
  resolveClipGenerationIds: vi.fn(),
  resolveSelectedClipShot: vi.fn(),
}));

vi.mock("./generation.ts", () => ({
  createGenerationTask: vi.fn(),
}));

vi.mock("../selectedClips.ts", () => ({
  resolveSelectionContext: vi.fn(() => []),
}));

import { executeCreateTask } from "./create-task.ts";

describe("executeCreateTask", () => {
  it("fails closed before materialization, task creation, or network access", async () => {
    const from = vi.fn(() => { throw new Error("legacy task reads must not run"); });
    const supabaseAdmin = { from } as never;
    const selectedClips = [{
      clip_id: "clip-1",
      url: "https://example.test/input.png",
      media_type: "image" as const,
      generation_id: "gen-1",
    }];

    const result = await executeCreateTask(
      {
        task_type: "character-animate",
        reference_image_urls: [selectedClips[0].url],
        video_url: "https://example.test/motion.mp4",
        materialized_inputs: [{ generation_id: "gen-1", kind: "remote", target: "https://example.test/input.png" }],
      },
      {
        config: { clips: [] },
        configVersion: 1,
        registry: { assets: {} },
        projectId: "project-1",
      } as never,
      selectedClips,
      supabaseAdmin,
      undefined,
      "timeline-1",
    );

    expect(result).toEqual({
      result: "create_task is retired; use the canonical Astrid admission and readback paths.",
    });
    expect(from).not.toHaveBeenCalled();
  });
});
