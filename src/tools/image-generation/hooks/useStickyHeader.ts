import { useState, useEffect, useRef, type RefObject } from 'react';

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

    const stickyThresholdY = { current: 0 };
    let rafId: number | null = null;

    const computeThreshold = () => {
      const rect = containerEl.getBoundingClientRect();
      const docTop = window.pageYOffset || document.documentElement.scrollTop || 0;
      const containerDocTop = rect.top + docTop;
      const headerHeight = isMobile ? 150 : 96;
      const extra = isMobile ? 0 : -120;
      stickyThresholdY.current = containerDocTop + headerHeight + extra;
    };

    const checkSticky = () => {
      rafId = null;
      const shouldBeSticky = (window.pageYOffset || document.documentElement.scrollTop || 0) > stickyThresholdY.current;
      if (shouldBeSticky !== isStickyRef.current) {
        isStickyRef.current = shouldBeSticky;
        setIsSticky(shouldBeSticky);
      }
    };

    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(checkSticky);
    };

    const onResize = () => {
      computeThreshold();
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(checkSticky);
    };

    computeThreshold();
    checkSticky();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    const ro = new ResizeObserver(() => onResize());
    ro.observe(containerEl);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (rafId !== null) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [containerRef, isFormExpanded, isMobile]);

  return isSticky;
}
