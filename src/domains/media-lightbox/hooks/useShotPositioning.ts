import { useMemo } from 'react';
import { useShotNavigation } from '@/shared/hooks/shots/useShotNavigation';
import { GenerationRow, Shot, ShotOption } from '@/domains/generation/types';
import { getGenerationId, getMediaUrl, getThumbnailUrl } from '@/shared/lib/media/mediaTypeHelpers';
import type { LightboxShotWorkflowProps } from '../types';

/**
 * Shot association data that may exist on media objects from gallery queries.
 * These fields are added by the query layer (not on GenerationRow base type).
 */
interface ShotAssociation {
  shot_id: string;
  position: number | null;
  timeline_frame?: number | null;
}

/** Extended media fields that may be present at runtime from gallery/query layer */
interface MediaWithShotFields {
  shot_id?: string;
  position?: number | null;
  url?: string;
  thumbnail_url?: string;
  all_shot_associations?: ShotAssociation[];
}

interface UseShotPositioningProps extends Pick<LightboxShotWorkflowProps,
  | 'selectedShotId'
  | 'allShots'
  | 'positionedInSelectedShot'
  | 'associatedWithoutPositionInSelectedShot'
  | 'optimisticPositionedIds'
  | 'optimisticUnpositionedIds'
  | 'onNavigateToShot'
  | 'onAddToShot'
  | 'onAddToShotWithoutPosition'
  | 'onShowTick'
  | 'onShowSecondaryTick'
  | 'onOptimisticPositioned'
  | 'onOptimisticUnpositioned'
> {
  media: GenerationRow;
  allShots: ShotOption[];
  onClose: () => void;
}

interface UseShotPositioningReturn {
  isAlreadyPositionedInSelectedShot: boolean;
  isAlreadyAssociatedWithoutPosition: boolean;
  handleAddToShot: () => Promise<void>;
  handleAddToShotWithoutPosition: () => Promise<void>;
}

/**
 * Hook for managing shot positioning logic
 * Handles checking if media is positioned/associated with shots and navigation
 */
