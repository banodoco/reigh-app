/**
 * SegmentRegenerateForm Component
 *
 * A form for regenerating a video segment from within the MediaLightbox.
 * Uses the controlled SegmentSettingsForm pattern.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/shared/components/ui/toast';
import { useSegmentSettingsForm } from '@/shared/hooks/useSegmentSettingsForm';
import { SegmentSettingsForm } from '@/shared/components/SegmentSettingsForm';
import { extractSettingsFromParams } from '@/shared/components/SegmentSettingsForm/segmentSettingsMigration';
import { useTaskPlaceholder } from '@/shared/hooks/tasks/useTaskPlaceholder';
import { submitSegmentTask, buildStructureVideoForTask } from './submitSegmentTask';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export interface SegmentRegenerateTaskProps {
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
}

export interface SegmentRegenerateImageProps {
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
  /** Shot generation ID for the end image (for navigation) */
  endImageShotGenerationId?: string;
  /** Callback to navigate to a constituent image by shot_generation.id */
  onNavigateToImage?: (shotGenerationId: string) => void;
}

export interface SegmentRegenerateFrameSyncProps {
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
}

export interface SegmentRegenerateStructureDefaultsProps {
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
}

export interface SegmentRegenerateStructureManagementProps {
  /** Whether in timeline mode (shows structure video upload) vs batch mode (preview only) */
  isTimelineMode?: boolean;
  /** Callback to add a structure video for this segment */
  onAddSegmentStructureVideo?: (video: StructureVideoConfigWithMetadata) => void;
  /** Callback to update this segment's structure video */
  onUpdateSegmentStructureVideo?: (updates: Partial<StructureVideoConfigWithMetadata>) => void;
  /** Callback to remove this segment's structure video */
  onRemoveSegmentStructureVideo?: () => void;
}

export interface SegmentRegenerateFormProps
  extends SegmentRegenerateTaskProps,
    SegmentRegenerateImageProps,
    SegmentRegenerateFrameSyncProps,
    SegmentRegenerateStructureDefaultsProps,
    SegmentRegenerateStructureManagementProps {}

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
  // Per-segment structure video management
  isTimelineMode,
  onAddSegmentStructureVideo,
  onUpdateSegmentStructureVideo,
  onRemoveSegmentStructureVideo,
}) => {
  const queryClient = useQueryClient();
  const orchestratorDetails = asRecord(initialParams.orchestrator_details);
  const initialNumFrames = asNumber(initialParams.num_frames);
  const initialModelName = asString(initialParams.model_name) ?? asString(orchestratorDetails.model_name);
  const initialResolution = asString(initialParams.parsed_resolution_wh);

  const run = useTaskPlaceholder();

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
      numFrames: currentFrameCount ?? initialNumFrames ?? 25,
      // Regeneration should replace the current video in the slot by default.
      // The user can uncheck this in the form to create a non-primary variant instead.
      makePrimaryVariant: true,
    },
    // Form display options
    segmentIndex,
    startImageUrl,
    endImageUrl,
    modelName: initialModelName,
    resolution: projectResolution ?? initialResolution,
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
  }, [
    variantParamsToLoad,
    currentFrameCount,
    settings.numFrames,
    settings.makePrimaryVariant,
    updateSettings,
    onFrameCountChange,
    pairShotGenerationId,
    onVariantParamsLoaded,
  ]);

  // Handle form submission
  const handleSubmit = useCallback(async (): Promise<void> => {
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
      run,
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
    enhancePromptRef,
    run,
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
