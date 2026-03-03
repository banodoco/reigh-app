import { describe, expect, it, vi } from 'vitest';
import { fetchDerivedItemsFromRepository } from './derivedItemsRepository';
import { getSupabaseClient } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: vi.fn(),
}));

describe('fetchDerivedItemsFromRepository', () => {
  it('returns an empty array when source generation id is missing', async () => {
    const items = await fetchDerivedItemsFromRepository(null);

    expect(items).toEqual([]);
    expect(vi.mocked(getSupabaseClient)).not.toHaveBeenCalled();
  });
});
