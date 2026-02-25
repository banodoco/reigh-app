import { useCallback } from 'react';

import {
  normalizeAndPresentError,
  type RuntimeErrorOptions,
} from '@/shared/lib/errorHandling/runtimeError';

import type {
  GeneratedImageWithMetadata,
  NavigableShot,
  SimplifiedShotOption,
} from '../types';

interface UseMediaGalleryHandlersArgs {
  allShots: NavigableShot[];
  simplifiedShotOptions: SimplifiedShotOption[];
  navigateToShot: (shot: NavigableShot) => void;
  closeLightbox: () => void;
  formAssociatedShotId?: string | null;
  onSwitchToAssociatedShot?: (shotId: string) => void;
  setShotFilter: (value: string) => void;
  activeLightboxMedia: GeneratedImageWithMetadata | null;
  setSelectedImageForDetails: (image: GeneratedImageWithMetadata | null) => void;
  setShowTaskDetailsModal: (open: boolean) => void;
  setActiveLightboxMedia: (image: GeneratedImageWithMetadata | null) => void;
  reportError?: (error: unknown, options: RuntimeErrorOptions) => void;
}

interface UseShotNavigationHandlersArgs {
  allShots: NavigableShot[];
  simplifiedShotOptions: SimplifiedShotOption[];
  navigateToShot: (shot: NavigableShot) => void;
  closeLightbox: () => void;
  reportError: (error: unknown, options: RuntimeErrorOptions) => void;
}

function useShotNavigationHandlers({
  allShots,
  simplifiedShotOptions,
  navigateToShot,
  closeLightbox,
  reportError,
}: UseShotNavigationHandlersArgs) {
  const handleNavigateToShot = useCallback((shot: NavigableShot) => {
    try {
      navigateToShot(shot);
      closeLightbox();
    } catch (error) {
      reportError(error, {
        context: 'MediaGallery.handleNavigateToShot',
        showToast: false,
        logData: { shotId: shot.id },
      });
    }
  }, [navigateToShot, closeLightbox, reportError]);

  const handleVisitShotFromNotifier = useCallback((shotId: string) => {
    const shot = simplifiedShotOptions.find((option) => option.id === shotId);
    if (!shot) {
      reportError(new Error('Shot option not found for notifier navigation'), {
        context: 'MediaGallery.handleVisitShotFromNotifier',
        showToast: false,
        logData: { shotId, scope: 'simplifiedShotOptions' },
      });
      return;
    }

    const fullShot = allShots.find((candidate) => candidate.id === shotId);
    if (!fullShot) {
      reportError(new Error('Shot entity not found for notifier navigation'), {
        context: 'MediaGallery.handleVisitShotFromNotifier',
        showToast: false,
        logData: { shotId, scope: 'allShots' },
      });
      return;
    }

    try {
      navigateToShot(fullShot);
    } catch (error) {
      reportError(error, {
        context: 'MediaGallery.handleVisitShotFromNotifier',
        showToast: false,
        logData: { shotId },
      });
    }
  }, [simplifiedShotOptions, allShots, navigateToShot, reportError]);

  return {
    handleNavigateToShot,
    handleVisitShotFromNotifier,
  };
}

interface UseShotFilterHandlersArgs {
  formAssociatedShotId?: string | null;
  onSwitchToAssociatedShot?: (shotId: string) => void;
  setShotFilter: (value: string) => void;
}

function useShotFilterHandlers({
  formAssociatedShotId,
  onSwitchToAssociatedShot,
  setShotFilter,
}: UseShotFilterHandlersArgs) {
  const handleSwitchToAssociatedShot = useCallback(() => {
    if (formAssociatedShotId && onSwitchToAssociatedShot) {
      onSwitchToAssociatedShot(formAssociatedShotId);
    }
  }, [formAssociatedShotId, onSwitchToAssociatedShot]);

  const handleShowAllShots = useCallback(() => {
    setShotFilter('all');
  }, [setShotFilter]);

  return {
    handleSwitchToAssociatedShot,
    handleShowAllShots,
  };
}

interface UseTaskDetailsHandlerArgs {
  activeLightboxMedia: GeneratedImageWithMetadata | null;
  setSelectedImageForDetails: (image: GeneratedImageWithMetadata | null) => void;
  setShowTaskDetailsModal: (open: boolean) => void;
  setActiveLightboxMedia: (image: GeneratedImageWithMetadata | null) => void;
  reportError: (error: unknown, options: RuntimeErrorOptions) => void;
}

function useTaskDetailsHandler({
  activeLightboxMedia,
  setSelectedImageForDetails,
  setShowTaskDetailsModal,
  setActiveLightboxMedia,
  reportError,
}: UseTaskDetailsHandlerArgs) {
  const handleShowTaskDetails = useCallback(() => {
    if (!activeLightboxMedia) {
      reportError(new Error('No active lightbox media found'), {
        context: 'MediaGallery.handleShowTaskDetails',
        showToast: false,
      });
      return;
    }

    setSelectedImageForDetails(activeLightboxMedia);
    setShowTaskDetailsModal(true);
    setActiveLightboxMedia(null);
  }, [
    activeLightboxMedia,
    setSelectedImageForDetails,
    setShowTaskDetailsModal,
    setActiveLightboxMedia,
    reportError,
  ]);

  return { handleShowTaskDetails };
}

export function useMediaGalleryHandlers({
  allShots,
  simplifiedShotOptions,
  navigateToShot,
  closeLightbox,
  formAssociatedShotId,
  onSwitchToAssociatedShot,
  setShotFilter,
  activeLightboxMedia,
  setSelectedImageForDetails,
  setShowTaskDetailsModal,
  setActiveLightboxMedia,
  reportError: reportErrorProp,
}: UseMediaGalleryHandlersArgs) {
  const reportError = useCallback((error: unknown, options: RuntimeErrorOptions) => {
    if (reportErrorProp) {
      reportErrorProp(error, options);
      return;
    }
    normalizeAndPresentError(error, options);
  }, [reportErrorProp]);

  const {
    handleNavigateToShot,
    handleVisitShotFromNotifier,
  } = useShotNavigationHandlers({
    allShots,
    simplifiedShotOptions,
    navigateToShot,
    closeLightbox,
    reportError,
  });

  const {
    handleSwitchToAssociatedShot,
    handleShowAllShots,
  } = useShotFilterHandlers({
    formAssociatedShotId,
    onSwitchToAssociatedShot,
    setShotFilter,
  });

  const { handleShowTaskDetails } = useTaskDetailsHandler({
    activeLightboxMedia,
    setSelectedImageForDetails,
    setShowTaskDetailsModal,
    setActiveLightboxMedia,
    reportError,
  });

  return {
    handleNavigateToShot,
    handleVisitShotFromNotifier,
    handleSwitchToAssociatedShot,
    handleShowAllShots,
    handleShowTaskDetails,
  };
}
