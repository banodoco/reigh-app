/**
 * Diverse generation test — exercises every generation type the timeline agent supports.
 *
 * Verifies task CREATION only (does not wait for GPU completion).
 * Run: cd reigh-app && npx tsx supabase/functions/_tests/harness/diverse-gen-test.ts
 */

import type { SelectedClipPayload } from "../../ai-timeline-agent/types.ts";
import { TestHarness, createTestSession, callAgentUntilSettled, signInHarnessUser } from "./index.ts";
import type { HarnessSnapshot, SnapshotDiff, TaskSnapshotRow } from "./snapshot.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GenTestCase {
  label: string;
  expectedTaskType: string;
  message: string | ((snapshot: HarnessSnapshot) => string);
  selectedClips?: (snapshot: HarnessSnapshot) => SelectedClipPayload[];
  /** Extra checks on the created task's params JSON */
  validateTask?: (task: TaskSnapshotRow) => string | null; // null = ok, string = error
}

interface GenTestResult {
  label: string;
  expectedTaskType: string;
  actualTaskType: string | null;
  taskId: string | null;
  taskStatus: string | null;
  keyParams: Record<string, unknown>;
  sessionStatus: string | null;
  error: string | null;
  durationMs: number;
}

interface SelectedClipOverrides {
  media_type?: SelectedClipPayload["media_type"];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSelectedClip(
  snapshot: HarnessSnapshot,
  clipIndex: number,
  overrides?: SelectedClipOverrides,
): SelectedClipPayload {
  const timeline = Object.values(snapshot.timelines)[0];
  if (!timeline) throw new Error("No timeline in snapshot");

  const clip = timeline.config.clips[clipIndex];
  if (!clip) throw new Error(`No clip at index ${clipIndex}`);
  if (!clip.asset) throw new Error(`Clip ${clip.id} has no asset`);

  const registry = timeline.asset_registry as { assets: Record<string, { file: string; type?: string; generationId?: string }> };
  const asset = registry.assets[clip.asset];
  if (!asset?.file) throw new Error(`Asset ${clip.asset} missing file`);

  return {
    clip_id: clip.id,
    url: asset.file,
    media_type: overrides?.media_type ?? (asset.type?.startsWith("video/") ? "video" : "image"),
    ...(asset.generationId ? { generation_id: asset.generationId } : {}),
  };
}

function buildSyntheticVideoClip(snapshot: HarnessSnapshot, clipIndex: number): SelectedClipPayload {
  return buildSelectedClip(snapshot, clipIndex, { media_type: "video" });
}

function findAddedTask(diff: SnapshotDiff): TaskSnapshotRow | null {
  const added = Object.values(diff.tasks.added);
  return added.length > 0 ? added[0] : null;
}

function getSessionStatus(snapshot: HarnessSnapshot): string | null {
  const sessions = Object.values(snapshot.timeline_agent_sessions);
  if (sessions.length === 0) return null;
  return sessions[sessions.length - 1].status;
}

function extractKeyParams(task: TaskSnapshotRow): Record<string, unknown> {
  const params = task.params as Record<string, unknown> | null;
  if (!params) return {};

  const keys: Record<string, unknown> = {};
  if (params.prompts) keys.prompts = params.prompts;
  if (params.reference_mode) keys.reference_mode = params.reference_mode;
  if (params.style_reference_image) keys.style_reference_image = String(params.style_reference_image).slice(0, 60) + "...";
  if (params.subject_reference_image) keys.subject_reference_image = String(params.subject_reference_image).slice(0, 60) + "...";
  if (params.model_name) keys.model_name = params.model_name;
  if (params.image_urls) keys.image_urls = (params.image_urls as string[]).map((u) => u.slice(0, 60) + "...");
  if (params.base_prompts) keys.base_prompts = params.base_prompts;
  if (params.shot_id) keys.shot_id = params.shot_id;
  if (params.imagesPerPrompt) keys.imagesPerPrompt = params.imagesPerPrompt;
  if (params.image_url) keys.image_url = params.image_url;
  if (params.video_url) keys.video_url = params.video_url;
  if (params.character_image_url) keys.character_image_url = params.character_image_url;
  if (params.motion_video_url) keys.motion_video_url = params.motion_video_url;
  if (params.image) keys.image = params.image;
  if (params.model) keys.model = params.model;
  if (params.prompt) keys.prompt = String(params.prompt).slice(0, 80);
  if (params.strength !== undefined) keys.strength = params.strength;
  if (params.based_on) keys.based_on = params.based_on;
  if (params.generation_id) keys.generation_id = params.generation_id;
  if (params.enable_interpolation !== undefined) keys.enable_interpolation = params.enable_interpolation;
  if (params.enable_upscale !== undefined) keys.enable_upscale = params.enable_upscale;
  if (params.resolution) keys.resolution = params.resolution;
  if (params.orchestrator_details && typeof params.orchestrator_details === "object") {
    const orchestratorDetails = params.orchestrator_details as Record<string, unknown>;
    if (orchestratorDetails.model_name) keys.orchestrator_model_name = orchestratorDetails.model_name;
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

const testCases: GenTestCase[] = [
  {
    label: "text-to-image",
    expectedTaskType: "z_image_turbo",
    message: "Create a text-to-image task using model z-image for a futuristic city at sunset",
    validateTask: (task) => {
      const params = task.params as Record<string, unknown>;
      const paramsStr = JSON.stringify(params).toLowerCase();
      if (!paramsStr.includes("futuristic") && !paramsStr.includes("city") && !paramsStr.includes("sunset")) {
        return "Task params don't seem to contain the prompt content";
      }
      // The create-task resolver stores the model as "model", not "model_name"
      const model = params.model ?? params.model_name;
      if (model !== "z-image") {
        return `Expected model=z-image, got ${String(model)}`;
      }
      return null;
    },
  },
  {
    label: "image-to-video",
    expectedTaskType: "*",
    message: (snapshot) => {
      const clip0 = buildSelectedClip(snapshot, 0);
      const clip1 = buildSelectedClip(snapshot, 1);
      return `Create an image-to-video task using model ltx-2.3 to travel between selected clips ${clip0.clip_id} and ${clip1.clip_id}`;
    },
    selectedClips: (snapshot) => [buildSelectedClip(snapshot, 0), buildSelectedClip(snapshot, 1)],
    validateTask: (task) => {
      const params = task.params as Record<string, unknown>;
      if (params.image_urls && Array.isArray(params.image_urls) && (params.image_urls as string[]).length >= 2) {
        return params.model_name === "ltx2_22B" ? null : "Expected model_name to be ltx2_22B";
      }
      const orchestratorDetails = params.orchestrator_details as Record<string, unknown> | undefined;
      if (orchestratorDetails?.model_name === "ltx2_22B") {
        return null;
      }
      return `Expected video-related task or image_urls with 2+ entries, got task_type=${task.task_type}`;
    },
  },
  {
    label: "subject-transfer",
    // Maps to qwen_image_style or similar via the create-task edge function
    expectedTaskType: "*",
    message: (snapshot) => {
      const clip0 = buildSelectedClip(snapshot, 0);
      return `Create a subject-transfer task using selected clip ${clip0.clip_id} as the subject reference, with the prompt "place this subject in a lush forest setting"`;
    },
    selectedClips: (snapshot) => [buildSelectedClip(snapshot, 0)],
    validateTask: (task) => {
      const params = task.params as Record<string, unknown>;
      // For subject-transfer, we expect reference_mode=subject or subject_reference_image
      if (params.reference_mode === "subject" || params.subject_reference_image) return null;
      // Accept if it's at least a reference-based generation
      if (params.style_reference_image || params.reference_mode) return null;
      return `Expected subject-transfer params (reference_mode=subject or subject_reference_image), got: ${JSON.stringify(Object.keys(params))}`;
    },
  },
  {
    label: "scene-transfer",
    // Maps to qwen_image_style or similar via the create-task edge function
    expectedTaskType: "*",
    message: (snapshot) => {
      const clip0 = buildSelectedClip(snapshot, 0);
      return `Generate an image using the scene/background from selected clip ${clip0.clip_id} with a robot in it`;
    },
    selectedClips: (snapshot) => [buildSelectedClip(snapshot, 0)],
    validateTask: (task) => {
      const params = task.params as Record<string, unknown>;
      // For scene-transfer, we expect reference_mode=scene
      if (params.reference_mode === "scene") return null;
      // Accept if it's at least a reference-based generation
      if (params.style_reference_image || params.reference_mode || params.subject_reference_image) return null;
      return `Expected scene-transfer params (reference_mode=scene), got: ${JSON.stringify(Object.keys(params))}`;
    },
  },
  {
    label: "image-to-image",
    expectedTaskType: "z_image_turbo_i2i",
    message: (snapshot) => {
      const clip0 = buildSelectedClip(snapshot, 0);
      return `Create an image-to-image task from selected clip ${clip0.clip_id} with prompt "turn this into glossy editorial lighting" and strength 0.45`;
    },
    selectedClips: (snapshot) => [buildSelectedClip(snapshot, 0)],
    validateTask: (task) => {
      const params = task.params as Record<string, unknown>;
      if (!params.image_url) return "Expected image_url in image-to-image task params";
      if (params.strength !== 0.45) return `Expected strength 0.45, got ${String(params.strength)}`;
      if (!params.based_on) return "Expected based_on lineage in image-to-image task params";
      return null;
    },
  },
  {
    label: "magic-edit",
    expectedTaskType: "qwen_image_edit",
    message: (snapshot) => {
      const clip0 = buildSelectedClip(snapshot, 0);
      return `Create a magic-edit task for selected clip ${clip0.clip_id} that replaces the background with a moody rain-soaked alley`;
    },
    selectedClips: (snapshot) => [buildSelectedClip(snapshot, 0)],
    validateTask: (task) => {
      const params = task.params as Record<string, unknown>;
      // The magic-edit resolver stores the image as "image", not "image_url"
      if (!params.image && !params.image_url) return "Expected image or image_url in magic-edit task params";
      if (!params.prompt) return "Expected prompt in magic-edit task params";
      if (!params.based_on) return "Expected based_on lineage in magic-edit task params";
      return null;
    },
  },
  {
    label: "image-upscale",
    expectedTaskType: "image-upscale",
    message: (snapshot) => {
      const clip0 = buildSelectedClip(snapshot, 0);
      return `Create an image-upscale task for selected clip ${clip0.clip_id}`;
    },
    selectedClips: (snapshot) => [buildSelectedClip(snapshot, 0)],
    validateTask: (task) => {
      const params = task.params as Record<string, unknown>;
      // The image-upscale resolver stores the image as "image", not "image_url"
      if (!params.image && !params.image_url) return "Expected image or image_url in image-upscale task params";
      if (!params.generation_id) return "Expected generation_id in image-upscale task params";
      return null;
    },
  },
  {
    label: "video-enhance",
    expectedTaskType: "video_enhance",
    message: (snapshot) => {
      const videoClip = buildSyntheticVideoClip(snapshot, 1);
      return `Create a video-enhance task for selected video clip ${videoClip.clip_id}`;
    },
    selectedClips: (snapshot) => [buildSyntheticVideoClip(snapshot, 1)],
    validateTask: (task) => {
      const params = task.params as Record<string, unknown>;
      if (!params.video_url) return "Expected video_url in video-enhance task params";
      if (params.enable_interpolation !== true) return "Expected enable_interpolation=true in video-enhance task params";
      if (params.enable_upscale !== true) return "Expected enable_upscale=true in video-enhance task params";
      if (!params.based_on) return "Expected based_on lineage in video-enhance task params";
      return null;
    },
  },
  {
    label: "character-animate",
    expectedTaskType: "animate_character",
    message: (snapshot) => {
      const imageClip = buildSelectedClip(snapshot, 0);
      const videoClip = buildSyntheticVideoClip(snapshot, 1);
      return `Create a character-animate task using selected image clip ${imageClip.clip_id} as the character and selected video clip ${videoClip.clip_id} as the motion reference`;
    },
    selectedClips: (snapshot) => [buildSelectedClip(snapshot, 0), buildSyntheticVideoClip(snapshot, 1)],
    validateTask: (task) => {
      const params = task.params as Record<string, unknown>;
      if (!params.character_image_url) return "Expected character_image_url in character-animate task params";
      if (!params.motion_video_url) return "Expected motion_video_url in character-animate task params";
      if (params.resolution !== "480p") return `Expected resolution 480p, got ${String(params.resolution)}`;
      // Note: characterAnimateResolver does not propagate based_on (not in its interface)
      return null;
    },
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function runTest(
  harness: TestHarness,
  testCase: GenTestCase,
  baseSnapshot: HarnessSnapshot,
  setupInfo: { timelineId: string; userId: string },
): Promise<GenTestResult> {
  const start = Date.now();
  const result: GenTestResult = {
    label: testCase.label,
    expectedTaskType: testCase.expectedTaskType,
    actualTaskType: null,
    taskId: null,
    taskStatus: null,
    keyParams: {},
    sessionStatus: null,
    error: null,
    durationMs: 0,
  };

  try {
    const message = typeof testCase.message === "function"
      ? testCase.message(baseSnapshot)
      : testCase.message;
    const selectedClips = testCase.selectedClips?.(baseSnapshot);

    console.log(`\n--- [${testCase.label}] Sending: "${message.slice(0, 80)}..."`);
    if (selectedClips?.length) {
      console.log(`    Selected clips: ${selectedClips.map((c) => c.clip_id).join(", ")}`);
    }

    // Create a fresh session per test to avoid deduplication / context leakage
    const freshSession = await createTestSession(setupInfo.timelineId, setupInfo.userId);
    const auth = await signInHarnessUser();

    const beforeSnapshot = await harness.snapshot();
    const responses = await callAgentUntilSettled(
      freshSession.sessionId,
      message,
      selectedClips,
      { jwt: auth.jwt },
    );
    const lastResponse = responses[responses.length - 1];
    console.log(`    Agent status: ${lastResponse?.status}, turns: ${responses.length}`);

    const afterSnapshot = await harness.snapshot();
    const diff = harness.diff(beforeSnapshot, afterSnapshot);
    const addedTask = findAddedTask(diff);

    result.sessionStatus = getSessionStatus(afterSnapshot);

    if (!addedTask) {
      result.error = "No task was created";
    } else {
      result.taskId = addedTask.id;
      result.actualTaskType = addedTask.task_type;
      result.taskStatus = addedTask.status;
      result.keyParams = extractKeyParams(addedTask);

      if (testCase.expectedTaskType !== "*" && addedTask.task_type !== testCase.expectedTaskType) {
        result.error = `Task type mismatch: expected ${testCase.expectedTaskType}, got ${addedTask.task_type}`;
      }

      if (!result.error && testCase.validateTask) {
        const validationError = testCase.validateTask(addedTask);
        if (validationError) {
          result.error = validationError;
        }
      }
    }

    console.log(`    Task: ${result.taskId ?? "none"} (${result.actualTaskType ?? "n/a"}) status=${result.taskStatus ?? "n/a"}`);
    if (result.error) {
      console.log(`    ERROR: ${result.error}`);
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    console.log(`    EXCEPTION: ${result.error}`);
  }

  result.durationMs = Date.now() - start;
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Diverse Generation Test ===\n");

  const harness = new TestHarness();
  const results: GenTestResult[] = [];

  try {
    console.log("Setting up harness...");
    const setup = await harness.setup();
    console.log(`  Project: ${setup.projectId}`);
    console.log(`  Timeline: ${setup.timelineId}`);
    console.log(`  Session: ${setup.sessionId}`);

    const baseSnapshot = await harness.snapshot();
    console.log(`  Clips: ${Object.values(baseSnapshot.timelines)[0]?.config.clips.length ?? 0}`);

    for (const testCase of testCases) {
      const result = await runTest(harness, testCase, baseSnapshot, {
        timelineId: setup.timelineId,
        userId: setup.userId,
      });
      results.push(result);
    }
  } finally {
    console.log("\nTearing down harness...");
    await harness.teardown();
  }

  // Summary table
  console.log("\n\n=== SUMMARY ===\n");
  const colWidths = { label: 20, type: 24, taskId: 38, status: 12, session: 14, time: 8, result: 8 };
  const header = [
    "Label".padEnd(colWidths.label),
    "Task Type".padEnd(colWidths.type),
    "Task ID".padEnd(colWidths.taskId),
    "Status".padEnd(colWidths.status),
    "Session".padEnd(colWidths.session),
    "Time".padEnd(colWidths.time),
    "Result".padEnd(colWidths.result),
  ].join(" | ");
  console.log(header);
  console.log("-".repeat(header.length));

  let passed = 0;
  let failed = 0;

  for (const r of results) {
    const ok = !r.error;
    if (ok) passed++;
    else failed++;

    const row = [
      r.label.padEnd(colWidths.label),
      (r.actualTaskType ?? "NONE").padEnd(colWidths.type),
      (r.taskId ?? "—").padEnd(colWidths.taskId),
      (r.taskStatus ?? "—").padEnd(colWidths.status),
      (r.sessionStatus ?? "—").padEnd(colWidths.session),
      `${(r.durationMs / 1000).toFixed(1)}s`.padEnd(colWidths.time),
      (ok ? "PASS" : "FAIL").padEnd(colWidths.result),
    ].join(" | ");
    console.log(row);
  }

  console.log("-".repeat(header.length));
  console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`);

  // Print key params for each
  console.log("=== KEY PARAMS ===\n");
  for (const r of results) {
    console.log(`[${r.label}]`);
    if (r.error) console.log(`  Error: ${r.error}`);
    console.log(`  Params: ${JSON.stringify(r.keyParams, null, 2)}`);
    console.log();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
