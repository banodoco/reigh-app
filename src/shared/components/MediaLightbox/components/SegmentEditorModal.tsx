/**
 * SegmentEditorModal
 *
 * A lightweight modal for editing segment settings when no video exists yet.
 * This is a simpler alternative to MediaLightbox for form-only segment editing,
 * avoiding the overhead of video playback hooks and media display components.
 *
 * Use this when:
 * - Editing a segment that doesn't have a generated video yet
 * - You want quick access to the segment settings form
 *
 * Use MediaLightbox instead when:
 * - Viewing/editing a segment that has a generated video
 * - You need video playback, variants, or other media features
 */

import React, { useEffect, useCallback } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui-components/react/dialog';
import type { SegmentSlotModeData } from '../types';
import { SegmentSlotFormView } from './SegmentSlotFormView';

interface SegmentEditorModalProps {
  /** Segment slot data for the form */
  segmentSlotMode: SegmentSlotModeData;
  /** Callback when modal should close */
  onClose: () => void;
  /** Read-only mode - hides interactive elements */
  readOnly?: boolean;
}

/**
 * Lightweight modal for segment settings editing (no video).
 * Much simpler than MediaLightbox - just form + navigation.
 */
export const SegmentEditorModal: React.FC<SegmentEditorModalProps> = ({
  segmentSlotMode,
  onClose,
  readOnly = false,
}) => {
  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Navigation handlers
  const handleNavPrev = useCallback(() => {
    segmentSlotMode.onNavigateToPair?.(segmentSlotMode.currentIndex - 1);
  }, [segmentSlotMode]);

  const handleNavNext = useCallback(() => {
    segmentSlotMode.onNavigateToPair?.(segmentSlotMode.currentIndex + 1);
  }, [segmentSlotMode]);

  // Compute navigation availability
  const hasPrevious = segmentSlotMode.currentIndex > 0;
  const hasNext = segmentSlotMode.currentIndex < segmentSlotMode.totalPairs - 1;

  return (
    <DialogPrimitive.Root open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-[99999] bg-black/80" />
        <DialogPrimitive.Popup
          className="fixed inset-0 z-[100000] focus:outline-none"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">
            Segment {segmentSlotMode.currentIndex + 1} Settings
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Configure and generate this video segment. Use Tab or arrow keys to navigate between segments.
          </DialogPrimitive.Description>

          <SegmentSlotFormView
            segmentSlotMode={segmentSlotMode}
            onClose={onClose}
            onNavPrev={handleNavPrev}
            onNavNext={handleNavNext}
            hasPrevious={hasPrevious}
            hasNext={hasNext}
            readOnly={readOnly}
          />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
