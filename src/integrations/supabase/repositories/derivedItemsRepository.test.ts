import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDerivedItemsFromRepository } from './derivedItemsRepository';

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
  normalizeAndLogError: vi.fn(),
  calculateDerivedCountsSafe: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: (...args: unknown[]) => mocks.getSupabaseClient(...args),
}));

vi.mock('@/shared/lib/errorHandling/runtimeErrorReporting', () => ({
  normalizeAndLogError: (...args: unknown[]) => mocks.normalizeAndLogError(...args),
}));

vi.mock('@/shared/lib/generationTransformers', () => ({
  calculateDerivedCountsSafe: (...args: unknown[]) => mocks.calculateDerivedCountsSafe(...args),
}));

function buildQueryChain<T>(data: T, error: unknown = null) {
  const chain = {
    data,
    error,
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
  };
  return chain;
}

describe('fetchDerivedItemsFromRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calculateDerivedCountsSafe.mockResolvedValue({ derivedCounts: {} });
  });

  it('returns empty output when no source generation id is provided', async () => {
    const result = await fetchDerivedItemsFromRepository(null);

    expect(result).toEqual([]);
    expect(mocks.getSupabaseClient).not.toHaveBeenCalled();
  });

  it('maps generations/variants, logs query errors, and sorts by starred then recency', async () => {
    const generationError = new Error('generation query failed');
    const variantError = new Error('variant query failed');
    const generationsQuery = buildQueryChain(
      [
        {
          id: 'gen-older',
          location: 'https://assets/g-older.png',
          thumbnail_url: null,
          created_at: '2026-03-07T10:00:00.000Z',
          params: { prompt: 'direct prompt' },
          starred: false,
          based_on: 'source-1',
          shot_data: { shot_a: [0, 100] },
        },
        {
          id: 'gen-starred',
          location: 'https://assets/g-starred.png',
          thumbnail_url: 'https://thumbs/g-starred.png',
          created_at: '2026-03-05T10:00:00.000Z',
          params: {
            originalParams: {
              orchestrator_details: { prompt: 'nested prompt' },
            },
          },
          starred: true,
          based_on: 'source-1',
          shot_data: { shot_b: [50] },
        },
      ],
      generationError,
    );
    const variantsQuery = buildQueryChain(
      [
        {
          id: 'var-newest',
          location: 'https://assets/v-new.png',
          thumbnail_url: null,
          created_at: '2026-03-08T10:00:00.000Z',
          variant_type: 'flux_image_edit',
          name: 'Variant A',
          params: {
            originalParams: {
              orchestrator_details: { prompt: 'variant nested prompt' },
            },
          },
          viewed_at: '2026-03-08T10:15:00.000Z',
          is_primary: false,
        },
      ],
      variantError,
    );

    const from = vi.fn((table: string) => {
      if (table === 'generations') {
        return generationsQuery;
      }
      if (table === 'generation_variants') {
        return variantsQuery;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    mocks.getSupabaseClient.mockReturnValue({ from });
    mocks.calculateDerivedCountsSafe.mockResolvedValue({
      derivedCounts: {
        'gen-older': 2,
        'gen-starred': 9,
      },
    });

    const result = await fetchDerivedItemsFromRepository('source-1');

    expect(mocks.normalizeAndLogError).toHaveBeenCalledWith(generationError, {
      context: 'generation.derivedItems.repository.generations',
    });
    expect(mocks.normalizeAndLogError).toHaveBeenCalledWith(variantError, {
      context: 'generation.derivedItems.repository.variants',
    });
    expect(mocks.calculateDerivedCountsSafe).toHaveBeenCalledWith(['gen-older', 'gen-starred']);

    expect(result.map((item) => item.id)).toEqual(['gen-starred', 'var-newest', 'gen-older']);

    expect(result[0]).toEqual(expect.objectContaining({
      id: 'gen-starred',
      thumbUrl: 'https://thumbs/g-starred.png',
      prompt: 'nested prompt',
      itemType: 'generation',
      derivedCount: 9,
      shot_id: 'shot_b',
      timeline_frame: 50,
      all_shot_associations: undefined,
    }));
    expect(result[1]).toEqual(expect.objectContaining({
      id: 'var-newest',
      itemType: 'variant',
      variantType: 'flux_image_edit',
      variantName: 'Variant A',
      viewedAt: '2026-03-08T10:15:00.000Z',
      prompt: 'variant nested prompt',
      starred: false,
    }));
    expect(result[2]).toEqual(expect.objectContaining({
      id: 'gen-older',
      thumbUrl: 'https://assets/g-older.png',
      prompt: 'direct prompt',
      itemType: 'generation',
      derivedCount: 2,
      shot_id: 'shot_a',
      timeline_frame: 0,
      all_shot_associations: [
        { shot_id: 'shot_a', timeline_frame: 0, position: 0 },
        { shot_id: 'shot_a', timeline_frame: 100, position: 2 },
      ],
    }));
  });
});
