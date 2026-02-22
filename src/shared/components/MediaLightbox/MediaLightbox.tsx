import React, { useMemo } from 'react';
import type { GenerationRow, Shot } from '@/types/shots';
import { isVideoAny } from '@/shared/lib/typeGuards';
import type { AdjacentSegmentsData, SegmentSlotModeData } from './types';
import type { ShotOption, TaskDetailsData } from './types';
import { ImageLightbox } from './ImageLightbox';
import type { LightboxNavigationProps, LightboxShotWorkflowProps, LightboxFeatureFlags, LightboxActionHandlers } from './ImageLightbox';
import { VideoLightbox } from './VideoLightbox';

interface MediaLightboxProps {
  media?: GenerationRow;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  segmentSlotMode?: SegmentSlotModeData;
  readOnly?: boolean;
  showNavigation?: boolean;
  showImageEditTools?: boolean;
  showDownload?: boolean;
  showMagicEdit?: boolean;
  autoEnterInpaint?: boolean;
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

/** Bundle flat MediaLightboxProps into the grouped ImageLightbox sub-interfaces. */
function useBundledImageProps(props: MediaLightboxProps & { media: GenerationRow }) {
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
    autoEnterInpaint: props.autoEnterInpaint,
    showTaskDetails: props.showTaskDetails,
  }), [props.showImageEditTools, props.showDownload, props.showMagicEdit, props.autoEnterInpaint, props.showTaskDetails]);

  const actions: LightboxActionHandlers = useMemo(() => ({
    onDelete: props.onDelete,
    isDeleting: props.isDeleting,
    onApplySettings: props.onApplySettings,
    onToggleStar: props.onToggleStar,
    starred: props.starred,
  }), [props.onDelete, props.isDeleting, props.onApplySettings, props.onToggleStar, props.starred]);

  return { navigation, shotWorkflow, features, actions };
}

const MediaLightbox: React.FC<MediaLightboxProps> = ({ media, segmentSlotMode, ...restProps }) => {
  // Bundle flat props for ImageLightbox (hook must be called unconditionally)
  const bundled = useBundledImageProps({ media: media!, ...restProps } as MediaLightboxProps & { media: GenerationRow });

  if (segmentSlotMode) {
    return (
      <VideoLightbox
        media={media}
        segmentSlotMode={segmentSlotMode}
        {...restProps}
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
        {...restProps}
      />
    );
  }

  return (
    <ImageLightbox
      media={media}
      onClose={restProps.onClose}
      readOnly={restProps.readOnly}
      shotId={restProps.shotId}
      initialVariantId={restProps.initialVariantId}
      toolTypeOverride={restProps.toolTypeOverride}
      taskDetailsData={restProps.taskDetailsData}
      onOpenExternalGeneration={restProps.onOpenExternalGeneration}
      onNavigateToGeneration={restProps.onNavigateToGeneration}
      showTickForImageId={restProps.showTickForImageId}
      showTickForSecondaryImageId={restProps.showTickForSecondaryImageId}
      tasksPaneOpen={restProps.tasksPaneOpen}
      tasksPaneWidth={restProps.tasksPaneWidth}
      adjacentSegments={restProps.adjacentSegments}
      navigation={bundled.navigation}
      shotWorkflow={bundled.shotWorkflow}
      features={bundled.features}
      actions={bundled.actions}
    />
  );
};

export default MediaLightbox;
