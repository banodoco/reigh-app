import { describe, expect, it, vi } from "vitest";
import { createGenerationTask } from "./generation.ts";

describe("createGenerationTask", () => {
  it("returns the retired error without calling fetch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(createGenerationTask({
      project_id: "project-1",
      task_type: "text-to-image",
      prompt: "must not be sent",
    })).resolves.toEqual({
      result: "Legacy timeline generation is retired; use the canonical Astrid admission path.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
