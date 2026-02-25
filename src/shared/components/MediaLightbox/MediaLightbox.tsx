import React, { useMemo } from 'react';
import type { GenerationRow, Shot } from '@/domains/generation/types';
import { isVideoAny } from '@/shared/lib/typeGuards';
import type { AdjacentSegmentsData, SegmentSlotModeData } from './types';
import type { ShotOption, TaskDetailsData } from './types';
import type { LightboxNavigationProps, LightboxShotWorkflowProps, LightboxFeatureFlags, LightboxActionHandlers } from './types';
import { ImageLightbox } from './ImageLightbox';
import { VideoLightbox } from './VideoLightbox';
import type { VideoLightboxVideoProps } from './VideoLightbox';

export interface MediaLightboxProps {
  media?: GenerationRow;
  parentGenerationIdOverride?: string;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  segmentSlotMode?: SegmentSlotModeData;
  readOnly?: boolean;
  showNavigation?: boolean;
  showImageEditTools?: boolean;
  showDownload?: boolean;
  showMagicEdit?: boolean;
  initialEditActive?: boolean;
  hasNext?: boolean;
  hasPrevious?: boolean;
  allShots?: ShotOption[];
  selectedShotId?: string;
  onShotChange?: (shotId: string) => void;
  onAddToShot?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onDelete?: (id: string) => void;
  isDeleting?: string | null;
  onApplySettings?: (metadata: GenerationRow['metadata']) => void;
  showTickForImageId?: string | null;
  onShowTick?: (imageId: string) => void;
  showTickForSecondaryImageId?: string | null;
  onShowSecondaryTick?: (imageId: string) => void;
  onMagicEdit?: (imageUrl: string, prompt: string, numImages: number) => void;
  starred?: boolean;
  onToggleStar?: (id: string, starred: boolean) => void;
  showTaskDetails?: boolean;
  taskDetailsData?: TaskDetailsData;
  onShowTaskDetails?: () => void;
  onCreateShot?: (shotName: string, files: File[]) => Promise<{ shotId?: string; shotName?: string } | void>;
  onNavigateToShot?: (shot: Shot, options?: { isNewlyCreated?: boolean }) => void;
  toolTypeOverride?: string;
  optimisticPositionedIds?: Set<string>;
  optimisticUnpositionedIds?: Set<string>;
  onOptimisticPositioned?: (mediaId: string, shotId: string) => void;
  onOptimisticUnpositioned?: (mediaId: string, shotId: string) => void;
  positionedInSelectedShot?: boolean;
  associatedWithoutPositionInSelectedShot?: boolean;
  onNavigateToGeneration?: (generationId: string) => void;
  onOpenExternalGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
  shotId?: string;
  tasksPaneOpen?: boolean;
  tasksPaneWidth?: number;
  showVideoTrimEditor?: boolean;
  onTrimModeChange?: (isTrimMode: boolean) => void;
  initialVideoTrimMode?: boolean;
  initialVariantId?: string;
  fetchVariantsForSelf?: boolean;
  currentSegmentImages?: {
    startUrl?: string;
    endUrl?: string;
    startGenerationId?: string;
    endGenerationId?: string;
    startShotGenerationId?: string;
    endShotGenerationId?: string;
    activeChildGenerationId?: string;
    startVariantId?: string;
    endVariantId?: string;
  };
  onSegmentFrameCountChange?: (pairShotGenerationId: string, frameCount: number) => void;
  currentFrameCount?: number;
  adjacentSegments?: AdjacentSegmentsData;
}

