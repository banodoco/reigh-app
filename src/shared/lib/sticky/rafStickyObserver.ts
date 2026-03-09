interface RafStickyObserverOptions {
  element: HTMLElement;
  isStickyRef: { current: boolean };
  setSticky: (value: boolean) => void;
  computeThresholdY: () => number;
  shouldRunInitialCheck?: boolean;
}

function getDocumentScrollTop(): number {
  return window.pageYOffset || document.documentElement.scrollTop || 0;
}

export function getElementDocumentTop(element: Element): number {
  const rect = element.getBoundingClientRect();
  return rect.top + getDocumentScrollTop();
}

export function attachRafStickyObserver({
  element,
  isStickyRef,
  setSticky,
  computeThresholdY,
  shouldRunInitialCheck = true,
}: RafStickyObserverOptions): () => void {
  const stickyThresholdY = { current: 0 };
  let rafId: number | null = null;

  const checkSticky = () => {
    rafId = null;
    const shouldBeSticky = getDocumentScrollTop() > stickyThresholdY.current;
    if (shouldBeSticky !== isStickyRef.current) {
      isStickyRef.current = shouldBeSticky;
      setSticky(shouldBeSticky);
    }
  };

  const onScroll = () => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(checkSticky);
  };

  const onResize = () => {
    stickyThresholdY.current = computeThresholdY();
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    rafId = requestAnimationFrame(checkSticky);
  };

  stickyThresholdY.current = computeThresholdY();
  if (shouldRunInitialCheck) {
    checkSticky();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);

  const resizeObserver = new ResizeObserver(() => onResize());
  resizeObserver.observe(element);

  return () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    resizeObserver.disconnect();
  };
}
