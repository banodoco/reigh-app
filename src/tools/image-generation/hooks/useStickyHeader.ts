import { useState, useEffect, useRef, type RefObject } from 'react';
import {
  attachRafStickyObserver,
  getElementDocumentTop,
} from '@/shared/lib/sticky/rafStickyObserver';

interface UseStickyHeaderOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  isMobile: boolean;
  /** When this changes, threshold is recalculated (e.g. form expand/collapse) */
  isFormExpanded?: boolean;
}

/**
 * Tracks whether the page has scrolled past a container's header threshold.
 * Uses RAF-throttled scroll listener + ResizeObserver for threshold recalc.
 */
export function useStickyHeader({ containerRef, isMobile, isFormExpanded }: UseStickyHeaderOptions): boolean {
  const [isSticky, setIsSticky] = useState(false);
  const isStickyRef = useRef(isSticky);

  useEffect(() => {
    isStickyRef.current = isSticky;
  }, [isSticky]);

  useEffect(() => {
    const containerEl = containerRef.current;
    if (!containerEl) return;

    const headerHeight = isMobile ? 150 : 96;
    const extra = isMobile ? 0 : -120;

    return attachRafStickyObserver({
      element: containerEl,
      isStickyRef,
      setSticky: setIsSticky,
      computeThresholdY: () => getElementDocumentTop(containerEl) + headerHeight + extra,
    });
  }, [containerRef, isFormExpanded, isMobile]);

  return isSticky;
}
