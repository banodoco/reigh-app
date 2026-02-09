/**
 * useGenerateBatch - Video batch generation handler hook
 *
 * Extracted from ShotEditor to reduce component size.
 * Handles the fire-and-forget video generation flow with parent reuse tracking.
 */

import { useCallback, useRef, useState } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import { handleError } from '@/shared/lib/errorHandler';
import { generateVideo } from '../services/generateVideoService';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';
import type { SteerableMotionSettings } from '@/shared/types/steerableMotion';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type { Shot, GenerationRow } from '@/types/shots';

interface SelectedLora {
  id: string;
  path: string;
  strength: number;
  name?: string;
}

interface StructureVideoConfig {
  uni3c_end_percent?: number;
  [key: string]: unknown;
}

interface StructureVideo {
  url: string;
  [key: string]: unknown;
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
  generationMode: string;
  // Prompt config
  prompt: string;
  enhancePrompt: boolean;
  textBeforePrompts: string;
  textAfterPrompts: string;
  negativePrompt: string;
  // Motion config
  amountOfMotion: number;
  motionMode: string;
  advancedMode: boolean;
  phaseConfig?: PhaseConfig;
  selectedPhasePresetId?: string | null;
  // Model config
  steerableMotionSettings?: SteerableMotionSettings;
  randomSeed: boolean;
  turboMode: boolean;
  generationTypeMode?: string;
  smoothContinuations?: boolean;
  // Frame settings
  batchVideoFrames: number;
  // LoRAs
  selectedLoras: SelectedLora[];
  // Structure video
  structureVideoConfig: StructureVideoConfig;
  structureVideos: StructureVideo[];
  // Clear prompts callback
  clearAllEnhancedPrompts: () => void;
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
  joinMotionMode: string;
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
  handleGenerateBatch: (variantNameParam: string) => void;
  isSteerableMotionEnqueuing: boolean;
  steerableMotionJustQueued: boolean;
  isGenerationDisabled: boolean;
}

