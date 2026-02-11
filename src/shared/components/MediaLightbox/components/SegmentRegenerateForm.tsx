/**
 * SegmentRegenerateForm Component
 *
 * A form for regenerating a video segment from within the MediaLightbox.
 * Uses the controlled SegmentSettingsForm pattern.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/shared/hooks/use-toast';
import { useSegmentSettingsForm } from '@/shared/hooks/useSegmentSettingsForm';
import { SegmentSettingsForm } from '@/shared/components/SegmentSettingsForm';
import { extractSettingsFromParams } from '@/shared/components/segmentSettingsMigration';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';
import { submitSegmentTask, buildStructureVideoForTask } from './submitSegmentTask';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';

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
  const structureVideoForTask = useMemo(
    () => buildStructureVideoForTask(
      { structureVideoUrl, structureVideoType, structureVideoFrameRange, structureVideoDefaults },
      getSettingsForTaskCreation,
    ),
    [structureVideoUrl, structureVideoType, structureVideoFrameRange, structureVideoDefaults, getSettingsForTaskCreation],
  );

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
  const handleSubmit = useCallback(() => {
    if (!projectId) {
      toast({ title: "Error", description: "No project selected", variant: "destructive" });
      return;
    }
    if (!startImageUrl || !endImageUrl) {
      toast({ title: "Error", description: "Missing input images", variant: "destructive" });
      return;
    }

    submitSegmentTask({
      taskLabel: `Segment ${segmentIndex + 1}`,
      errorContext: 'SegmentRegenerateForm',
      getSettings: getSettingsForTaskCreation,
      saveSettings,
      shouldSaveSettings: !!pairShotGenerationId,
      shouldEnhance: enhancePromptRef.current,
      enhancedPrompt: enhancedPrompt,
      defaultNumFrames: currentFrameCount || 25,
      images: {
        startImageUrl,
        endImageUrl,
        startImageGenerationId,
        endImageGenerationId,
        startImageVariantId,
        endImageVariantId,
      },
      task: {
        projectId,
        shotId,
        generationId,
        childGenerationId,
        segmentIndex,
        pairShotGenerationId,
        projectResolution,
        structureVideo: structureVideoForTask,
      },
      addIncomingTask,
      removeIncomingTask,
      queryClient,
    });
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
    currentFrameCount,
    enhancedPrompt,
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
