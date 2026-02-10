/**
 * SegmentRegenerateForm Component
 *
 * A form for regenerating a video segment from within the MediaLightbox.
 * Uses the controlled SegmentSettingsForm pattern.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/shared/hooks/use-toast';
import { handleError } from '@/shared/lib/errorHandler';
import { useSegmentSettingsForm } from '@/shared/hooks/useSegmentSettingsForm';
import { SegmentSettingsForm } from '@/shared/components/SegmentSettingsForm';
import { buildTaskParams, extractSettingsFromParams } from '@/shared/components/segmentSettingsUtils';
import { createIndividualTravelSegmentTask } from '@/shared/lib/tasks/individualTravelSegment';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/shared/lib/queryKeys';
import type { StructureVideoConfigWithMetadata, StructureVideoConfig } from '@/shared/lib/tasks/travelBetweenImages';

export interface SegmentRegenerateFormProps {
  /** Generation params from the current video */
  params: Record<string, unknown>;
  /** Project ID for task creation */
  projectId: string | null;
  /** Generation ID to use as parent for the variant */
  generationId: string;
  /** Shot ID for fetching structure video settings */
  shotId?: string;
  /** Optional existing child generation ID (for Replace mode - creates variant instead of new child) */
  childGenerationId?: string;
  /** Optional segment index (defaults to 0 for single-segment videos) */
  segmentIndex?: number;
  /** Start image URL for the segment */
  startImageUrl?: string;
  /** End image URL for the segment */
  endImageUrl?: string;
  /** Start image generation ID */
  startImageGenerationId?: string;
  /** End image generation ID */
  endImageGenerationId?: string;
  /** Start image variant ID (generation_variants.id) */
  startImageVariantId?: string;
  /** End image variant ID (generation_variants.id) */
  endImageVariantId?: string;
  /** Shot generation ID for the start image (for video-to-timeline tethering) */
  pairShotGenerationId?: string;
  /** Project resolution for output */
  projectResolution?: string;
  /** Callback when frame count changes - for instant timeline updates */
  onFrameCountChange?: (pairShotGenerationId: string, frameCount: number) => void;
  /** Current frame count from timeline positions (source of truth) */
  currentFrameCount?: number;
  /** Maximum frames allowed (77 with smooth continuations, 81 otherwise) */
  maxFrames?: number;
  /** Variant params to load into the form (set externally, e.g., from VariantSelector hover) */
  variantParamsToLoad?: Record<string, unknown> | null;
  /** Callback when variant params have been loaded (to clear the trigger) */
  onVariantParamsLoaded?: () => void;
  /** Structure video type for this segment (null = no structure video coverage) */
  structureVideoType?: 'uni3c' | 'flow' | 'canny' | 'depth' | null;
  /** Shot-level structure video defaults */
  structureVideoDefaults?: {
    motionStrength: number;
    treatment: 'adjust' | 'clip';
    uni3cEndPercent: number;
  };
  /** Structure video URL for preview */
  structureVideoUrl?: string;
  /** Frame range info for this segment's structure video usage */
  structureVideoFrameRange?: {
    segmentStart: number;
    segmentEnd: number;
    videoTotalFrames: number;
    videoFps: number;
  };
  /** Callback to update structure video defaults when "Set as Shot Defaults" is clicked */
  onUpdateStructureVideoDefaults?: (updates: {
    motionStrength?: number;
    treatment?: 'adjust' | 'clip';
    uni3cEndPercent?: number;
  }) => Promise<void>;

  /** Shot generation ID for the end image (for navigation) */
  endImageShotGenerationId?: string;
  /** Callback to navigate to a constituent image by shot_generation.id */
  onNavigateToImage?: (shotGenerationId: string) => void;

  /** Whether the segment currently has a primary variant.
   * When false (orphaned), new generations will default to becoming the primary variant. */
  hasPrimaryVariant?: boolean;

  // Per-segment structure video management (Timeline Mode only)
  /** Whether in timeline mode (shows structure video upload) vs batch mode (preview only) */
  isTimelineMode?: boolean;
  /** Callback to add a structure video for this segment */
  onAddSegmentStructureVideo?: (video: StructureVideoConfigWithMetadata) => void;
  /** Callback to update this segment's structure video */
  onUpdateSegmentStructureVideo?: (updates: Partial<StructureVideoConfigWithMetadata>) => void;
  /** Callback to remove this segment's structure video */
  onRemoveSegmentStructureVideo?: () => void;
}

