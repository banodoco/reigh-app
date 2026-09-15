import { useState, useCallback } from 'react';
import { toast } from '@/shared/components/ui/runtime/sonner';
import type { ImageTransform } from './types';
import type { GenerationRow } from '@/domains/generation/types';
import type { EditAdvancedSettings, QwenEditModel } from '../useGenerationEditSettings';

interface UseRepositionTaskCreationProps {
  media: GenerationRow;
  selectedProjectId: string | null;
  shotId?: string;
  toolTypeOverride?: string;
  imageDimensions: { width: number; height: number } | null;
  loras?: Array<{ url: string; strength: number }>;
  inpaintPrompt: string;
  inpaintNumGenerations: number;
  transform: ImageTransform;
  hasTransformChanges: boolean;
  createAsGeneration?: boolean;
  advancedSettings?: EditAdvancedSettings;
  activeVariantId?: string | null;
  qwenEditModel?: QwenEditModel;
  /** Function to create the transformed canvas */
  createTransformedCanvas: () => Promise<HTMLCanvasElement>;
}

interface UseRepositionTaskCreationReturn {
  isGeneratingReposition: boolean;
  repositionGenerateSuccess: boolean;
  handleGenerateReposition: () => Promise<void>;
}

/**
 * Hook boundary for repositioned image edits. The current Runtime contract
 * intentionally keeps this derived-source case fail-closed.
 */
export function useRepositionTaskCreation(
  _props: UseRepositionTaskCreationProps,
): UseRepositionTaskCreationReturn {
  const [isGeneratingReposition] = useState(false);
  const [repositionGenerateSuccess] = useState(false);
  // Reposition produces a derived source image. Runtime's current atomic
  // variant settlement requires source_object_id to equal the selected
  // source variant object, so it cannot honestly settle this transformed
  // source through the same mask capability yet. Keep the UI fail-closed
  // rather than reintroducing the legacy Supabase upload path.
  const handleGenerateReposition = useCallback(async () => {
    toast.error(
      'Repositioned inpainting is blocked until Astrid publishes derived-source lineage for mask edits.',
    );
  }, []);

  return {
    isGeneratingReposition,
    repositionGenerateSuccess,
    handleGenerateReposition,
  };
}
