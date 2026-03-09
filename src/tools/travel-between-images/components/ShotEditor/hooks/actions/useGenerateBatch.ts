/**
 * useGenerateBatch - Video batch generation handler hook
 *
 * Extracted from ShotEditor to reduce component size.
 * Handles the fire-and-forget video generation flow with parent reuse tracking.
 */

import { useCallback, useRef, useState } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { generateVideo } from '../../services/generateVideoService';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type { Shot, GenerationRow } from '@/domains/generation/types';
import type {
  StructureGuidanceConfig,
  StructureVideoConfigWithMetadata,
} from '@/shared/lib/tasks/travelBetweenImages';

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
    randomSeed: boolean;
    turboMode: boolean;
    generationTypeMode?: 'i2v' | 'vace';
    smoothContinuations?: boolean;
  };
  batchVideoFrames: number;
  selectedLoras: SelectedLora[];
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
}

export function useGenerateBatch({
  core,
  request,
  clearAllEnhancedPrompts,
}: UseGenerateBatchOptions): UseGenerateBatchReturn {
  const {
    projectId,
    selectedProjectId: _selectedProjectId,
    selectedShotId,
    selectedShot,
    queryClient,
    onShotImagesUpdate: _onShotImagesUpdate,
    effectiveAspectRatio,
    generationMode,
  } = core;
  const {
    prompt,
    motion,
    model,
    batchVideoFrames,
    selectedLoras,
    structureGuidance,
    structureVideos,
    selectedOutputId,
    stitchAfterGenerate,
  } = request;
  const { addIncomingTask, removeIncomingTask } = useIncomingTasks();

  // Local state
  const [isSteerableMotionEnqueuing] = useState(false);
  const [steerableMotionJustQueued, setSteerableMotionJustQueued] = useState(false);

  // Track pending parent ID for main generations within the same shot
  const pendingMainParentRef = useRef<{ shotId: string; parentId: string; timestamp: number } | null>(null);

  const isGenerationDisabled = isSteerableMotionEnqueuing;

  const handleGenerateBatch = useCallback((variantNameParam?: string) => {
    const variantName = variantNameParam ?? '';

    // Add incoming task immediately for instant TasksPane feedback
    const taskLabel = variantName || selectedShot?.name || 'Travel video';
    const incomingTaskId = addIncomingTask({
      taskType: 'travel_orchestrator',
      label: taskLabel.length > 50 ? taskLabel.substring(0, 50) + '...' : taskLabel,
    });

    // Show success feedback immediately (task is being created)
    setSteerableMotionJustQueued(true);
    setTimeout(() => setSteerableMotionJustQueued(false), 1500);

    // Fire-and-forget: run task creation in background
    (async () => {
      try {
        if (!projectId || !selectedShotId || !selectedShot) {
          return;
        }

        // Determine the parent generation ID to use
        let effectiveParentId = selectedOutputId ?? undefined;

        if (!effectiveParentId && selectedShotId) {
          const pending = pendingMainParentRef.current;

          // Always reuse pending parent for the same shot
          if (pending && pending.shotId === selectedShotId) {
            effectiveParentId = pending.parentId;
          }
        }

        const normalizedGenerationMode = generationMode === 'join' ? 'by-pair' : generationMode;

        // Call the service with all required parameters
        const result = await generateVideo({
          projectId,
          selectedShotId,
          selectedShot,
          queryClient,
          effectiveAspectRatio: effectiveAspectRatio ?? null,
          generationMode: normalizedGenerationMode,
          promptConfig: {
            base_prompt: prompt.basePrompt,
            enhance_prompt: prompt.enhancePrompt,
            text_before_prompts: prompt.textBeforePrompts,
            text_after_prompts: prompt.textAfterPrompts,
            default_negative_prompt: prompt.negativePrompt,
          },
          motionConfig: {
            amount_of_motion: motion.amountOfMotion,
            motion_mode: motion.motionMode || 'basic',
            advanced_mode: motion.advancedMode,
            phase_config: motion.phaseConfig,
            selected_phase_preset_id: motion.selectedPhasePresetId ?? undefined,
          },
          modelConfig: {
            seed: model.steerableMotionSettings?.seed ?? 789,
            random_seed: model.randomSeed,
            turbo_mode: model.turboMode,
            debug: model.steerableMotionSettings?.debug || false,
            generation_type_mode: model.generationTypeMode ?? 'i2v',
          },
          structureGuidance,
          structureVideos,
          batchVideoFrames,
          selectedLoras: selectedLoras.map(lora => ({
            id: lora.id,
            path: lora.path,
            strength: parseFloat(lora.strength?.toString() ?? '0') || 0.0,
            name: lora.name ?? 'LoRA',
          })),
          variantNameParam: variantName,
          clearAllEnhancedPrompts,
          parentGenerationId: effectiveParentId,
          stitchConfig: stitchAfterGenerate ? {
            context_frame_count: stitchAfterGenerate.contextFrameCount,
            gap_frame_count: stitchAfterGenerate.gapFrames,
            replace_mode: stitchAfterGenerate.replaceMode,
            keep_bridging_images: stitchAfterGenerate.keepBridgingImages,
            prompt: stitchAfterGenerate.prompt,
            negative_prompt: stitchAfterGenerate.negativePrompt,
            enhance_prompt: stitchAfterGenerate.enhancePrompt,
            model: stitchAfterGenerate.model,
            num_inference_steps: stitchAfterGenerate.numInferenceSteps,
            guidance_scale: stitchAfterGenerate.guidanceScale,
            seed: stitchAfterGenerate.seed,
            random_seed: stitchAfterGenerate.randomSeed,
            motion_mode: stitchAfterGenerate.motionMode,
            phase_config: stitchAfterGenerate.phaseConfig,
            selected_phase_preset_id: stitchAfterGenerate.selectedPhasePresetId,
            loras: stitchAfterGenerate.selectedLoras.map(l => ({ path: l.path, strength: l.strength })),
            priority: stitchAfterGenerate.priority,
            use_input_video_resolution: stitchAfterGenerate.useInputVideoResolution,
            use_input_video_fps: stitchAfterGenerate.useInputVideoFps,
            vid2vid_init_strength: stitchAfterGenerate.noisedInputVideo,
            loop_first_clip: stitchAfterGenerate.loopFirstClip,
          } : undefined,
        });

        // If a new parent was created, store it and invalidate the query
        if (result.ok && result.value.parentGenerationId && !selectedOutputId && selectedShotId) {
          pendingMainParentRef.current = {
            shotId: selectedShotId,
            parentId: result.value.parentGenerationId,
            timestamp: Date.now(),
          };

          // Invalidate segment-parent-generations so the auto-select effect picks up the new parent
          queryClient.invalidateQueries({
            predicate: (query) => query.queryKey[0] === queryKeys.segments.parentsAll[0]
          });
        }

      } catch (error) {
        normalizeAndPresentError(error, { context: 'handleGenerateBatch', toastTitle: 'Failed to create video task. Please try again.' });
      } finally {
        // Wait for task queries to refetch, then remove placeholder
        await queryClient.refetchQueries({ queryKey: queryKeys.tasks.paginatedAll });
        await queryClient.refetchQueries({ queryKey: queryKeys.tasks.statusCountsAll });
        removeIncomingTask(incomingTaskId);
      }
    })();
  }, [
    addIncomingTask,
    batchVideoFrames,
    clearAllEnhancedPrompts,
    effectiveAspectRatio,
    generationMode,
    model,
    motion,
    projectId,
    prompt,
    queryClient,
    removeIncomingTask,
    selectedLoras,
    selectedOutputId,
    selectedShot,
    selectedShotId,
    stitchAfterGenerate,
    structureVideos,
  ]);

  return {
    handleGenerateBatch,
    isSteerableMotionEnqueuing,
    steerableMotionJustQueued,
    isGenerationDisabled,
  };
}