export const SegmentRegenerateForm: React.FC<SegmentRegenerateFormProps> = ({
  params: initialParams,
  projectId,
  generationId,
  shotId,
  childGenerationId,
  segmentIndex = 0,
  startImageUrl,
  endImageUrl,
  startImageGenerationId,
  endImageGenerationId,
  startImageVariantId,
  endImageVariantId,
  pairShotGenerationId,
  projectResolution,
  onFrameCountChange,
  currentFrameCount,
  maxFrames,
  variantParamsToLoad,
  onVariantParamsLoaded,
  structureVideoType,
  structureVideoDefaults,
  structureVideoUrl,
  structureVideoFrameRange,
  onUpdateStructureVideoDefaults,
  // Navigation to constituent images
  endImageShotGenerationId,
  onNavigateToImage,
  // Whether segment has a primary variant (for defaulting makePrimaryVariant)
  hasPrimaryVariant = true,
  // Per-segment structure video management
  isTimelineMode,
  onAddSegmentStructureVideo,
  onUpdateSegmentStructureVideo,
  onRemoveSegmentStructureVideo,
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // For background task submission with placeholder
  const { addIncomingTask, removeIncomingTask } = useIncomingTasks();

  // Use the combined hook for form props
  const {
    formProps,
    getSettingsForTaskCreation,
    saveSettings,
    updateSettings,
    settings,
    enhancePromptRef,
  } = useSegmentSettingsForm({
    pairShotGenerationId,
    shotId,
    defaults: {
      prompt: '',
      negativePrompt: '',
      numFrames: currentFrameCount ?? initialParams?.num_frames ?? 25,
      // When segment has no primary variant (orphaned), default to making new generation primary
      makePrimaryVariant: !hasPrimaryVariant,
    },
    // Form display options
    segmentIndex,
    startImageUrl,
    endImageUrl,
    modelName: initialParams?.model_name || initialParams?.orchestrator_details?.model_name,
    resolution: projectResolution || initialParams?.parsed_resolution_wh,
    isRegeneration: true,
    buttonLabel: "Regenerate Video",
    showHeader: false,
    queryKeyPrefix: "lightbox-segment-presets",
    // Structure video
    structureVideoDefaults: structureVideoDefaults ?? null,
    structureVideoType,
    structureVideoUrl,
    structureVideoFrameRange,
    onUpdateStructureVideoDefaults,
    // Per-segment structure video management
    isTimelineMode,
    onAddSegmentStructureVideo,
    onUpdateSegmentStructureVideo,
    onRemoveSegmentStructureVideo,
    // Navigation to constituent images
    startImageShotGenerationId: pairShotGenerationId,
    endImageShotGenerationId,
    onNavigateToImage,
    // Frame limit
    maxFrames,
  });

  // Extract enhanced prompt from form props (enhancePromptEnabled and onEnhancePromptChange are now included in formProps)
  const { enhancedPrompt } = formProps;

  // Handle frame count change - wrap to include pairShotGenerationId
  const handleFrameCountChange = useCallback((frameCount: number) => {
    if (pairShotGenerationId && onFrameCountChange) {
      onFrameCountChange(pairShotGenerationId, frameCount);
    }
  }, [pairShotGenerationId, onFrameCountChange]);

  // Build structure video config from props (for task creation)
  // This combines the shot-level structure video with segment-level setting overrides
  const structureVideoForTask = useMemo((): StructureVideoConfig | null => {
    if (!structureVideoUrl || !structureVideoType || !structureVideoFrameRange) {
      return null;
    }

    const effectiveSettings = getSettingsForTaskCreation();
    return {
      path: structureVideoUrl,
      start_frame: structureVideoFrameRange.segmentStart,
      end_frame: structureVideoFrameRange.segmentEnd,
      structure_type: structureVideoType,
      treatment: effectiveSettings.structureTreatment ?? structureVideoDefaults?.treatment ?? 'adjust',
      motion_strength: effectiveSettings.structureMotionStrength ?? structureVideoDefaults?.motionStrength ?? 1.2,
      uni3c_end_percent: effectiveSettings.structureUni3cEndPercent ?? structureVideoDefaults?.uni3cEndPercent ?? 0.1,
    };
  }, [structureVideoUrl, structureVideoType, structureVideoFrameRange, structureVideoDefaults, getSettingsForTaskCreation]);

  // Effect to load variant settings when triggered from outside (e.g., VariantSelector hover button)
  useEffect(() => {
    if (!variantParamsToLoad) return;

    const variantSettings = extractSettingsFromParams(variantParamsToLoad, {
      numFrames: currentFrameCount ?? settings.numFrames,
      makePrimaryVariant: settings.makePrimaryVariant,
    });

    // Update all settings from the variant
    updateSettings({
      prompt: variantSettings.prompt,
      negativePrompt: variantSettings.negativePrompt,
      motionMode: variantSettings.motionMode,
      amountOfMotion: variantSettings.amountOfMotion,
      phaseConfig: variantSettings.phaseConfig,
      selectedPhasePresetId: variantSettings.selectedPhasePresetId,
      loras: variantSettings.loras,
      randomSeed: variantSettings.randomSeed,
      seed: variantSettings.seed,
      numFrames: variantSettings.numFrames,
    });

    // Trigger frame count change callback if provided
    if (onFrameCountChange && pairShotGenerationId && variantSettings.numFrames) {
      onFrameCountChange(pairShotGenerationId, variantSettings.numFrames);
    }

    // Notify parent that we've loaded the params (so it can clear the trigger)
    onVariantParamsLoaded?.();
  }, [variantParamsToLoad]); // Only re-run when variantParamsToLoad changes

  // Handle form submission
  const handleSubmit = useCallback(async () => {
    if (!projectId) {
      toast({
        title: "Error",
        description: "No project selected",
        variant: "destructive",
      });
      return;
    }

    if (!startImageUrl || !endImageUrl) {
      toast({
        title: "Error",
        description: "Missing input images",
        variant: "destructive",
      });
      return;
    }

    // Get effective settings
    const effectiveSettings = getSettingsForTaskCreation();
    // Prioritize existing enhanced prompt if available, otherwise use base prompt
    const promptToEnhance = enhancedPrompt?.trim() || effectiveSettings.prompt?.trim() || '';

    // Read current enhance state from ref (avoids stale closure issue)
    const shouldEnhance = enhancePromptRef.current;

    // If enhance is enabled, use background submission pattern
    if (shouldEnhance && promptToEnhance) {

      // Add placeholder for immediate feedback
      const taskLabel = `Segment ${segmentIndex + 1}`;
      const incomingTaskId = addIncomingTask({
        taskType: 'individual_travel_segment',
        label: taskLabel,
      });

      // Fire and forget - run in background
      (async () => {
        try {
          // Save settings first
          if (pairShotGenerationId) {
            await saveSettings();
          }

          // 1. Call edge function to enhance prompt
          const { data: enhanceResult, error: enhanceError } = await supabase.functions.invoke('ai-prompt', {
            body: {
              task: 'enhance_segment_prompt',
              prompt: promptToEnhance,
              temperature: 0.7,
              numFrames: effectiveSettings.numFrames || currentFrameCount || 25,
            },
          });

          if (enhanceError) {
            console.error('[SegmentRegenerateForm] Error enhancing prompt:', enhanceError);
          }

          const enhancedPromptResult = enhanceResult?.enhanced_prompt?.trim() || promptToEnhance;

          // 2. Apply before/after text to both original and enhanced prompts
          const beforeText = effectiveSettings.textBeforePrompts?.trim() || '';
          const afterText = effectiveSettings.textAfterPrompts?.trim() || '';
          // Original prompt with before/after (what user would have gotten without enhancement)
          const originalPromptWithPrefixes = [beforeText, effectiveSettings.prompt?.trim() || '', afterText].filter(Boolean).join(' ');
          // Enhanced prompt with before/after (the AI-enhanced version)
          const enhancedPromptWithPrefixes = [beforeText, enhancedPromptResult, afterText].filter(Boolean).join(' ');

          // 3. Store enhanced prompt in metadata
          if (pairShotGenerationId && enhancedPromptResult !== promptToEnhance) {
            const { data: current, error: fetchError } = await supabase
              .from('shot_generations')
              .select('metadata')
              .eq('id', pairShotGenerationId)
              .single();

            if (fetchError) {
              console.error('[EnhancedPromptSave] ❌ Error fetching current metadata:', fetchError);
            }

            const currentMetadata = (current?.metadata as Record<string, unknown>) || {};

            const { error: updateError } = await supabase
              .from('shot_generations')
              .update({
                metadata: {
                  ...currentMetadata,
                  enhanced_prompt: enhancedPromptResult,
                  // Store the base prompt so we can reveal it when clearing enhanced
                  base_prompt_for_enhancement: effectiveSettings.prompt?.trim() || '',
                },
              })
              .eq('id', pairShotGenerationId);

            if (updateError) {
              console.error('[EnhancedPromptSave] ❌ Error saving enhanced_prompt to metadata:', updateError);
            }

            queryClient.invalidateQueries({ queryKey: queryKeys.segments.pairMetadata(pairShotGenerationId) });
          }

          // 4. Build task params with original prompt as base_prompt, enhanced as separate field
          // The worker should prefer enhanced_prompt over base_prompt when present
          const taskParams = buildTaskParams(
            { ...effectiveSettings, prompt: originalPromptWithPrefixes },
            {
              projectId,
              shotId,
              generationId,
              childGenerationId,
              segmentIndex,
              startImageUrl,
              endImageUrl,
              startImageGenerationId,
              endImageGenerationId,
              startImageVariantId,
              endImageVariantId,
              pairShotGenerationId,
              projectResolution,
              enhancedPrompt: enhancedPromptWithPrefixes,
              structureVideo: structureVideoForTask,
            }
          );

          // 5. Create task
          const result = await createIndividualTravelSegmentTask(taskParams);

          if (!result.task_id) {
            throw new Error(result.error || 'Failed to create task');
          }

        } catch (error) {
          handleError(error, { context: 'SegmentRegenerateForm', toastTitle: 'Failed to create task' });
        } finally {
          await queryClient.refetchQueries({ queryKey: queryKeys.tasks.paginatedAll });
          await queryClient.refetchQueries({ queryKey: queryKeys.tasks.statusCountsAll });
          removeIncomingTask(incomingTaskId);
        }
      })();

      return;
    }

    // Standard submission (no enhancement) - also use background pattern for fast UI
    const taskLabel = `Segment ${segmentIndex + 1}`;
    const incomingTaskId = addIncomingTask({
      taskType: 'individual_travel_segment',
      label: taskLabel,
    });

    (async () => {
      try {
        // Save settings first
        if (pairShotGenerationId) {
          await saveSettings();
        }

        // Apply before/after text to the prompt
        const beforeText = effectiveSettings.textBeforePrompts?.trim() || '';
        const afterText = effectiveSettings.textAfterPrompts?.trim() || '';
        const basePrompt = effectiveSettings.prompt?.trim() || '';
        const finalPrompt = [beforeText, basePrompt, afterText].filter(Boolean).join(' ');

        // Build task params using effective settings with final prompt
        const taskParams = buildTaskParams({ ...effectiveSettings, prompt: finalPrompt }, {
          projectId,
          shotId,
          generationId,
          childGenerationId,
          segmentIndex,
          startImageUrl,
          endImageUrl,
          startImageGenerationId,
          endImageGenerationId,
          startImageVariantId,
          endImageVariantId,
          pairShotGenerationId,
          projectResolution,
          structureVideo: structureVideoForTask,
        });

        // Create task
        const result = await createIndividualTravelSegmentTask(taskParams);

        if (!result.task_id) {
          throw new Error(result.error || 'Failed to create task');
        }
      } catch (error) {
        handleError(error, { context: 'SegmentRegenerateForm', toastTitle: 'Failed to create task' });
      } finally {
        await queryClient.refetchQueries({ queryKey: queryKeys.tasks.paginatedAll });
        await queryClient.refetchQueries({ queryKey: queryKeys.tasks.statusCountsAll });
        removeIncomingTask(incomingTaskId);
      }
    })();
  }, [
    projectId,
    getSettingsForTaskCreation,
    saveSettings,
    shotId,
    generationId,
    childGenerationId,
    segmentIndex,
    startImageUrl,
    endImageUrl,
    startImageGenerationId,
    endImageGenerationId,
    startImageVariantId,
    endImageVariantId,
    pairShotGenerationId,
    projectResolution,
    toast,
    enhancePromptRef,
    addIncomingTask,
    removeIncomingTask,
    queryClient,
    structureVideoForTask,
  ]);

  return (
    <SegmentSettingsForm
      {...formProps}
      onSubmit={handleSubmit}
      onFrameCountChange={handleFrameCountChange}
      edgeExtendAmount={6}
    />
  );
};
