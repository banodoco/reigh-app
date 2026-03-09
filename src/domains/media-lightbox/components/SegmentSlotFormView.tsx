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
import { toast } from '@/shared/components/ui/runtime/sonner';
import { useSegmentSettingsForm } from '@/shared/hooks/useSegmentSettingsForm';
import { SegmentSettingsForm } from '@/shared/components/SegmentSettingsForm/SegmentSettingsForm';
import { useTaskPlaceholder } from '@/shared/hooks/tasks/useTaskPlaceholder';
import { submitSegmentTask, buildStructureVideoForTask } from './submitSegmentTask';
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
  const queryClient = useQueryClient();
  const run = useTaskPlaceholder();

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
  const structureVideoForTask = useMemo(
    () => buildStructureVideoForTask(segmentSlotMode, getSettingsForTaskCreation),
    [segmentSlotMode, getSettingsForTaskCreation],
  );

  // Handle frame count change
  const handleFrameCountChange = useCallback((frameCount: number) => {
    if (pairShotGenerationId && segmentSlotMode.onFrameCountChange) {
      segmentSlotMode.onFrameCountChange(pairShotGenerationId, frameCount);
    }
  }, [pairShotGenerationId, segmentSlotMode]);

  // Tab key navigation between segments (capture phase on document).
  // Arrow keys + Escape are handled by useLightboxNavigation (also capture phase).
  // Capture phase ensures the handler fires before any Base-UI internals that
  // might call stopPropagation during bubble phase.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (!e.shiftKey && hasNext) {
        e.preventDefault();
        onNavNext();
      } else if (e.shiftKey && hasPrevious) {
        e.preventDefault();
        onNavPrev();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true); // capture phase
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [hasNext, hasPrevious, onNavNext, onNavPrev]);

  // Handle form submission
  const handleSubmit = useCallback(async (): Promise<void> => {
    const isTrailingSegment = segmentSlotMode.pairData.endImage === null;

    if (!segmentSlotMode.projectId) {
      toast({ title: "Error", description: "No project selected", variant: "destructive" });
      return;
    }
    if (!startImageUrl) {
      toast({ title: "Error", description: "Missing start image", variant: "destructive" });
      return;
    }
    if (!isTrailingSegment && !endImageUrl) {
      toast({ title: "Error", description: "Missing end image", variant: "destructive" });
      return;
    }

    submitSegmentTask({
      taskLabel: `Segment ${segmentSlotMode.currentIndex + 1}`,
      errorContext: 'SegmentSlotFormView',
      getSettings: getSettingsForTaskCreation,
      saveSettings,
      shouldSaveSettings: !!pairShotGenerationId,
      shouldEnhance: enhancePromptRef.current,
      enhancedPrompt: enhancedPrompt,
      defaultNumFrames: segmentSlotMode.pairData.frames || 25,
      images: {
        startImageUrl,
        endImageUrl,
        startImageGenerationId: segmentSlotMode.pairData.startImage?.generationId,
        endImageGenerationId: segmentSlotMode.pairData.endImage?.generationId,
        startImageVariantId: segmentSlotMode.pairData.startImage?.primaryVariantId,
        endImageVariantId: segmentSlotMode.pairData.endImage?.primaryVariantId,
      },
      task: {
        projectId: segmentSlotMode.projectId,
        shotId: segmentSlotMode.shotId,
        generationId: segmentSlotMode.parentGenerationId,
        childGenerationId: segmentSlotMode.activeChildGenerationId,
        segmentIndex: segmentSlotMode.currentIndex,
        pairShotGenerationId,
        projectResolution: segmentSlotMode.projectResolution,
        structureInput: structureVideoForTask,
      },
      run,
      queryClient,
      onGenerateStarted: () => segmentSlotMode.onGenerateStarted?.(pairShotGenerationId),
    });
  }, [
    segmentSlotMode,
    pairShotGenerationId,
    startImageUrl,
    endImageUrl,
    getSettingsForTaskCreation,
    saveSettings,
    toast,
    enhancePromptRef,
    run,
    queryClient,
    structureVideoForTask,
    enhancedPrompt,
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
