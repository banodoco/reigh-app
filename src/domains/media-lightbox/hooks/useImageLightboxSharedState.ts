import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import type {
  LightboxActionHandlers,
  LightboxFeatureFlags,
  LightboxNavigationProps,
  LightboxShotWorkflowProps,
} from '../types';
import { useSharedLightboxState } from './useSharedLightboxState';
import type { ImageLightboxEnvironment } from './useImageLightboxEnvironment';

interface UseImageLightboxSharedStateProps {
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
}

export function useImageLightboxSharedState(
  props: UseImageLightboxSharedStateProps,
  env: ImageLightboxEnvironment,
) {
  const navigation = props.navigation;
  const { upscaleHook } = env;

  const handleSlotNavNext = useCallback(() => {
    navigation?.onNext?.();
  }, [navigation]);

  const handleSlotNavPrev = useCallback(() => {
    navigation?.onPrevious?.();
  }, [navigation]);

  const [modeSnapshot, setModeSnapshot] = useState({
    isInpaintMode: false,
    isMagicEditMode: false,
  });

  const sharedInput = useMemo(() => ({
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
      showNavigation: navigation?.showNavigation,
      hasNext: navigation?.hasNext ?? false,
      hasPrevious: navigation?.hasPrevious ?? false,
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
  }), [
    env.selectedProjectId,
    env.isMobile,
    env.variantFetchGenerationId,
    env.isCloudMode,
    env.isDownloading,
    env.setIsDownloading,
    env.upscaleHook,
    env.imageDimensions,
    env.projectAspectRatio,
    props.media,
    props.onClose,
    props.readOnly,
    props.initialVariantId,
    props.shotId,
    props.shotWorkflow,
    props.features?.showTaskDetails,
    props.features?.showDownload,
    props.actions,
    props.onOpenExternalGeneration,
    navigation?.showNavigation,
    navigation?.hasNext,
    navigation?.hasPrevious,
    handleSlotNavNext,
    handleSlotNavPrev,
    modeSnapshot.isMagicEditMode,
    modeSnapshot.isInpaintMode,
  ]);
  const sharedState = useSharedLightboxState(sharedInput);

  useEffect(() => {
    upscaleHook.setActiveVariant(sharedState.variants.activeVariant?.location, sharedState.variants.activeVariant?.id);
  }, [
    sharedState.variants.activeVariant?.location,
    sharedState.variants.activeVariant?.id,
    upscaleHook,
  ]);

  return {
    sharedState,
    handleSlotNavNext,
    handleSlotNavPrev,
    modeSnapshot,
    setModeSnapshot,
  };
}

export type ImageLightboxSharedModel = ReturnType<typeof useImageLightboxSharedState>;