export const useShotPositioning = ({
  media,
  selectedShotId,
  allShots,
  positionedInSelectedShot,
  associatedWithoutPositionInSelectedShot,
  optimisticPositionedIds,
  optimisticUnpositionedIds,
  onNavigateToShot,
  onClose,
  onAddToShot,
  onAddToShotWithoutPosition,
  onShowTick,
  onShowSecondaryTick,
  onOptimisticPositioned,
  onOptimisticUnpositioned,
}: UseShotPositioningProps): UseShotPositioningReturn => {
  const { navigateToShot } = useShotNavigation();
  
  // IMPORTANT: Use generation_id (actual generations.id) when available, falling back to id
  // For ShotImageManager/Timeline images, id is shot_generations.id but generation_id is the actual generation ID
  const actualGenerationId = getGenerationId(media);
  const generationIdForActions = actualGenerationId ?? media.id;

  const isAlreadyPositionedInSelectedShot = useMemo(() => {
    if (!selectedShotId || !media.id) return false;

    const compositeKey = `${media.id}:${selectedShotId}`;

    // Check optimistic state first (most up-to-date and shot-specific)
    const hasComposite = optimisticPositionedIds?.has(compositeKey);
    
    // Optimistic state takes precedence - if we have a composite key match, trust it
    if (hasComposite) {
      return true;
    }
    
    // CRITICAL: Don't trust simple keys when we have a selectedShotId - simple keys are not shot-specific!
    // Simple keys mean "added to SOME shot" but we don't know which one, so they're ambiguous.
    // Only use simple keys as a last resort if we can't determine shot-specific state.
    
    // Trust the override from parent component (ShotImageManagerDesktop)
    // The parent already verified the media is in the selected shot using props.shotId comparison
    // Don't re-verify using media.shot_id since the image objects may not have shot_id populated
    if (typeof positionedInSelectedShot === 'boolean') {
      return positionedInSelectedShot;
    }
    
    // Check if this media is positioned in the selected shot
    // First check single shot association
    const mediaExt = media as GenerationRow & MediaWithShotFields;
    if (mediaExt.shot_id === selectedShotId) {
      const result = mediaExt.position !== null && mediaExt.position !== undefined;
      return result;
    }

    // Check multiple shot associations
    const allShotAssociations = mediaExt.all_shot_associations;
    if (allShotAssociations && Array.isArray(allShotAssociations)) {
      const matchingAssociation = allShotAssociations.find(
        (assoc: ShotAssociation) => assoc.shot_id === selectedShotId
      );
      const result = !!(matchingAssociation &&
             matchingAssociation.position !== null &&
             matchingAssociation.position !== undefined);
      return result;
    }
    
    return false;
  }, [selectedShotId, media, optimisticPositionedIds, positionedInSelectedShot]);

  // Navigate to the selected shot (shared by both handlers)
  const navigateToSelectedShot = () => {
    if (!selectedShotId) return;
    const targetShotOption = allShots.find(s => s.id === selectedShotId);
    const minimalShot: Shot = {
      id: targetShotOption?.id || selectedShotId,
      name: targetShotOption?.name || 'Shot',
      images: [],
      position: 0,
    };
    if (onNavigateToShot) {
      onNavigateToShot(minimalShot);
    } else {
      onClose();
      navigateToShot(minimalShot);
    }
  };

  // Resolve media URLs (shared by both handlers)
  const resolveMediaUrls = () => {
    const mediaWithUrls = media as GenerationRow & MediaWithShotFields;
    const imageUrl = getMediaUrl(mediaWithUrls) || media.imageUrl;
    const thumbUrl = getThumbnailUrl(mediaWithUrls) || media.thumbUrl || imageUrl;
    return { imageUrl, thumbUrl };
  };

  // Internal helper shared by both add-to-shot handlers
  const executeAddToShot = async (
    addFn: ((targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>) | undefined,
    isAlreadyInShot: boolean,
    onShowFeedback: ((imageId: string) => void) | undefined,
    onOptimistic: ((mediaId: string, shotId: string) => void) | undefined,
  ) => {
    if (!addFn || !selectedShotId) return;

    if (isAlreadyInShot) {
      navigateToSelectedShot();
      return;
    }

    const { imageUrl, thumbUrl } = resolveMediaUrls();

    // CRITICAL: Pass selectedShotId (the dropdown value) as targetShotId
    // Use actualGenerationId (generations.id) not media.id (which might be shot_generations.id)
    const success = await addFn(selectedShotId, generationIdForActions, imageUrl, thumbUrl);
    if (success) {
      onShowFeedback?.(generationIdForActions);
      // Pass selectedShotId so optimistic state can use composite keys (mediaId:shotId)
      onOptimistic?.(generationIdForActions, selectedShotId);
    }
  };

  const handleAddToShot = () => executeAddToShot(
    onAddToShot, isAlreadyPositionedInSelectedShot, onShowTick, onOptimisticPositioned
  );

  // Check if image is already associated with the selected shot WITHOUT position
  const isAlreadyAssociatedWithoutPosition = useMemo(() => {
    if (!selectedShotId || !media.id) return false;

    // Prefer override from gallery source
    if (typeof associatedWithoutPositionInSelectedShot === 'boolean') {
      // Check for composite key (mediaId:shotId) first, then fallback to simple mediaId
      const compositeKey = `${media.id}:${selectedShotId}`;
      const hasComposite = optimisticUnpositionedIds?.has(compositeKey);
      const hasSimple = optimisticUnpositionedIds?.has(media.id);
      return associatedWithoutPositionInSelectedShot || !!hasComposite || !!hasSimple;
    }
    
    // Check optimistic state first - try composite key (mediaId:shotId), then fallback to simple mediaId
    const compositeKey = `${media.id}:${selectedShotId}`;
    if (optimisticUnpositionedIds?.has(compositeKey)) return true;
    if (optimisticUnpositionedIds?.has(media.id)) return true;
    
    // Check if this media is associated with the selected shot without position
    // First check single shot association
    const mediaExtAssoc = media as GenerationRow & MediaWithShotFields;
    if (mediaExtAssoc.shot_id === selectedShotId) {
      return mediaExtAssoc.position === null || mediaExtAssoc.position === undefined;
    }

    // Check multiple shot associations
    const assocShotAssociations = mediaExtAssoc.all_shot_associations;
    if (assocShotAssociations && Array.isArray(assocShotAssociations)) {
      const matchingAssociation = assocShotAssociations.find(
        (assoc: ShotAssociation) => assoc.shot_id === selectedShotId
      );
      return !!(matchingAssociation &&
             (matchingAssociation.position === null || matchingAssociation.position === undefined));
    }
    
    return false;
  }, [selectedShotId, media, optimisticUnpositionedIds, associatedWithoutPositionInSelectedShot]);

  const handleAddToShotWithoutPosition = () => executeAddToShot(
    onAddToShotWithoutPosition, isAlreadyAssociatedWithoutPosition, onShowSecondaryTick, onOptimisticUnpositioned
  );

  return {
    isAlreadyPositionedInSelectedShot,
    isAlreadyAssociatedWithoutPosition,
    handleAddToShot,
    handleAddToShotWithoutPosition,
  };
};
