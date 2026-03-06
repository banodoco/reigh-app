import { useMemo } from 'react';
import type { VideoLightboxPropsWithMedia } from '../types';
import type {
  VideoLightboxEditModel,
  VideoLightboxSharedStateModel,
} from './useVideoLightboxController';
import type { VideoLightboxEnvironment } from './useVideoLightboxEnvironment';

interface UseVideoInfoPanelModelInput {
  props: VideoLightboxPropsWithMedia;
  panelVariant: 'desktop' | 'mobile';
  panelTaskId: string | null;
  env: VideoLightboxEnvironment;
  sharedState: VideoLightboxSharedStateModel;
  editModel: VideoLightboxEditModel;
}

export function useVideoInfoPanelModel({
  props,
  panelVariant,
  panelTaskId,
  env,
  sharedState,
  editModel,
}: UseVideoInfoPanelModelInput) {
  const {
    media,
    shotId,
    onOpenExternalGeneration,
    shotWorkflow,
  } = props;

  const selectedShotId = shotWorkflow?.selectedShotId;

  return useMemo(() => {
    const primaryVariant = sharedState.variants.primaryVariant;
    const onSwitchToPrimary = primaryVariant
      ? () => {
        sharedState.variants.setActiveVariantId(primaryVariant.id);
      }
      : undefined;

    return {
      variant: panelVariant,
      showImageEditTools: false,
      taskPanel: {
        taskDetailsData: editModel.adjustedTaskDetailsData,
        derivedItems: sharedState.lineage.derivedItems,
        derivedGenerations: sharedState.lineage.derivedGenerations,
        paginatedDerived: sharedState.lineage.paginatedDerived,
        derivedPage: sharedState.lineage.derivedPage,
        derivedTotalPages: sharedState.lineage.derivedTotalPages,
        onSetDerivedPage: sharedState.lineage.setDerivedPage,
        onNavigateToGeneration: onOpenExternalGeneration,
        currentMediaId: media.id,
        currentShotId: selectedShotId || shotId,
        replaceImages: env.replaceImages,
        onReplaceImagesChange: env.setReplaceImages,
        onSwitchToPrimary,
      },
      taskId: panelTaskId,
    };
  }, [
    editModel.adjustedTaskDetailsData,
    env.replaceImages,
    env.setReplaceImages,
    media.id,
    onOpenExternalGeneration,
    panelTaskId,
    panelVariant,
    selectedShotId,
    sharedState.lineage.derivedGenerations,
    sharedState.lineage.derivedItems,
    sharedState.lineage.derivedPage,
    sharedState.lineage.derivedTotalPages,
    sharedState.lineage.paginatedDerived,
    sharedState.lineage.setDerivedPage,
    sharedState.variants.primaryVariant,
    sharedState.variants.setActiveVariantId,
    shotId,
  ]);
}
