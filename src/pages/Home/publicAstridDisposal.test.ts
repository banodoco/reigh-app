// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPublicAstridSkySession } from './publicAstridSkySession';
import { PUBLIC_ASTRID_SKY_LAYERS, type PublicAstridSkyCanvases } from './publicAstridSkyRenderer';
import { skyState, type PublicAstridSkyRasterCache } from './publicAstridSkyRender';

const retainedCaches = vi.hoisted(() => [] as PublicAstridSkyRasterCache[]);
vi.mock('./publicAstridSkyRender', async (original) => {
  const module = await original<typeof import('./publicAstridSkyRender')>();
  return { ...module, createPublicAstridSkyRasterCache: () => {
    const cache = module.createPublicAstridSkyRasterCache();
    retainedCaches.push(cache);
    return cache;
  } };
});

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); retainedCaches.length = 0; });

describe('F08 Site disposal evidence', () => {
  it('releases populated moon/star/mask caches and four image buffers on every disposal', () => {
    const owner = createPublicAstridSkySession({ environment: { visible: true, reducedMotion: true, phone: false } });
    const targets = Object.fromEntries(PUBLIC_ASTRID_SKY_LAYERS.map((layer) => [layer, {
      width: 0, height: 0,
      getContext: () => ({
        createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
        putImageData: () => {},
      }),
    }])) as unknown as PublicAstridSkyCanvases;
    const input = { columns: 60, rows: 40, state: skyState(1, { sunrise: 7.25, sunset: 19 }), phase: 0.5, intensity: 0.5, path: 'arc' as const, size: 0.7, moonScale: 0.6, reveal: 1, tick: 0, quiet: new Uint8Array(2400).fill(3) };
    for (let cycle = 0; cycle < 5; cycle += 1) {
      owner.mount();
      expect(owner.renderer.paint(input, targets).allocations).toBe(4);
      expect(owner.renderer.paint(input, targets)).toEqual({ layers: [], allocations: 0, resizes: 0 });
      const cache = retainedCaches[0];
      expect(cache.moon).not.toBeNull();
      expect(cache.stars).not.toBeNull();
      expect(cache.mask).not.toBeNull();
      owner.destroy();
      expect(cache.moon).toBeNull();
      expect(cache.stars).toBeNull();
      expect(cache.mask).toBeNull();
      expect(cache.featureQuiet.every((value) => value === 0)).toBe(true);
      expect(cache.featureSize.every((value) => value === 0)).toBe(true);
    }
    expect(retainedCaches).toHaveLength(1);
  });

  it('returns timers, frames, active root and owned listeners to zero over five mounts', () => {
    vi.useFakeTimers();
    const frames = new Map<number, FrameRequestCallback>();
    let sequence = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { frames.set(++sequence, callback); return sequence; });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { frames.delete(id); });
    const addWindow = vi.spyOn(window, 'addEventListener');
    const removeWindow = vi.spyOn(window, 'removeEventListener');
    const addDocument = vi.spyOn(document, 'addEventListener');
    const removeDocument = vi.spyOn(document, 'removeEventListener');
    const owner = createPublicAstridSkySession({ environment: { visible: true, reducedMotion: true, phone: false } });
    const root = document.createElement('main');
    const reading = document.createElement('p');
    reading.textContent = 'Disposable reading root';
    root.append(reading);
    owner.setGeometryViewport(60, 40);
    const notify = vi.fn();
    for (let cycle = 0; cycle < 5; cycle += 1) {
      owner.mount();
      owner.registerGeometryRoot(root, 'p', 'home');
      owner.subscribeRaster(notify);
      owner.subscribeGeometry(notify);
      owner.subscribeParallax(notify);
      owner.subscribeControls(notify);
      expect(vi.getTimerCount()).toBe(2);
      expect(frames.size).toBe(1);
      const stale = [...frames.values()];
      owner.destroy();
      expect(vi.getTimerCount()).toBe(0);
      expect(frames.size).toBe(0);
      expect(owner.getGeometrySnapshot()).toMatchObject({ quiet: null, root: null, owner: null });
      notify.mockClear();
      stale.forEach((callback) => callback(performance.now()));
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(60_000);
      expect(notify).not.toHaveBeenCalled();
      expect(frames.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    }
    for (const [name, callback] of addWindow.mock.calls) {
      expect(removeWindow.mock.calls.filter(([removedName, removedCallback]) => removedName === name && removedCallback === callback)).toHaveLength(addWindow.mock.calls.filter(([addedName, addedCallback]) => addedName === name && addedCallback === callback).length);
    }
    for (const [name, callback] of addDocument.mock.calls) {
      expect(removeDocument.mock.calls.filter(([removedName, removedCallback]) => removedName === name && removedCallback === callback)).toHaveLength(addDocument.mock.calls.filter(([addedName, addedCallback]) => addedName === name && addedCallback === callback).length);
    }
  });
});
