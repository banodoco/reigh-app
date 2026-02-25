import { getSupabaseClient } from '@/integrations/supabase/client';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

interface EnsureShotParentGenerationInput {
  projectId: string;
  shotId?: string;
  parentGenerationId?: string;
  context: string;
}

/**
 * Returns the existing parent generation ID for a shot, or creates one if missing.
 * Never replaces an existing parent generation.
 */
export async function ensureShotParentGenerationId({
  projectId,
  shotId,
  parentGenerationId,
  context,
}: EnsureShotParentGenerationInput): Promise<string> {
  const supabase = getSupabaseClient();

  if (parentGenerationId) {
    return parentGenerationId;
  }

  if (!shotId) {
    throw new Error('parent_generation_id is required when shot_id is missing');
  }

  const { data, error } = await supabase.rpc('ensure_shot_parent_generation', {
    p_shot_id: shotId,
    p_project_id: projectId,
  });

  if (error) {
    normalizeAndPresentError(error, {
      context: `${context}:ensureShotParentGeneration`,
      showToast: false,
      logData: { shotId, projectId },
    });
    throw new Error(`Failed to ensure parent generation for shot ${shotId}: ${error.message}`);
  }

  if (!data || typeof data !== 'string') {
    throw new Error(`ensure_shot_parent_generation returned invalid parent ID for shot ${shotId}`);
  }

  return data;
}
