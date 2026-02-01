/**
 * SegmentSlotFormView Component
 *
 * Renders the form-only view for a segment slot when no video exists yet.
 * Used within MediaLightbox when in segment slot mode without a video.
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/shared/components/ui/button';
import { X } from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import { handleError } from '@/shared/lib/errorHandler';
import { useSegmentSettingsForm } from '@/shared/hooks/useSegmentSettingsForm';
import { SegmentSettingsForm } from '@/shared/components/SegmentSettingsForm';
import { buildTaskParams } from '@/shared/components/segmentSettingsUtils';
import { createIndividualTravelSegmentTask } from '@/shared/lib/tasks/individualTravelSegment';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';
import { useTaskStatusCounts } from '@/shared/hooks/useTasks';
import { supabase } from '@/integrations/supabase/client';
import type { SegmentSlotModeData } from '../types';
import { NavigationArrows } from './NavigationArrows';

export interface SegmentSlotFormViewProps {
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  // For background task submission with placeholder
  const { addIncomingTask, removeIncomingTask } = useIncomingTasks();
  const { data: taskStatusCounts } = useTaskStatusCounts(segmentSlotMode.projectId ?? undefined);

  const pairShotGenerationId = segmentSlotMode.pairData.startImage?.id;
  const startImageUrl = segmentSlotMode.pairData.startImage?.url ?? segmentSlotMode.pairData.startImage?.thumbUrl;
  const endImageUrl = segmentSlotMode.pairData.endImage?.url ?? segmentSlotMode.pairData.endImage?.thumbUrl;

  // [FrameSyncDebug] Log the frame count received by the modal
  console.log('[FrameSyncDebug] 🖼️ SegmentSlotFormView DISPLAYING:', {
    frames: segmentSlotMode.pairData.frames,
    startFrame: segmentSlotMode.pairData.startFrame,
    endFrame: segmentSlotMode.pairData.endFrame,
    pairIndex: segmentSlotMode.currentIndex,
  });

  // [SegmentNavDebug] Log what we're getting for constituent image navigation
  console.log('[SegmentNavDebug] SegmentSlotFormView image data:', {
    hasOnNavigateToImage: !!segmentSlotMode.onNavigateToImage,
    startImageId: pairShotGenerationId?.substring(0, 8),
    endImageId: segmentSlotMode.pairData.endImage?.id?.substring(0, 8),
    startImageUrl: startImageUrl?.substring(0, 50),
    endImageUrl: endImageUrl?.substring(0, 50),
    startImageKeys: segmentSlotMode.pairData.startImage ? Object.keys(segmentSlotMode.pairData.startImage) : [],
    endImageKeys: segmentSlotMode.pairData.endImage ? Object.keys(segmentSlotMode.pairData.endImage) : [],
  });

  // Use the combined hook for form props
  const { formProps, getSettingsForTaskCreation, saveSettings, persistedEnhancePromptEnabled, saveEnhancePromptEnabled } = useSegmentSettingsForm({
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

  // Extract enhanced prompt from form props
  const { enhancedPrompt } = formProps;

  // Enhance prompt toggle state
  // Use persisted preference if available, otherwise default based on enhanced prompt existence
  const defaultEnhanceEnabled = useMemo(() => !enhancedPrompt?.trim(), [enhancedPrompt]);
  const effectiveEnhanceEnabled = persistedEnhancePromptEnabled ?? defaultEnhanceEnabled;

  // Ref for submit handler - updated synchronously on toggle, not waiting for cache refetch
  const effectiveEnhanceEnabledRef = useRef(effectiveEnhanceEnabled);
  // Keep in sync during normal renders
  effectiveEnhanceEnabledRef.current = effectiveEnhanceEnabled;

  // Handle enhance toggle changes - persist to database AND update ref synchronously
  const handleEnhancePromptChange = useCallback((enabled: boolean) => {
    effectiveEnhanceEnabledRef.current = enabled; // Update ref immediately for submit handler
    saveEnhancePromptEnabled(enabled); // Persist to database
  }, [saveEnhancePromptEnabled]);

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
    if (!segmentSlotMode.projectId) {
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
        description: "Missing start or end image",
        variant: "destructive",
      });
      return;
    }

    // Get effective settings
    const effectiveSettings = getSettingsForTaskCreation();
    // Prioritize existing enhanced prompt if available, otherwise use base prompt
    const promptToEnhance = enhancedPrompt?.trim() || effectiveSettings.prompt?.trim() || '';

    // Read current enhance state from ref (avoids stale closure issue when user toggles then immediately submits)
    const shouldEnhance = effectiveEnhanceEnabledRef.current;

    // Log the enhance decision
    console.log('[EnhancedPromptSave] 🔍 Submit handler called:', {
      shouldEnhance,
      effectiveEnhanceEnabled, // May be stale if user just toggled
      hasPromptToEnhance: !!promptToEnhance,
      promptToEnhancePreview: promptToEnhance?.substring(0, 50) || '(empty)',
      pairShotGenerationId: pairShotGenerationId?.substring(0, 8) || '(none)',
      existingEnhancedPrompt: enhancedPrompt?.substring(0, 50) || '(none)',
    });

    // If enhance is enabled, use background submission pattern
    if (shouldEnhance && promptToEnhance) {
      console.log('[EnhancedPromptSave] 🚀 Starting background submission with prompt enhancement');

      // Add placeholder for immediate feedback
      const taskLabel = `Segment ${segmentSlotMode.currentIndex + 1}`;
      const currentBaseline = taskStatusCounts?.processing ?? 0;
      const incomingTaskId = addIncomingTask({
        taskType: 'individual_travel_segment',
        label: taskLabel,
        baselineCount: currentBaseline,
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
          console.log('[SegmentSlotFormView] 📝 Calling ai-prompt edge function to enhance prompt...');
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
          console.log('[SegmentSlotFormView] ✅ Enhanced prompt:', enhancedPromptResult.substring(0, 80) + '...');

          // 2. Apply before/after text to both original and enhanced prompts
          const beforeText = effectiveSettings.textBeforePrompts?.trim() || '';
          const afterText = effectiveSettings.textAfterPrompts?.trim() || '';
          // Original prompt with before/after (what user would have gotten without enhancement)
          const originalPromptWithPrefixes = [beforeText, effectiveSettings.prompt?.trim() || '', afterText].filter(Boolean).join(' ');
          // Enhanced prompt with before/after (the AI-enhanced version)
          const enhancedPromptWithPrefixes = [beforeText, enhancedPromptResult, afterText].filter(Boolean).join(' ');
          console.log('[SegmentSlotFormView] 📝 Original prompt with before/after:', originalPromptWithPrefixes.substring(0, 100) + '...');
          console.log('[SegmentSlotFormView] 📝 Enhanced prompt with before/after:', enhancedPromptWithPrefixes.substring(0, 100) + '...');

          // 3. Store enhanced prompt in metadata
          if (pairShotGenerationId && enhancedPromptResult !== promptToEnhance) {
            console.log('[EnhancedPromptSave] 📥 Fetching current metadata for pairShotGenerationId:', pairShotGenerationId.substring(0, 8));
            const { data: current, error: fetchError } = await supabase
              .from('shot_generations')
              .select('metadata')
              .eq('id', pairShotGenerationId)
              .single();

            if (fetchError) {
              console.error('[EnhancedPromptSave] ❌ Error fetching current metadata:', fetchError);
            }

            const currentMetadata = (current?.metadata as Record<string, any>) || {};
            console.log('[EnhancedPromptSave] 📝 Saving enhanced_prompt to metadata:', {
              pairShotGenerationId: pairShotGenerationId.substring(0, 8),
              enhancedPromptPreview: enhancedPromptResult.substring(0, 50) + '...',
              basePromptPreview: (effectiveSettings.prompt?.trim() || '').substring(0, 50) + '...',
            });

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
            } else {
              console.log('[EnhancedPromptSave] ✅ Enhanced prompt saved to metadata successfully');
            }

            queryClient.invalidateQueries({ queryKey: ['pair-metadata', pairShotGenerationId] });
          } else {
            console.log('[EnhancedPromptSave] ⏭️ Skipping save:', {
              hasPairShotGenerationId: !!pairShotGenerationId,
              enhancedPromptMatchesInput: enhancedPromptResult === promptToEnhance,
            });
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
              pairShotGenerationId,
              projectResolution: segmentSlotMode.projectResolution,
              enhancedPrompt: enhancedPromptWithPrefixes,
            }
          );

          // 5. Create task
          const result = await createIndividualTravelSegmentTask(taskParams);

          if (!result.task_id) {
            throw new Error(result.error || 'Failed to create task');
          }

          console.log('[SegmentSlotFormView] ✅ Task created successfully:', result.task_id);
        } catch (error) {
          handleError(error, { context: 'SegmentSlotFormView', toastTitle: 'Failed to create task' });
        } finally {
          await queryClient.refetchQueries({ queryKey: ['tasks', 'paginated'] });
          await queryClient.refetchQueries({ queryKey: ['task-status-counts'] });
          removeIncomingTask(incomingTaskId);
        }
      })();

      return;
    }

    // Standard submission (no enhancement)
    setIsSubmitting(true);

    try {
      // Save settings first
      if (pairShotGenerationId) {
        await saveSettings();
      }

      // Notify parent for optimistic UI
      segmentSlotMode.onGenerateStarted?.(pairShotGenerationId);

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
        pairShotGenerationId,
        projectResolution: segmentSlotMode.projectResolution,
      });

      // Create task
      const result = await createIndividualTravelSegmentTask(taskParams);

      if (!result.task_id) {
        throw new Error(result.error || 'Failed to create task');
      }
    } catch (error) {
      handleError(error, { context: 'SegmentSlotFormView', toastTitle: 'Failed to create task' });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    segmentSlotMode,
    pairShotGenerationId,
    startImageUrl,
    endImageUrl,
    getSettingsForTaskCreation,
    saveSettings,
    toast,
    effectiveEnhanceEnabled,
    addIncomingTask,
    removeIncomingTask,
    taskStatusCounts,
    queryClient,
  ]);

  return (
    <div className="w-full h-full relative">
      {/* Backdrop - click/tap to close */}
      <div
        className="absolute inset-0 bg-black/90"
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

        <div className="bg-background rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto relative pointer-events-auto">
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
                isSubmitting={isSubmitting}
                onFrameCountChange={handleFrameCountChange}
                enhancePromptEnabled={effectiveEnhanceEnabled}
                onEnhancePromptChange={handleEnhancePromptChange}
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

export default SegmentSlotFormView;
