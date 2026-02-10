import { useMemo, useEffect } from 'react';
import { useShotNavigation } from '@/shared/hooks/useShotNavigation';
import { GenerationRow, Shot } from '@/types/shots';
import { getGenerationId, getMediaUrl, getThumbnailUrl } from '@/shared/lib/mediaTypeHelpers';

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

export interface ShotOption {
  id: string;
  name: string;
}

interface UseShotPositioningProps {
  media: GenerationRow;
  selectedShotId: string | undefined;
  allShots: ShotOption[];
  positionedInSelectedShot?: boolean;
  associatedWithoutPositionInSelectedShot?: boolean;
  optimisticPositionedIds?: Set<string>;
  optimisticUnpositionedIds?: Set<string>;
  onNavigateToShot?: (shot: Shot, options?: { isNewlyCreated?: boolean }) => void;
  onClose: () => void;
  // CRITICAL: targetShotId is the shot selected in the DROPDOWN, not the shot being viewed
  onAddToShot?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onShowTick?: (imageId: string) => void;
  onShowSecondaryTick?: (imageId: string) => void;
  onOptimisticPositioned?: (mediaId: string, shotId: string) => void;
  onOptimisticUnpositioned?: (mediaId: string, shotId: string) => void;
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

  const isAlreadyPositionedInSelectedShot = useMemo(() => {
    if (!selectedShotId || !media.id) return false;

    const compositeKey = `${media.id}:${selectedShotId}`;
    const optimisticSetSize = optimisticPositionedIds?.size || 0;
    const optimisticKeys = optimisticPositionedIds ? Array.from(optimisticPositionedIds) : [];
    
    // Check optimistic state first (most up-to-date and shot-specific)
    const hasComposite = optimisticPositionedIds?.has(compositeKey);
    const hasSimple = optimisticPositionedIds?.has(media.id);
    
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
      const result = matchingAssociation && 
             matchingAssociation.position !== null && 
             matchingAssociation.position !== undefined;
      return result;
    }
    
    return false;
  }, [selectedShotId, media, optimisticPositionedIds, positionedInSelectedShot]);

  // [ShotNavDebug] Log computed positioned state
  useEffect(() => {
    const mediaExtDbg = media as GenerationRow & MediaWithShotFields;
  }, [isAlreadyPositionedInSelectedShot, media?.id, selectedShotId, optimisticPositionedIds, positionedInSelectedShot]);

  const handleAddToShot = async () => {
    if (!onAddToShot || !selectedShotId) return;
    
    // If already positioned in shot, navigate to the shot
    if (isAlreadyPositionedInSelectedShot) {
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
      return;
    }
    
    // FIX: Use fallback chain for image URL since data structure varies
    // The media object may have 'url', 'location', or 'imageUrl' depending on source
    const mediaWithUrls = media as GenerationRow & MediaWithShotFields;
    const imageUrl = getMediaUrl(mediaWithUrls) || media.imageUrl;
    const thumbUrl = getThumbnailUrl(mediaWithUrls) || media.thumbUrl || imageUrl;

    // CRITICAL: Pass selectedShotId (the dropdown value) as targetShotId
    // Use actualGenerationId (generations.id) not media.id (which might be shot_generations.id)
    const success = await onAddToShot(selectedShotId, actualGenerationId, imageUrl, thumbUrl);
    if (success) {
      onShowTick?.(actualGenerationId);
      // Pass selectedShotId so optimistic state can use composite keys (mediaId:shotId)
      const optimisticKey = `${actualGenerationId}:${selectedShotId}`;
      onOptimisticPositioned?.(actualGenerationId, selectedShotId);
    }
  };

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
      return matchingAssociation && 
             (matchingAssociation.position === null || matchingAssociation.position === undefined);
    }
    
    return false;
  }, [selectedShotId, media, optimisticUnpositionedIds, associatedWithoutPositionInSelectedShot]);

  // [ShotNavDebug] Log computed unpositioned state
  useEffect(() => {
    const mediaExtDbg2 = media as GenerationRow & MediaWithShotFields;
  }, [isAlreadyAssociatedWithoutPosition, media?.id, selectedShotId, optimisticUnpositionedIds, associatedWithoutPositionInSelectedShot]);

  const handleAddToShotWithoutPosition = async () => {
    if (!onAddToShotWithoutPosition || !selectedShotId) return;

    // If already associated without position, navigate to the shot
    if (isAlreadyAssociatedWithoutPosition) {
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
      return;
    }
    
    // FIX: Use fallback chain for image URL since data structure varies
    const mediaWithUrls2 = media as GenerationRow & MediaWithShotFields;
    const imageUrl = getMediaUrl(mediaWithUrls2) || media.imageUrl;
    const thumbUrl = getThumbnailUrl(mediaWithUrls2) || media.thumbUrl || imageUrl;
    
    // CRITICAL: Pass selectedShotId (the dropdown value) as targetShotId
    // Use actualGenerationId (generations.id) not media.id (which might be shot_generations.id)
    const success = await onAddToShotWithoutPosition(selectedShotId, actualGenerationId, imageUrl, thumbUrl);
    if (success) {
      onShowSecondaryTick?.(actualGenerationId);
      // Pass selectedShotId so optimistic state can use composite keys (mediaId:shotId)
      onOptimisticUnpositioned?.(actualGenerationId, selectedShotId);
    }
  };

  return {
    isAlreadyPositionedInSelectedShot,
    isAlreadyAssociatedWithoutPosition,
    handleAddToShot,
    handleAddToShotWithoutPosition,
  };
};

