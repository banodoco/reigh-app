/**
 * useGenerateBatch - Video batch generation handler hook
 *
 * Extracted from ShotEditor to reduce component size.
 * Handles the fire-and-forget video generation flow with parent reuse tracking.
 */

import { useCallback, useRef, useState } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { generateVideo } from '../services/generateVideoService';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';
import type { SteerableMotionSettings } from '@/shared/types/steerableMotion';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type { Shot, GenerationRow } from '@/types/shots';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';

interface SelectedLora {
  id: string;
  path: string;
  strength: number;
  name?: string;
}

interface UseGenerateBatchOptions {
  projectId?: string;
  selectedProjectId?: string;
  selectedShotId?: string;
  selectedShot: Shot | null;
  queryClient: QueryClient;
  onShotImagesUpdate?: (images: GenerationRow[]) => void;
  effectiveAspectRatio?: string;
  // Generation mode
  generationMode: 'timeline' | 'batch' | 'by-pair';
  // Prompt config
  prompt: string;
  enhancePrompt: boolean;
  textBeforePrompts: string;
  textAfterPrompts: string;
  negativePrompt: string;
  // Motion config
  amountOfMotion: number;
  motionMode: 'basic' | 'advanced' | 'presets';
  advancedMode: boolean;
  phaseConfig?: PhaseConfig;
  selectedPhasePresetId?: string | null;
  // Model config
  steerableMotionSettings?: SteerableMotionSettings;
  randomSeed: boolean;
  turboMode: boolean;
  generationTypeMode?: 'i2v' | 'vace';
  smoothContinuations?: boolean;
  // Frame settings
  batchVideoFrames: number;
  // LoRAs
  selectedLoras: SelectedLora[];
  // Structure video
  structureVideos: StructureVideoConfigWithMetadata[];
  // Clear prompts callback
  clearAllEnhancedPrompts: () => Promise<void>;
  // Output selection
  selectedOutputId?: string | null;
  // Stitch config (for join after generate)
  stitchAfterGenerate?: boolean;
  joinContextFrames: number;
  joinGapFrames: number;
  joinReplaceMode: boolean;
  joinKeepBridgingImages: boolean;
  joinPrompt: string;
  joinNegativePrompt: string;
  joinEnhancePrompt: boolean;
  joinModel: string;
  joinNumInferenceSteps: number;
  joinGuidanceScale: number;
  joinSeed: number;
  joinRandomSeed: boolean;
  joinMotionMode: 'basic' | 'advanced';
  joinPhaseConfig?: PhaseConfig;
  joinSelectedPhasePresetId?: string | null;
  joinSelectedLoras: Array<{ path: string; strength: number }>;
  joinPriority: number;
  joinUseInputVideoResolution: boolean;
  joinUseInputVideoFps: boolean;
  joinNoisedInputVideo: number;
  joinLoopFirstClip: boolean;
}

interface UseGenerateBatchReturn {
  handleGenerateBatch: (variantNameParam?: string) => void;
  isSteerableMotionEnqueuing: boolean;
  steerableMotionJustQueued: boolean;
  isGenerationDisabled: boolean;
}

