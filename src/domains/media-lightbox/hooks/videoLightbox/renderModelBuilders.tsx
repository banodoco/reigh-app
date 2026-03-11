import type { ComponentProps, ReactNode } from 'react';
import { InfoPanel } from '../../components/InfoPanel';
import { VideoEditPanel } from '../../components/VideoEditPanel';
import type { LightboxStateValue } from '../../contexts/LightboxStateContext';
import type { VideoLightboxPropsWithMedia } from '../../types';
import type {
  VideoLightboxEditModel,
  VideoLightboxSharedStateModel,
} from '../useVideoLightboxController';
import type {
  VideoLightboxEnvironment,
  VideoLightboxModeModel,
} from '../useVideoLightboxEnvironment';

type VideoEditPanelModel = ComponentProps<typeof VideoEditPanel>;
type VideoInfoPanelModel = ComponentProps<typeof InfoPanel>;

interface BuildVideoLightboxVariantsModelInput {
  sharedState: VideoLightboxSharedStateModel;
  editModel: Pick<VideoLightboxEditModel, 'loadVariantImages' | 'variantBadges' | 'variantSegmentImages'>;
  env: Pick<VideoLightboxEnvironment, 'setVariantParamsToLoad' | 'variantsSectionRef'>;
}

export function buildVideoLightboxVariantsModel({
  sharedState,
  editModel,
  env,
}: BuildVideoLightboxVariantsModelInput): LightboxStateValue['variants'] {
  return {
    variants: sharedState.variants.list,
    activeVariant: sharedState.variants.activeVariant,
    primaryVariant: sharedState.variants.primaryVariant,
    isLoadingVariants: sharedState.variants.isLoading,
    handleVariantSelect: sharedState.variants.setActiveVariantId,
    handleMakePrimary: sharedState.variants.setPrimaryVariant,
    handleDeleteVariant: sharedState.variants.deleteVariant,
    onLoadVariantSettings: env.setVariantParamsToLoad,
    onLoadVariantImages: editModel.variantSegmentImages ? editModel.loadVariantImages : undefined,
    currentSegmentImages: editModel.variantSegmentImages,
    promoteSuccess: sharedState.variants.promoteSuccess,
    isPromoting: sharedState.variants.isPromoting,
    handlePromoteToGeneration: sharedState.variants.handlePromoteToGeneration,
    isMakingMainVariant: sharedState.makeMainVariant.isMaking,
    canMakeMainVariant: sharedState.makeMainVariant.canMake,
    handleMakeMainVariant: sharedState.makeMainVariant.handle,
    pendingTaskCount: editModel.variantBadges.pendingTaskCount,
    unviewedVariantCount: editModel.variantBadges.unviewedVariantCount,
    onMarkAllViewed: editModel.variantBadges.handleMarkAllViewed,
    variantsSectionRef: env.variantsSectionRef,
  };
}

interface BuildVideoLightboxStateValueInput {
  media: VideoLightboxPropsWithMedia['media'];
  onClose: () => void;
  readOnly: boolean;
  env: Pick<
    VideoLightboxEnvironment,
    'actualGenerationId' | 'imageDimensions' | 'isMobile' | 'selectedProjectId' | 'setImageDimensions'
  >;
  sharedState: Pick<VideoLightboxSharedStateModel, 'effectiveMedia' | 'layout' | 'navigation'>;
  modeModel: Pick<VideoLightboxModeModel, 'handleSlotNavNext' | 'handleSlotNavPrev' | 'hasNext' | 'hasPrevious'>;
  showNavigation: boolean;
  lightboxVariants: LightboxStateValue['variants'];
}

