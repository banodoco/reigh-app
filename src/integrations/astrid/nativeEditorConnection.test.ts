import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ sessions: vi.fn(), projects: vi.fn() }));
vi.mock("@/integrations/runtime/client.ts", () => ({
  AstridRuntimeClient: class {
    constructor(readonly options?: { baseUrl?: string }) {}
    ensureSession() {
      return state.sessions(this.options?.baseUrl ?? "/api/runtime");
    }
    listProjects = state.projects;
  },
}));
import { assertNativeEditorConnection } from "./nativeEditorConnection.ts";
describe("native editor connection authority", () => {
  beforeEach(() => {
    state.sessions
      .mockReset()
      .mockResolvedValue({
        realm: { realm_id: "existing" },
        health: { runtime_instance_id: "instance" },
      });
    state.projects.mockReset().mockResolvedValue([]);
  });
  it("requires both authenticated transports and project discovery", async () => {
    await assertNativeEditorConnection();
    expect(state.sessions.mock.calls.map((call) => call[0]).sort()).toEqual([
      "/api/astrid",
      "/api/runtime",
    ]);
    expect(state.projects).toHaveBeenCalledOnce();
  });
  it("rejects discovery 503 even while persistence is healthy", async () => {
    state.sessions.mockImplementation(async (url: string) => {
      if (url === "/api/astrid") throw new Error("Workspace discovery: 503");
      return {
        realm: { realm_id: "existing" },
        health: { runtime_instance_id: "instance" },
      };
    });
    await expect(assertNativeEditorConnection()).rejects.toThrow("503");
    expect(state.projects).not.toHaveBeenCalled();
  });
  it.each(["realm", "instance", "missing instance"])(
    "rejects a different or unproven %s",
    async (kind) => {
      state.sessions
        .mockResolvedValueOnce({
          realm: { realm_id: "existing" },
          health: { runtime_instance_id: "instance" },
        })
        .mockResolvedValueOnce({
          realm: { realm_id: kind === "realm" ? "different" : "existing" },
          health: {
            runtime_instance_id:
              kind === "missing instance"
                ? undefined
                : kind === "instance"
                  ? "different"
                  : "instance",
          },
        });
      await expect(assertNativeEditorConnection()).rejects.toThrow(
        "different Runtime instances",
      );
      expect(state.projects).not.toHaveBeenCalled();
    },
  );
  it("rejects a negotiated session whose project discovery is unavailable", async () => {
    state.projects.mockRejectedValue(new Error("Projects unavailable"));
    await expect(assertNativeEditorConnection()).rejects.toThrow(
      "Projects unavailable",
    );
  });
});