export function useGenerateBatch({
  projectId,
  selectedProjectId: _selectedProjectId,
  selectedShotId,
  selectedShot,
  queryClient,
  onShotImagesUpdate: _onShotImagesUpdate,
  effectiveAspectRatio,
  generationMode,
  // Prompt config
  prompt,
  enhancePrompt,
  textBeforePrompts,
  textAfterPrompts,
  negativePrompt,
  // Motion config
  amountOfMotion,
  motionMode,
  advancedMode,
  phaseConfig,
  selectedPhasePresetId,
  // Model config
  steerableMotionSettings,
  randomSeed,
  turboMode,
  generationTypeMode,
  smoothContinuations: _smoothContinuations,
  // Frame settings
  batchVideoFrames,
  // LoRAs
  selectedLoras,
  // Structure video
  structureVideos,
  // Clear prompts callback
  clearAllEnhancedPrompts,
  // Output selection
  selectedOutputId,
  // Stitch config
  stitchAfterGenerate,
  joinContextFrames,
  joinGapFrames,
  joinReplaceMode,
  joinKeepBridgingImages,
  joinPrompt,
  joinNegativePrompt,
  joinEnhancePrompt,
  joinModel,
  joinNumInferenceSteps,
  joinGuidanceScale,
  joinSeed,
  joinRandomSeed,
  joinMotionMode,
  joinPhaseConfig,
  joinSelectedPhasePresetId,
  joinSelectedLoras,
  joinPriority,
  joinUseInputVideoResolution,
  joinUseInputVideoFps,
  joinNoisedInputVideo,
  joinLoopFirstClip,
}: UseGenerateBatchOptions): UseGenerateBatchReturn {
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

        // Call the service with all required parameters
        const result = await generateVideo({
          projectId,
          selectedShotId,
          selectedShot,
          queryClient,
          effectiveAspectRatio: effectiveAspectRatio ?? null,
          generationMode,
          promptConfig: {
            base_prompt: prompt,
            enhance_prompt: enhancePrompt,
            text_before_prompts: textBeforePrompts,
            text_after_prompts: textAfterPrompts,
            default_negative_prompt: negativePrompt,
          },
          motionConfig: {
            amount_of_motion: amountOfMotion,
            motion_mode: motionMode || 'basic',
            advanced_mode: advancedMode,
            phase_config: phaseConfig,
            selected_phase_preset_id: selectedPhasePresetId ?? undefined,
          },
          modelConfig: {
            seed: steerableMotionSettings?.seed ?? 789,
            random_seed: randomSeed,
            turbo_mode: turboMode,
            debug: steerableMotionSettings?.debug || false,
            generation_type_mode: generationTypeMode ?? 'i2v',
            use_svi: false, // SVI feature removed from UX
          },
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
            context_frame_count: joinContextFrames,
            gap_frame_count: joinGapFrames,
            replace_mode: joinReplaceMode,
            keep_bridging_images: joinKeepBridgingImages,
            prompt: joinPrompt,
            negative_prompt: joinNegativePrompt,
            enhance_prompt: joinEnhancePrompt,
            model: joinModel,
            num_inference_steps: joinNumInferenceSteps,
            guidance_scale: joinGuidanceScale,
            seed: joinSeed,
            random_seed: joinRandomSeed,
            motion_mode: joinMotionMode,
            phase_config: joinPhaseConfig,
            selected_phase_preset_id: joinSelectedPhasePresetId,
            loras: joinSelectedLoras.map(l => ({ path: l.path, strength: l.strength })),
            priority: joinPriority,
            use_input_video_resolution: joinUseInputVideoResolution,
            use_input_video_fps: joinUseInputVideoFps,
            vid2vid_init_strength: joinNoisedInputVideo,
            loop_first_clip: joinLoopFirstClip,
          } : undefined,
        });

        // If a new parent was created, store it and invalidate the query
        if (result.success && result.parentGenerationId && !selectedOutputId && selectedShotId) {
          pendingMainParentRef.current = {
            shotId: selectedShotId,
            parentId: result.parentGenerationId,
            timestamp: Date.now(),
          };

          // Invalidate segment-parent-generations so the auto-select effect picks up the new parent
          queryClient.invalidateQueries({
            predicate: (query) => query.queryKey[0] === queryKeys.segments.parentsAll[0]
          });
        }

      } catch (error) {
        handleError(error, { context: 'handleGenerateBatch', toastTitle: 'Failed to create video task. Please try again.' });
      } finally {
        // Wait for task queries to refetch, then remove placeholder
        await queryClient.refetchQueries({ queryKey: queryKeys.tasks.paginatedAll });
        await queryClient.refetchQueries({ queryKey: queryKeys.tasks.statusCountsAll });
        removeIncomingTask(incomingTaskId);
      }
    })();
  }, [
    projectId,
    selectedShotId,
    selectedShot,
    queryClient,
    effectiveAspectRatio,
    generationMode,
    prompt,
    textBeforePrompts,
    textAfterPrompts,
    enhancePrompt,
    negativePrompt,
    steerableMotionSettings,
    amountOfMotion,
    motionMode,
    advancedMode,
    phaseConfig,
    selectedPhasePresetId,
    randomSeed,
    turboMode,
    generationTypeMode,
    batchVideoFrames,
    selectedLoras,
    structureVideos,
    clearAllEnhancedPrompts,
    selectedOutputId,
    stitchAfterGenerate,
    joinContextFrames,
    joinGapFrames,
    joinReplaceMode,
    joinKeepBridgingImages,
    joinPrompt,
    joinNegativePrompt,
    joinEnhancePrompt,
    joinModel,
    joinNumInferenceSteps,
    joinGuidanceScale,
    joinSeed,
    joinRandomSeed,
    joinMotionMode,
    joinPhaseConfig,
    joinSelectedPhasePresetId,
    joinSelectedLoras,
    joinPriority,
    joinUseInputVideoResolution,
    joinUseInputVideoFps,
    joinNoisedInputVideo,
    joinLoopFirstClip,
    addIncomingTask,
    removeIncomingTask,
  ]);

  return {
    handleGenerateBatch,
    isSteerableMotionEnqueuing,
    steerableMotionJustQueued,
    isGenerationDisabled,
  };
}
