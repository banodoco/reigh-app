import { useEffect, type RefObject } from 'react';

/** The landing pieces that change place when the layout switches, found inside the landing grid. */
const GLIDING_PIECES = [
  '.astrid-brand',
  '.astrid-audience-switch',
  '#astrid-hero-title',
  '.astrid-hero-subtitle',
  '.astrid-hero-actions',
  '.astrid-hero-note',
  '.astrid-showcase',
] as const;
/** Mirrors the tablet and phone breakpoints in PublicAstridShell.css. */
const STACKED_QUERY = '(max-width: 1099px)';
const PHONE_QUERY = '(max-width: 640px)';
const GLIDE_ID = 'astrid-layout-glide';
const GLIDE_MS = 520;
const GLIDE_EASING = 'cubic-bezier(.22,.61,.36,1)';

type Snapshot = Map<string, { element: HTMLElement; rect: DOMRect }>;

/**
 * Resizing across a breakpoint moves the hero copy between the side column and the top of the page in a
 * single frame. This remembers where each piece sat at the previous resize and, when the layout changes,
 * starts every piece there and glides it to its new place (FLIP), so the switch reads as the page
 * rearranging rather than breaking. Within one layout nothing animates.
 */
export function usePublicAstridLayoutGlide(gridRef: RefObject<HTMLElement | null>, reducedMotion: boolean, active = true) {
  useEffect(() => {
    const grid = gridRef.current;
    if (!active || !grid || reducedMotion || typeof grid.animate !== 'function') return;
    const landingGrid: HTMLElement = grid;
    const stacked = window.matchMedia(STACKED_QUERY);
    const phone = window.matchMedia(PHONE_QUERY);
    const layoutKind = () => (phone.matches ? 'phone' : stacked.matches ? 'stacked' : 'side');

    function snapshot(): Snapshot {
      const pieces: Snapshot = new Map();
      for (const selector of GLIDING_PIECES) {
        const element = landingGrid.querySelector<HTMLElement>(selector);
        if (element) pieces.set(selector, { element, rect: element.getBoundingClientRect() });
      }
      return pieces;
    }

    function cancelGlides() {
      for (const selector of GLIDING_PIECES) {
        landingGrid.querySelector<HTMLElement>(selector)?.getAnimations()
          .forEach((animation) => { if (animation.id === GLIDE_ID) animation.cancel(); });
      }
    }

    function glide(before: Snapshot, after: Snapshot) {
      for (const [selector, next] of after) {
        const previous = before.get(selector);
        if (!previous || previous.element !== next.element || !next.rect.width) continue;
        const dx = previous.rect.left - next.rect.left;
        const dy = previous.rect.top - next.rect.top;
        // The stage keeps its proportions closely enough to grow or shrink into place; text rewraps at
        // the new size, so it only travels, settling in from a light fade.
        const isStage = selector === '.astrid-showcase';
        const scale = isStage ? previous.rect.width / next.rect.width : 1;
        const animation = next.element.animate(
          [
            { transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: isStage ? 1 : 0.35 },
            { transformOrigin: 'top left', transform: 'none', opacity: 1 },
          ],
          { duration: GLIDE_MS, easing: GLIDE_EASING },
        );
        animation.id = GLIDE_ID;
      }
    }

    let lastKind = layoutKind();
    let last = snapshot();
    let frame = 0;
    let alive = true;
    function measureResize() {
      if (!alive) return;
      frame = 0;
      const kind = layoutKind();
      if (kind !== lastKind) {
        // Measure the new places without any glide still in flight; the previous snapshot already holds
        // where each piece visibly was, so an interrupted glide continues from there.
        cancelGlides();
        const next = snapshot();
        glide(last, next);
        last = next;
        lastKind = kind;
        return;
      }
      last = snapshot();
    }
    function onResize() {
      if (alive && !frame) frame = window.requestAnimationFrame(measureResize);
    }

    window.addEventListener('resize', onResize);
    return () => {
      alive = false;
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      cancelGlides();
    };
  }, [gridRef, reducedMotion, active]);
}
