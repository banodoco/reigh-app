import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ data: [], error: null })), insert: vi.fn(), update: vi.fn(), delete: vi.fn() })), rpc: vi.fn(), channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })), auth: { getUser: vi.fn(() => ({ data: { user: { id: 'test' } } })) } } }));
import { BUILTIN_DEFAULT_I2V_ID, BUILTIN_DEFAULT_VACE_ID, FEATURED_PRESET_IDS, MotionControl } from '../MotionControl';

describe('MotionControl', () => {
  it('exports expected members', () => {
    expect(BUILTIN_DEFAULT_I2V_ID).toBeDefined();
    expect(BUILTIN_DEFAULT_VACE_ID).toBeDefined();
    expect(FEATURED_PRESET_IDS).toBeDefined();
    expect(MotionControl).toBeDefined();
  });
});
