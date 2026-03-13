import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupFailedProjectSetup,
  createDefaultShotForProject,
  createDefaultShotWithRollback,
  ensureUserRecordExists,
} from './projectSetupService';

const mocks = vi.hoisted(() => ({
  normalizeAndPresentError: vi.fn(),
  copyOnboardingTemplateToProject: vi.fn(),
  createDefaultShotRecord: vi.fn(),
  createUserRecordIfMissing: vi.fn(),
  deleteProjectForUser: vi.fn(),
  hasUserRecord: vi.fn(),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mocks.normalizeAndPresentError(...args),
}));

vi.mock('@/shared/hooks/projects/services/projectSetupRepository', () => ({
  copyOnboardingTemplateToProject: (...args: unknown[]) => mocks.copyOnboardingTemplateToProject(...args),
  createDefaultShotRecord: (...args: unknown[]) => mocks.createDefaultShotRecord(...args),
  createUserRecordIfMissing: (...args: unknown[]) => mocks.createUserRecordIfMissing(...args),
  deleteProjectForUser: (...args: unknown[]) => mocks.deleteProjectForUser(...args),
  hasUserRecord: (...args: unknown[]) => mocks.hasUserRecord(...args),
}));

describe('projectSetupService', () => {
  beforeEach(() => {
    mocks.normalizeAndPresentError.mockReset();
    mocks.copyOnboardingTemplateToProject.mockReset();
    mocks.createDefaultShotRecord.mockReset();
    mocks.createUserRecordIfMissing.mockReset();
    mocks.deleteProjectForUser.mockReset();
    mocks.hasUserRecord.mockReset();

    mocks.createDefaultShotRecord.mockResolvedValue({ id: 'shot-1' });
    mocks.copyOnboardingTemplateToProject.mockResolvedValue(undefined);
    mocks.createUserRecordIfMissing.mockResolvedValue(undefined);
    mocks.deleteProjectForUser.mockResolvedValue(undefined);
    mocks.hasUserRecord.mockResolvedValue(true);
  });

  it('swallows cleanup failures and reports them through runtime error handling', async () => {
    const cleanupError = new Error('cleanup failed');
    mocks.deleteProjectForUser.mockRejectedValueOnce(cleanupError);

    await expect(cleanupFailedProjectSetup('project-1', 'user-1')).resolves.toBeUndefined();
    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(cleanupError, {
      context: 'projectSetupService.cleanupFailedProjectSetup',
      showToast: false,
    });
  });

  it('creates a default shot and only copies onboarding content for the first project', async () => {
    await expect(createDefaultShotForProject('project-1')).resolves.toBe('shot-1');
    expect(mocks.createDefaultShotRecord).toHaveBeenNthCalledWith(
      1,
      'project-1',
      'Default Shot',
      {},
    );
    expect(mocks.copyOnboardingTemplateToProject).not.toHaveBeenCalled();

    await expect(createDefaultShotForProject('project-2', { isFirstProject: true })).resolves.toBe('shot-1');
    expect(mocks.createDefaultShotRecord).toHaveBeenNthCalledWith(
      2,
      'project-2',
      'Getting Started',
      {},
    );
    expect(mocks.copyOnboardingTemplateToProject).toHaveBeenCalledWith('project-2', 'shot-1');
  });

  it('creates a user record only when one is missing and reports creation failures softly', async () => {
    await ensureUserRecordExists('user-1');
    expect(mocks.createUserRecordIfMissing).not.toHaveBeenCalled();

    const creationError = new Error('user create failed');
    mocks.hasUserRecord.mockResolvedValueOnce(false);
    mocks.createUserRecordIfMissing.mockRejectedValueOnce(creationError);

    await ensureUserRecordExists('user-1');

    expect(mocks.createUserRecordIfMissing).toHaveBeenCalledTimes(1);
    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(creationError, {
      context: 'projectSetupService.ensureUserRecordExists',
      showToast: false,
    });
  });

  it('rolls back project setup if default shot creation fails and rethrows the original error', async () => {
    const setupError = new Error('shot create failed');
    mocks.createDefaultShotRecord.mockRejectedValueOnce(setupError);

    await expect(createDefaultShotWithRollback('project-1', 'user-1')).rejects.toBe(setupError);
    expect(mocks.deleteProjectForUser).toHaveBeenCalledWith('project-1', 'user-1');
  });
});
