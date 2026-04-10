import { describe, expect, it } from "vitest";
import { imageGenerationResolver } from "../imageGeneration.ts";
import { imageUpscaleResolver } from "../imageUpscale.ts";
import { magicEditResolver } from "../magicEdit.ts";
import { zImageTurboI2IResolver } from "../zImageTurboI2I.ts";
import type { ResolveRequest, ResolverContext, ResolverResult } from "../types.ts";

const timelinePlacement = {
  timeline_id: "timeline-1",
  source_clip_id: "clip-1",
  target_track: "V1",
  insertion_time: 12.5,
  intent: "after_source" as const,
};

const placementIntent = {
  timeline_id: "timeline-1",
  anchor_clip_id: "clip-1",
  anchor_generation_id: "gen-1",
  anchor_variant_id: "variant-1",
  relation: "after" as const,
  preferred_track_id: "V1",
  fallback_at: 12.5,
  fallback_track_id: "V1",
};

const context: ResolverContext = {
  supabaseAdmin: {} as ResolverContext["supabaseAdmin"],
  projectId: "project-1",
  aspectRatio: "16:9",
  logger: {} as ResolverContext["logger"],
};

function expectPlacement(result: ResolverResult) {
  expect(result.tasks).toHaveLength(1);
  expect(result.tasks[0]?.params.timeline_placement).toEqual(timelinePlacement);
}

function expectPlacementIntent(result: ResolverResult) {
  expect(result.tasks).toHaveLength(1);
  expect(result.tasks[0]?.params.placement_intent).toEqual(placementIntent);
}

describe("resolver timeline placement persistence", () => {
  it("keeps timeline_placement in params for the real imageGenerationResolver", () => {
    const result = imageGenerationResolver({
      family: "image-generation",
      project_id: "project-1",
      input: {
        prompts: [{ id: "prompt-1", fullPrompt: "cinematic skyline at dusk" }],
        imagesPerPrompt: 1,
        model_name: "qwen-image",
        timeline_placement: timelinePlacement,
      },
    } satisfies ResolveRequest, context);

    expectPlacement(result);
  });

  it("keeps timeline_placement in params for the real magicEditResolver", () => {
    const result = magicEditResolver({
      family: "magic-edit",
      project_id: "project-1",
      input: {
        prompt: "extend the clouds",
        image_url: "https://example.com/source.png",
        timeline_placement: timelinePlacement,
      },
    } satisfies ResolveRequest, context);

    expectPlacement(result);
  });

  it("keeps timeline_placement in params for the real zImageTurboI2IResolver", () => {
    const result = zImageTurboI2IResolver({
      family: "z-image-turbo-i2i",
      project_id: "project-1",
      input: {
        image_url: "https://example.com/source.png",
        prompt: "more dramatic lighting",
        timeline_placement: timelinePlacement,
      },
    } satisfies ResolveRequest, context);

    expectPlacement(result);
  });

  it("keeps placement_intent in params for the real magicEditResolver", () => {
    const result = magicEditResolver({
      family: "magic-edit",
      project_id: "project-1",
      input: {
        prompt: "extend the clouds",
        image_url: "https://example.com/source.png",
        placement_intent: placementIntent,
      },
    } satisfies ResolveRequest, context);

    expectPlacementIntent(result);
  });

  it("keeps placement_intent in params for the real zImageTurboI2IResolver", () => {
    const result = zImageTurboI2IResolver({
      family: "z-image-turbo-i2i",
      project_id: "project-1",
      input: {
        image_url: "https://example.com/source.png",
        prompt: "more dramatic lighting",
        placement_intent: placementIntent,
      },
    } satisfies ResolveRequest, context);

    expectPlacementIntent(result);
  });

  it("keeps placement_intent in params for the real imageUpscaleResolver", () => {
    const result = imageUpscaleResolver({
      family: "image-upscale",
      project_id: "project-1",
      input: {
        image_url: "https://example.com/source.png",
        generation_id: "gen-1",
        source_variant_id: "variant-1",
        placement_intent: placementIntent,
      },
    } satisfies ResolveRequest, context);

    expectPlacementIntent(result);
  });
});
