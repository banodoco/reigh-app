import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  copyOnboardingTemplateToProject,
  createDefaultShotRecord,
  createUserRecordIfMissing,
  deleteProjectForUser,
  hasUserRecord,
} from './projectSetupRepository';

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: (...args: unknown[]) => mocks.getSupabaseClient(...args),
}));

describe('projectSetupRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies the onboarding template through the repository boundary', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    mocks.getSupabaseClient.mockReturnValue({ rpc });

    await copyOnboardingTemplateToProject('project-1', 'shot-1');

    expect(rpc).toHaveBeenCalledWith('copy_onboarding_template', {
      target_project_id: 'project-1',
      target_shot_id: 'shot-1',
    });
  });

  it('throws when project deletion fails', async () => {
    const eqUserId = vi.fn().mockResolvedValue({ error: { message: 'delete failed' } });
    const eqProjectId = vi.fn(() => ({ eq: eqUserId }));
    const deleteProject = vi.fn(() => ({ eq: eqProjectId }));
    const from = vi.fn(() => ({ delete: deleteProject }));
    mocks.getSupabaseClient.mockReturnValue({ from });

    await expect(deleteProjectForUser('project-1', 'user-1')).rejects.toThrow('delete failed');
  });

  it('creates the default shot and returns its id', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'shot-1' }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ insert }));
    mocks.getSupabaseClient.mockReturnValue({ from });

    await expect(
      createDefaultShotRecord('project-1', 'Default Shot', { quality: 'high' }),
    ).resolves.toEqual({ id: 'shot-1' });

    expect(insert).toHaveBeenCalledWith({
      name: 'Default Shot',
      project_id: 'project-1',
      settings: { quality: 'high' },
    });
    expect(select).toHaveBeenCalledWith('id');
  });

  it('returns whether the user record exists without treating missing rows as an error', async () => {
    const maybeSingle = vi.fn()
      .mockResolvedValueOnce({ data: { id: 'user-1' }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    mocks.getSupabaseClient.mockReturnValue({ from });

    await expect(hasUserRecord('user-1')).resolves.toBe(true);
    await expect(hasUserRecord('user-2')).resolves.toBe(false);
  });

  it('throws when creating the user record fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: 'rpc failed' } });
    mocks.getSupabaseClient.mockReturnValue({ rpc });

    await expect(createUserRecordIfMissing()).rejects.toThrow('rpc failed');
    expect(rpc).toHaveBeenCalledWith('create_user_record_if_not_exists');
  });
});
