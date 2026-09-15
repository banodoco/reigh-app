/**
 * Guarded batch travel-generation entry point.
 *
 * The current Astrid catalog has no lossless capability for the ordered-image
 * travel contract. Preserve the hook's public shape, but reject before
 * settings mutation, loading state, timers, invalidation, enhancement, or
 * Runtime submission.
 */

import { useCallback } from 'react';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { unsupportedLegacyTaskError } from '@/shared/lib/taskCreation/legacyBoundary';
import type { Shot } from '@/domains/generation/types';
import type { ActiveLora } from '@/domains/lora/types/lora';
import type { resolveTravelStructureState } from '@/shared/lib/tasks/travelBetweenImages';

type StructureState = ReturnType<typeof resolveTravelStructureState>;

export interface UseBatchVideoGenerationParams {
  shot: Shot;
  projectId: string | null | undefined;
  onClose: () => void;
  randomSeed: boolean;
  positionedImages: Array<{ metadata?: Record<string, unknown> | null }>;
  effectiveAspectRatio: string;
  selectedLoras: ActiveLora[];
  structureState: StructureState;
}

export interface UseBatchVideoGenerationResult {
  handleGenerate: () => Promise<void>;
  isGenerating: boolean;
  justQueued: boolean;
  isDisabled: boolean;
}

export function useBatchVideoGeneration({
  shot,
  projectId,
  positionedImages,
}: UseBatchVideoGenerationParams): UseBatchVideoGenerationResult {
  const handleGenerate = useCallback(async () => {
    if (!projectId || !shot.id) {
      toast.error('No project or shot selected.');
      return;
    }

    if (positionedImages.length < 1) {
      toast.error('At least 1 positioned image is required.');
      return;
    }

    toast.error(unsupportedLegacyTaskError('travel_between_images').message);
  }, [projectId, shot.id, positionedImages.length]);

  return {
    handleGenerate,
    isGenerating: false,
    justQueued: false,
    isDisabled: positionedImages.length < 1,
  };
}
