/**
 * SegmentSlotFormView Component
 *
 * Renders the form-only view for a segment slot when no video exists yet.
 * Used within MediaLightbox when in segment slot mode without a video.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/shared/components/ui/button';
import { X } from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import { handleError } from '@/shared/lib/errorHandler';
import { useSegmentSettingsForm } from '@/shared/hooks/useSegmentSettingsForm';
import { SegmentSettingsForm } from '@/shared/components/SegmentSettingsForm';
import { buildTaskParams } from '@/shared/components/segmentSettingsUtils';
import { createIndividualTravelSegmentTask } from '@/shared/lib/tasks/individualTravelSegment';
import type { StructureVideoConfig } from '@/shared/lib/tasks/travelBetweenImages';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/shared/lib/queryKeys';
import type { SegmentSlotModeData } from '../types';
import { NavigationArrows } from './NavigationArrows';

interface SegmentSlotFormViewProps {
  segmentSlotMode: SegmentSlotModeData;
  onClose: () => void;
  onNavPrev: () => void;
  onNavNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  /** Read-only mode - hides the form and shows info only */
  readOnly?: boolean;
}

export const SegmentSlotFormView: React.FC<SegmentSlotFormViewProps> = ({
  segmentSlotMode,
  onClose,
  onNavPrev,
  onNavNext,
  hasPrevious,
  hasNext,
  readOnly = false,
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // For background task submission with placeholder
  const { addIncomingTask, removeIncomingTask } = useIncomingTasks();

  const pairShotGenerationId = segmentSlotMode.pairData.startImage?.id;
  const startImageUrl = segmentSlotMode.pairData.startImage?.url ?? segmentSlotMode.pairData.startImage?.thumbUrl;
  const endImageUrl = segmentSlotMode.pairData.endImage?.url ?? segmentSlotMode.pairData.endImage?.thumbUrl;

  // Use the combined hook for form props
  const { formProps, getSettingsForTaskCreation, saveSettings, enhancePromptRef } = useSegmentSettingsForm({
    pairShotGenerationId,
    shotId: segmentSlotMode.shotId,
    defaults: {
      prompt: segmentSlotMode.pairPrompt ?? segmentSlotMode.defaultPrompt ?? '',
      negativePrompt: segmentSlotMode.pairNegativePrompt ?? segmentSlotMode.defaultNegativePrompt ?? '',
      numFrames: segmentSlotMode.pairData.frames ?? 25,
    },
    // Form display options
    segmentIndex: segmentSlotMode.currentIndex,
    startImageUrl,
    endImageUrl,
    resolution: segmentSlotMode.projectResolution,
    isRegeneration: false,
    buttonLabel: "Generate Segment",
    showHeader: false,
    queryKeyPrefix: `segment-slot-${segmentSlotMode.currentIndex}`,
    // Structure video
    structureVideoDefaults: segmentSlotMode.structureVideoDefaults ?? null,
    structureVideoType: segmentSlotMode.structureVideoType,
    structureVideoUrl: segmentSlotMode.structureVideoUrl,
    structureVideoFrameRange: segmentSlotMode.structureVideoFrameRange,
    // Per-segment structure video management (Timeline Mode only)
    isTimelineMode: segmentSlotMode.isTimelineMode,
    onAddSegmentStructureVideo: segmentSlotMode.onAddSegmentStructureVideo,
    onUpdateSegmentStructureVideo: segmentSlotMode.onUpdateSegmentStructureVideo,
    onRemoveSegmentStructureVideo: segmentSlotMode.onRemoveSegmentStructureVideo,
    // Navigation to constituent images
    startImageShotGenerationId: pairShotGenerationId,
    endImageShotGenerationId: segmentSlotMode.pairData.endImage?.id,
    onNavigateToImage: segmentSlotMode.onNavigateToImage,
    // Frame limit
    maxFrames: segmentSlotMode.maxFrameLimit,
  });

  // Extract enhanced prompt from form props (enhancePromptEnabled and onEnhancePromptChange are now included in formProps)
  const { enhancedPrompt } = formProps;

  // Build structure video config from props (for task creation)
  // This combines the shot-level structure video with segment-level setting overrides
  const structureVideoForTask = useMemo((): StructureVideoConfig | null => {
    const { structureVideoUrl, structureVideoType, structureVideoFrameRange, structureVideoDefaults } = segmentSlotMode;
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
  }, [segmentSlotMode, getSettingsForTaskCreation]);

  // Handle frame count change
  const handleFrameCountChange = useCallback((frameCount: number) => {
    if (pairShotGenerationId && segmentSlotMode.onFrameCountChange) {
      segmentSlotMode.onFrameCountChange(pairShotGenerationId, frameCount);
    }
  }, [pairShotGenerationId, segmentSlotMode.onFrameCountChange]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in a textarea
      if (document.activeElement?.tagName === 'TEXTAREA') return;

      if (e.key === 'Tab' && !e.shiftKey && hasNext) {
        e.preventDefault();
        onNavNext();
      } else if (e.key === 'Tab' && e.shiftKey && hasPrevious) {
        e.preventDefault();
        onNavPrev();
      } else if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault();
        onNavNext();
      } else if (e.key === 'ArrowLeft' && hasPrevious) {
        e.preventDefault();
        onNavPrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasNext, hasPrevious, onNavNext, onNavPrev]);

  // Handle form submission
  const handleSubmit = useCallback(async () => {
    // Detect trailing segment (single-image-to-video with no end image)
    const isTrailingSegment = segmentSlotMode.pairData.endImage === null;

    if (!segmentSlotMode.projectId) {
      console.error('[TrailingGen] ❌ No project selected');
      toast({
        title: "Error",
        description: "No project selected",
        variant: "destructive",
      });
      return;
    }

    // For trailing segments (single-image-to-video), endImageUrl is intentionally undefined
    if (!startImageUrl) {
      console.error('[TrailingGen] ❌ Missing start image');
      toast({
        title: "Error",
        description: "Missing start image",
        variant: "destructive",
      });
      return;
    }

    // For regular pairs, require end image
    if (!isTrailingSegment && !endImageUrl) {
      console.error('[TrailingGen] ❌ Missing end image for non-trailing segment');
      toast({
        title: "Error",
        description: "Missing end image",
        variant: "destructive",
      });
      return;
    }

    // Get effective settings
    const effectiveSettings = getSettingsForTaskCreation();
    // Prioritize existing enhanced prompt if available, otherwise use base prompt
    const promptToEnhance = enhancedPrompt?.trim() || effectiveSettings.prompt?.trim() || '';

    // Read current enhance state from ref (avoids stale closure issue when user toggles then immediately submits)
    const shouldEnhance = enhancePromptRef.current;

    // If enhance is enabled, use background submission pattern
    if (shouldEnhance && promptToEnhance) {

      // Add placeholder for immediate feedback
      const taskLabel = `Segment ${segmentSlotMode.currentIndex + 1}`;
      const incomingTaskId = addIncomingTask({
        taskType: 'individual_travel_segment',
        label: taskLabel,
      });

      // Notify parent for optimistic UI
      segmentSlotMode.onGenerateStarted?.(pairShotGenerationId);

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
              numFrames: effectiveSettings.numFrames || segmentSlotMode.pairData.frames || 25,
            },
          });

          if (enhanceError) {
            console.error('[SegmentSlotFormView] Error enhancing prompt:', enhanceError);
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
              projectId: segmentSlotMode.projectId,
              shotId: segmentSlotMode.shotId,
              generationId: segmentSlotMode.parentGenerationId,
              childGenerationId: segmentSlotMode.activeChildGenerationId,
              segmentIndex: segmentSlotMode.currentIndex,
              startImageUrl,
              endImageUrl,
              startImageGenerationId: segmentSlotMode.pairData.startImage?.generationId,
              endImageGenerationId: segmentSlotMode.pairData.endImage?.generationId,
              startImageVariantId: segmentSlotMode.pairData.startImage?.primaryVariantId,
              endImageVariantId: segmentSlotMode.pairData.endImage?.primaryVariantId,
              pairShotGenerationId,
              projectResolution: segmentSlotMode.projectResolution,
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
          handleError(error, { context: 'SegmentSlotFormView', toastTitle: 'Failed to create task' });
        } finally {
          await queryClient.refetchQueries({ queryKey: queryKeys.tasks.paginatedAll });
          await queryClient.refetchQueries({ queryKey: queryKeys.tasks.statusCountsAll });
          removeIncomingTask(incomingTaskId);
        }
      })();

      return;
    }

    // Standard submission (no enhancement) - also use background pattern for fast UI
    const taskLabel = `Segment ${segmentSlotMode.currentIndex + 1}`;
    const incomingTaskId = addIncomingTask({
      taskType: 'individual_travel_segment',
      label: taskLabel,
    });

    // Notify parent for optimistic UI
    segmentSlotMode.onGenerateStarted?.(pairShotGenerationId);

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
          projectId: segmentSlotMode.projectId,
          shotId: segmentSlotMode.shotId,
          generationId: segmentSlotMode.parentGenerationId,
          childGenerationId: segmentSlotMode.activeChildGenerationId,
          segmentIndex: segmentSlotMode.currentIndex,
          startImageUrl,
          endImageUrl,
          startImageGenerationId: segmentSlotMode.pairData.startImage?.generationId,
          endImageGenerationId: segmentSlotMode.pairData.endImage?.generationId,
          startImageVariantId: segmentSlotMode.pairData.startImage?.primaryVariantId,
          endImageVariantId: segmentSlotMode.pairData.endImage?.primaryVariantId,
          pairShotGenerationId,
          projectResolution: segmentSlotMode.projectResolution,
          structureVideo: structureVideoForTask,
        });

        // Create task
        const result = await createIndividualTravelSegmentTask(taskParams);

        if (!result.task_id) {
          throw new Error(result.error || 'Failed to create task');
        }

      } catch (error) {
        handleError(error, { context: 'SegmentSlotFormView', toastTitle: 'Failed to create task' });
      } finally {
        await queryClient.refetchQueries({ queryKey: queryKeys.tasks.paginatedAll });
        await queryClient.refetchQueries({ queryKey: queryKeys.tasks.statusCountsAll });
        removeIncomingTask(incomingTaskId);
      }
    })();
  }, [
    segmentSlotMode,
    pairShotGenerationId,
    startImageUrl,
    endImageUrl,
    getSettingsForTaskCreation,
    saveSettings,
    toast,
    enhancePromptRef,
    addIncomingTask,
    removeIncomingTask,
    queryClient,
    structureVideoForTask,
  ]);

  return (
    <div className="w-full h-full relative">
      {/* Backdrop - click/tap to close. touch-none prevents iOS rubber-banding. */}
      <div
        className="absolute inset-0 bg-black/90 touch-none"
        onClick={onClose}
        onTouchEnd={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
      />

      {/* Content container - positioned above backdrop */}
      <div className="relative w-full h-full flex items-center justify-center p-4 pointer-events-none">
        {/* Wrapper to position navigation arrows closer to the form */}
        <div className="relative max-w-2xl w-full flex items-center justify-center">
        {/* Floating Navigation Arrows - positioned relative to this wrapper */}
        <div className="pointer-events-auto">
          <NavigationArrows
            showNavigation={true}
            readOnly={readOnly}
            onPrevious={onNavPrev}
            onNext={onNavNext}
            hasPrevious={hasPrevious}
            hasNext={hasNext}
            variant="desktop"
          />
        </div>

        <div className="bg-background rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto overscroll-none relative pointer-events-auto touch-auto">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b px-4 py-3 flex items-center justify-center z-10">
          <div className="text-center">
            <h2 className="text-lg font-medium">
              Segment {segmentSlotMode.currentIndex + 1}
            </h2>
            <p className="text-sm text-muted-foreground">
              {segmentSlotMode.pairData.frames} frames
            </p>
          </div>
        </div>

        {/* Close button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="absolute top-2 right-2 h-8 w-8 p-0 z-20"
          title="Close (Escape)"
        >
          <X className="h-4 w-4" />
        </Button>

        {/* Segment Settings Form - hidden in readOnly mode */}
        <div className="p-4">
          {readOnly ? (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-sm">Segment {segmentSlotMode.currentIndex + 1}</p>
              <p className="text-xs mt-1">No video generated yet</p>
            </div>
          ) : (
            <>
              <SegmentSettingsForm
                {...formProps}
                onSubmit={handleSubmit}
                onFrameCountChange={handleFrameCountChange}
              />

              {/* Show warning if missing context */}
              {!segmentSlotMode.parentGenerationId && !segmentSlotMode.shotId && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Cannot generate: Missing shot context. Please save your shot first.
                </p>
              )}
            </>
          )}
        </div>
      </div>
      </div>
      </div>
    </div>
  );
};
