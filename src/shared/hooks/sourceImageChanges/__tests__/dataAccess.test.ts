import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  normalizeAndPresentError: vi.fn(),
  from: vi.fn(),
  responses: {
    shotStart: { data: [], error: null as unknown },
    shotAll: { data: [], error: null as unknown },
    generations: { data: [], error: null as unknown },
    variants: { data: [], error: null as unknown },
  },
}));

function createChain(table: string) {
  const state = { selected: '' };
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.select = vi.fn((selection: string) => {
    state.selected = selection;
    return chain;
  });

  chain.in = vi.fn(() => {
    if (table === 'generations') {
      return Promise.resolve(mocks.responses.generations);
    }
    if (table === 'generation_variants') {
      return Promise.resolve(mocks.responses.variants);
    }
    return chain;
  });

  chain.eq = vi.fn(() => chain);

  chain.not = vi.fn(() => {
    if (table === 'shot_generations' && state.selected.includes('shot_id')) {
      return Promise.resolve(mocks.responses.shotStart);
    }
    return chain;
  });

  chain.order = vi.fn(() => {
    if (table === 'shot_generations') {
      return Promise.resolve(mocks.responses.shotAll);
    }
    return Promise.resolve({ data: [], error: null });
  });

  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    from: mocks.from,
  }),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: mocks.normalizeAndPresentError,
}));

import { fetchSourceSlotData } from '../dataAccess';

describe('fetchSourceSlotData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.responses.shotStart = { data: [], error: null };
    mocks.responses.shotAll = { data: [], error: null };
    mocks.responses.generations = { data: [], error: null };
    mocks.responses.variants = { data: [], error: null };
    mocks.from.mockImplementation((table: string) => createChain(table));
  });

  it('returns null without querying when no start generation ids are provided', async () => {
    const result = await fetchSourceSlotData([]);

    expect(result).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('returns null and reports start-slot query failures', async () => {
    const error = new Error('start slots failed');
    mocks.responses.shotStart = { data: null, error };

    const result = await fetchSourceSlotData(['gen-1']);

    expect(result).toBeNull();
    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        context: 'useSourceImageChanges:startSlots',
        showToast: false,
      }),
    );
  });

  it('builds generation and slot maps from successful queries', async () => {
    mocks.responses.shotStart = {
      data: [
        { shot_id: 'shot-1', generation_id: 'gen-1', updated_at: '2026-01-01T10:00:00.000Z' },
      ],
      error: null,
    };
    mocks.responses.shotAll = {
      data: [
        { generation_id: 'gen-1', timeline_frame: 0, updated_at: '2026-01-01T10:00:00.000Z' },
        { generation_id: 'gen-2', timeline_frame: 1, updated_at: '2026-01-01T11:00:00.000Z' },
      ],
      error: null,
    };
    mocks.responses.generations = {
      data: [
        { id: 'gen-1', primary_variant_id: 'variant-1', updated_at: '2026-01-01T10:00:00.000Z' },
        { id: 'gen-2', primary_variant_id: null, updated_at: '2026-01-01T11:00:00.000Z' },
      ],
      error: null,
    };
    mocks.responses.variants = {
      data: [{ id: 'variant-1', location: 'https://cdn.example.com/variant-1.png' }],
      error: null,
    };

    const result = await fetchSourceSlotData(['gen-1']);

    expect(result).not.toBeNull();
    expect(result?.startGenToNext['gen-1']).toEqual({
      nextGenId: 'gen-2',
      nextSlotUpdatedAt: new Date('2026-01-01T11:00:00.000Z'),
    });
    expect(result?.lookupError).toBeNull();
    expect(result?.genToVariant['gen-1']).toEqual({
      location: 'https://cdn.example.com/variant-1.png',
      updated_at: new Date('2026-01-01T10:00:00.000Z'),
    });
    expect(result?.genToVariant['gen-2']).toEqual({
      location: null,
      updated_at: new Date('2026-01-01T11:00:00.000Z'),
    });
  });

  it('reports variant lookup errors and falls back to null locations', async () => {
    const variantError = new Error('variant lookup failed');
    mocks.responses.shotStart = {
      data: [{ shot_id: 'shot-2', generation_id: 'gen-3', updated_at: '2026-01-01T10:00:00.000Z' }],
      error: null,
    };
    mocks.responses.shotAll = {
      data: [{ generation_id: 'gen-3', timeline_frame: 0, updated_at: '2026-01-01T10:00:00.000Z' }],
      error: null,
    };
    mocks.responses.generations = {
      data: [{ id: 'gen-3', primary_variant_id: 'variant-3', updated_at: '2026-01-01T10:00:00.000Z' }],
      error: null,
    };
    mocks.responses.variants = { data: null, error: variantError };

    const result = await fetchSourceSlotData(['gen-3']);

    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      variantError,
      expect.objectContaining({
        context: 'useSourceImageChanges:variantLookup',
        showToast: false,
      }),
    );
    expect(result?.lookupError).toEqual({
      kind: 'variant_lookup_failed',
      message: 'variant lookup failed',
    });
    expect(result?.genToVariant['gen-3'].location).toBeNull();
  });
});
