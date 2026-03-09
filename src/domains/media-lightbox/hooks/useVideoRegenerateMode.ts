/**
 * useVideoRegenerateMode - Manages video segment regeneration
 *
 * Handles:
 * - Fetching shot data (aspect ratio, canonical structure settings)
 * - Computing effective resolution for regeneration
 * - Determining if regeneration is available
 * - Extracting segment images
 * - Reapplying canonical shot-level structure defaults onto regenerated tasks
 * - Computing all props for SegmentRegenerateForm
 */

import { useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/media/aspectRatios';
import {
  buildStructureGuidanceFromControls,
  normalizeStructureGuidance,
  resolveStructureGuidanceControls,
} from '@/shared/lib/tasks/structureGuidance';
import { extractSegmentImages } from '@/shared/lib/tasks/travelBetweenImages/segmentImages';
import { updateToolSettingsSupabase } from '@/shared/hooks/settings/useToolSettings';
import { queryKeys } from '@/shared/lib/queryKeys';
import type { SegmentRegenerateFormProps } from '../components/SegmentRegenerateForm';
import type { SegmentSlotModeData } from '../types';
import { SETTINGS_IDS } from '@/shared/lib/settingsIds';
import { TOOL_IDS } from '@/shared/lib/toolIds';
import type { GenerationRow } from '@/domains/generation/types';
import type { TaskDetailsData } from '../types';
import {
  stripDuplicateStructureDetailParams,
  stripLegacyStructureParams,
} from '@/shared/lib/tasks/legacyStructureParams';

interface CurrentSegmentImages {
  startUrl?: string;
  endUrl?: string;
  startGenerationId?: string;
  endGenerationId?: string;
  startShotGenerationId?: string;
  endShotGenerationId?: string;
  startVariantId?: string;
  endVariantId?: string;
  activeChildGenerationId?: string;
}

interface UseVideoRegenerateModeProps {
  isVideo: boolean;
  media: GenerationRow;
  shotId: string | undefined;
  selectedProjectId: string | null;
  actualGenerationId: string | null;
  adjustedTaskDetailsData: TaskDetailsData | undefined;
  primaryVariant: {
    id: string;
    params?: Record<string, unknown> | null;
  } | null;
  currentSegmentImages?: CurrentSegmentImages;
  segmentSlotMode?: SegmentSlotModeData | null;
  // For loading variant settings
  variantParamsToLoad: Record<string, unknown> | null;
  setVariantParamsToLoad: (params: Record<string, unknown> | null) => void;
  // For frame count updates
  onSegmentFrameCountChange?: (pairShotGenerationId: string, frameCount: number) => void;
  currentFrameCount?: number;
}

interface UseVideoRegenerateModeReturn {
  /** Whether regeneration is available for this video */
  canRegenerate: boolean;
  /** Props to pass to SegmentRegenerateForm (null if can't regenerate) */
  regenerateFormProps: SegmentRegenerateFormProps | null;
  /** Whether shot data is still loading */
  isLoadingShotData: boolean;
}

function sanitizeStoredStructureVideos(
  structureVideos: Array<Record<string, unknown>> | null | undefined,
): Array<Record<string, unknown>> {
  return (structureVideos ?? [])
    .filter((video): video is Record<string, unknown> => typeof video?.path === 'string' && video.path.length > 0)
    .map((video) => ({
      path: video.path,
      start_frame: typeof video.start_frame === 'number' ? video.start_frame : 0,
      end_frame: typeof video.end_frame === 'number' ? video.end_frame : null,
      treatment: video.treatment === 'clip' ? 'clip' : 'adjust',
      ...(video.metadata ? { metadata: video.metadata } : {}),
      ...(typeof video.resource_id === 'string' ? { resource_id: video.resource_id } : {}),
    }));
}

export function useVideoRegenerateMode({
  isVideo,
  media,
  shotId,
  selectedProjectId,
  actualGenerationId,
  adjustedTaskDetailsData,
  primaryVariant,
  currentSegmentImages,
  segmentSlotMode,
  variantParamsToLoad,
  setVariantParamsToLoad,
  onSegmentFrameCountChange,
  currentFrameCount,
}: UseVideoRegenerateModeProps): UseVideoRegenerateModeReturn {
  const queryClient = useQueryClient();

  // Fetch shot's aspect ratio AND structure videos for regeneration
  const { data: shotDataForRegen, isLoading: isLoadingShotData } = useQuery({
    queryKey: queryKeys.shots.regenData(shotId!),
    queryFn: async () => {
      if (!shotId) return null;
      const { data, error } = await supabase().from('shots')
        .select('aspect_ratio, settings')
        .eq('id', shotId)
        .single();
      if (error) {
        return null;
      }

      const allSettings = data?.settings as Record<string, unknown>;
      // Structure videos are stored under 'travel-structure-video' key
      const structureVideoSettings = (allSettings?.[SETTINGS_IDS.TRAVEL_STRUCTURE_VIDEO] ?? {}) as Record<string, unknown>;

      return {
        aspect_ratio: data?.aspect_ratio,
        structure_videos: (structureVideoSettings.structure_videos as unknown[]) ?? null,
        structure_guidance: structureVideoSettings.structure_guidance ?? null,
      };
    },
    enabled: !!shotId && isVideo,
    staleTime: 60000,
  });

  // Callback to update structure video defaults when "Set as Shot Defaults" is clicked
  const handleUpdateStructureVideoDefaults = useCallback(async (updates: {
    motionStrength?: number;
    treatment?: 'adjust' | 'clip';
    uni3cEndPercent?: number;
  }): Promise<void> => {
    if (!shotId) return;

    const shotStructureVideos = sanitizeStoredStructureVideos(
      shotDataForRegen?.structure_videos as Array<Record<string, unknown>> | null,
    );
    if (!shotStructureVideos || shotStructureVideos.length === 0) {
      return;
    }

    const currentGuidance = normalizeStructureGuidance({
      structureGuidance: shotDataForRegen?.structure_guidance ?? undefined,
      structureVideos: shotDataForRegen?.structure_videos ?? undefined,
      defaultVideoTreatment: 'adjust',
      defaultUni3cEndPercent: 0.1,
    });
    const currentControls = resolveStructureGuidanceControls(currentGuidance, {
      defaultStructureType: 'flow',
      defaultMotionStrength: 1.2,
      defaultUni3cEndPercent: 0.1,
    });

    const updatedVideos = shotStructureVideos.map((video, index) => {
      if (index === 0) {
        return {
          ...video,
          ...(updates.treatment !== undefined && { treatment: updates.treatment }),
        };
      }
      return video;
    });
    const updatedGuidance = buildStructureGuidanceFromControls({
      structureVideos: updatedVideos,
      controls: {
        ...currentControls,
        ...(updates.motionStrength !== undefined ? { motionStrength: updates.motionStrength } : {}),
        ...(updates.uni3cEndPercent !== undefined ? { uni3cEndPercent: updates.uni3cEndPercent } : {}),
      },
      defaultVideoTreatment: updatedVideos[0]?.treatment === 'clip' ? 'clip' : 'adjust',
      defaultUni3cEndPercent: updates.uni3cEndPercent ?? currentControls.uni3cEndPercent,
    });

    // Update structure video settings and await completion
    await updateToolSettingsSupabase({
      scope: 'shot',
      id: shotId,
      toolId: SETTINGS_IDS.TRAVEL_STRUCTURE_VIDEO,
      patch: {
        structure_videos: updatedVideos,
        structure_guidance: updatedGuidance ?? null,
      },
    }, 'immediate');

    // Refetch to update UI - await so caller knows when complete
    await Promise.all([
      queryClient.refetchQueries({ queryKey: queryKeys.shots.regenData(shotId!) }),
      queryClient.refetchQueries({ queryKey: queryKeys.settings.byTool(SETTINGS_IDS.TRAVEL_STRUCTURE_VIDEO) }),
    ]);

  }, [shotId, shotDataForRegen?.structure_guidance, shotDataForRegen?.structure_videos, queryClient]);

  // Compute effective resolution for regeneration
  const effectiveRegenerateResolution = useMemo(() => {
    const aspectRatio = typeof shotDataForRegen?.aspect_ratio === 'string'
      ? shotDataForRegen.aspect_ratio
      : undefined;

    if (aspectRatio) {
      const shotResolution = ASPECT_RATIO_TO_RESOLUTION[aspectRatio];
      if (shotResolution) {
        return shotResolution;
      }
    }
    return undefined;
  }, [shotDataForRegen?.aspect_ratio]);

  // Determine if regenerate mode is available
  const canRegenerate = useMemo(() => {
    if (!isVideo) return false;

    // Root parent videos cannot be regenerated
    const isRootParent = !media.parent_generation_id;
    if (isRootParent) return false;

    // Join-clips outputs cannot be regenerated
    const mediaParams = media.params as Record<string, unknown> | undefined;
    const toolType = (media.metadata as Record<string, unknown>)?.tool_type || mediaParams?.tool_type;
    if (toolType === TOOL_IDS.JOIN_CLIPS) return false;

    // Need task params to regenerate
    const taskDataParams = adjustedTaskDetailsData?.task?.params;
    if (!taskDataParams && !mediaParams) return false;

    return true;
  }, [isVideo, media, adjustedTaskDetailsData]);

  // Build regenerate form props
  const regenerateFormProps = useMemo((): SegmentRegenerateFormProps | null => {
    if (!canRegenerate || !isVideo) return null;

    const mediaParams = media.params as Record<string, unknown> | undefined;
    const taskDataParams = adjustedTaskDetailsData?.task?.params;

    // Prefer primary variant's params if it has task data
    const primaryParams = primaryVariant?.params as Record<string, unknown> | undefined;
    const primaryHasTaskData = primaryParams && (
      primaryParams.source_task_id ||
      primaryParams.orchestrator_details ||
      primaryParams.additional_loras
    );

    let taskParams = primaryHasTaskData
      ? primaryParams
      : ((taskDataParams ?? mediaParams) as Record<string, unknown>);

    if (!taskParams) return null;

    // Inject the shot-level canonical structure contract back onto the task.
    const shotStructureVideos = sanitizeStoredStructureVideos(
      shotDataForRegen?.structure_videos as Array<Record<string, unknown>> | null,
    );
    const shotStructureGuidance = normalizeStructureGuidance({
      structureGuidance: shotDataForRegen?.structure_guidance ?? undefined,
      structureVideos: shotDataForRegen?.structure_videos ?? undefined,
      defaultVideoTreatment: 'adjust',
      defaultUni3cEndPercent: 0.1,
    });

    if (shotStructureGuidance) {
      const cleanedTaskParams = { ...taskParams };
      stripLegacyStructureParams(cleanedTaskParams);
      const cleanedOrchestratorDetails = {
        ...((cleanedTaskParams.orchestrator_details as Record<string, unknown>) || {}),
      };
      stripLegacyStructureParams(cleanedOrchestratorDetails);
      stripDuplicateStructureDetailParams(cleanedOrchestratorDetails);
      taskParams = {
        ...cleanedTaskParams,
        structure_guidance: shotStructureGuidance,
        ...(shotStructureVideos.length > 0 ? { structure_videos: shotStructureVideos } : {}),
        orchestrator_details: {
          ...cleanedOrchestratorDetails,
          structure_guidance: shotStructureGuidance,
        },
      };
    }

    const orchestratorDetails = (taskParams.orchestrator_details || {}) as Record<string, unknown>;

    // Extract segment images
    // CRITICAL: In segment slot mode, ALWAYS use pairData from timeline (fresh data).
    // Task params are stale and may have different images from when the video was generated.
    const segmentIndex = (taskParams.segment_index as number) ?? 0;
    let segmentImageInfo: {
      startUrl?: string;
      endUrl?: string;
      startGenId?: string;
      endGenId?: string;
      startVariantId?: string;
      endVariantId?: string;
      hasImages: boolean;
    };

    if (segmentSlotMode?.pairData) {
      // Segment slot mode: Use timeline pairData (source of truth for current pair)
      segmentImageInfo = {
        startUrl: segmentSlotMode.pairData.startImage?.url,
        endUrl: segmentSlotMode.pairData.endImage?.url,
        startGenId: segmentSlotMode.pairData.startImage?.generationId,
        endGenId: segmentSlotMode.pairData.endImage?.generationId,
        startVariantId: segmentSlotMode.pairData.startImage?.primaryVariantId,
        endVariantId: segmentSlotMode.pairData.endImage?.primaryVariantId,
        hasImages: !!(segmentSlotMode.pairData.startImage?.url || segmentSlotMode.pairData.endImage?.url),
      };
    } else if (currentSegmentImages && (currentSegmentImages.startUrl || currentSegmentImages.endUrl)) {
      // Non-slot mode with currentSegmentImages prop (fresh timeline data)
      segmentImageInfo = {
        startUrl: currentSegmentImages.startUrl,
        endUrl: currentSegmentImages.endUrl,
        startGenId: currentSegmentImages.startGenerationId,
        endGenId: currentSegmentImages.endGenerationId,
        startVariantId: currentSegmentImages.startVariantId,
        endVariantId: currentSegmentImages.endVariantId,
        hasImages: !!(currentSegmentImages.startUrl || currentSegmentImages.endUrl),
      };
    } else {
      // Fallback: Extract from task params (only when not in segment slot mode)
      segmentImageInfo = extractSegmentImages(taskParams, segmentIndex);

      // Last resort: Fall back to inputImages from task details
      if (!segmentImageInfo.hasImages && adjustedTaskDetailsData?.inputImages?.length) {
        const passedImages = adjustedTaskDetailsData.inputImages;
        segmentImageInfo = {
          startUrl: passedImages[0],
          endUrl: passedImages.length > 1 ? passedImages[passedImages.length - 1] : passedImages[0],
          startGenId: undefined,
          endGenId: undefined,
          hasImages: passedImages.length > 0,
        };
      }
    }

    // Extract pair_shot_generation_id
    const orchPairIds = orchestratorDetails.pair_shot_generation_ids as string[] | undefined;
    const pairShotGenerationId = [
      segmentSlotMode?.pairData?.startImage?.id,
      currentSegmentImages?.startShotGenerationId,
      taskParams.pair_shot_generation_id,
      (taskParams.individual_segment_params as Record<string, unknown>)?.pair_shot_generation_id,
      Array.isArray(orchPairIds) ? orchPairIds[segmentIndex] : undefined,
    ].find((v): v is string => typeof v === 'string') || undefined;

    // Get childGenerationId
    const parentGenerationId = media.parent_generation_id ||
      (orchestratorDetails.parent_generation_id as string) ||
      (taskParams.parent_generation_id as string) ||
      actualGenerationId ||
      media.id;

    const isChildSegment = parentGenerationId !== actualGenerationId;
    const videoPairShotGenId = (taskParams.pair_shot_generation_id as string) ||
      (taskParams.individual_segment_params as Record<string, unknown>)?.pair_shot_generation_id as string;
    const videoMatchesCurrentSlot = !pairShotGenerationId || !videoPairShotGenId ||
      pairShotGenerationId === videoPairShotGenId;

    const childGenerationId = videoMatchesCurrentSlot
      ? (
        currentSegmentImages?.activeChildGenerationId
        || (isChildSegment ? actualGenerationId ?? undefined : undefined)
      )
      : undefined;

    // Extract structure video props
    // In Timeline Mode with segmentSlotMode, prefer segment-level structure video data
    // over shot-level defaults (since segmentSlotMode has per-segment coverage info)
    const firstStructureVideo = shotStructureVideos?.[0];
    const shotStructureControls = resolveStructureGuidanceControls(shotStructureGuidance, {
      defaultStructureType: 'flow',
      defaultMotionStrength: 1.2,
      defaultUni3cEndPercent: 0.1,
    });
    const shotStructureVideoType = shotStructureControls.structureType;
    const shotStructureVideoDefaults = firstStructureVideo ? {
      motionStrength: shotStructureControls.motionStrength,
      treatment: ((firstStructureVideo.treatment as string) ?? 'adjust') as 'adjust' | 'clip',
      uni3cEndPercent: shotStructureControls.uni3cEndPercent,
    } : undefined;
    const shotStructureVideoUrl = firstStructureVideo?.path as string | undefined;

    // When segmentSlotMode is present (Timeline Mode), it's the authority for structure video data.
    // Its structureVideoType is null (not undefined) when no covering video exists,
    // so we must NOT use ?? which would fall through null to stale shot-level cache.
    const structureVideoType = segmentSlotMode
      ? segmentSlotMode.structureVideoType
      : shotStructureVideoType;
    const structureVideoDefaults = segmentSlotMode
      ? segmentSlotMode.structureVideoDefaults
      : shotStructureVideoDefaults;
    const structureVideoUrl = segmentSlotMode
      ? segmentSlotMode.structureVideoUrl
      : shotStructureVideoUrl;

    // Get frame count from segmentSlotMode.pairData (source of truth for timeline)
    // Fall back to currentFrameCount prop for non-slot-mode usage
    const effectiveFrameCount = segmentSlotMode?.pairData?.frames ?? currentFrameCount;

    return {
      task: {
        params: taskParams as SegmentRegenerateFormProps['task']['params'],
        projectId: selectedProjectId ?? null,
        generationId: parentGenerationId,
        shotId,
        childGenerationId,
        segmentIndex,
      },
      images: {
        startImageUrl: segmentImageInfo.startUrl,
        endImageUrl: segmentImageInfo.endUrl,
        startImageGenerationId: segmentImageInfo.startGenId,
        endImageGenerationId: segmentImageInfo.endGenId,
        startImageVariantId: segmentImageInfo.startVariantId,
        endImageVariantId: segmentImageInfo.endVariantId,
        pairShotGenerationId,
      },
      frame: {
        projectResolution: effectiveRegenerateResolution,
        onFrameCountChange: onSegmentFrameCountChange,
        currentFrameCount: effectiveFrameCount,
        maxFrames: segmentSlotMode?.maxFrameLimit,
      },
      variant: {
        variantParamsToLoad:
          variantParamsToLoad as NonNullable<
            SegmentRegenerateFormProps['variant']
          >['variantParamsToLoad'],
        onVariantParamsLoaded: () => setVariantParamsToLoad(null),
      },
      structure: {
        structureVideoType,
        structureVideoDefaults,
        structureVideoUrl,
        structureVideoFrameRange: segmentSlotMode?.structureVideoFrameRange,
        onUpdateStructureVideoDefaults: handleUpdateStructureVideoDefaults,
      },
      navigation: {
        endImageShotGenerationId:
          segmentSlotMode?.pairData?.endImage?.id ||
          currentSegmentImages?.endShotGenerationId,
        onNavigateToImage: segmentSlotMode?.onNavigateToImage,
      },
      timeline: {
        isTimelineMode: segmentSlotMode?.isTimelineMode,
        onAddSegmentStructureVideo: segmentSlotMode?.onAddSegmentStructureVideo,
        onUpdateSegmentStructureVideo: segmentSlotMode?.onUpdateSegmentStructureVideo,
        onRemoveSegmentStructureVideo: segmentSlotMode?.onRemoveSegmentStructureVideo,
      },
    };
  }, [
    canRegenerate,
    isVideo,
    media,
    adjustedTaskDetailsData,
    primaryVariant,
    shotDataForRegen,
    selectedProjectId,
    actualGenerationId,
    effectiveRegenerateResolution,
    currentSegmentImages,
    segmentSlotMode,
    variantParamsToLoad,
    setVariantParamsToLoad,
    onSegmentFrameCountChange,
    currentFrameCount,
    shotId,
    handleUpdateStructureVideoDefaults,
  ]);

  return {
    canRegenerate,
    regenerateFormProps,
    isLoadingShotData,
  };
}
