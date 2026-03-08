import type { GenerationRow } from '@/domains/generation/types';
import { fetchGenerationById } from '@/integrations/supabase/repositories/generationRepository';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

interface NavigateToGenerationOptions {
  context: string;
  onResolved: (generation: GenerationRow) => void;
  onAfterResolved?: () => void;
}

export async function navigateToGenerationById(
  generationId: string,
  options: NavigateToGenerationOptions
): Promise<void> {
  try {
    const generation = await fetchGenerationById(generationId);

    if (generation) {
      options.onResolved(generation);
      options.onAfterResolved?.();
    }
  } catch (error) {
    normalizeAndPresentError(error, { context: options.context, showToast: false });
  }
}
