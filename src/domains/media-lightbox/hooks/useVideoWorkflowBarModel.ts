import { useMemo } from 'react';
import type { WorkflowControlsBarProps } from '../components/WorkflowControlsBar';
import type { VideoLightboxPropsWithMedia } from '../types';
import type { VideoLightboxEnvironment } from './useVideoLightboxEnvironment';
import type { VideoLightboxSharedStateModel } from './useVideoLightboxController';

interface UseVideoWorkflowBarModelInput {
  props: VideoLightboxPropsWithMedia;
  env: VideoLightboxEnvironment;
  sharedState: VideoLightboxSharedStateModel;
  handleApplySettings: () => void;
  handleNavigateToShotFromSelector: (shot: { id: string; name: string }) => void;
}

export function useVideoWorkflowBarModel({
  props,
  env,
  sharedState,
  handleApplySettings,
  handleNavigateToShotFromSelector,
}: UseVideoWorkflowBarModelInput): WorkflowControlsBarProps {
  const {
    media,
    onClose,
    showTickForImageId,
    showTickForSecondaryImageId,
    actions,
    shotWorkflow,
  } = props;
  const allShots = shotWorkflow?.allShots ?? [];
  const selectedShotId = shotWorkflow?.selectedShotId;

  return useMemo(() => ({
    core: {
      onDelete: actions?.onDelete,
      onApplySettings: actions?.onApplySettings,
      isSpecialEditMode: false,
      isVideo: true,
      handleApplySettings,
    },
    shotSelector: shotWorkflow?.onAddToShot
      ? {
          mediaId: env.actualGenerationId ?? media.id,
          imageUrl: sharedState.effectiveMedia.mediaUrl ?? '',
          thumbUrl: media.thumbUrl,
          allShots,
          selectedShotId,
          onShotChange: shotWorkflow?.onShotChange,
          onCreateShot: shotWorkflow?.onCreateShot,
          isAlreadyPositionedInSelectedShot: sharedState.shots.isAlreadyPositionedInSelectedShot,
          isAlreadyAssociatedWithoutPosition: sharedState.shots.isAlreadyAssociatedWithoutPosition,
          showTickForImageId,
          showTickForSecondaryImageId,
          onAddToShot: shotWorkflow.onAddToShot,
          onAddToShotWithoutPosition: shotWorkflow?.onAddToShotWithoutPosition,
          onAddVariantAsNewGeneration: sharedState.variants.handleAddVariantAsNewGenerationToShot,
          activeVariantId: sharedState.variants.activeVariant?.id || sharedState.variants.primaryVariant?.id,
          currentTimelineFrame: media.timeline_frame ?? undefined,
          onShowTick: shotWorkflow?.onShowTick,
          onOptimisticPositioned: shotWorkflow?.onOptimisticPositioned,
          onShowSecondaryTick: shotWorkflow?.onShowSecondaryTick,
          onOptimisticUnpositioned: shotWorkflow?.onOptimisticUnpositioned,
          isAdding: false,
          isAddingWithoutPosition: false,
          contentRef: env.contentRef,
          onNavigateToShot: handleNavigateToShotFromSelector,
          onClose,
        }
      : undefined,
  }), [
    actions?.onApplySettings,
    actions?.onDelete,
    allShots,
    env.actualGenerationId,
    env.contentRef,
    handleApplySettings,
    handleNavigateToShotFromSelector,
    media.id,
    media.thumbUrl,
    media.timeline_frame,
    onClose,
    selectedShotId,
    sharedState.effectiveMedia.mediaUrl,
    sharedState.shots.isAlreadyAssociatedWithoutPosition,
    sharedState.shots.isAlreadyPositionedInSelectedShot,
    sharedState.variants.activeVariant?.id,
    sharedState.variants.handleAddVariantAsNewGenerationToShot,
    sharedState.variants.primaryVariant?.id,
    shotWorkflow?.onAddToShot,
    shotWorkflow?.onAddToShotWithoutPosition,
    shotWorkflow?.onCreateShot,
    shotWorkflow?.onOptimisticPositioned,
    shotWorkflow?.onOptimisticUnpositioned,
    shotWorkflow?.onShotChange,
    shotWorkflow?.onShowSecondaryTick,
    shotWorkflow?.onShowTick,
    showTickForImageId,
    showTickForSecondaryImageId,
  ]);
}
