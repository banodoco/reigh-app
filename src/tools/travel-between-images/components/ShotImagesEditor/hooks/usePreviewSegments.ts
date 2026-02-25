/**
 * Hook for computing preview segments from shot generations and segment slots.
 */

import { useMemo, useState } from 'react';
import { getDisplayUrl } from '@/shared/lib/mediaUrl';
import type { PreviewSegment } from '../types';
import type { GenerationRow } from '@/domains/generation/types';
import type { SegmentSlot } from '@/shared/hooks/segments';

export interface UsePreviewSegmentsReturn {
  /** Whether the preview dialog is open */
  isPreviewTogetherOpen: boolean;
  /** Setter for preview dialog open state */
  setIsPreviewTogetherOpen: (open: boolean) => void;
  /** All segments that can be previewed (have video OR have both images) */
  previewableSegments: PreviewSegment[];
  /** Whether there are any segments to preview */
  hasVideosToPreview: boolean;
}

interface UsePreviewSegmentsProps {
  /** Current generation mode */
  generationMode: 'batch' | 'timeline' | 'by-pair';
  /** Frame spacing for batch mode */
  batchVideoFrames: number;
  /** All shot generations (images) */
  shotGenerations: GenerationRow[];
  /** Segment slots with video data */
  segmentSlots: SegmentSlot[];
}

export function usePreviewSegments({
  generationMode,
  batchVideoFrames,
  shotGenerations,
  segmentSlots,
}: UsePreviewSegmentsProps): UsePreviewSegmentsReturn {
  const [isPreviewTogetherOpen, setIsPreviewTogetherOpen] = useState(false);

  // Get ALL segments for preview (both with videos and image-only)
  // Build from IMAGE PAIRS, not segmentSlots - otherwise we miss image-only segments
  const allSegmentsForPreview = useMemo(() => {
    // Get sorted images to find start/end for each pair
    const sortedImages = [...(shotGenerations || [])]
      .filter((img) => img.timeline_frame != null && img.timeline_frame >= 0)
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));

    // Build a lookup of segment slots by index for quick access
    const slotsByIndex = new Map<number, SegmentSlot>();
    segmentSlots.forEach(slot => {
      slotsByIndex.set(slot.index, slot);
    });

    // Number of pairs = number of images - 1 (each pair is consecutive images)
    const numPairs = Math.max(0, sortedImages.length - 1);

    // FPS for calculating duration from frames
    const FPS = 16;
    const isBatchMode = generationMode !== 'timeline';

    // Build segments from ALL image pairs, enriching with video data from slots if available
    const segments: PreviewSegment[] = [];
    for (let pairIndex = 0; pairIndex < numPairs; pairIndex++) {
      // Get start and end images for this pair
      const startImage = sortedImages[pairIndex];
      const endImage = sortedImages[pairIndex + 1];

      // Get frame positions for timeline mode calculation
      const startFrame = startImage?.timeline_frame ?? 0;
      const endFrame = endImage?.timeline_frame ?? startFrame;

      // Calculate duration - in batch mode use uniform batchVideoFrames, otherwise from timeline positions
      const durationFromFrames = isBatchMode
        ? batchVideoFrames / FPS  // Batch mode: uniform duration for all pairs
        : (endFrame - startFrame) / FPS;  // Timeline mode: from actual frame positions

      // Check if there's a slot with video for this pair
      const slot = slotsByIndex.get(pairIndex);
      const hasVideoInSlot = slot?.type === 'child' && !!slot.child?.location;

      if (hasVideoInSlot && slot?.type === 'child') {
        // Has video
        segments.push({
          hasVideo: true,
          videoUrl: getDisplayUrl(slot.child.location),
          thumbUrl: getDisplayUrl(slot.child.thumbUrl || slot.child.location),
          startImageUrl: startImage?.imageUrl || startImage?.thumbUrl || null,
          endImageUrl: endImage?.imageUrl || endImage?.thumbUrl || null,
          index: pairIndex,
          durationFromFrames, // Used as fallback if video duration fails to load
        });
      } else {
        // No video - will show crossfade
        segments.push({
          hasVideo: false,
          videoUrl: null,
          thumbUrl: startImage?.thumbUrl || startImage?.imageUrl || null,
          startImageUrl: startImage?.imageUrl || startImage?.thumbUrl || null,
          endImageUrl: endImage?.imageUrl || endImage?.thumbUrl || null,
          index: pairIndex,
          durationFromFrames,
        });
      }
    }

    return segments;
  }, [segmentSlots, shotGenerations, generationMode, batchVideoFrames]);

  // Filter to just segments we can actually preview (have video OR have both images)
  const previewableSegments = useMemo(() => {
    return allSegmentsForPreview.filter(seg =>
      seg.hasVideo || (seg.startImageUrl && seg.endImageUrl)
    );
  }, [allSegmentsForPreview]);

  const hasVideosToPreview = previewableSegments.length > 0;

  return {
    isPreviewTogetherOpen,
    setIsPreviewTogetherOpen,
    previewableSegments,
    hasVideosToPreview,
  };
}
