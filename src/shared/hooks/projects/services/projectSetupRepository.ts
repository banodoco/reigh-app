import { getSupabaseClient } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/jsonTypes';

function throwProjectSetupRepositoryError(error: unknown, fallbackMessage: string): never {
  if (error instanceof Error) {
    throw error;
  }
  if (
    error
    && typeof error === 'object'
    && 'message' in error
    && typeof (error as { message?: unknown }).message === 'string'
  ) {
    throw new Error((error as { message: string }).message);
  }

  throw new Error(fallbackMessage);
}

export async function copyOnboardingTemplateToProject(
  targetProjectId: string,
  targetShotId: string,
): Promise<void> {
  const { error } = await getSupabaseClient().rpc('copy_onboarding_template', {
    target_project_id: targetProjectId,
    target_shot_id: targetShotId,
  });

  if (error) {
    throwProjectSetupRepositoryError(error, 'Failed to copy onboarding template');
  }
}

export async function deleteProjectForUser(projectId: string, userId: string): Promise<void> {
  const { error } = await getSupabaseClient().from('projects')
    .delete()
    .eq('id', projectId)
    .eq('user_id', userId);

  if (error) {
    throwProjectSetupRepositoryError(error, 'Failed to delete project');
  }
}

export async function createDefaultShotRecord(
  projectId: string,
  name: string,
  settings: Record<string, Json | undefined>,
): Promise<{ id: string }> {
  const { data, error } = await getSupabaseClient().from('shots')
    .insert({
      name,
      project_id: projectId,
      settings,
    })
    .select('id')
    .single();

  if (error) {
    throwProjectSetupRepositoryError(error, 'Failed to create default shot');
  }
  if (!data?.id) {
    throw new Error('Default shot creation returned no shot id');
  }

  return { id: data.id };
}

export async function hasUserRecord(userId: string): Promise<boolean> {
  const { data, error } = await getSupabaseClient().from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throwProjectSetupRepositoryError(error, 'Failed to check user record');
  }

  return Boolean(data?.id);
}

export async function createUserRecordIfMissing(): Promise<void> {
  const { error } = await getSupabaseClient().rpc('create_user_record_if_not_exists');

  if (error) {
    throwProjectSetupRepositoryError(error, 'Failed to create user record');
  }
}
