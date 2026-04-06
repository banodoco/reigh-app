import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  executeCreateTask: vi.fn(),
  executeDuplicateGeneration: vi.fn(),
  executeSearchLoras: vi.fn(),
  executeSetLora: vi.fn(),
}));

vi.mock("./tools/registry.ts", () => ({
  executeCommand: (...args: unknown[]) => mocks.executeCommand(...args),
}));

vi.mock("./tools/create-task.ts", () => ({
  executeCreateTask: (...args: unknown[]) => mocks.executeCreateTask(...args),
}));

vi.mock("./tools/duplicate-generation.ts", () => ({
  executeDuplicateGeneration: (...args: unknown[]) => mocks.executeDuplicateGeneration(...args),
}));

vi.mock("./tools/loras.ts", () => ({
  executeSearchLoras: (...args: unknown[]) => mocks.executeSearchLoras(...args),
  executeSetLora: (...args: unknown[]) => mocks.executeSetLora(...args),
}));

import {
  buildToolErrorTurn,
  cleanAssistantText,
  executeToolCall,
  recoverSelectedClipsFromTurns,
} from "./loop.ts";
import { buildSelectedClipsPrompt } from "./prompts.ts";

describe("loop helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes tool-call formatting junk from assistant text", () => {
    const input = [
      '[TOOL_CALL]ignored[/TOOL_CALL]',
      '<invoke>ignored</invoke>',
      'Tool call run:\n{"command":"move clip-1 2"}',
      'run(command="move clip-1 2")',
      '1. move clip-1 2',
      "Done editing the timeline.",
    ].join("\n\n");

    expect(cleanAssistantText(input)).toBe("Done editing the timeline.");
  });

  it("dispatches parse errors, run commands, create_task calls, and unknown tools", async () => {
    const timelineState = {
      config: { clips: [] },
      configVersion: 1,
      registry: { assets: {} },
      projectId: "project-1",
    } as unknown as import("./types.ts").TimelineState;
    const supabaseAdmin = {} as import("./types.ts").SupabaseAdmin;
    const selectedClips = [{ clip_id: "clip-1", url: "https://example.com/1.png", media_type: "image" as const }];

    mocks.executeCommand.mockResolvedValue({ result: "ran" });
    mocks.executeCreateTask.mockResolvedValue({ result: "queued" });
    mocks.executeSearchLoras.mockResolvedValue({ result: "found" });
    mocks.executeSetLora.mockResolvedValue({ result: "updated" });

    await expect(executeToolCall({
      id: "parse",
      name: "run",
      args: {},
      parseError: "bad args",
    }, timelineState, supabaseAdmin, "timeline-1", selectedClips)).resolves.toEqual({ result: "bad args" });

    await expect(executeToolCall({
      id: "run",
      name: "run",
      args: { command: "view" },
      parseError: null,
    }, timelineState, supabaseAdmin, "timeline-1", selectedClips)).resolves.toEqual({ result: "ran" });
    expect(mocks.executeCommand).toHaveBeenCalledWith("view", timelineState, "timeline-1", supabaseAdmin);

    await expect(executeToolCall({
      id: "task",
      name: "create_task",
      args: { prompt: "hello" },
      parseError: null,
    }, timelineState, supabaseAdmin, "timeline-1", selectedClips)).resolves.toEqual({ result: "queued" });
    expect(mocks.executeCreateTask).toHaveBeenCalledWith(
      { prompt: "hello" },
      timelineState,
      selectedClips,
      supabaseAdmin,
      undefined,
    );

    await expect(executeToolCall({
      id: "search",
      name: "search_loras",
      args: { query: "cinematic" },
      parseError: null,
    }, timelineState, supabaseAdmin, "timeline-1", selectedClips, undefined, "user-1")).resolves.toEqual({ result: "found" });
    expect(mocks.executeSearchLoras).toHaveBeenCalledWith(
      { query: "cinematic" },
      supabaseAdmin,
      "user-1",
    );

    const generationContext = {
      image: null,
      travel: null,
    } satisfies import("./types.ts").GenerationContext;

    await expect(executeToolCall({
      id: "set",
      name: "set_lora",
      args: { action: "add", lora_path: "loras/cinematic.safetensors", target: "video-travel" },
      parseError: null,
    }, timelineState, supabaseAdmin, "timeline-1", selectedClips, generationContext)).resolves.toEqual({
      result: "updated",
    });
    expect(mocks.executeSetLora).toHaveBeenCalledWith(
      { action: "add", lora_path: "loras/cinematic.safetensors", target: "video-travel" },
      timelineState,
      selectedClips,
      supabaseAdmin,
      generationContext,
    );

    await expect(executeToolCall({
      id: "unknown",
      name: "mystery",
      args: {},
      parseError: null,
    }, timelineState, supabaseAdmin, "timeline-1", selectedClips)).resolves.toEqual({ result: "Unknown tool: mystery." });
  });

  it("dispatches duplicate_generation to executeDuplicateGeneration", async () => {
    const timelineState = {
      config: { clips: [] },
      configVersion: 1,
      registry: { assets: {} },
      projectId: "project-1",
    } as unknown as import("./types.ts").TimelineState;
    const supabaseAdmin = {} as import("./types.ts").SupabaseAdmin;
    const selectedClips = [{ clip_id: "clip-1", url: "https://example.com/1.png", media_type: "image" as const }];

    mocks.executeDuplicateGeneration.mockResolvedValue({ result: "duplicated" });

    await expect(executeToolCall({
      id: "dup",
      name: "duplicate_generation",
      args: { generation_id: "gen-abc" },
      parseError: null,
    }, timelineState, supabaseAdmin, "timeline-1", selectedClips)).resolves.toEqual({ result: "duplicated" });

    expect(mocks.executeDuplicateGeneration).toHaveBeenCalledWith(
      { generation_id: "gen-abc" },
      timelineState,
      selectedClips,
      supabaseAdmin,
    );
  });

  it("builds a tool-specific assistant error turn", () => {
    const turn = buildToolErrorTurn("tool-123", new Error("boom"));

    expect(turn.role).toBe("assistant");
    expect(turn.content).toContain("[TOOL ERROR tool-123]");
    expect(turn.content).toContain("boom");
  });

  it("recovers selected clips from the most recent stored user attachments", () => {
    const turns = [
      {
        role: "user",
        content: "older selection",
        attachments: [{
          clipId: "clip-old",
          url: "https://example.com/old.png",
          mediaType: "image",
          generationId: "gen-old",
          prompt: "old prompt",
        }],
        timestamp: "2026-04-04T00:00:00.000Z",
      },
      {
        role: "assistant",
        content: "working on it",
        timestamp: "2026-04-04T00:00:01.000Z",
      },
      {
        role: "user",
        content: "use these",
        attachments: [{
          clipId: "clip-new",
          url: "https://example.com/new.png",
          mediaType: "image",
          generationId: "gen-new",
          prompt: "new prompt",
        }],
        timestamp: "2026-04-04T00:00:02.000Z",
      },
    ] as import("./types.ts").AgentTurn[];

    expect(recoverSelectedClipsFromTurns(turns)).toEqual([{
      clip_id: "clip-new",
      url: "https://example.com/new.png",
      media_type: "image",
      generation_id: "gen-new",
      prompt: "new prompt",
    }]);
  });

  it("includes prompt text in the selected clips prompt only when present", () => {
    const prompt = buildSelectedClipsPrompt([
      {
        clip_id: "clip-1",
        url: "https://example.com/1.png",
        media_type: "image",
        prompt: 'moody "reference" lighting',
      },
      {
        clip_id: "clip-2",
        url: "https://example.com/2.png",
        media_type: "video",
      },
    ], [
      "- id=clip-1 track=V1",
      "- id=clip-2 track=V2",
    ].join("\n"));

    expect(prompt).toContain('prompt="moody \\"reference\\" lighting"');
    expect(prompt).not.toContain("prompt=undefined");
  });
});
