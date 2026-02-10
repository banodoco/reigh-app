import React, { useState } from 'react';
import { GenerationRow } from '@/types/shots';
import { Button } from '@/shared/components/ui/button';
import { TextAction } from '@/shared/components/ui/text-action';
import { Star, Loader2 } from 'lucide-react';
import { handleError } from '@/shared/lib/errorHandler';
import type { SourceVariantData } from '../hooks/useSourceGeneration';

/** Generation data with enriched fields from useSourceGeneration */
interface EnrichedGenerationRow extends GenerationRow {
  all_shot_associations?: Array<{ shot_id: string; timeline_frame: number | null }>;
  thumbUrl?: string;
}

interface SourceGenerationDisplayProps {
  sourceGeneration: EnrichedGenerationRow;
  onNavigate: (generationId: string) => Promise<void>;
  variant?: 'compact' | 'full';
  className?: string;
  currentShotId?: string; // Optional: to check if parent is in same shot
  currentShotName?: string; // Optional: to display shot name in badge
  allShots?: Array<{ id: string; name: string }>; // Optional: to look up shot names
  currentMediaId?: string; // The current image being viewed
  isCurrentMediaPositioned?: boolean; // Whether current image has a timeline position
  onReplaceInShot?: (parentGenerationId: string, currentMediaId: string, parentTimelineFrame: number, currentShotId: string) => Promise<void>;
  sourcePrimaryVariant?: SourceVariantData | null; // The primary variant of the source generation
  onMakeMainVariant?: () => Promise<void>; // Handler to make current media the main variant
  canMakeMainVariant?: boolean; // Whether the current media can become the main variant
}

export const SourceGenerationDisplay: React.FC<SourceGenerationDisplayProps> = ({
  sourceGeneration,
  onNavigate,
  variant = 'full',
  className = '',
  currentShotId,
  currentShotName,
  allShots,
  currentMediaId,
  isCurrentMediaPositioned,
  onReplaceInShot,
  sourcePrimaryVariant,
  onMakeMainVariant,
  canMakeMainVariant = false
}) => {
  const [isMakingMainVariant, setIsMakingMainVariant] = useState(false);

  // Check if parent is positioned in the current shot
  const parentShotAssociation = currentShotId
    ? sourceGeneration.all_shot_associations?.find(
        (assoc) => assoc.shot_id === currentShotId
      )
    : null;
  
  const isParentInCurrentShot = !!parentShotAssociation;
  const parentTimelineFrame = parentShotAssociation?.timeline_frame;
  const isParentPositioned = parentTimelineFrame !== null && parentTimelineFrame !== undefined;
  
  // Determine shot name - use prop or look up in allShots
  const shotName = currentShotName || allShots?.find(s => s.id === currentShotId)?.name || 'Shot';
  
  // Show "Replace in shot" CTA if parent is positioned but current item is not
  const showReplaceCTA = isParentPositioned && !isCurrentMediaPositioned && onReplaceInShot && currentMediaId;
  
  const handleClick = async () => {
    // Clear derived context by not passing it - exits derived nav mode
    await onNavigate(sourceGeneration.id);
  };

  const handleReplace = async () => {
    if (!onReplaceInShot || !currentMediaId || !currentShotId || parentTimelineFrame === null || parentTimelineFrame === undefined) {
      return;
    }
    
    await onReplaceInShot(sourceGeneration.id, currentMediaId, parentTimelineFrame, currentShotId);
  };

  const handleMakeMainVariant = async () => {
    if (!onMakeMainVariant) return;
    setIsMakingMainVariant(true);
    try {
      await onMakeMainVariant();
    } catch (error) {
      handleError(error, { context: 'SourceGenerationDisplay', showToast: false });
    } finally {
      setIsMakingMainVariant(false);
    }
  };

  // Use primary variant's thumbnail if available, otherwise fall back to generation's location
  const displayThumbnail = sourcePrimaryVariant?.thumbnail_url || 
    sourcePrimaryVariant?.location || 
    sourceGeneration.thumbUrl ||
    sourceGeneration.location;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center gap-2">
        <button
          onClick={handleClick}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group"
        >
          <span>Based on:</span>
          <div className={`relative ${variant === 'compact' ? 'w-8 h-8' : 'w-10 h-10'} rounded border border-border overflow-hidden group-hover:border-primary transition-colors`}>
            <img
              src={displayThumbnail}
              alt="Source generation"
              className="w-full h-full object-cover"
            />
          </div>
        </button>
        
        {/* Make main variant button */}
        {canMakeMainVariant && onMakeMainVariant && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleMakeMainVariant}
            disabled={isMakingMainVariant}
            className="h-6 text-xs px-2 gap-1"
          >
            {isMakingMainVariant ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Star className="w-3 h-3" />
            )}
            Make main variant
          </Button>
        )}
      </div>
      
      {/* Show "Replace in shot" CTA if parent is positioned but current item is not */}
      {showReplaceCTA && (
        <TextAction
          onClick={handleReplace}
          className="self-start"
        >
          Replace in {shotName}
        </TextAction>
      )}
    </div>
  );
};
