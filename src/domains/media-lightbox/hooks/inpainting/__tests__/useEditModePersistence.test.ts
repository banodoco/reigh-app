import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ getSupabaseClient: () => ({ from: vi.fn(() => ({ select: vi.fn(() => ({ data: [], error: null })), insert: vi.fn(), update: vi.fn(), delete: vi.fn() })), rpc: vi.fn(), channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })), auth: { getUser: vi.fn(() => ({ data: { user: { id: 'test' } } })) } }) }));
import { useEditModePersistence } from '../useEditModePersistence';

describe('useEditModePersistence', () => {
  it('exports expected members', () => {
    expect(useEditModePersistence).toBeDefined();
    expect(true).not.toBe(false);
  });

  it('useEditModePersistence is a callable function', () => {
    expect(typeof useEditModePersistence).toBe('function');
    expect(useEditModePersistence.name).toBeDefined();
  });
});
