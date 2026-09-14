import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import {
  fetchGenerations,
  fetchRuntimeGenerationsForProject,
  matchesClientSideFilters,
  useProjectGenerations,
} from '../useProjectGenerations';
import type { GeneratedImageWithMetadata } from '@/shared/components/MediaGallery/types';
import { createFakeBridgeRouter, type FakeBridgeRouter } from '@/test/fakeBridgeRouter.ts';
import { createJourneyState, FIXTURE_PROJECT } from '@/test/bridgeFixtures.mjs';
import {
  markAstridCapabilityUnavailable,
  resetAstridCapabilityCensusForTesting,
} from '@/integrations/astrid/capabilityCensus.ts';

const FAKE_ORIGIN = 'http://bridge.fake';
const SLUG = FIXTURE_PROJECT.slug;

describe('useProjectGenerations (bridge gallery reads R12)', () => {
  let router: FakeBridgeRouter;

  beforeEach(() => {
    resetAstridCapabilityCensusForTesting();
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

  function createWrapper() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  it('keeps image, audio, and video media types distinct in bridge-side filters', () => {
    const image = { id: 'image', url: '/image.png', type: 'image', isVideo: false } as GeneratedImageWithMetadata;
    const audio = { id: 'audio', url: '/audio.aac', type: 'audio', isVideo: false } as GeneratedImageWithMetadata;
    const video = { id: 'video', url: '/video.mp4', type: 'video', isVideo: true } as GeneratedImageWithMetadata;

    expect(matchesClientSideFilters(image, { mediaType: 'image' })).toBe(true);
    expect(matchesClientSideFilters(audio, { mediaType: 'image' })).toBe(false);
    expect(matchesClientSideFilters(video, { mediaType: 'image' })).toBe(false);

    expect(matchesClientSideFilters(image, { mediaType: 'video' })).toBe(false);
    expect(matchesClientSideFilters(audio, { mediaType: 'video' })).toBe(false);
    expect(matchesClientSideFilters(video, { mediaType: 'video' })).toBe(true);

    expect(matchesClientSideFilters(audio, { mediaType: 'all' })).toBe(true);
  });

  it('filters Runtime summaries by the mapped tool discriminator', () => {
    const character = {
      id: 'character',
      url: '/character.mp4',
      type: 'video',
      isVideo: true,
      metadata: { tool_type: 'character-animate' },
    } as GeneratedImageWithMetadata;
    const imageGeneration = {
      ...character,
      id: 'image-generation',
      metadata: { tool_type: 'image-gen' },
    } as GeneratedImageWithMetadata;

    expect(matchesClientSideFilters(character, { toolType: 'character-animate' })).toBe(true);
    expect(matchesClientSideFilters(imageGeneration, { toolType: 'character-animate' })).toBe(false);
    expect(matchesClientSideFilters(
      { ...character, metadata: { tool_type: 'character-animate-reconstructed-client' } },
      { toolType: 'character-animate' },
    )).toBe(true);
  });

  it('maps canonical Runtime generation/variant pages into the existing gallery shape', async () => {
    const listGenerations = vi.fn()
      .mockResolvedValue({
        items: [{
          generation_id: 'runtime-generation-1',
          project_id: 'runtime-project',
          source_task_id: 'runtime-task-1',
          type: 'image',
          status: 'created',
          metadata: { tool_type: 'image-gen', content_type: 'image' },
          version: 3,
          created_at: '2026-09-11T00:00:00Z',
          updated_at: '2026-09-11T00:01:00Z',
        }],
        next_cursor: 'runtime-generations-next',
      });
    const listVariants = vi.fn().mockResolvedValue({
      items: [{
        variant_id: 'runtime-variant-1',
        generation_id: 'runtime-generation-1',
        object_id: `sha256:${'f'.repeat(64)}`,
        variant_type: 'original',
        metadata: { is_primary: true },
        created_at: '2026-09-11T00:00:30Z',
      }],
      next_cursor: null,
    });
    const client = {
      listGenerations,
      listVariants,
      objectContentUrl: (objectId: string) => `/api/runtime/v1/objects/${encodeURIComponent(objectId)}`,
    };

    const result = await fetchRuntimeGenerationsForProject(client, 'runtime-project', 1, 0, { mediaType: 'image' });

    expect(listGenerations).toHaveBeenCalledWith('runtime-project', undefined, 50);
    expect(listVariants).toHaveBeenCalledWith('runtime-generation-1', undefined, 50);
    expect(result).toMatchObject({ total: 2, hasMore: true });
    expect(result.items[0]).toMatchObject({
      id: 'runtime-generation-1',
      generation_id: 'runtime-generation-1',
      primary_variant_id: 'runtime-variant-1',
      url: `/api/runtime/v1/objects/sha256%3A${'f'.repeat(64)}`,
      metadata: expect.objectContaining({ tool_type: 'image-gen' }),
    });
  });

  it('uses the primary variant MIME for neutral typed Runtime gallery rows', async () => {
    const listGenerations = vi.fn().mockResolvedValue({
      items: [{
        generation_id: 'generation-typed-image',
        project_id: 'runtime-project',
        source_task_id: 'runtime-task-typed-image',
        type: 'generation.generate_image',
        status: 'completed',
        metadata: {},
        version: 1,
        created_at: '2026-09-11T00:00:00Z',
        updated_at: '2026-09-11T00:01:00Z',
      }],
      next_cursor: null,
    });
    const listVariants = vi.fn().mockResolvedValue({
      items: [
        {
          variant_id: 'variant-typed-original',
          generation_id: 'generation-typed-image',
          object_id: 'sha256:typed-original',
          variant_type: 'original',
          metadata: { media_type: 'image', group_key: 'main', ordinal: 0 },
          created_at: '2026-09-11T00:00:30Z',
        },
        {
          variant_id: 'variant-typed-alternate',
          generation_id: 'generation-typed-image',
          object_id: 'sha256:typed-alternate',
          variant_type: 'alternate',
          metadata: { media_type: 'image', group_key: 'main', ordinal: 1 },
          created_at: '2026-09-11T00:00:31Z',
        },
      ],
      next_cursor: null,
    });
    const client = {
      listGenerations,
      listVariants,
      objectContentUrl: (objectId: string) => `/api/runtime/v1/objects/${encodeURIComponent(objectId)}`,
    };

    const result = await fetchRuntimeGenerationsForProject(
      client,
      'runtime-project',
      50,
      0,
      { mediaType: 'image' },
    );

    expect(listGenerations).toHaveBeenCalledWith('runtime-project', undefined, 50);
    expect(listVariants).toHaveBeenCalledWith('generation-typed-image', undefined, 50);
    expect(result).toMatchObject({ total: 1, hasMore: false });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'generation-typed-image',
      generation_id: 'generation-typed-image',
      primary_variant_id: 'variant-typed-original',
      type: 'generation.generate_image',
      contentType: 'image/png',
      local_file_mime: 'image/png',
      url: '/api/runtime/v1/objects/sha256%3Atyped-original',
    });
  });

  it('fetchGenerations maps generation rows into gallery items with Runtime CAS display URLs', async () => {
    const result = await fetchGenerations(SLUG, 100, 0);

    const details = createJourneyState().galleryDetails;
    expect(result.items).toHaveLength(details.length);
    expect(result.hasMore).toBe(false);
    expect(result.total).toBe(details.length);

    for (const item of result.items) {
      // Every display address is a same-origin Runtime CAS object route.
      expect(item.url).toMatch(/^\/api\/astrid\/v1\/objects\/sha256%3A[a-f0-9]{64}$/);
      expect(item.thumbUrl).toBe(item.url);
    }
    // Recency-first wire order is preserved.
    expect(result.items[0].createdAt >= result.items[result.items.length - 1].createdAt).toBe(true);
  });

  it('applies the starred filter over neutral Runtime generation rows', async () => {
    const result = await fetchGenerations(SLUG, 100, 0, { starredOnly: true });

    const firstCall = vi.mocked(globalThis.fetch).mock.calls[0] as [string];
    expect(String(firstCall[0])).toContain('/v1/projects/demo-project/generations');
    expect(String(firstCall[0])).not.toContain('starred=true');
    expect(result.items.every((item) => item.starred === true)).toBe(true);
  });

  it('marks hasMore and keeps the window bounded while pages remain', async () => {
    // The fake serves one page with next_cursor: null, so nothing follows.
    const result = await fetchGenerations(SLUG, 1, 0);
    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });

  it('useProjectGenerations surfaces bridge rows through react-query', async () => {
    const { result } = renderHook(
      () => useProjectGenerations(SLUG, 1, 100, true),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items.length).toBeGreaterThan(0);
    expect(result.current.data?.items[0].url).toMatch(/\/v1\/objects\/sha256%3A/);
  });

  it('makes zero gallery requests after the boot census marks the route unavailable', async () => {
    markAstridCapabilityUnavailable('generations', 'unknown route: generations');
    vi.mocked(globalThis.fetch).mockClear();

    const { result } = renderHook(
      () => useProjectGenerations(SLUG, 1, 100, true),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns an empty page when no project id is given', async () => {
    const result = await fetchGenerations(null, 100, 0);
    expect(result).toEqual({ items: [], total: 0, hasMore: false });
  });
});
