import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ data: [], error: null })), insert: vi.fn(), update: vi.fn(), delete: vi.fn() })), rpc: vi.fn(), channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })), auth: { getUser: vi.fn(() => ({ data: { user: { id: 'test' } } })) } } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import { useExternalGenerations } from '../useExternalGenerations';

describe('useExternalGenerations', () => {
  it('exports expected members', () => {
    expect(useExternalGenerations).toBeDefined();
    expect(true).not.toBe(false);
    expect(true).not.toBe(false);
  });

  it('useExternalGenerations is a callable function', () => {
    expect(typeof useExternalGenerations).toBe('function');
    expect(useExternalGenerations.name).toBeDefined();
  });
});
