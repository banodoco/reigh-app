import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

import type { TaskStatusRow } from './types.ts';

export async function fetchCurrentTaskStatus(
  supabaseAdmin: SupabaseClient,
  taskId: string,
): Promise<{ data: TaskStatusRow | null; error: { message: string } | null }> {
  const { data, error } = await supabaseAdmin
    .from('tasks')
    .select('id, status')
    .eq('id', taskId)
    .single();

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  if (!data) {
    return { data: null, error: null };
  }

  return { data: data as TaskStatusRow, error: null };
}

export async function updateTaskByRole(
  supabaseAdmin: SupabaseClient,
  taskId: string,
  updatePayload: Record<string, unknown>,
  isServiceRole: boolean,
  callerId: string | null,
): Promise<{ data: TaskStatusRow | null; error: { message: string; code?: string } | null }> {
  if (isServiceRole) {
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .update(updatePayload)
      .eq('id', taskId)
      .select('id, status, params, generation_started_at, generation_processed_at')
      .single();

    if (error) {
      return { data: null, error: { message: error.message, code: error.code } };
    }

    return { data: (data as TaskStatusRow) ?? null, error: null };
  }

  const { data: userProjects, error: projectsError } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('user_id', callerId);

  if (projectsError) {
    return { data: null, error: { message: projectsError.message, code: projectsError.code } };
  }

  if (!userProjects || userProjects.length === 0) {
    return { data: null, error: { message: 'User has no projects' } };
  }

  const projectIds = userProjects
    .map((project) => project.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  const { data, error } = await supabaseAdmin
    .from('tasks')
    .update(updatePayload)
    .eq('id', taskId)
    .in('project_id', projectIds)
    .select('id, status, params, generation_started_at, generation_processed_at')
    .single();

  if (error) {
    return { data: null, error: { message: error.message, code: error.code } };
  }

  return { data: (data as TaskStatusRow) ?? null, error: null };
}
