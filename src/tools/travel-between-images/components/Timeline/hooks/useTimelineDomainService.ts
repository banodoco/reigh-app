import { useMemo } from 'react';
import type { GenerationRow } from '@/domains/generation/types/generationViewRow';
import { filterTimelineEligiblePositionedImages } from '@/shared/lib/timelineEligibility';
import { useTimelineCore } from '@/shared/hooks/useTimelineCore';
import { useTimelinePositionUtils } from '../../../hooks/useTimelinePositionUtils';
import { usePositionManagement } from './usePositionManagement';

interface UseTimelineDomainServiceInput {
  shotId: string;
  projectId?: string;
  frameSpacing: number;
  isDragInProgress: boolean;
  onFramePositionsChange?: (framePositions: Map<string, number>) => void;
  propShotGenerations?: GenerationRow[];
  propImages?: GenerationRow[];
  propAllGenerations?: GenerationRow[];
  readOnly: boolean;
}

interface UseTimelineDomainServiceResult {
  shotGenerations: GenerationRow[];
  images: GenerationRow[];
  readOnlyGenerations: GenerationRow[] | undefined;
  displayPositions: Map<string, number>;
  setFramePositions: (positions: Map<string, number>) => Promise<void>;
  actualPairPrompts: Record<number, { prompt: string; negativePrompt: string }>;
  loadPositions: (opts?: { silent?: boolean; reason?: string }) => void | Promise<void>;
}

/**
 * Domain/application service boundary for Timeline data.
 * Consolidates position/query orchestration and keeps Timeline.tsx as view composition.
 */
export function useTimelineDomainService(input: UseTimelineDomainServiceInput): UseTimelineDomainServiceResult {
  const {
    shotId,
    projectId,
    frameSpacing,
    isDragInProgress,
    onFramePositionsChange,
    propShotGenerations,
    propImages,
    propAllGenerations,
    readOnly,
  } = input;

  const coreHookData = useTimelineCore(!propAllGenerations ? shotId : null);
  const utilsHookData = useTimelinePositionUtils({
    shotId: propAllGenerations ? shotId : null,
    generations: propAllGenerations || [],
    projectId,
  });

  const shotGenerations: GenerationRow[] = propShotGenerations
    || (propAllGenerations ? propAllGenerations : coreHookData.positionedItems);

  const loadPositions = propAllGenerations
    ? utilsHookData.loadPositions
    : async (_opts?: { silent?: boolean; reason?: string }) => {
      coreHookData.refetch();
    };

  const actualPairPrompts = propAllGenerations ? utilsHookData.pairPrompts : coreHookData.pairPrompts;

  const images = useMemo(() => {
    let result: GenerationRow[] = propImages ?? shotGenerations;
    result = filterTimelineEligiblePositionedImages(result);

    result = result.sort((a, b) => {
      const frameDiff = (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0);
      if (frameDiff !== 0) return frameDiff;
      return String(a.id ?? '').localeCompare(String(b.id ?? ''));
    });

    return result;
  }, [shotGenerations, propImages]);

  const readOnlyGenerations = readOnly ? propAllGenerations : undefined;

  const {
    displayPositions,
    setFramePositions,
  } = usePositionManagement({
    shotId,
    shotGenerations,
    frameSpacing,
    isDragInProgress,
    onFramePositionsChange,
  });

  return {
    shotGenerations,
    images,
    readOnlyGenerations,
    displayPositions,
    setFramePositions,
    actualPairPrompts,
    loadPositions,
  };
}
