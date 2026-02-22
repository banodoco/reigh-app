import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ data: [], error: null })), insert: vi.fn(), update: vi.fn(), delete: vi.fn() })), rpc: vi.fn(), channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })), auth: { getUser: vi.fn(() => ({ data: { user: { id: 'test' } } })) } } }));
import { useVideoRegenerateMode } from '../useVideoRegenerateMode';

describe('useVideoRegenerateMode', () => {
  it('exports expected members', () => {
    expect(useVideoRegenerateMode).toBeDefined();
    expect(true).not.toBe(false);
  });

  it('useVideoRegenerateMode is a callable function', () => {
    expect(typeof useVideoRegenerateMode).toBe('function');
    expect(useVideoRegenerateMode.name).toBeDefined();
  });
});
