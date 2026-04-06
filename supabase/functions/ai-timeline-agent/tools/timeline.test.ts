import { describe, expect, it } from "vitest";
import { addMediaClip } from "./timeline.ts";
import type { AssetRegistry, TimelineConfig } from "../../../../src/tools/video-editor/types/index.ts";

function makeConfig(tracks: { id: string; label: string; kind: string }[] = []): TimelineConfig {
  return { clips: [], tracks } as unknown as TimelineConfig;
}

function makeRegistry(assets: Record<string, { duration?: number }> = {}): AssetRegistry {
  return { assets } as unknown as AssetRegistry;
}

describe("addMediaClip", () => {
  it("adds an image clip with hold duration and opacity", () => {
    const config = makeConfig([{ id: "V1", label: "V1", kind: "visual" }]);
    const registry = makeRegistry();
    const result = addMediaClip(config, registry, {
      track: "V1",
      at: 5.5,
      assetKey: "asset-abc",
      mediaType: "image",
    });

    expect(result.config).toBeDefined();
    expect(result.result).toContain("Added media clip");
    const clip = result.config!.clips[0];
    expect(clip.track).toBe("V1");
    expect(clip.at).toBe(5.5);
    expect(clip.asset).toBe("asset-abc");
    expect((clip as Record<string, unknown>).clipType).toBe("hold");
    expect((clip as Record<string, unknown>).hold).toBe(5);
    expect((clip as Record<string, unknown>).opacity).toBe(1);
  });

  it("adds a video clip with from/to/speed/volume/opacity", () => {
    const config = makeConfig([{ id: "V1", label: "V1", kind: "visual" }]);
    const registry = makeRegistry({ "asset-vid": { duration: 10 } });
    const result = addMediaClip(config, registry, {
      track: "V1",
      at: 0,
      assetKey: "asset-vid",
      mediaType: "video",
    });

    expect(result.config).toBeDefined();
    const clip = result.config!.clips[0] as Record<string, unknown>;
    expect(clip.clipType).toBe("media");
    expect(clip.from).toBe(0);
    expect(clip.to).toBe(10);
    expect(clip.speed).toBe(1);
    expect(clip.volume).toBe(1);
    expect(clip.opacity).toBe(1);
  });

  it("defaults video duration to 5s when asset has no duration", () => {
    const config = makeConfig([{ id: "V1", label: "V1", kind: "visual" }]);
    const registry = makeRegistry();
    const result = addMediaClip(config, registry, {
      track: "V1",
      at: 0,
      assetKey: "asset-unknown",
      mediaType: "video",
    });

    expect(result.config).toBeDefined();
    expect((result.config!.clips[0] as Record<string, unknown>).to).toBe(5);
  });

  it("rejects unknown track", () => {
    const config = makeConfig([{ id: "V1", label: "V1", kind: "visual" }]);
    const registry = makeRegistry();
    const result = addMediaClip(config, registry, {
      track: "V99",
      at: 0,
      assetKey: "asset-abc",
      mediaType: "image",
    });

    expect(result.config).toBeUndefined();
    expect(result.result).toContain("does not exist");
  });

  it("rejects missing required args", () => {
    const config = makeConfig();
    const registry = makeRegistry();
    const result = addMediaClip(config, registry, {});

    expect(result.config).toBeUndefined();
    expect(result.result).toContain("requires");
  });
});
