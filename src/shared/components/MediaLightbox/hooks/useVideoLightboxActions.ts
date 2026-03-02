import { useCallback } from 'react';
import { handleLightboxDownload } from '../utils';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type {
  VideoLightboxSharedStateModel,
} from './useVideoLightboxController';
import type { VideoLightboxProps } from '../videoLightboxContracts';
import type { VideoLightboxEnvironment } from './useVideoLightboxEnvironment';

interface UseVideoLightboxActionsInput {
  props: VideoLightboxProps;
  env: VideoLightboxEnvironment;
  sharedState: VideoLightboxSharedStateModel;
}

export function useVideoLightboxActions({
  props,
  env,
  sharedState,
}: UseVideoLightboxActionsInput) {
  const handleDownload = useCallback(async (): Promise<void> => {
    if (!props.media) {
      return;
    }

    await handleLightboxDownload({
      intendedVariantId: sharedState.intendedActiveVariantIdRef.current,
      variants: sharedState.variants.list,
      fallbackUrl: sharedState.effectiveMedia.videoUrl ?? '',
      media: props.media,
      isVideo: true,
      setIsDownloading: env.setIsDownloading,
    });
  }, [
    props.media,
    sharedState.intendedActiveVariantIdRef,
    sharedState.variants.list,
    sharedState.effectiveMedia.videoUrl,
    env.setIsDownloading,
  ]);

  const handleDelete = useCallback(async (): Promise<void> => {
    if (!props.actions?.onDelete || !props.media) {
      return;
    }

    try {
      await Promise.resolve(props.actions.onDelete(props.media.id));
    } catch (error) {
      normalizeAndPresentError(error, {
        context: 'VideoLightbox.delete',
        toastTitle: 'Delete Failed',
      });
    }
  }, [props.actions, props.media]);

  const handleApplySettings = useCallback(() => {
    if (props.actions?.onApplySettings && props.media) {
      props.actions.onApplySettings(props.media.metadata);
    }
  }, [props.actions, props.media]);

  const handleNavigateToShotFromSelector = useCallback((shot: { id: string; name: string }) => {
    if (!props.shotWorkflow?.onNavigateToShot) {
      return;
    }
    const minimalShot = { id: shot.id, name: shot.name, images: [], position: 0 };
    props.onClose();
    props.shotWorkflow.onNavigateToShot(minimalShot);
  }, [props.onClose, props.shotWorkflow]);

  return {
    handleDownload,
    handleDelete,
    handleApplySettings,
    handleNavigateToShotFromSelector,
  };
}
