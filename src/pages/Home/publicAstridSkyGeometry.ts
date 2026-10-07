/** The mask is deliberately a small, stable value channel between layout and the canvas renderer. */
export interface PublicAstridSkyRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface PublicAstridSkyGeometrySnapshot {
  quiet: Uint8Array | null;
  columns: number;
  rows: number;
  revision: number;
  owner: string | null;
  root: HTMLElement | null;
}

export interface PublicAstridSkyGeometry {
  getSnapshot: () => PublicAstridSkyGeometrySnapshot;
  subscribe: (listener: () => void) => () => void;
  mount: () => void;
  destroy: () => void;
  setViewport: (columns: number, rows: number) => void;
  registerRoot: (root: HTMLElement | null, selector: string, owner: string) => () => void;
}

/**
 * A range rect is already in viewport coordinates. That is important here: the sky is fixed to the
 * viewport, so scroll, ancestor transforms, and reflow all project correctly without consulting the
 * active page's document position.
 */
export function readingLineBoxes(root: HTMLElement, selector: string): PublicAstridSkyRect[] {
  const boxes: PublicAstridSkyRect[] = [];
  const elements = Array.from(root.querySelectorAll<HTMLElement>(selector));
  const range = root.ownerDocument.createRange();
  const rangeRects = typeof range.getClientRects === 'function';
  const showText = root.ownerDocument.defaultView?.NodeFilter?.SHOW_TEXT ?? 4;

  for (const element of elements) {
    let measured = false;
    if (rangeRects) {
      const walker = root.ownerDocument.createTreeWalker(element, showText);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        range.selectNodeContents(node);
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width && rect.height) {
            boxes.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height });
            measured = true;
          }
        }
      }
    }
    // jsdom and older engines do not expose Range#getClientRects. The element rect is a deterministic
    // fallback for tests and still preserves viewport coordinates in browsers that lack range support.
    if (!measured) {
      const rect = element.getBoundingClientRect();
      if (rect.width && rect.height) {
        boxes.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height });
      }
    }
  }
  return boxes;
}

export const QUIET_LEVELS = 3;

export function quietField(boxes: readonly PublicAstridSkyRect[], columns: number, rows: number, artPixel = 4, margin = 24): Uint8Array {
  if (columns <= 0 || rows <= 0) return new Uint8Array(0);
  const field = new Uint8Array(columns * rows);
  // Viewport px to art pixels on the fixed sky canvases, which start margin px above and left of the window.
  const toArt = (px: number) => (px + margin) / artPixel;
  for (const box of boxes) {
    if (!box.width || !box.height) continue;
    // The text's own pixels and one more all round.
    const x0 = Math.max(0, Math.floor(toArt(box.left)) - 1);
    const x1 = Math.min(columns - 1, Math.ceil(toArt(box.right)));
    const y0 = Math.max(0, Math.floor(toArt(box.top)) - 1);
    const y1 = Math.min(rows - 1, Math.ceil(toArt(box.bottom)));
    for (let y = y0; y <= y1; y++) field.fill(QUIET_LEVELS, y * columns + x0, y * columns + x1 + 1);
  }
  // Each further ring steps down one level (square rings, as pixel art steps).
  for (let level = QUIET_LEVELS - 1; level > 0; level--) {
    const next = field.slice();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        if (field[y * columns + x]) continue;
        search: for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
            if (field[ny * columns + nx] === level + 1) { next[y * columns + x] = level; break search; }
          }
        }
      }
    }
    field.set(next);
  }
  return field;
}

function sameField(left: Uint8Array | null, right: Uint8Array | null): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

/**
 * Owns the active page's reading geometry. It observes only the registered root and coalesces all layout
 * signals into one RAF. Every callback carries the registration generation, so a stale observer cannot
 * publish a mask for a successor page.
 */