/** Bundle flat MediaLightboxProps into the grouped sub-interfaces shared by Image/VideoLightbox. */
function useBundledLightboxProps(props: MediaLightboxProps) {
  const navigation: LightboxNavigationProps = useMemo(() => ({
    onNext: props.onNext,
    onPrevious: props.onPrevious,
    showNavigation: props.showNavigation,
    hasNext: props.hasNext,
    hasPrevious: props.hasPrevious,
  }), [props.onNext, props.onPrevious, props.showNavigation, props.hasNext, props.hasPrevious]);

  const shotWorkflow: LightboxShotWorkflowProps = useMemo(() => ({
    allShots: props.allShots,
    selectedShotId: props.selectedShotId,
    onShotChange: props.onShotChange,
    onAddToShot: props.onAddToShot,
    onAddToShotWithoutPosition: props.onAddToShotWithoutPosition,
    onCreateShot: props.onCreateShot,
    onNavigateToShot: props.onNavigateToShot,
    onShowTick: props.onShowTick,
    onShowSecondaryTick: props.onShowSecondaryTick,
    onOptimisticPositioned: props.onOptimisticPositioned,
    onOptimisticUnpositioned: props.onOptimisticUnpositioned,
    optimisticPositionedIds: props.optimisticPositionedIds,
    optimisticUnpositionedIds: props.optimisticUnpositionedIds,
    positionedInSelectedShot: props.positionedInSelectedShot,
    associatedWithoutPositionInSelectedShot: props.associatedWithoutPositionInSelectedShot,
  }), [
    props.allShots, props.selectedShotId, props.onShotChange,
    props.onAddToShot, props.onAddToShotWithoutPosition,
    props.onCreateShot, props.onNavigateToShot,
    props.onShowTick, props.onShowSecondaryTick,
    props.onOptimisticPositioned, props.onOptimisticUnpositioned,
    props.optimisticPositionedIds, props.optimisticUnpositionedIds,
    props.positionedInSelectedShot, props.associatedWithoutPositionInSelectedShot,
  ]);

  const features: LightboxFeatureFlags = useMemo(() => ({
    showImageEditTools: props.showImageEditTools,
    showDownload: props.showDownload,
    showMagicEdit: props.showMagicEdit,
    initialEditActive: props.initialEditActive,
    showTaskDetails: props.showTaskDetails,
  }), [props.showImageEditTools, props.showDownload, props.showMagicEdit, props.initialEditActive, props.showTaskDetails]);

  const actions: LightboxActionHandlers = useMemo(() => ({
    onDelete: props.onDelete,
    isDeleting: props.isDeleting,
    onApplySettings: props.onApplySettings,
    onToggleStar: props.onToggleStar,
    starred: props.starred,
  }), [props.onDelete, props.isDeleting, props.onApplySettings, props.onToggleStar, props.starred]);

  const videoProps: VideoLightboxVideoProps = useMemo(() => ({
    initialVideoTrimMode: props.initialVideoTrimMode,
    fetchVariantsForSelf: props.fetchVariantsForSelf,
    currentSegmentImages: props.currentSegmentImages,
    onSegmentFrameCountChange: props.onSegmentFrameCountChange,
    currentFrameCount: props.currentFrameCount,
    onTrimModeChange: props.onTrimModeChange,
    onShowTaskDetails: props.onShowTaskDetails,
  }), [
    props.initialVideoTrimMode, props.fetchVariantsForSelf,
    props.currentSegmentImages, props.onSegmentFrameCountChange,
    props.currentFrameCount, props.onTrimModeChange,
    props.onShowTaskDetails,
  ]);

  return { navigation, shotWorkflow, features, actions, videoProps };
}

const MediaLightbox: React.FC<MediaLightboxProps> = (props) => {
  const { media, segmentSlotMode } = props;

  // Bundle flat props into grouped sub-interfaces (hook must be called unconditionally)
  const bundled = useBundledLightboxProps(props);

  if (segmentSlotMode) {
    return (
      <VideoLightbox
        media={media}
        onClose={props.onClose}
        segmentSlotMode={segmentSlotMode}
        readOnly={props.readOnly}
        shotId={props.shotId}
        initialVariantId={props.initialVariantId}
        taskDetailsData={props.taskDetailsData}
        onOpenExternalGeneration={props.onOpenExternalGeneration}
        showTickForImageId={props.showTickForImageId}
        showTickForSecondaryImageId={props.showTickForSecondaryImageId}
        tasksPaneOpen={props.tasksPaneOpen}
        tasksPaneWidth={props.tasksPaneWidth}
        adjacentSegments={props.adjacentSegments}
        navigation={bundled.navigation}
        shotWorkflow={bundled.shotWorkflow}
        features={bundled.features}
        actions={bundled.actions}
        videoProps={bundled.videoProps}
        parentGenerationIdOverride={props.parentGenerationIdOverride}
      />
    );
  }

  if (!media) {
    return null;
  }

  if (isVideoAny(media)) {
    return (
      <VideoLightbox
        media={media}
        onClose={props.onClose}
        readOnly={props.readOnly}
        shotId={props.shotId}
        initialVariantId={props.initialVariantId}
        taskDetailsData={props.taskDetailsData}
        onOpenExternalGeneration={props.onOpenExternalGeneration}
        showTickForImageId={props.showTickForImageId}
        showTickForSecondaryImageId={props.showTickForSecondaryImageId}
        tasksPaneOpen={props.tasksPaneOpen}
        tasksPaneWidth={props.tasksPaneWidth}
        adjacentSegments={props.adjacentSegments}
        navigation={bundled.navigation}
        shotWorkflow={bundled.shotWorkflow}
        features={bundled.features}
        actions={bundled.actions}
        videoProps={bundled.videoProps}
        parentGenerationIdOverride={props.parentGenerationIdOverride}
      />
    );
  }

  return (
    <ImageLightbox
      media={media}
      onClose={props.onClose}
      readOnly={props.readOnly}
      shotId={props.shotId}
      initialVariantId={props.initialVariantId}
      toolTypeOverride={props.toolTypeOverride}
      taskDetailsData={props.taskDetailsData}
      onOpenExternalGeneration={props.onOpenExternalGeneration}
      onNavigateToGeneration={props.onNavigateToGeneration}
      showTickForImageId={props.showTickForImageId}
      showTickForSecondaryImageId={props.showTickForSecondaryImageId}
      tasksPaneOpen={props.tasksPaneOpen}
      tasksPaneWidth={props.tasksPaneWidth}
      adjacentSegments={props.adjacentSegments}
      navigation={bundled.navigation}
      shotWorkflow={bundled.shotWorkflow}
      features={bundled.features}
      actions={bundled.actions}
    />
  );
};

export default MediaLightbox;
