/**
 * useGenerateBatch - guarded travel-generation entry point.
 *
 * Travel-between-images does not yet have a lossless canonical Astrid
 * capability for ordered pairs, continuation, and lineage. Keep the public
 * hook shape so callers remain stable, but reject before any placeholder,
 * timer, settings mutation, enhancement, query work, or Runtime submission.
 */

import { useCallback } from 'react';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { unsupportedLegacyTaskError } from '@/shared/lib/taskCreation/legacyBoundary';
import type { QueryClient } from '@tanstack/react-query';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type { Shot, GenerationRow } from '@/domains/generation/types';
import type {
  StructureGuidanceConfig,
  StructureVideoConfigWithMetadata,
  TravelGuidance,
} from '@/shared/lib/tasks/travelBetweenImages';
import type { SelectedModel } from '@/tools/travel-between-images/settings';

export interface SelectedLora {
  id: string;
  path: string;
  strength: number;
  name?: string;
}

export interface StitchAfterGenerateConfig {
  contextFrameCount: number;
  gapFrames: number;
  replaceMode: boolean;
  keepBridgingImages: boolean;
  prompt: string;
  negativePrompt: string;
  enhancePrompt: boolean;
  model: string;
  numInferenceSteps: number;
  guidanceScale: number;
  seed: number;
  randomSeed: boolean;
  motionMode: 'basic' | 'advanced';
  phaseConfig?: PhaseConfig;
  selectedPhasePresetId?: string | null;
  selectedLoras: Array<{ path: string; strength: number }>;
  priority: number;
  useInputVideoResolution: boolean;
  useInputVideoFps: boolean;
  noisedInputVideo: number;
  loopFirstClip: boolean;
}

interface UseGenerateBatchCoreOptions {
  projectId?: string | null;
  selectedProjectId?: string | null;
  selectedShotId?: string;
  selectedShot: Shot | null;
  queryClient: QueryClient;
  onShotImagesUpdate?: (images: GenerationRow[]) => void;
  effectiveAspectRatio?: string;
  generationMode: 'timeline' | 'batch' | 'by-pair' | 'join';
}

export interface BatchGenerationRequest {
  prompt: {
    basePrompt: string;
    enhancePrompt: boolean;
    textBeforePrompts: string;
    textAfterPrompts: string;
    negativePrompt: string;
  };
  motion: {
    amountOfMotion: number;
    motionMode: 'basic' | 'advanced' | 'presets';
    advancedMode: boolean;
    phaseConfig?: PhaseConfig;
    selectedPhasePresetId?: string | null;
  };
  model: {
    steerableMotionSettings?: { seed?: number; debug?: boolean };
    selectedModel: SelectedModel;
    numInferenceSteps: number;
    guidanceScale?: number;
    randomSeed: boolean;
    turboMode: boolean;
    generationTypeMode?: 'i2v' | 'vace';
    smoothContinuations?: boolean;
    ltxHdResolution?: boolean;
  };
  batchVideoFrames: number;
  selectedLoras: SelectedLora[];
  travelGuidance?: TravelGuidance;
  structureGuidance?: StructureGuidanceConfig;
  structureVideos: StructureVideoConfigWithMetadata[];
  selectedOutputId?: string | null;
  stitchAfterGenerate?: StitchAfterGenerateConfig;
}

interface UseGenerateBatchOptions {
  core: UseGenerateBatchCoreOptions;
  request: BatchGenerationRequest;
  clearAllEnhancedPrompts: () => Promise<void>;
}

interface UseGenerateBatchReturn {
  handleGenerateBatch: (variantNameParam?: string) => void;
  isSteerableMotionEnqueuing: boolean;
  steerableMotionJustQueued: boolean;
  isGenerationDisabled: boolean;
  enhancementProgress: { phase: 'enhancing'; completed: number; total: number } | null;
}

export function useGenerateBatch({ core }: UseGenerateBatchOptions): UseGenerateBatchReturn {
  const { projectId, selectedShotId, selectedShot } = core;

  const handleGenerateBatch = useCallback((variantNameParam?: string) => {
    void variantNameParam;
    if (!projectId || !selectedShotId || !selectedShot) return;

    toast.error(unsupportedLegacyTaskError('travel_between_images').message);
  }, [projectId, selectedShotId, selectedShot]);

  return {
    handleGenerateBatch,
    isSteerableMotionEnqueuing: false,
    steerableMotionJustQueued: false,
    isGenerationDisabled: false,
    enhancementProgress: null,
  };
}