export function buildVideoLightboxStateValue({
  media,
  onClose,
  readOnly,
  env,
  sharedState,
  modeModel,
  showNavigation,
  lightboxVariants,
}: BuildVideoLightboxStateValueInput): LightboxStateValue {
  return {
    core: {
      onClose,
      readOnly,
      isMobile: env.isMobile,
      isTabletOrLarger: sharedState.layout.isTabletOrLarger,
      selectedProjectId: env.selectedProjectId,
      actualGenerationId: env.actualGenerationId,
    },
    media: {
      media,
      isVideo: true,
      effectiveMediaUrl: sharedState.effectiveMedia.mediaUrl ?? '',
      effectiveVideoUrl: sharedState.effectiveMedia.videoUrl ?? '',
      effectiveImageDimensions: sharedState.effectiveMedia.imageDimensions,
      imageDimensions: env.imageDimensions,
      setImageDimensions: env.setImageDimensions,
    },
    variants: lightboxVariants,
    navigation: {
      showNavigation,
      hasNext: modeModel.hasNext,
      hasPrevious: modeModel.hasPrevious,
      handleSlotNavNext: modeModel.handleSlotNavNext,
      handleSlotNavPrev: modeModel.handleSlotNavPrev,
      swipeNavigation: sharedState.navigation.swipeNavigation,
    },
  };
}

interface BuildVideoEditPanelModelInput {
  panelVariant: 'desktop' | 'mobile';
  env: Pick<VideoLightboxEnvironment, 'isCloudMode' | 'selectedProjectId'>;
  editModel: Pick<VideoLightboxEditModel, 'regenerateFormProps' | 'videoMode'>;
  sharedState: Pick<VideoLightboxSharedStateModel, 'effectiveMedia'>;
  panelTaskId: string | null;
}

export function buildVideoEditPanelModel({
  panelVariant,
  env,
  editModel,
  sharedState,
  panelTaskId,
}: BuildVideoEditPanelModelInput): VideoEditPanelModel {
  return {
    variant: panelVariant,
    isCloudMode: env.isCloudMode,
    trim: {
      trimState: editModel.videoMode.trimState,
      onStartTrimChange: editModel.videoMode.setStartTrim,
      onEndTrimChange: editModel.videoMode.setEndTrim,
      onResetTrim: editModel.videoMode.resetTrim,
      trimmedDuration: editModel.videoMode.trimmedDuration,
      hasTrimChanges: editModel.videoMode.hasTrimChanges,
      onSaveTrim: editModel.videoMode.saveTrimmedVideo,
      isSavingTrim: editModel.videoMode.isSavingTrim,
      trimSaveProgress: editModel.videoMode.trimSaveProgress,
      trimSaveError: editModel.videoMode.trimSaveError,
      trimSaveSuccess: editModel.videoMode.trimSaveSuccess,
      videoUrl: sharedState.effectiveMedia.videoUrl ?? '',
      trimCurrentTime: editModel.videoMode.trimCurrentTime,
      trimVideoRef: editModel.videoMode.trimVideoRef,
    },
    replace: {
      videoEditing: editModel.videoMode.videoEditing,
      projectId: env.selectedProjectId ?? undefined,
    },
    regenerateFormProps: editModel.regenerateFormProps,
    enhance: {
      settings: editModel.videoMode.videoEnhance.settings,
      onUpdateSetting: editModel.videoMode.videoEnhance.updateSetting,
      onGenerate: editModel.videoMode.videoEnhance.handleGenerate,
      isGenerating: editModel.videoMode.videoEnhance.isGenerating,
      generateSuccess: editModel.videoMode.videoEnhance.generateSuccess,
      canSubmit: editModel.videoMode.videoEnhance.canSubmit,
    },
    taskId: panelTaskId,
  };
}

interface BuildVideoControlsPanelContentInput {
  showPanel: boolean;
  isInVideoEditMode: boolean;
  videoEditSubMode: VideoLightboxEnvironment['videoEditSubMode'];
  videoEditPanelModel: VideoEditPanelModel;
  videoInfoPanelModel: VideoInfoPanelModel;
}

export function buildVideoControlsPanelContent({
  showPanel,
  isInVideoEditMode,
  videoEditSubMode,
  videoEditPanelModel,
  videoInfoPanelModel,
}: BuildVideoControlsPanelContentInput): ReactNode | undefined {
  if (!showPanel) {
    return undefined;
  }

  if (isInVideoEditMode && videoEditSubMode) {
    return <VideoEditPanel {...videoEditPanelModel} />;
  }

  return <InfoPanel {...videoInfoPanelModel} />;
}
