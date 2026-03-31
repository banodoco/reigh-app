import { describe, expect, it, vi } from 'vitest';
import {
  handleChildGeneration,
  createSingleItemVariant,
  findExistingGenerationAtPosition,
  createChildGenerationRecord,
} from './generation-child.ts';

function createQueryBuilder(result: {
  maybeSingle?: { data?: unknown; error?: { code?: string; message?: string } | null };
}) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result.maybeSingle ?? { data: null, error: null }),
  };
}

describe('complete_task/generation-child exports', () => {
  it('exports child generation handlers', () => {
    expect(handleChildGeneration).toBeTypeOf('function');
    expect(createSingleItemVariant).toBeTypeOf('function');
    expect(findExistingGenerationAtPosition).toBeTypeOf('function');
    expect(createChildGenerationRecord).toBeTypeOf('function');
  });
});

describe('complete_task/generation-child findExistingGenerationAtPosition', () => {
  it('returns the latest pair-shot match by created_at desc', async () => {
    const generationsQuery = createQueryBuilder({
      maybeSingle: { data: { id: 'gen-pair-match' }, error: null },
    });
    const supabase = {
      from: vi.fn().mockReturnValue(generationsQuery),
    } as unknown as Parameters<typeof findExistingGenerationAtPosition>[0];

    const result = await findExistingGenerationAtPosition(
      supabase,
      'parent-1',
      3,
      'pair-shot-1',
    );

    expect(generationsQuery.eq).toHaveBeenCalledWith('pair_shot_generation_id', 'pair-shot-1');
    expect(generationsQuery.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(generationsQuery.limit).toHaveBeenCalledWith(1);
    expect(result).toBe('gen-pair-match');
  });

  it('returns null when the pair-shot lookup finds no row', async () => {
    const generationsQuery = createQueryBuilder({
      maybeSingle: { data: null, error: null },
    });
    const supabase = {
      from: vi.fn().mockReturnValue(generationsQuery),
    } as unknown as Parameters<typeof findExistingGenerationAtPosition>[0];

    const result = await findExistingGenerationAtPosition(
      supabase,
      'parent-1',
      3,
      'pair-shot-missing',
    );

    expect(generationsQuery.eq).toHaveBeenCalledWith('pair_shot_generation_id', 'pair-shot-missing');
    expect(generationsQuery.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(generationsQuery.limit).toHaveBeenCalledWith(1);
    expect(result).toBeNull();
  });
});
