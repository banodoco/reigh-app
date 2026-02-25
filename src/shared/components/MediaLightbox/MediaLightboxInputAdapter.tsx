import React, { useMemo } from 'react';
import MediaLightbox, { type MediaLightboxProps } from './MediaLightbox';

type LightboxCoreAdapter = Pick<
  MediaLightboxProps,
  | 'media'
  | 'onClose'
  | 'readOnly'
  | 'shotId'
  | 'toolTypeOverride'
  | 'initialVariantId'
  | 'segmentSlotMode'
  | 'tasksPaneOpen'
  | 'tasksPaneWidth'
  | 'adjacentSegments'
  | 'parentGenerationIdOverride'
>;

type LightboxNavigationAdapter = Pick<
  MediaLightboxProps,
  | 'onNext'
  | 'onPrevious'
  | 'showNavigation'
  | 'hasNext'
  | 'hasPrevious'
  | 'onNavigateToGeneration'
  | 'onOpenExternalGeneration'
>;

type LightboxShotWorkflowAdapter = Pick<
  MediaLightboxProps,
  | 'allShots'
  | 'selectedShotId'
  | 'onShotChange'
  | 'onAddToShot'
  | 'onAddToShotWithoutPosition'
  | 'onCreateShot'
  | 'onNavigateToShot'
  | 'positionedInSelectedShot'
  | 'associatedWithoutPositionInSelectedShot'
>;

type LightboxActionAdapter = Pick<
  MediaLightboxProps,
  | 'onDelete'
  | 'isDeleting'
  | 'onApplySettings'
  | 'onMagicEdit'
  | 'starred'
  | 'onToggleStar'
>;

type LightboxTaskDetailsAdapter = Pick<
  MediaLightboxProps,
  | 'showTaskDetails'
  | 'taskDetailsData'
  | 'onShowTaskDetails'
>;

type LightboxVisualStateAdapter = Pick<
  MediaLightboxProps,
  | 'showTickForImageId'
  | 'onShowTick'
  | 'showTickForSecondaryImageId'
  | 'onShowSecondaryTick'
  | 'optimisticPositionedIds'
  | 'optimisticUnpositionedIds'
  | 'onOptimisticPositioned'
  | 'onOptimisticUnpositioned'
>;

type LightboxFeatureAdapter = Pick<
  MediaLightboxProps,
  | 'showImageEditTools'
  | 'showDownload'
  | 'showMagicEdit'
  | 'initialEditActive'
>;

type LightboxVideoAdapter = Pick<
  MediaLightboxProps,
  | 'showVideoTrimEditor'
  | 'onTrimModeChange'
  | 'initialVideoTrimMode'
  | 'fetchVariantsForSelf'
  | 'currentSegmentImages'
  | 'onSegmentFrameCountChange'
  | 'currentFrameCount'
>;

export interface MediaLightboxInputAdapter {
  core: LightboxCoreAdapter;
  navigation?: Partial<LightboxNavigationAdapter>;
  shotWorkflow?: Partial<LightboxShotWorkflowAdapter>;
  actions?: Partial<LightboxActionAdapter>;
  taskDetails?: Partial<LightboxTaskDetailsAdapter>;
  visualState?: Partial<LightboxVisualStateAdapter>;
  features?: Partial<LightboxFeatureAdapter>;
  video?: Partial<LightboxVideoAdapter>;
}

export function toMediaLightboxProps(adapter: MediaLightboxInputAdapter): MediaLightboxProps {
  return {
    ...adapter.core,
    ...(adapter.navigation ?? {}),
    ...(adapter.shotWorkflow ?? {}),
    ...(adapter.actions ?? {}),
    ...(adapter.taskDetails ?? {}),
    ...(adapter.visualState ?? {}),
    ...(adapter.features ?? {}),
    ...(adapter.video ?? {}),
  };
}

interface MediaLightboxFromAdapterProps {
  adapter: MediaLightboxInputAdapter;
}

export function MediaLightboxFromAdapter({ adapter }: MediaLightboxFromAdapterProps) {
  const lightboxProps = useMemo(() => toMediaLightboxProps(adapter), [adapter]);
  return <MediaLightbox {...lightboxProps} />;
}
