import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  cleanupFailedProjectSetup,
  createDefaultShotForProject,
  ensureUserRecordExists,
  createDefaultShotWithRollback,
} from './projectSetupService';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import {
  deleteProjectByIdForUser,
  fetchUserById,
  insertDefaultShotForProject,
  rpcCopyOnboardingTemplate,
  rpcCreateUserRecordIfNotExists,
} from '@/integrations/supabase/repositories/projectSetupRepository';

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
}));

vi.mock('@/integrations/supabase/repositories/projectSetupRepository', () => ({
  deleteProjectByIdForUser: vi.fn(),
  fetchUserById: vi.fn(),
  insertDefaultShotForProject: vi.fn(),
  rpcCopyOnboardingTemplate: vi.fn(),
  rpcCreateUserRecordIfNotExists: vi.fn(),
}));

describe('projectSetupService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates default shot and optionally copies onboarding template for first project', async () => {
    vi.mocked(insertDefaultShotForProject).mockResolvedValue({
      data: { id: 'shot-1' },
      error: null,
    } as never);
    vi.mocked(rpcCopyOnboardingTemplate).mockResolvedValue({ error: null } as never);

    const firstShotId = await createDefaultShotForProject('project-1', { isFirstProject: true });
    const defaultShotId = await createDefaultShotForProject('project-2');

    expect(firstShotId).toBe('shot-1');
    expect(defaultShotId).toBe('shot-1');
    expect(insertDefaultShotForProject).toHaveBeenNthCalledWith(1, 'project-1', 'Getting Started', {});
    expect(insertDefaultShotForProject).toHaveBeenNthCalledWith(2, 'project-2', 'Default Shot', {});
    expect(rpcCopyOnboardingTemplate).toHaveBeenCalledWith('project-1', 'shot-1');
  });

  it('throws when shot creation returns error or missing id', async () => {
    vi.mocked(insertDefaultShotForProject).mockResolvedValueOnce({
      data: null,
      error: new Error('insert failed'),
    } as never);
    await expect(createDefaultShotForProject('project-1')).rejects.toThrow('insert failed');

    vi.mocked(insertDefaultShotForProject).mockResolvedValueOnce({
      data: {},
      error: null,
    } as never);
    await expect(createDefaultShotForProject('project-1')).rejects.toThrow(
      'Default shot creation returned no shot id',
    );
  });

  it('cleans up failed setup and reports cleanup errors', async () => {
    vi.mocked(deleteProjectByIdForUser).mockResolvedValue({
      error: new Error('cleanup failed'),
    } as never);

    await cleanupFailedProjectSetup('project-1', 'user-1');

    expect(normalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      {
        context: 'projectSetupService.cleanupFailedProjectSetup',
        showToast: false,
      },
    );
  });

  it('ensures user record exists and reports rpc errors when user is missing', async () => {
    vi.mocked(fetchUserById).mockResolvedValue({ data: null } as never);
    vi.mocked(rpcCreateUserRecordIfNotExists).mockResolvedValue({
      error: new Error('rpc failed'),
    } as never);

    await ensureUserRecordExists('user-1');

    expect(rpcCreateUserRecordIfNotExists).toHaveBeenCalledTimes(1);
    expect(normalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      {
        context: 'projectSetupService.ensureUserRecordExists',
        showToast: false,
      },
    );
  });

  it('rolls back project setup when default shot creation fails', async () => {
    vi.mocked(insertDefaultShotForProject).mockResolvedValue({
      data: null,
      error: new Error('insert failed'),
    } as never);
    vi.mocked(deleteProjectByIdForUser).mockResolvedValue({ error: null } as never);

    await expect(
      createDefaultShotWithRollback('project-1', 'user-1'),
    ).rejects.toThrow('insert failed');

    expect(deleteProjectByIdForUser).toHaveBeenCalledWith('project-1', 'user-1');
  });
});
