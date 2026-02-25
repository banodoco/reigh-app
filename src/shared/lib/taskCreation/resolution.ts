import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/media/aspectRatios';
import { ServerError } from '@/shared/lib/errorHandling/errors';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { DEFAULT_ASPECT_RATIO, type ProjectResolutionResult } from './types';

async function resolveProjectResolutionStrict(projectId: string): Promise<ProjectResolutionResult> {
  const { data: project, error } = await supabase().from('projects')
    .select('aspect_ratio')
    .eq('id', projectId)
    .single();

  if (error) {
    throw new ServerError('Failed to load project aspect ratio', {
      context: { projectId },
      cause: error,
    });
  }

  const aspectRatioKey = project?.aspect_ratio ?? DEFAULT_ASPECT_RATIO;
  const resolution = ASPECT_RATIO_TO_RESOLUTION[aspectRatioKey] ?? ASPECT_RATIO_TO_RESOLUTION[DEFAULT_ASPECT_RATIO];

  return {
    resolution,
    aspectRatio: aspectRatioKey,
  };
}

/**
 * Resolves the resolution for a project, either using provided custom resolution
 * or looking up the project's aspect ratio and mapping it to a standard resolution.
 */
export async function resolveProjectResolution(
  projectId: string,
  customResolution?: string,
): Promise<ProjectResolutionResult> {
  // If custom resolution is provided and valid, use it.
  if (customResolution?.trim()) {
    return {
      resolution: customResolution.trim(),
      aspectRatio: 'custom',
    };
  }

  try {
    return await resolveProjectResolutionStrict(projectId);
  } catch (error) {
    normalizeAndPresentError(error, { context: 'TaskCreation', showToast: false });
    // Fallback to default resolution
    return {
      resolution: ASPECT_RATIO_TO_RESOLUTION[DEFAULT_ASPECT_RATIO],
      aspectRatio: DEFAULT_ASPECT_RATIO,
    };
  }
}
