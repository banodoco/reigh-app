/**
 * MediaLightbox - Unified Lightbox Dispatcher
 *
 * This is a thin dispatcher that routes to specialized lightbox components
 * based on media type:
 * - ImageLightbox: For images with edit/inpaint/reposition capabilities
 * - VideoLightbox: For videos with trim/regenerate/enhance capabilities
 *
 * The original implementation is preserved in MediaLightbox.legacy.tsx for reference.
 *
 * Architecture notes:
 * - MediaLightbox preserves the original props interface for backwards compatibility
 * - Media type detection uses isVideoAny from typeGuards
 * - Segment slot mode (form-only) goes through VideoLightbox
 */

import React from 'react';
import type { GenerationRow, Shot } from '@/types/shots';
import { isVideoAny } from '@/shared/lib/typeGuards';
import type { SegmentSlotModeData, AdjacentSegmentsData } from './types';
import { ImageLightbox } from './ImageLightbox';
import { VideoLightbox } from './VideoLightbox';

// ============================================================================
// Props Interface (unchanged from original for backwards compatibility)
// ============================================================================

interface MediaLightboxProps {
  /** Media to display. Optional when segmentSlotMode is provided with no video. */
  media?: GenerationRow;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  /**
   * Segment slot mode - when provided, MediaLightbox acts as a unified segment editor.
   * If segmentVideo is null, shows only the generate form (no media display).
   * Navigation uses onNavigateToPair for seamless slot-based navigation.
   */
  segmentSlotMode?: SegmentSlotModeData;
  // Configuration props to control features
  readOnly?: boolean;
  showNavigation?: boolean;
  showImageEditTools?: boolean;
  showDownload?: boolean;
  showMagicEdit?: boolean;
  autoEnterInpaint?: boolean;
  // Navigation availability
  hasNext?: boolean;
  hasPrevious?: boolean;
  // Workflow-specific props
  allShots?: ShotOption[];
  selectedShotId?: string;
  onShotChange?: (shotId: string) => void;
  onAddToShot?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onDelete?: (id: string) => void;
  isDeleting?: string | null;
  onApplySettings?: (metadata: Record<string, unknown>) => void;
  showTickForImageId?: string | null;
  onShowTick?: (imageId: string) => void;
  showTickForSecondaryImageId?: string | null;
  onShowSecondaryTick?: (imageId: string) => void;
  onMagicEdit?: (imageUrl: string, prompt: string, numImages: number) => void;
  // Star functionality
  starred?: boolean;
  onToggleStar?: (id: string, starred: boolean) => void;
  // Task details functionality
  showTaskDetails?: boolean;
  taskDetailsData?: {
    task: Record<string, unknown> | null;
    isLoading: boolean;
    error: Error | null;
    inputImages: string[];
    taskId: string | null;
    onApplySettingsFromTask?: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
    onClose?: () => void;
  };
  onShowTaskDetails?: () => void;
  // Shot creation functionality
  onCreateShot?: (shotName: string, files: File[]) => Promise<{shotId?: string; shotName?: string} | void>;
  // Shot navigation functionality
  onNavigateToShot?: (shot: Shot, options?: { isNewlyCreated?: boolean }) => void;
  // Tool type override for magic edit
  toolTypeOverride?: string;
  // Optimistic updates
  optimisticPositionedIds?: Set<string>;
  optimisticUnpositionedIds?: Set<string>;
  onOptimisticPositioned?: (mediaId: string, shotId: string) => void;
  onOptimisticUnpositioned?: (mediaId: string, shotId: string) => void;
  // Precomputed overrides from gallery source record
  positionedInSelectedShot?: boolean;
  associatedWithoutPositionInSelectedShot?: boolean;
  // Navigation to specific generation
  onNavigateToGeneration?: (generationId: string) => void;
  // Open external generation
  onOpenExternalGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
  // Shot ID for star persistence
  shotId?: string;
  // Tasks pane integration (desktop only)
  tasksPaneOpen?: boolean;
  tasksPaneWidth?: number;
  // Video trim functionality
  showVideoTrimEditor?: boolean;
  onTrimModeChange?: (isTrimMode: boolean) => void;
  // Initial video trim mode
  initialVideoTrimMode?: boolean;
  // Initial variant to display
  initialVariantId?: string;
  // Fetch variants for self vs parent
  fetchVariantsForSelf?: boolean;
  // Current segment images from timeline
  currentSegmentImages?: {
    startUrl?: string;
    endUrl?: string;
    startGenerationId?: string;
    endGenerationId?: string;
    startShotGenerationId?: string;
    endShotGenerationId?: string;
    activeChildGenerationId?: string;
    startVariantId?: string;
    endVariantId?: string;
  };
  // Segment frame count callback
  onSegmentFrameCountChange?: (pairShotGenerationId: string, frameCount: number) => void;
  // Current frame count
  currentFrameCount?: number;
  // Adjacent segments for image-to-video navigation
  adjacentSegments?: AdjacentSegmentsData;
}

// ============================================================================
// Component
// ============================================================================

const MediaLightbox: React.FC<MediaLightboxProps> = (props) => {
  const {
    media,
    segmentSlotMode,
    ...restProps
  } = props;

  // Determine if this is a video or segment slot mode (both go to VideoLightbox)
  const isSegmentSlotMode = !!segmentSlotMode;
  const isVideo = media ? isVideoAny(media) : false;

  // Segment slot mode always uses VideoLightbox (handles form-only case)
  // media may be undefined in form-only mode - VideoLightbox handles this
  if (isSegmentSlotMode) {
    return (
      <VideoLightbox
        media={media}
        segmentSlotMode={segmentSlotMode}
        {...restProps}
      />
    );
  }

  // Safety check - media is required outside segment slot mode
  if (!media) {
    console.error('[MediaLightbox] ❌ No media prop provided!');
    return null;
  }

  // Dispatch based on media type
  if (isVideo) {
    return (
      <VideoLightbox
        media={media}
        {...restProps}
      />
    );
  }

  // Image media
  return (
    <ImageLightbox
      media={media}
      {...restProps}
    />
  );
};

export default MediaLightbox;

// Re-export ShotOption for external use
export type { ShotOption } from './types';