export function createPublicAstridSkyGeometry(): PublicAstridSkyGeometry {
  let mounted = false;
  let destroyed = false;
  let generation = 0;
  let frame = 0;
  let frameGeneration = 0;
  let resizeObserver: ResizeObserver | null = null;
  let mutationObserver: MutationObserver | null = null;
  let target: { root: HTMLElement; selector: string; owner: string; generation: number } | null = null;
  let columns = 0;
  let rows = 0;
  let snapshot: PublicAstridSkyGeometrySnapshot = { quiet: null, columns, rows, revision: 0, owner: null, root: null };
  const listeners = new Set<() => void>();
  const cleanups: Array<() => void> = [];

  const notify = () => listeners.forEach((listener) => listener());
  const cancelFrame = () => {
    if (!frame) return;
    window.cancelAnimationFrame(frame);
    frame = 0;
  };
  const clearSnapshot = () => {
    if (!snapshot.quiet && snapshot.columns === columns && snapshot.rows === rows && snapshot.owner === (target?.owner ?? null) && snapshot.root === (target?.root ?? null)) return;
    snapshot = { quiet: null, columns, rows, revision: snapshot.revision + 1, owner: target?.owner ?? null, root: target?.root ?? null };
    notify();
  };
  const clearObservers = () => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    mutationObserver?.disconnect();
    mutationObserver = null;
    while (cleanups.length) cleanups.pop()?.();
  };

  const schedule = (expectedGeneration: number) => {
    if (!mounted || !target || target.generation !== expectedGeneration) return;
    if (frame && frameGeneration === expectedGeneration) return;
    cancelFrame();
    frameGeneration = expectedGeneration;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      if (!mounted || !target || target.generation !== expectedGeneration || generation !== expectedGeneration) return;
      const next = quietField(readingLineBoxes(target.root, target.selector), columns, rows);
      if (sameField(snapshot.quiet, next) && snapshot.columns === columns && snapshot.rows === rows && snapshot.owner === target.owner) return;
      snapshot = { quiet: next, columns, rows, revision: snapshot.revision + 1, owner: target.owner, root: target.root };
      notify();
    });
  };

  const observe = (expectedGeneration: number) => {
    if (!target || target.generation !== expectedGeneration) return;
    const { root } = target;
    const invalidate = () => schedule(expectedGeneration);
    window.addEventListener('scroll', invalidate, { passive: true });
    window.addEventListener('resize', invalidate);
    root.addEventListener('animationend', invalidate);
    root.addEventListener('transitionend', invalidate);
    cleanups.push(
      () => window.removeEventListener('scroll', invalidate),
      () => window.removeEventListener('resize', invalidate),
      () => root.removeEventListener('animationend', invalidate),
      () => root.removeEventListener('transitionend', invalidate),
    );

    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() => schedule(expectedGeneration));
      resizeObserver.observe(root);
      for (const element of root.querySelectorAll<HTMLElement>(target.selector)) resizeObserver.observe(element);
    }
    if (typeof MutationObserver === 'function') {
      mutationObserver = new MutationObserver(() => {
        if (!target || target.generation !== expectedGeneration) return;
        resizeObserver?.disconnect();
        if (resizeObserver) {
          resizeObserver.observe(root);
          for (const element of root.querySelectorAll<HTMLElement>(target.selector)) resizeObserver.observe(element);
        }
        schedule(expectedGeneration);
      });
      mutationObserver.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-expanded'] });
    }

    const media = root.querySelectorAll<HTMLImageElement | HTMLMediaElement>('img,video,audio,iframe,object');
    for (const element of media) {
      for (const eventName of ['load', 'loadedmetadata', 'canplay', 'error']) {
        element.addEventListener(eventName, invalidate);
        cleanups.push(() => element.removeEventListener(eventName, invalidate));
      }
    }
    const fonts = document.fonts;
    if (fonts) {
      const onFonts = () => schedule(expectedGeneration);
      fonts.addEventListener('loadingdone', onFonts);
      fonts.addEventListener('loadingerror', onFonts);
      cleanups.push(
        () => fonts.removeEventListener('loadingdone', onFonts),
        () => fonts.removeEventListener('loadingerror', onFonts),
      );
      void fonts.ready.then(() => schedule(expectedGeneration), () => schedule(expectedGeneration));
    }
    schedule(expectedGeneration);
  };

  const mount = () => {
    if (mounted) return;
    destroyed = false;
    mounted = true;
    if (target) observe(target.generation);
  };
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    mounted = false;
    generation += 1;
    cancelFrame();
    clearObservers();
    target = null;
    snapshot = { quiet: null, columns, rows, revision: snapshot.revision + 1, owner: null, root: null };
    listeners.clear();
  };
  const setViewport = (nextColumns: number, nextRows: number) => {
    const next = { columns: Math.max(0, nextColumns), rows: Math.max(0, nextRows) };
    if (next.columns === columns && next.rows === rows) return;
    columns = next.columns;
    rows = next.rows;
    clearSnapshot();
    if (target) schedule(target.generation);
  };
  const registerRoot = (root: HTMLElement | null, selector: string, owner: string) => {
    const registrationGeneration = ++generation;
    cancelFrame();
    clearObservers();
    target = root ? { root, selector, owner, generation: registrationGeneration } : null;
    clearSnapshot();
    if (target && mounted) observe(registrationGeneration);
    return () => {
      if (!target || target.generation !== registrationGeneration) return;
      ++generation;
      cancelFrame();
      clearObservers();
      target = null;
      clearSnapshot();
    };
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    mount,
    destroy,
    setViewport,
    registerRoot,
  };
}
