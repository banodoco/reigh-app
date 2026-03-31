import { describe, expect, it, vi } from 'vitest';
import {
  ExistingGenerationLookupError,
  findExistingGeneration,
  findSourceGenerationByImageUrl,
  insertGeneration,
  createVariant,
  linkGenerationToShot,
  derivePredecessorVariantId,
} from './generation-core.ts';

function createQueryBuilder(result: {
  list?: { data?: unknown; error?: { code?: string; message?: string } | null };
  single?: { data?: unknown; error?: { code?: string; message?: string } | null };
  maybeSingle?: { data?: unknown; error?: { code?: string; message?: string } | null };
}) {
  return {
    data: result.list?.data ?? [],
    error: result.list?.error ?? null,
    select: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result.single ?? { data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue(result.maybeSingle ?? { data: null, error: null }),
  };
}

describe('complete_task/generation-core', () => {
  it('finds existing generation by task id with JSON-array contains filter', async () => {
    const generationsQuery = createQueryBuilder({
      list: { data: [{ id: 'gen-1' }], error: null },
    });
    const supabase = {
      from: vi.fn().mockReturnValue(generationsQuery),
    } as unknown as Parameters<typeof findExistingGeneration>[0];

    const result = await findExistingGeneration(supabase, 'task-1');

    expect(supabase.from).toHaveBeenCalledWith('generations');
    expect(generationsQuery.contains).toHaveBeenCalledWith('tasks', JSON.stringify(['task-1']));
    expect(generationsQuery.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(generationsQuery.limit).toHaveBeenCalledWith(2);
    expect(result).toEqual({ id: 'gen-1' });
  });

  it('throws typed error for lookup failures instead of returning null', async () => {
    const generationsQuery = createQueryBuilder({
      list: { data: null, error: { code: '500', message: 'db exploded' } },
    });
    const supabase = {
      from: vi.fn().mockReturnValue(generationsQuery),
    } as unknown as Parameters<typeof findExistingGeneration>[0];

    await expect(findExistingGeneration(supabase, 'task-1')).rejects.toMatchObject({
      name: 'ExistingGenerationLookupError',
      code: 'existing_generation_lookup_failed',
    });
  });

  it('throws duplicate typed error when multiple existing generations match task id', async () => {
    const generationsQuery = createQueryBuilder({
      list: {
        data: [{ id: 'gen-a' }, { id: 'gen-b' }],
        error: null,
      },
    });
    const supabase = {
      from: vi.fn().mockReturnValue(generationsQuery),
    } as unknown as Parameters<typeof findExistingGeneration>[0];

    try {
      await findExistingGeneration(supabase, 'task-dup');
      expect.fail('Expected duplicate lookup to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ExistingGenerationLookupError);
      expect((error as ExistingGenerationLookupError).code).toBe('existing_generation_lookup_duplicate');
      expect((error as ExistingGenerationLookupError).details).toMatchObject({
        taskId: 'task-dup',
        generationIds: ['gen-a', 'gen-b'],
      });
    }
  });

  it('returns null when no existing generation is found', async () => {
    const generationsQuery = createQueryBuilder({
      list: { data: [], error: null },
    });
    const supabase = {
      from: vi.fn().mockReturnValue(generationsQuery),
    } as unknown as Parameters<typeof findExistingGeneration>[0];

    const result = await findExistingGeneration(supabase, 'task-missing');
    expect(result).toBeNull();
  });

  it('resolves latest source generation id by image url', async () => {
    const generationsQuery = createQueryBuilder({
      maybeSingle: { data: { id: 'source-2' }, error: null },
    });
    const supabase = {
      from: vi.fn().mockReturnValue(generationsQuery),
    } as unknown as Parameters<typeof findSourceGenerationByImageUrl>[0];

    const result = await findSourceGenerationByImageUrl(supabase, 'https://x.test/image.png');

    expect(generationsQuery.eq).toHaveBeenCalledWith('location', 'https://x.test/image.png');
    expect(generationsQuery.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(generationsQuery.limit).toHaveBeenCalledWith(1);
    expect(result).toBe('source-2');
  });

  it('creates variants with optional viewed_at only when supplied', async () => {
    const variantsQuery = createQueryBuilder({
      single: { data: { id: 'variant-1' }, error: null },
    });
    const supabase = {
      from: vi.fn().mockReturnValue(variantsQuery),
    } as unknown as Parameters<typeof createVariant>[0];

    await createVariant(
      supabase,
      'gen-1',
      'https://x.test/video.mp4',
      null,
      { debug: true },
      true,
      'video',
      'main',
      '2026-01-01T00:00:00.000Z',
    );

    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabase.from).toHaveBeenCalledWith('generation_variants');
    expect(variantsQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        generation_id: 'gen-1',
        location: 'https://x.test/video.mp4',
        viewed_at: '2026-01-01T00:00:00.000Z',
      }),
    );
  });

  it('throws on generation insert errors', async () => {
    const generationsQuery = createQueryBuilder({
      single: { data: null, error: { message: 'insert failed' } },
    });
    const supabase = {
      from: vi.fn().mockReturnValue(generationsQuery),
    } as unknown as Parameters<typeof insertGeneration>[0];

    await expect(insertGeneration(supabase, { task: 't1' })).rejects.toThrow(
      'Failed to insert generation: insert failed',
    );
  });

  it('calls shot-link rpc with positional policy', async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ error: null }),
    } as unknown as Parameters<typeof linkGenerationToShot>[0];

    await linkGenerationToShot(supabase, 'shot-1', 'gen-1', true);

    expect(supabase.rpc).toHaveBeenCalledWith('add_generation_to_shot', {
      p_shot_id: 'shot-1',
      p_generation_id: 'gen-1',
      p_with_position: true,
    });
  });

  it('derives the predecessor primary variant for overlapping child segments', async () => {
    const generationsQuery = createQueryBuilder({
      maybeSingle: {
        data: { primary_variant_id: 'variant-prev' },
        error: null,
      },
    });
    const supabase = {
      from: vi.fn().mockReturnValue(generationsQuery),
    } as unknown as Parameters<typeof derivePredecessorVariantId>[0];

    await expect(derivePredecessorVariantId(
      supabase,
      {
        continuation_config: { overlap_frames: 24 },
      },
      'parent-1',
      2,
    )).resolves.toBe('variant-prev');
  });

  it('skips predecessor lookup when no overlap is configured', async () => {
    const supabase = {
      from: vi.fn(),
    } as unknown as Parameters<typeof derivePredecessorVariantId>[0];

    await expect(derivePredecessorVariantId(
      supabase,
      {
        continuation_config: { overlap_frames: 0 },
      },
      'parent-1',
      2,
    )).resolves.toBeNull();

    expect(supabase.from).not.toHaveBeenCalled();
  });
});
