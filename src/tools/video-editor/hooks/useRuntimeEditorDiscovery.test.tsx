vi.mock("@/integrations/astrid/nativeEditorConnection.ts", () => ({
  assertNativeEditorConnection: vi.fn(async () => undefined),
}));
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { AstridRuntimeClient } from "@/integrations/runtime/client.ts";
import {
  useRuntimeEditorDiscovery,
  chooseRuntimeTimeline,
} from "./useRuntimeEditorDiscovery.ts";
import type { Project } from "@/integrations/runtime/generated.ts";
const project = (id: string): Project => ({
  project_id: id,
  realm_id: "realm",
  slug: `slug-${id}`,
  name: `Project ${id}`,
  metadata: {},
  version: 1,
  created_at: "now",
  updated_at: "now",
});
function wrapper() {
  const q = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={q}>{children}</QueryClientProvider>
  );
}
afterEach(() => vi.restoreAllMocks());
describe("native Runtime discovery", () => {
  it("discovers canonical projects, then scopes timeline reads to the selected real project", async () => {
    vi.spyOn(AstridRuntimeClient.prototype, "listProjects").mockResolvedValue([
      project("a"),
      project("b"),
    ]);
    const read = vi
      .spyOn(AstridRuntimeClient.prototype, "listTimelines")
      .mockImplementation(async (id) => [
        { project_id: id, timeline_id: `${id}-main`, name: "Main" },
      ]);
    const hook = renderHook(
      ({ id }) =>
        useRuntimeEditorDiscovery({
          enabled: true,
          projectId: id,
          open: false,
        }),
      { initialProps: { id: null as string | null }, wrapper: wrapper() },
    );
    await waitFor(() =>
      expect(hook.result.current.projectsQuery.isSuccess).toBe(true),
    );
    expect(read).not.toHaveBeenCalled();
    hook.rerender({ id: "b" });
    await waitFor(() =>
      expect(hook.result.current.timelinesQuery.data?.[0].timeline_id).toBe(
        "b-main",
      ),
    );
    expect(hook.result.current.project?.slug).toBe("slug-b");
    expect(read).toHaveBeenCalledWith("b");
  });
  it("does not substitute a project for a missing explicit ID and rejects cross-project rows", async () => {
    vi.spyOn(AstridRuntimeClient.prototype, "listProjects").mockResolvedValue([
      project("a"),
    ]);
    const read = vi
      .spyOn(AstridRuntimeClient.prototype, "listTimelines")
      .mockResolvedValue([{ project_id: "other", timeline_id: "foreign" }]);
    const h = renderHook(
      ({ id }) =>
        useRuntimeEditorDiscovery({
          enabled: true,
          projectId: id,
          open: false,
          retry: 0,
        }),
      { initialProps: { id: "missing" }, wrapper: wrapper() },
    );
    await waitFor(() =>
      expect(h.result.current.projectsQuery.isSuccess).toBe(true),
    );
    expect(h.result.current.project).toBeNull();
    expect(read).not.toHaveBeenCalled();
    h.rerender({ id: "a" });
    await waitFor(() =>
      expect(h.result.current.timelinesQuery.isError).toBe(true),
    );
    expect(h.result.current.timelinesQuery.data).toBeUndefined();
  });
  it("fences late reads when project selection changes", async () => {
    vi.spyOn(AstridRuntimeClient.prototype, "listProjects").mockResolvedValue([
      project("a"),
      project("b"),
    ]);
    let release!: (v: Record<string, unknown>[]) => void;
    vi.spyOn(AstridRuntimeClient.prototype, "listTimelines").mockImplementation(
      (id) =>
        id === "a"
          ? new Promise((resolve) => {
              release = resolve;
            })
          : Promise.resolve([{ timeline_id: "b-main", project_id: "b" }]),
    );
    const h = renderHook(
      ({ id }) =>
        useRuntimeEditorDiscovery({
          enabled: true,
          projectId: id,
          open: false,
        }),
      { initialProps: { id: "a" }, wrapper: wrapper() },
    );
    await waitFor(() => expect(release).toBeDefined());
    h.rerender({ id: "b" });
    await waitFor(() =>
      expect(h.result.current.timelinesQuery.data?.[0].timeline_id).toBe(
        "b-main",
      ),
    );
    await act(async () =>
      release([{ timeline_id: "a-main", project_id: "a" }]),
    );
    expect(h.result.current.timelinesQuery.data?.[0].timeline_id).toBe(
      "b-main",
    );
  });
  it("recovers from a single failed discovery request without a sticky error", async () => {
    const list = vi
      .spyOn(AstridRuntimeClient.prototype, "listProjects")
      .mockRejectedValueOnce(new Error("Runtime busy"))
      .mockResolvedValue([project("a")]);
    const h = renderHook(
      () =>
        useRuntimeEditorDiscovery({
          enabled: true,
          projectId: "a",
          open: false,
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(h.result.current.projectsQuery.isSuccess).toBe(true));
    expect(h.result.current.projectsQuery.error).toBeNull();
    expect(h.result.current.project?.project_id).toBe("a");
    expect(list).toHaveBeenCalledTimes(2);
  });
  it("selects a legitimate default or deterministic existing timeline without using absent metadata", () => {
    expect(
      chooseRuntimeTimeline(
        { ...project("a"), metadata: { default_timeline_id: "absent" } },
        [{ timeline_id: "z" }, { timeline_id: "a" }],
      )?.timeline_id,
    ).toBe("a");
    expect(
      chooseRuntimeTimeline(
        { ...project("a"), metadata: { default_timeline_id: "z" } },
        [{ timeline_id: "z" }, { timeline_id: "a" }],
      )?.timeline_id,
    ).toBe("z");
    expect(chooseRuntimeTimeline(project("a"), [])).toBeUndefined();
  });
});
