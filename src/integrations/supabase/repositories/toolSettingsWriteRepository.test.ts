import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  callUpdateToolSettingsAtomicRpc,
  resolveSettingsScopeTable,
  selectSettingsForScope,
} from './toolSettingsWriteRepository';

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: (...args: unknown[]) => mocks.getSupabaseClient(...args),
}));

describe('toolSettingsWriteRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps scope to table names', () => {
    expect(resolveSettingsScopeTable('user')).toBe('users');
    expect(resolveSettingsScopeTable('project')).toBe('projects');
    expect(resolveSettingsScopeTable('shot')).toBe('shots');
  });

  it('selects settings for a given scope and id', async () => {
    const single = vi.fn().mockResolvedValue({ data: { settings: { x: 1 } }, error: null });
    const eq = vi.fn(() => ({ single }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    mocks.getSupabaseClient.mockReturnValue({ from, rpc: vi.fn() });

    const result = await selectSettingsForScope('project', 'proj-1');

    expect(from).toHaveBeenCalledWith('projects');
    expect(select).toHaveBeenCalledWith('settings');
    expect(eq).toHaveBeenCalledWith('id', 'proj-1');
    expect(result).toEqual({ data: { settings: { x: 1 } }, error: null });
  });

  it('calls atomic RPC with normalized payload keys', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    mocks.getSupabaseClient.mockReturnValue({ from: vi.fn(), rpc });

    await callUpdateToolSettingsAtomicRpc('shots', 'shot-1', 'edit-video', { quality: 'high' });

    expect(rpc).toHaveBeenCalledWith('update_tool_settings_atomic', {
      p_table_name: 'shots',
      p_id: 'shot-1',
      p_tool_id: 'edit-video',
      p_settings: { quality: 'high' },
    });
  });
});
