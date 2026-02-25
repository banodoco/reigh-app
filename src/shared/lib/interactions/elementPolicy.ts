export function isInteractiveElement(target: HTMLElement): boolean {
  return (
    target.tagName === 'BUTTON' ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.tagName === 'A' ||
    target.closest('button') !== null ||
    target.closest('a') !== null
  );
}

export function isFloatingOverlayElement(target: Element): boolean {
  return target.closest('[role="listbox"], [role="menu"], [data-side], [data-popup]') !== null;
}

export function shouldAllowTouchThrough(
  target: HTMLElement,
  options: {
    hasCanvasOverlay: boolean;
  },
): boolean {
  if (options.hasCanvasOverlay && target.tagName === 'CANVAS') return true;
  if (isInteractiveElement(target)) return true;
  return false;
}
