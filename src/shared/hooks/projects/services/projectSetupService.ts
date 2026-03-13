import type { Json } from '@/integrations/supabase/jsonTypes';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import {
  copyOnboardingTemplateToProject,
  createDefaultShotRecord,
  createUserRecordIfMissing,
  deleteProjectForUser,
  hasUserRecord,
} from '@/shared/hooks/projects/services/projectSetupRepository';

export async function cleanupFailedProjectSetup(projectId: string, userId: string): Promise<void> {
  try {
    await deleteProjectForUser(projectId, userId);
  } catch (error) {
    normalizeAndPresentError(error, {
      context: 'projectSetupService.cleanupFailedProjectSetup',
      showToast: false,
    });
  }
}

export async function createDefaultShotForProject(
  projectId: string,
  options?: {
    initialSettings?: Record<string, Json | undefined>;
    isFirstProject?: boolean;
  },
): Promise<string> {
  const isFirstProject = options?.isFirstProject === true;
  const shotName = isFirstProject ? 'Getting Started' : 'Default Shot';

  const shot = await createDefaultShotRecord(
    projectId,
    shotName,
    options?.initialSettings || {},
  );

  if (isFirstProject) {
    await copyOnboardingTemplateToProject(projectId, shot.id);
  }

  return shot.id;
}

export async function ensureUserRecordExists(userId: string): Promise<void> {
  const existingUser = await hasUserRecord(userId);

  if (!existingUser) {
    try {
      await createUserRecordIfMissing();
    } catch (userError) {
      normalizeAndPresentError(userError, {
        context: 'projectSetupService.ensureUserRecordExists',
        showToast: false,
      });
    }
  }
}

export async function createDefaultShotWithRollback(
  projectId: string,
  userId: string,
  options?: {
    initialSettings?: Record<string, Json | undefined>;
    isFirstProject?: boolean;
  },
): Promise<void> {
  try {
    await createDefaultShotForProject(projectId, options);
  } catch (setupError) {
    await cleanupFailedProjectSetup(projectId, userId);
    throw setupError;
  }
}
