import { useState, useEffect } from 'react';
import type { GenerationRow } from '@/types/shots';

interface UsePendingFramesProps {
  shotId: string;
  images: GenerationRow[];
  isUploadingImage: boolean;
}

interface UsePendingFramesReturn {
  pendingDropFrame: number | null;
  setPendingDropFrame: (frame: number | null) => void;
  pendingDuplicateFrame: number | null;
  setPendingDuplicateFrame: (frame: number | null) => void;
  pendingExternalAddFrame: number | null;
  isInternalDropProcessing: boolean;
  setIsInternalDropProcessing: (processing: boolean) => void;
  /** Combined pending frame (for marker display) */
  activePendingFrame: number | null;
}

/**
 * Manages pending frame state for skeleton placeholders during:
 * - File drops
 * - Image duplication
 * - External adds (from GenerationsPane)
 */
export function usePendingFrames({
  shotId,
  images,
  isUploadingImage,
}: UsePendingFramesProps): UsePendingFramesReturn {
  const [pendingDropFrame, setPendingDropFrame] = useState<number | null>(null);
  const [pendingDuplicateFrame, setPendingDuplicateFrame] = useState<number | null>(null);
  const [pendingDuplicateId, setPendingDuplicateId] = useState<string | null>(null);
  const [pendingExternalAddFrame, setPendingExternalAddFrame] = useState<number | null>(null);
  const [isInternalDropProcessing, setIsInternalDropProcessing] = useState(false);

  // Listen for global pending add events (from GenerationsPane)
  useEffect(() => {
    const handlePendingAdd = (event: CustomEvent) => {
      const { frame, shotId: targetShotId } = event.detail;

      // Only handle if this is for the current shot
      if (targetShotId && targetShotId !== shotId) {
        return;
      }

      setPendingExternalAddFrame(frame);
    };

    window.addEventListener('timeline:pending-add', handlePendingAdd as EventListener);
    return () => {
      window.removeEventListener('timeline:pending-add', handlePendingAdd as EventListener);
    };
  }, [shotId]);

  // Listen for duplicate complete event to get the new item's ID
  useEffect(() => {
    const handleDuplicateComplete = (event: CustomEvent) => {
      const { shotId: targetShotId, newItemId } = event.detail;
      if (!targetShotId || targetShotId === shotId) {
        // Store the ID so we can clear skeleton when this item appears
        setPendingDuplicateId(newItemId);
      }
    };

    window.addEventListener('timeline:duplicate-complete', handleDuplicateComplete as EventListener);
    return () => {
      window.removeEventListener('timeline:duplicate-complete', handleDuplicateComplete as EventListener);
    };
  }, [shotId]);

  // Clear pending drop frame when upload finishes
  useEffect(() => {
    if (!isUploadingImage && !isInternalDropProcessing) {
      setPendingDropFrame(null);
    }
  }, [isUploadingImage, isInternalDropProcessing]);

  // Clear pending duplicate frame when the new item appears (by ID, not frame)
  useEffect(() => {
    if (pendingDuplicateFrame !== null && pendingDuplicateId !== null) {
      const hasNewItem = images.some(img => img.id === pendingDuplicateId);
      if (hasNewItem) {
        setPendingDuplicateFrame(null);
        setPendingDuplicateId(null);
      }
    }
  }, [images, pendingDuplicateFrame, pendingDuplicateId]);

  // Safety timeout for pending duplicate frame
  useEffect(() => {
    if (pendingDuplicateFrame !== null) {
      const timer = setTimeout(() => {
        setPendingDuplicateFrame(null);
        setPendingDuplicateId(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [pendingDuplicateFrame]);

  // Clear pending external add frame when the new item appears
  useEffect(() => {
    if (pendingExternalAddFrame !== null) {
      const imageAtFrame = images.find(img => img.timeline_frame === pendingExternalAddFrame);
      if (imageAtFrame) {
        setTimeout(() => setPendingExternalAddFrame(null), 100);
      }
    }
  }, [images, pendingExternalAddFrame]);

  // Safety timeout for pending external add frame
  useEffect(() => {
    if (pendingExternalAddFrame !== null) {
      const timer = setTimeout(() => {
        setPendingExternalAddFrame(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [pendingExternalAddFrame]);

  const activePendingFrame = pendingDropFrame ?? pendingDuplicateFrame ?? pendingExternalAddFrame;

  return {
    pendingDropFrame,
    setPendingDropFrame,
    pendingDuplicateFrame,
    setPendingDuplicateFrame,
    pendingExternalAddFrame,
    isInternalDropProcessing,
    setIsInternalDropProcessing,
    activePendingFrame,
  };
}
