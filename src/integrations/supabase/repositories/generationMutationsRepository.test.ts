import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGenerationPrimaryVariant,
  createGenerationRecord,
  deleteGenerationByScope,
  deleteGenerationVariantByScope,
  updateGenerationLocationByScope,
  updateGenerationStarByScope,
} from './generationMutationsRepository';

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: (...args: unknown[]) => mocks.getSupabaseClient(...args),
}));

describe('generationMutationsRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates generation location scoped by generation and project id', async () => {
    const select = vi.fn().mockResolvedValue({ data: [{ id: 'g1' }], error: null });
    const secondEq = vi.fn(() => ({ select }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const update = vi.fn(() => ({ eq: firstEq }));
    const from = vi.fn(() => ({ update }));
    mocks.getSupabaseClient.mockReturnValue({ from });

    await updateGenerationLocationByScope({
      id: 'g1',
      projectId: 'p1',
      location: 'https://cdn.example.com/new.png',
      thumbnailUrl: 'https://cdn.example.com/new-thumb.png',
    });

    expect(from).toHaveBeenCalledWith('generations');
    expect(update).toHaveBeenCalledWith({
      location: 'https://cdn.example.com/new.png',
      thumbnail_url: 'https://cdn.example.com/new-thumb.png',
    });
    expect(firstEq).toHaveBeenCalledWith('id', 'g1');
    expect(secondEq).toHaveBeenCalledWith('project_id', 'p1');
    expect(select).toHaveBeenCalledWith('id');
  });

  it('inserts generation and primary variant records with expected payload shape', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'g2' }, error: null });
    const select = vi.fn(() => ({ single }));
    const generationInsert = vi.fn(() => ({ select }));

    const variantInsert = vi.fn().mockResolvedValue({ data: [{ id: 'v1' }], error: null });

    const from = vi.fn((table: string) => {
      if (table === 'generations') return { insert: generationInsert };
      if (table === 'generation_variants') return { insert: variantInsert };
      throw new Error(`Unexpected table: ${table}`);
    });
    mocks.getSupabaseClient.mockReturnValue({ from });

    await createGenerationRecord({
      imageUrl: 'https://cdn.example.com/original.png',
      thumbnailUrl: 'https://cdn.example.com/thumb.png',
      fileType: 'image',
      projectId: 'p2',
      generationParams: { prompt: 'hello' },
    });

    await createGenerationPrimaryVariant({
      generationId: 'g2',
      imageUrl: 'https://cdn.example.com/original.png',
      thumbnailUrl: 'https://cdn.example.com/thumb.png',
      generationParams: { prompt: 'hello' },
      variantType: 'original',
    });

    expect(generationInsert).toHaveBeenCalledWith({
      location: 'https://cdn.example.com/original.png',
      thumbnail_url: 'https://cdn.example.com/thumb.png',
      type: 'image',
      project_id: 'p2',
      params: { prompt: 'hello' },
    });
    expect(select).toHaveBeenCalledTimes(1);
    expect(single).toHaveBeenCalledTimes(1);

    expect(variantInsert).toHaveBeenCalledWith({
      generation_id: 'g2',
      location: 'https://cdn.example.com/original.png',
      thumbnail_url: 'https://cdn.example.com/thumb.png',
      is_primary: true,
      variant_type: 'original',
      name: 'Original',
      params: { prompt: 'hello' },
    });
  });

  it('updates starred state and deletes scoped generation rows', async () => {
    const selectStar = vi.fn().mockResolvedValue({ data: [{ id: 'g3', starred: true }], error: null });
    const eqStarProject = vi.fn(() => ({ select: selectStar }));
    const eqStarId = vi.fn(() => ({ eq: eqStarProject }));
    const update = vi.fn(() => ({ eq: eqStarId }));

    const selectDeleteGeneration = vi.fn().mockResolvedValue({ data: [{ id: 'g3' }], error: null });
    const eqDeleteGenProject = vi.fn(() => ({ select: selectDeleteGeneration }));
    const eqDeleteGenId = vi.fn(() => ({ eq: eqDeleteGenProject }));
    const deleteGeneration = vi.fn(() => ({ eq: eqDeleteGenId }));

    const selectDeleteVariant = vi.fn().mockResolvedValue({ data: [{ id: 'v3' }], error: null });
    const eqDeleteVariantGeneration = vi.fn(() => ({ select: selectDeleteVariant }));
    const eqDeleteVariantId = vi.fn(() => ({ eq: eqDeleteVariantGeneration }));
    const deleteVariant = vi.fn(() => ({ eq: eqDeleteVariantId }));

    const from = vi.fn((table: string) => {
      if (table === 'generations') {
        return {
          update,
          delete: deleteGeneration,
        };
      }
      if (table === 'generation_variants') {
        return {
          delete: deleteVariant,
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    mocks.getSupabaseClient.mockReturnValue({ from });

    await updateGenerationStarByScope({ id: 'g3', projectId: 'p3', starred: true });
    await deleteGenerationByScope({ id: 'g3', projectId: 'p3' });
    await deleteGenerationVariantByScope({ id: 'v3', generationId: 'g3' });

    expect(update).toHaveBeenCalledWith({ starred: true });
    expect(eqStarId).toHaveBeenCalledWith('id', 'g3');
    expect(eqStarProject).toHaveBeenCalledWith('project_id', 'p3');
    expect(selectStar).toHaveBeenCalledWith('id, starred');

    expect(deleteGeneration).toHaveBeenCalledTimes(1);
    expect(eqDeleteGenId).toHaveBeenCalledWith('id', 'g3');
    expect(eqDeleteGenProject).toHaveBeenCalledWith('project_id', 'p3');
    expect(selectDeleteGeneration).toHaveBeenCalledWith('id');

    expect(deleteVariant).toHaveBeenCalledTimes(1);
    expect(eqDeleteVariantId).toHaveBeenCalledWith('id', 'v3');
    expect(eqDeleteVariantGeneration).toHaveBeenCalledWith('generation_id', 'g3');
    expect(selectDeleteVariant).toHaveBeenCalledWith('id');
  });
});
