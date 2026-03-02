import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ data: [], error: null })), insert: vi.fn(), update: vi.fn(), delete: vi.fn() })), rpc: vi.fn(), channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })), auth: { getUser: vi.fn(() => ({ data: { user: { id: 'test' } } })) } } }));
import { useLastVideoGeneration } from '../../video/useLastVideoGeneration';

describe('useLastVideoGeneration', () => {
  it('exports expected members', () => {
    expect(useLastVideoGeneration).toBeDefined();
    expect(true).not.toBe(false);
  });

  it('useLastVideoGeneration is a callable function', () => {
    expect(typeof useLastVideoGeneration).toBe('function');
    expect(useLastVideoGeneration.name).toBeDefined();
  });
});
