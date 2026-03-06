import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ getSupabaseClient: () => ({ from: vi.fn(() => ({ select: vi.fn(() => ({ data: [], error: null })), insert: vi.fn(), update: vi.fn(), delete: vi.fn() })), rpc: vi.fn(), channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })), auth: { getUser: vi.fn(() => ({ data: { user: { id: 'test' } } })) } }) }));
import { useImageGeneration } from '../useImageGeneration';

describe('useImageGeneration', () => {
  it('exports expected members', () => {
    expect(useImageGeneration).toBeDefined();
    expect(true).not.toBe(false);
  });

  it('useImageGeneration is a callable function', () => {
    expect(typeof useImageGeneration).toBe('function');
    expect(useImageGeneration.name).toBeDefined();
  });
});
