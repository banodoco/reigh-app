import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useVideoScrubbing } from '@/shared/hooks/useVideoScrubbing';
import { getPreviewDimensions } from '@/shared/lib/aspectRatios';
import type { SegmentSlot } from '@/shared/hooks/segments';

interface UseSegmentScrubbingProps {
  projectAspectRatio?: string;
  displaySlots: SegmentSlot[];
}

export function useSegmentScrubbing({ projectAspectRatio, displaySlots }: UseSegmentScrubbingProps) {
  const isMobile = useIsMobile();
  const [activeScrubbingIndex, setActiveScrubbingIndex] = useState<number | null>(null);
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const stripContainerRef = useRef<HTMLDivElement>(null);

  const scrubbing = useVideoScrubbing({
    enabled: !isMobile && activeScrubbingIndex !== null,
    playOnStopScrubbing: true,
    playDelay: 400,
    resetOnLeave: true,
    onHoverEnd: () => setActiveScrubbingIndex(null),
  });

  // When active scrubbing index changes, manually trigger onMouseEnter
  useEffect(() => {
    if (activeScrubbingIndex !== null) {
      scrubbing.containerProps.onMouseEnter();
    }
  }, [activeScrubbingIndex]);  

  // Clear scrubbing preview on scroll
  useEffect(() => {
    if (activeScrubbingIndex === null) return;
    const handleScroll = () => {
      setActiveScrubbingIndex(null);
      scrubbing.reset();
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [activeScrubbingIndex, scrubbing]);

  // Active scrubbing video
  const activeSegmentSlot = activeScrubbingIndex !== null ? displaySlots[activeScrubbingIndex] : null;
  const activeSegmentVideoUrl = activeSegmentSlot?.type === 'child' ? activeSegmentSlot.child.location : null;

  useEffect(() => {
    if (previewVideoRef.current && activeScrubbingIndex !== null) {
      scrubbing.setVideoElement(previewVideoRef.current);
    }
  }, [activeScrubbingIndex, activeSegmentVideoUrl, scrubbing.setVideoElement]);

  // Preview dimensions
  const previewDimensions = useMemo(() => getPreviewDimensions(projectAspectRatio), [projectAspectRatio]);

  const handleScrubbingStart = useCallback((index: number, segmentRect: DOMRect) => {
    setActiveScrubbingIndex(index);
    setPreviewPosition({
      x: segmentRect.left + segmentRect.width / 2,
      y: segmentRect.top,
    });
  }, []);

  const clampedPreviewX = useMemo(() => {
    const padding = 16;
    const halfWidth = previewDimensions.width / 2;
    const minX = padding + halfWidth;
    const maxX = (typeof window !== 'undefined' ? window.innerWidth : 1920) - padding - halfWidth;
    return Math.max(minX, Math.min(maxX, previewPosition.x));
  }, [previewPosition.x, previewDimensions.width]);

  /** Call from parent's handleSegmentClick to clear scrubbing state */
  const clearScrubbing = useCallback(() => {
    setActiveScrubbingIndex(null);
    scrubbing.reset();
  }, [scrubbing]);

  return {
    isMobile,
    previewVideoRef,
    stripContainerRef,
    activeScrubbingIndex,
    activeSegmentSlot,
    activeSegmentVideoUrl,
    scrubbing,
    previewPosition,
    previewDimensions,
    clampedPreviewX,
    handleScrubbingStart,
    clearScrubbing,
  };
}
