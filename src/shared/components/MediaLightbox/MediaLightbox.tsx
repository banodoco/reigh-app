import React from 'react';
import type { GenerationRow, Shot } from '@/domains/generation/types';
import { isVideoAny } from '@/shared/lib/typeGuards';
import type { AdjacentSegmentsData, SegmentSlotModeData } from './types';
import type { ShotOption, TaskDetailsData } from './types';
import type { LightboxNavigationProps, LightboxShotWorkflowProps, LightboxFeatureFlags, LightboxActionHandlers } from './types';
import type { VideoLightboxVideoProps } from './videoLightboxContracts';
import { ImageLightbox } from './ImageLightbox';
import { VideoLightbox } from './VideoLightbox';

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
  onDelete?: LightboxActionHandlers['onDelete'];
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

const MediaLightbox: React.FC<MediaLightboxProps> = (props) => {
  const { media, segmentSlotMode } = props;

  const navigation: LightboxNavigationProps = {
    onNext: props.onNext,
    onPrevious: props.onPrevious,
    showNavigation: props.showNavigation,
    hasNext: props.hasNext,
    hasPrevious: props.hasPrevious,
  };
  const shotWorkflow: LightboxShotWorkflowProps = {
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
  };
  const features: LightboxFeatureFlags = {
    showImageEditTools: props.showImageEditTools,
    showDownload: props.showDownload,
    showMagicEdit: props.showMagicEdit,
    initialEditActive: props.initialEditActive,
    showTaskDetails: props.showTaskDetails,
  };
  const actions: LightboxActionHandlers = {
    onDelete: props.onDelete,
    isDeleting: props.isDeleting,
    onApplySettings: props.onApplySettings,
    onToggleStar: props.onToggleStar,
    starred: props.starred,
  };
  const videoProps: VideoLightboxVideoProps = {
    initialVideoTrimMode: props.initialVideoTrimMode,
    fetchVariantsForSelf: props.fetchVariantsForSelf,
    currentSegmentImages: props.currentSegmentImages,
    onSegmentFrameCountChange: props.onSegmentFrameCountChange,
    currentFrameCount: props.currentFrameCount,
    onTrimModeChange: props.onTrimModeChange,
    onShowTaskDetails: props.onShowTaskDetails,
  };

  const sharedContainerProps = {
    onClose: props.onClose,
    readOnly: props.readOnly,
    shotId: props.shotId,
    initialVariantId: props.initialVariantId,
    taskDetailsData: props.taskDetailsData,
    onOpenExternalGeneration: props.onOpenExternalGeneration,
    showTickForImageId: props.showTickForImageId,
    showTickForSecondaryImageId: props.showTickForSecondaryImageId,
    tasksPaneOpen: props.tasksPaneOpen,
    tasksPaneWidth: props.tasksPaneWidth,
    adjacentSegments: props.adjacentSegments,
    navigation,
    shotWorkflow,
    features,
    actions,
  };

  if (segmentSlotMode) {
    return (
      <VideoLightbox
        {...sharedContainerProps}
        media={media}
        segmentSlotMode={segmentSlotMode}
        parentGenerationIdOverride={props.parentGenerationIdOverride}
        videoProps={videoProps}
      />
    );
  }

  if (!media) {
    return null;
  }

  if (isVideoAny(media)) {
    return (
      <VideoLightbox
        {...sharedContainerProps}
        media={media}
        segmentSlotMode={segmentSlotMode}
        parentGenerationIdOverride={props.parentGenerationIdOverride}
        videoProps={videoProps}
      />
    );
  }

  return (
    <ImageLightbox
      {...sharedContainerProps}
      media={media}
      toolTypeOverride={props.toolTypeOverride}
      onNavigateToGeneration={props.onNavigateToGeneration}
    />
  );
};

export default MediaLightbox;
