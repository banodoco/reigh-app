import { useCallback, useMemo } from 'react';
import { GenerationRow, Shot } from '@/types/shots';
import { QuickCreateSuccess, ShotOption } from '../types';
import { useQuickShotCreate } from '@/shared/hooks/useQuickShotCreate';
import { getGenerationId } from '@/shared/lib/mediaTypeHelpers';

interface UseShotCreationProps {
  media: GenerationRow;
  selectedProjectId: string | null;
  allShots: ShotOption[];
  onNavigateToShot?: (shot: Shot, options?: { isNewlyCreated?: boolean }) => void;
  onClose: () => void;
  onShotChange?: (shotId: string) => void;
}

interface UseShotCreationReturn {
  isCreatingShot: boolean;
  quickCreateSuccess: QuickCreateSuccess;
  handleQuickCreateAndAdd: () => Promise<void>;
  handleQuickCreateSuccess: () => void;
}

/**
 * Hook for managing quick shot creation with image in MediaLightbox
 * 
 * This is a thin wrapper around useQuickShotCreate that:
 * 1. Handles the generation_id vs id distinction (when viewing from ShotImagesEditor,
 *    media.id is the shot_generations.id, not the actual generations.id)
 * 2. Uses custom navigation via onNavigateToShot callback instead of internal navigation
 */
export const useShotCreation = ({
  media,
  allShots,
  onNavigateToShot,
  onClose,
  onShotChange,
}: UseShotCreationProps): UseShotCreationReturn => {
  // CRITICAL: When viewing from ShotImagesEditor, media.id is the shot_generations.id (join table ID)
  // We need to use media.generation_id (actual generations table ID) for creating new shot associations
  const actualGenerationId = useMemo(() => {
    const genId = getGenerationId(media);
    return genId;
  }, [media]);

  // Use the consolidated hook
  const {
    isCreatingShot,
    quickCreateSuccess,
    handleQuickCreateAndAdd,
    clearQuickCreateSuccess,
  } = useQuickShotCreate({
    generationId: actualGenerationId ?? media.id,
    shots: allShots,
    onShotChange,
    // Don't use the hook's built-in navigation - we have custom navigation via onNavigateToShot
    onClose: undefined,
  });

  // Custom navigation handler that uses onNavigateToShot callback
  const handleQuickCreateSuccess = useCallback(() => {

    if (quickCreateSuccess.shotId && onNavigateToShot) {
      // Try to find the shot in the list first
      const shotOption = allShots?.find(s => s.id === quickCreateSuccess.shotId);

      // Close the lightbox first
      onClose();

      if (shotOption) {
        // Build a minimal Shot object compatible with navigation
        const minimalShot: Shot = {
          id: shotOption.id,
          name: shotOption.name,
          images: [],
          position: 0,
        };
        onNavigateToShot(minimalShot, { isNewlyCreated: true });
      } else {
        // Fallback when shot not in list yet
        const minimalShot: Shot = {
          id: quickCreateSuccess.shotId,
          name: quickCreateSuccess.shotName || 'Shot',
          images: [],
          position: 0,
        };
        onNavigateToShot(minimalShot, { isNewlyCreated: true });
      }
    }

    // Always clear the success state (prevents the header from sticking on "Visit Shot")
    clearQuickCreateSuccess();
  }, [quickCreateSuccess, onNavigateToShot, onClose, allShots, clearQuickCreateSuccess]);

  return {
    isCreatingShot,
    quickCreateSuccess,
    handleQuickCreateAndAdd,
    handleQuickCreateSuccess,
  };
};
