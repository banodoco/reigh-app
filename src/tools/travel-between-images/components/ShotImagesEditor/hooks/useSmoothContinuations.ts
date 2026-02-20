/**
 * Hook for compacting timeline gaps when smooth continuations is enabled.
 * Reduces any gaps > maxFrameLimit down to maxFrameLimit.
 */

import { useEffect, useRef } from 'react';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import type { GenerationRow } from '@/types/shots';

interface UseSmoothContinuationsProps {
  /** Whether smooth continuations is enabled */
  smoothContinuations: boolean;
  /** Array of images with timeline_frame positions */
  images: GenerationRow[];
  /** Maximum frame limit (77 when smooth continuations enabled) */
  maxFrameLimit: number;
  /** Function to update a single timeline frame position */
  updateTimelineFrame: (id: string, frame: number) => Promise<void>;
  /** Whether in read-only mode */
  readOnly: boolean;
}

export function useSmoothContinuations({
  smoothContinuations,
  images,
  maxFrameLimit,
  updateTimelineFrame,
  readOnly,
}: UseSmoothContinuationsProps): void {
  // Track previous smoothContinuations value to detect when it's enabled
  const prevSmoothContinuationsRef = useRef(smoothContinuations);

  useEffect(() => {
    const wasEnabled = !prevSmoothContinuationsRef.current && smoothContinuations;
    prevSmoothContinuationsRef.current = smoothContinuations;

    if (!wasEnabled || readOnly) return;

    // Get positioned images sorted by frame
    const positionedImages = images
      .filter((img) => img.timeline_frame != null && img.timeline_frame !== -1)
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));

    if (positionedImages.length < 2) return;

    // Find gaps > maxFrameLimit and calculate shifts needed
    const updates: Array<{ id: string; newFrame: number }> = [];
    let cumulativeShift = 0;

    // Always start from frame 0 for gap calculation
    let prevFrame = 0;

    for (const img of positionedImages) {
      const currentFrame = img.timeline_frame ?? 0;
      const gap = currentFrame - prevFrame;

      if (gap > maxFrameLimit) {
        // This gap is too large, need to shift this and all subsequent images
        const excess = gap - maxFrameLimit;
        cumulativeShift += excess;
      }

      if (cumulativeShift > 0) {
        const newFrame = currentFrame - cumulativeShift;
        updates.push({ id: img.id, newFrame });
      }

      prevFrame = currentFrame - cumulativeShift; // Use the new position for next gap calculation
    }

    // Apply updates if any
    if (updates.length > 0) {

      // Update each frame position
      Promise.all(
        updates.map(({ id, newFrame }) => updateTimelineFrame(id, newFrame))
      ).then(() => {
      }).catch((err) => {
        handleError(err, { context: 'SmoothContinuations', showToast: false });
      });
    }
  }, [smoothContinuations, images, maxFrameLimit, updateTimelineFrame, readOnly]);
}
