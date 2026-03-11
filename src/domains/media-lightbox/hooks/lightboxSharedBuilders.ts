import type { GenerationRow } from '@/domains/generation/types';
import type {
  LightboxActionHandlers,
  LightboxFeatureFlags,
  LightboxNavigationProps,
  LightboxShotWorkflowProps,
  SegmentSlotModeData,
  VideoLightboxProps,
  VideoLightboxPropsWithMedia,
} from '../types';
import type { ImageLightboxEnvironment } from './useImageLightboxEnvironment';
import type { VideoLightboxEnvironment, VideoLightboxModeModel } from './useVideoLightboxEnvironment';
import type { useSharedLightboxState } from './useSharedLightboxState';

type SharedLightboxInput = Parameters<typeof useSharedLightboxState>[0];

interface BuildImageSharedLightboxInputArgs {
  props: {
    media: GenerationRow;
    onClose: () => void;
    readOnly?: boolean;
    shotId?: string;
    initialVariantId?: string;
    navigation?: LightboxNavigationProps;
    shotWorkflow?: LightboxShotWorkflowProps;
    features?: LightboxFeatureFlags;
    actions?: LightboxActionHandlers;
    onOpenExternalGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
  };
  env: ImageLightboxEnvironment;
  modeSnapshot: { isInpaintMode: boolean; isMagicEditMode: boolean };
  handleSlotNavNext: () => void;
  handleSlotNavPrev: () => void;
}

export function buildImageSharedLightboxInput({
  props,
  env,
  modeSnapshot,
  handleSlotNavNext,
  handleSlotNavPrev,
}: BuildImageSharedLightboxInputArgs): SharedLightboxInput {
  return {
    core: {
      media: props.media,
      isVideo: false,
      selectedProjectId: env.selectedProjectId,
      isMobile: env.isMobile,
      isFormOnlyMode: false,
      onClose: props.onClose,
      readOnly: props.readOnly ?? false,
      variantFetchGenerationId: env.variantFetchGenerationId,
      initialVariantId: props.initialVariantId,
    },
    navigation: {
      showNavigation: props.navigation?.showNavigation,
      hasNext: props.navigation?.hasNext ?? false,
      hasPrevious: props.navigation?.hasPrevious ?? false,
      handleSlotNavNext,
      handleSlotNavPrev,
      swipeDisabled: modeSnapshot.isMagicEditMode || (props.readOnly ?? false),
    },
    shots: {
      shotId: props.shotId,
      shotWorkflow: props.shotWorkflow,
    },
    layout: {
      showTaskDetails: props.features?.showTaskDetails,
      isSpecialEditMode: modeSnapshot.isMagicEditMode,
      isInpaintMode: modeSnapshot.isInpaintMode,
      isMagicEditMode: modeSnapshot.isMagicEditMode,
    },
    actions: {
      isCloudMode: env.isCloudMode,
      showDownload: props.features?.showDownload,
      isDownloading: env.isDownloading,
      setIsDownloading: env.setIsDownloading,
      onDelete: props.actions?.onDelete,
      isDeleting: props.actions?.isDeleting,
      isUpscaling: env.upscaleHook.isUpscaling,
      handleUpscale: () => {
        void env.upscaleHook.handleUpscale({ scaleFactor: 2, noiseScale: 0.1 });
      },
    },
    media: {
      effectiveImageUrl: env.upscaleHook.effectiveImageUrl,
      imageDimensions: env.imageDimensions || { width: 1024, height: 1024 },
      projectAspectRatio: env.projectAspectRatio,
    },
    starred: props.actions?.starred,
    onOpenExternalGeneration: props.onOpenExternalGeneration,
  };
}

export function buildVideoSharedLightboxInput(params: {
  props: VideoLightboxPropsWithMedia;
  modeModel: VideoLightboxModeModel;
  env: VideoLightboxEnvironment;
}): SharedLightboxInput {
  const { props, modeModel, env } = params;
  const nav = props.navigation;
  const sw = props.shotWorkflow;
  const feat = props.features;
  const act = props.actions;
  const readOnly = props.readOnly ?? false;

  return {
    core: {
      media: props.media,
      isVideo: true,
      selectedProjectId: env.selectedProjectId,
      isMobile: env.isMobile,
      isFormOnlyMode: modeModel.isFormOnlyMode,
      onClose: props.onClose,
      readOnly,
      variantFetchGenerationId: env.variantFetchGenerationId,
      initialVariantId: props.initialVariantId,
    },
    navigation: {
      showNavigation: nav?.showNavigation ?? true,
      hasNext: modeModel.hasNext,
      hasPrevious: modeModel.hasPrevious,
      handleSlotNavNext: modeModel.handleSlotNavNext,
      handleSlotNavPrev: modeModel.handleSlotNavPrev,
      swipeDisabled: env.videoEditSubMode !== null || readOnly,
    },
    shots: {
      shotId: props.shotId,
      shotWorkflow: sw,
    },
    layout: {
      showTaskDetails: feat?.showTaskDetails ?? false,
      isSpecialEditMode: env.videoEditSubMode !== null,
      isInpaintMode: false,
      isMagicEditMode: false,
    },
    actions: {
      isCloudMode: env.isCloudMode,
      showDownload: feat?.showDownload ?? true,
      isDownloading: env.isDownloading,
      setIsDownloading: env.setIsDownloading,
      onDelete: act?.onDelete,
      isDeleting: act?.isDeleting,
      isUpscaling: false,
      handleUpscale: () => {},
    },
    media: {
      effectiveImageUrl: env.effectiveImageUrl,
      imageDimensions: env.imageDimensions || { width: 1024, height: 576 },
      projectAspectRatio: env.projectAspectRatio,
    },
    starred: act?.starred,
    onOpenExternalGeneration: props.onOpenExternalGeneration,
  };
}

export function buildVariantSegmentImages(
  segmentSlotMode?: SegmentSlotModeData,
  currentSegmentImages?: NonNullable<VideoLightboxProps['videoProps']>['currentSegmentImages'],
) {
  if (segmentSlotMode?.pairData) {
    return {
      startUrl: segmentSlotMode.pairData.startImage?.url,
      endUrl: segmentSlotMode.pairData.endImage?.url,
      startGenerationId: segmentSlotMode.pairData.startImage?.generationId,
      endGenerationId: segmentSlotMode.pairData.endImage?.generationId,
      startShotGenerationId: segmentSlotMode.pairData.startImage?.id,
      endShotGenerationId: segmentSlotMode.pairData.endImage?.id,
      startVariantId: segmentSlotMode.pairData.startImage?.primaryVariantId,
      endVariantId: segmentSlotMode.pairData.endImage?.primaryVariantId,
    };
  }

  return currentSegmentImages;
}
