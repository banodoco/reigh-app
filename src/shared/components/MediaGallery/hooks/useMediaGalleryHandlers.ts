import { useCallback, useEffect } from 'react';

import { handleError } from '@/shared/lib/errorHandling/handleError';
import type { Shot } from '@/types/shots';

import type { GeneratedImageWithMetadata } from '../types';

interface SimplifiedShotOption {
  id: string;
  name: string;
  settings?: unknown;
  created_at?: string | null;
}

interface UseMediaGalleryHandlersArgs {
  allShots: Shot[];
  simplifiedShotOptions: SimplifiedShotOption[];
  navigateToShot: (shot: Shot) => void;
  closeLightbox: () => void;
  handleShotChange: (shotId: string) => void;
  formAssociatedShotId?: string | null;
  onSwitchToAssociatedShot?: (shotId: string) => void;
  setShotFilter: (value: string) => void;
  activeLightboxMedia: GeneratedImageWithMetadata | null;
  setSelectedImageForDetails: (image: GeneratedImageWithMetadata | null) => void;
  setShowTaskDetailsModal: (open: boolean) => void;
  setActiveLightboxMedia: (image: GeneratedImageWithMetadata | null) => void;
}

export function useMediaGalleryHandlers({
  allShots,
  simplifiedShotOptions,
  navigateToShot,
  closeLightbox,
  handleShotChange,
  formAssociatedShotId,
  onSwitchToAssociatedShot,
  setShotFilter,
  activeLightboxMedia,
  setSelectedImageForDetails,
  setShowTaskDetailsModal,
  setActiveLightboxMedia,
}: UseMediaGalleryHandlersArgs) {
  const handleNavigateToShot = useCallback((shot: Shot) => {
    try {
      navigateToShot(shot);
      closeLightbox();
    } catch (error) {
      handleError(error, { context: 'MediaGallery', showToast: false });
    }
  }, [navigateToShot, closeLightbox]);

  const handleVisitShotFromNotifier = useCallback((shotId: string) => {
    const shot = simplifiedShotOptions.find((option) => option.id === shotId);
    if (!shot) {
      console.error('[VisitShotDebug] ERROR: Shot not found for ID:', shotId);
      return;
    }

    const fullShot = allShots.find((candidate) => candidate.id === shotId);
    if (!fullShot) {
      console.error('[VisitShotDebug] ERROR: Full shot not found for ID:', shotId);
      return;
    }

    try {
      navigateToShot(fullShot);
    } catch (error) {
      handleError(error, { context: 'MediaGallery', showToast: false });
    }
  }, [simplifiedShotOptions, allShots, navigateToShot]);

  const handleSwitchToAssociatedShot = useCallback(() => {
    if (formAssociatedShotId && onSwitchToAssociatedShot) {
      onSwitchToAssociatedShot(formAssociatedShotId);
    }
  }, [formAssociatedShotId, onSwitchToAssociatedShot]);

  const handleShowAllShots = useCallback(() => {
    setShotFilter('all');
  }, [setShotFilter]);

  const handleShowTaskDetails = useCallback(() => {
    if (!activeLightboxMedia) {
      handleError(new Error('No active lightbox media found'), { context: 'handleShowTaskDetails' });
      return;
    }

    setSelectedImageForDetails(activeLightboxMedia);
    setTimeout(() => {
      setShowTaskDetailsModal(true);
      setActiveLightboxMedia(null);
    }, 100);
  }, [
    activeLightboxMedia,
    setSelectedImageForDetails,
    setShowTaskDetailsModal,
    setActiveLightboxMedia,
  ]);

  useEffect(() => {
    const handleSelectShotForAddition = (event: CustomEvent<{ shotId: string; shotName: string }>) => {
      const { shotId } = event.detail;
      handleShotChange(shotId);
    };

    window.addEventListener('selectShotForAddition', handleSelectShotForAddition as EventListener);
    return () => window.removeEventListener('selectShotForAddition', handleSelectShotForAddition as EventListener);
  }, [handleShotChange]);

  return {
    handleNavigateToShot,
    handleVisitShotFromNotifier,
    handleSwitchToAssociatedShot,
    handleShowAllShots,
    handleShowTaskDetails,
  };
}
