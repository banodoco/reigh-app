import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveGenerationAsset } from '@/tools/video-editor/data/generationAssetResolver';
import { createFakeBridgeRouter, type FakeBridgeRouter } from '@/test/fakeBridgeRouter.ts';
import { createJourneyState, FIXTURE_PROJECT } from '@/test/bridgeFixtures.mjs';

const FAKE_ORIGIN = 'http://bridge.fake';

describe('resolveGenerationAsset (neutral generation detail read → Runtime CAS object route)', () => {
  let router: FakeBridgeRouter;

  beforeEach(() => {
    router = createFakeBridgeRouter();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      // The client defaults to the same-origin base ('/api/astrid'); resolve
      // relative paths against the fake origin before handing to the router.
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(raw, FAKE_ORIGIN);
      return await router.handle(new Request(url.href, init));
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resolves the primary variant to a same-origin Runtime CAS object address', async () => {
    const detail = createJourneyState().galleryDetails[0];

    const result = await resolveGenerationAsset({
      generationId: detail.generation_id,
      projectSlug: FIXTURE_PROJECT.slug,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.asset.url).toMatch(/^\/api\/astrid\/v1\/objects\/sha256%3A[a-f0-9]{64}$/);
    expect(result.asset.thumbnailUrl).toBe(result.asset.url);
    expect(result.asset.entry.url).toBe(result.asset.url);
    expect(result.asset.entry.generationId).toBe(detail.generation_id);
    // Runtime CAS addresses are immutable by construction — no signed-URL expiry.
    expect(result.asset.entry.url_expires_at).toBeUndefined();
  });

  it('uses the Runtime variant thumbnail descriptor when it matches the source object', async () => {
    const detail = createJourneyState().galleryDetails[0];
    const sourceId = `sha256:${'a'.repeat(64)}`;
    const thumbnailId = `sha256:${'e'.repeat(64)}`;
    router.state.galleryDetails[0] = {
      ...detail,
      variants: [{
        ...detail.variants[0]!,
        thumbnail: {
          object_id: thumbnailId,
          source_object_id: sourceId,
          recipe_version: 1,
        },
      }, ...detail.variants.slice(1)],
    };

    const result = await resolveGenerationAsset({
      generationId: detail.generation_id,
      projectSlug: FIXTURE_PROJECT.slug,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.asset.thumbnailUrl).toBe(`/api/astrid/v1/objects/${encodeURIComponent(thumbnailId)}`);
    expect(result.asset.url).not.toBe(result.asset.thumbnailUrl);
  });

  it('does not use a video source URL as its image thumbnail', async () => {
    const detail = createJourneyState().galleryDetails[1];
    router.state.galleryDetails[1] = { ...detail, type: 'video' };

    const result = await resolveGenerationAsset({
      generationId: detail.generation_id,
      entry: { type: 'video/mp4', url: '/source.mp4', thumbnailUrl: '/source.mp4' },
      projectSlug: FIXTURE_PROJECT.slug,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.asset.mediaType).toBe('video');
    expect(result.asset.thumbnailUrl).toBeUndefined();
    expect(result.asset.entry.thumbnailUrl).toBeUndefined();
  });

  it('reports a missing-asset failure for an unknown generation (404)', async () => {
    const result = await resolveGenerationAsset({
      generationId: '01j8zcex4q7m4sjdy6g6missinggenaa',
      projectSlug: FIXTURE_PROJECT.slug,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missingReason).toBe('missing_asset');
    expect(result.diagnostic.code).toBe('generation-not-found');
  });

  it('reports a failure when the generation carries no variant media', async () => {
    const empty = {
      ...router.state.galleryDetails[0],
      generation_id: '01j8zcex4q7m4sjdy6g6nomediagen',
      variants: [],
    };
    router.state.galleryDetails.push(empty);

    const result = await resolveGenerationAsset({
      generationId: empty.generation_id,
      projectSlug: FIXTURE_PROJECT.slug,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe('missing-generation-media');
  });
});