export function useGenerateBatch({
  projectId,
  selectedProjectId,
  selectedShotId,
  selectedShot,
  queryClient,
  onShotImagesUpdate,
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
  smoothContinuations,
  // Frame settings
  batchVideoFrames,
  // LoRAs
  selectedLoras,
  // Structure video
  structureVideoConfig,
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
  const [isSteerableMotionEnqueuing, setIsSteerableMotionEnqueuing] = useState(false);
  const [steerableMotionJustQueued, setSteerableMotionJustQueued] = useState(false);

  // Track pending parent ID for main generations within the same shot
  const pendingMainParentRef = useRef<{ shotId: string; parentId: string; timestamp: number } | null>(null);

  const isGenerationDisabled = isSteerableMotionEnqueuing;

  const handleGenerateBatch = useCallback((variantNameParam: string) => {
    // Add incoming task immediately for instant TasksPane feedback
    const taskLabel = variantNameParam || selectedShot?.name || 'Travel video';
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
        // Determine the parent generation ID to use
        let effectiveParentId = selectedOutputId ?? undefined;

        console.log('[ParentReuseDebug] === handleGenerateBatch START ===');
        console.log('[ParentReuseDebug] selectedOutputId:', selectedOutputId?.substring(0, 8) || 'null');
        console.log('[ParentReuseDebug] selectedShotId:', selectedShotId?.substring(0, 8) || 'null');
        console.log('[ParentReuseDebug] pendingMainParentRef.current:', pendingMainParentRef.current ? {
          shotId: pendingMainParentRef.current.shotId.substring(0, 8),
          parentId: pendingMainParentRef.current.parentId.substring(0, 8),
          timestamp: pendingMainParentRef.current.timestamp,
          age: Date.now() - pendingMainParentRef.current.timestamp + 'ms'
        } : 'null');

        if (!effectiveParentId && selectedShotId) {
          const pending = pendingMainParentRef.current;

          if (pending) {
            const age = Date.now() - pending.timestamp;
            const shotIdMatches = pending.shotId === selectedShotId;
            console.log('[ParentReuseDebug] Checking pending parent:', {
              pendingParentId: pending.parentId.substring(0, 8),
              pendingShotId: pending.shotId.substring(0, 8),
              currentShotId: selectedShotId.substring(0, 8),
              shotIdMatches,
              age: age + 'ms',
              willReuse: shotIdMatches
            });
          } else {
            console.log('[ParentReuseDebug] No pending parent to check');
          }

          // Always reuse pending parent for the same shot
          if (pending && pending.shotId === selectedShotId) {
            console.log('[ParentReuseDebug] ✅ REUSING pending parent:', pending.parentId.substring(0, 8));
            effectiveParentId = pending.parentId;
          } else {
            console.log('[ParentReuseDebug] ❌ NOT reusing - will create new parent');
          }
        } else {
          console.log('[ParentReuseDebug] Using selectedOutputId or no shotId:', effectiveParentId?.substring(0, 8) || 'none');
        }

        // Call the service with all required parameters
        const result = await generateVideo({
          projectId,
          selectedShotId,
          selectedShot,
          queryClient,
          effectiveAspectRatio,
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
            selected_phase_preset_id: selectedPhasePresetId,
          },
          modelConfig: {
            seed: steerableMotionSettings?.seed ?? 789,
            random_seed: randomSeed,
            turbo_mode: turboMode,
            debug: steerableMotionSettings?.debug || false,
            generation_type_mode: generationTypeMode || 'i2v',
            use_svi: false, // SVI feature removed from UX
          },
          structureVideoConfig,
          structureVideos,
          batchVideoFrames,
          selectedLoras: selectedLoras.map(lora => ({
            id: lora.id,
            path: lora.path,
            strength: parseFloat(lora.strength?.toString() ?? '0') || 0.0,
            name: lora.name
          })),
          variantNameParam,
          clearAllEnhancedPrompts,
          uni3cEndPercent: structureVideoConfig.uni3c_end_percent,
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

        console.log('[ParentReuseDebug] generateVideo result:', {
          success: result.success,
          parentGenerationId: result.parentGenerationId?.substring(0, 8) || 'undefined',
          effectiveParentIdUsed: effectiveParentId?.substring(0, 8) || 'undefined',
          parentWasProvided: !!effectiveParentId,
          newParentCreated: result.parentGenerationId && result.parentGenerationId !== effectiveParentId
        });

        // If a new parent was created, store it and invalidate the query
        if (result.success && result.parentGenerationId && !selectedOutputId && selectedShotId) {
          console.log('[ParentReuseDebug] ✅ STORING pending parent for future reuse:', {
            parentId: result.parentGenerationId.substring(0, 8),
            shotId: selectedShotId.substring(0, 8),
            timestamp: Date.now()
          });
          pendingMainParentRef.current = {
            shotId: selectedShotId,
            parentId: result.parentGenerationId,
            timestamp: Date.now(),
          };

          // Invalidate segment-parent-generations so the auto-select effect picks up the new parent
          console.log('[ParentReuseDebug] Invalidating segment-parent-generations query');
          queryClient.invalidateQueries({
            predicate: (query) => query.queryKey[0] === queryKeys.segments.parentsAll[0]
          });
        } else {
          console.log('[ParentReuseDebug] NOT storing pending parent:', {
            success: result.success,
            hasParentGenerationId: !!result.parentGenerationId,
            hasSelectedOutputId: !!selectedOutputId,
            hasSelectedShotId: !!selectedShotId,
            reason: !result.success ? 'not successful' :
                    !result.parentGenerationId ? 'no parent ID returned' :
                    selectedOutputId ? 'user had selected output' :
                    !selectedShotId ? 'no shot ID' : 'unknown'
          });
        }
        console.log('[ParentReuseDebug] === handleGenerateBatch END ===');

      } catch (error) {
        handleError(error, { context: 'handleGenerateBatch', toastTitle: 'Failed to create video task. Please try again.' });
      } finally {
        // Wait for task queries to refetch, then remove placeholder
        await queryClient.refetchQueries({ queryKey: queryKeys.tasks.paginatedAll });
        await queryClient.refetchQueries({ queryKey: queryKeys.tasks.statusCountsAll });
        console.log('[handleGenerateBatch] Removing incoming task placeholder:', incomingTaskId);
        removeIncomingTask(incomingTaskId);
      }
    })();
  }, [
    projectId,
    selectedProjectId,
    selectedShotId,
    selectedShot,
    queryClient,
    onShotImagesUpdate,
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
    smoothContinuations,
    batchVideoFrames,
    selectedLoras,
    structureVideoConfig,
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
