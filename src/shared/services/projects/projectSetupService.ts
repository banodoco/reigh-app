import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

async function copyTemplateToNewUser(newProjectId: string, newShotId: string): Promise<void> {
  const { error } = await supabase().rpc('copy_onboarding_template', {
    target_project_id: newProjectId,
    target_shot_id: newShotId,
  });

  if (error) {
    throw error;
  }
}

export async function cleanupFailedProjectSetup(projectId: string, userId: string): Promise<void> {
  const { error } = await supabase().from('projects')
    .delete()
    .eq('id', projectId)
    .eq('user_id', userId);

  if (error) {
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

  const { data: shot, error } = await supabase().from('shots')
    .insert({
      name: shotName,
      project_id: projectId,
      settings: options?.initialSettings || {},
    })
    .select('id')
    .single();

  if (error) {
    throw error;
  }
  if (!shot?.id) {
    throw new Error('Default shot creation returned no shot id');
  }

  if (isFirstProject) {
    await copyTemplateToNewUser(projectId, shot.id);
  }

  return shot.id;
}

export async function ensureUserRecordExists(userId: string): Promise<void> {
  const { data: existingUser } = await supabase().from('users')
    .select('id')
    .eq('id', userId)
    .single();

  if (!existingUser) {
    const { error: userError } = await supabase().rpc('create_user_record_if_not_exists');
    if (userError) {
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
