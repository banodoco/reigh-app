// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createPublicAstridSkyRasterCache, renderPublicAstridSky, skyState, type PublicAstridSkyRenderInput } from './publicAstridSkyRender';
import { createPublicAstridSkyRenderer, PUBLIC_ASTRID_SKY_LAYERS, publicAstridSkyLayerKey, type PublicAstridSkyCanvases } from './publicAstridSkyRenderer';
import { createPublicAstridSkySession } from './publicAstridSkySession';

const input: PublicAstridSkyRenderInput = {
  columns: 60, rows: 40, state: skyState(1, { sunrise: 7.25, sunset: 19 }),
  phase: 0.5, intensity: 0.5, path: 'arc', size: 0.7, moonScale: 0.6, reveal: 1, tick: 0,
};

function canvases(events: string[] = []) {
  return Object.fromEntries(PUBLIC_ASTRID_SKY_LAYERS.map((layer) => {
    let width = 0;
    let height = 0;
    const context = {
      createImageData: vi.fn((w: number, h: number) => { events.push('allocate'); return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }),
      putImageData: vi.fn(() => events.push('write')),
    };
    return [layer, {
      get width() { events.push('read'); return width; }, set width(value: number) { events.push('write'); width = value; },
      get height() { events.push('read'); return height; }, set height(value: number) { events.push('write'); height = value; },
      getContext: () => context,
    }];
  })) as PublicAstridSkyCanvases;
}

describe('bounded sky raster passes', () => {
  it('maps twinkle, phase, clouds and disc occlusion to only their dependent layers', () => {
    const dirty = (next: PublicAstridSkyRenderInput) => PUBLIC_ASTRID_SKY_LAYERS.filter((layer) => publicAstridSkyLayerKey(input, layer) !== publicAstridSkyLayerKey(next, layer));
    expect(dirty({ ...input, tick: 1 })).toEqual(['stars']);
    expect(dirty({ ...input, phase: 0.6 })).toEqual(['sky']);
    expect(dirty({ ...input, state: { ...input.state, hours: 2 } })).toEqual(['stars', 'far', 'near']);
    expect(dirty({ ...input, state: { ...input.state, stars: 0.5 } })).toEqual(['stars']);
    expect(dirty({ ...input, intensity: 0.8 })).toEqual(['sky']);
    expect(dirty({ ...input, lift: 0.2 })).toEqual([...PUBLIC_ASTRID_SKY_LAYERS]);
    const sun = { ...input, state: skyState(12, { sunrise: 7.25, sunset: 19 }) };
    expect(publicAstridSkyLayerKey(sun, 'sky')).toBe(publicAstridSkyLayerKey({ ...sun, phase: 0.6 }, 'sky'));
  });

  it('reuses all four ImageData buffers and resizes only changed grid dimensions', () => {
    const renderer = createPublicAstridSkyRenderer();
    const targets = canvases();
    expect(renderer.paint(input, targets)).toEqual({ layers: [...PUBLIC_ASTRID_SKY_LAYERS], allocations: 4, resizes: 8 });
    const first = targets.sky!.getContext('2d')!.createImageData;
    expect(renderer.paint(input, targets)).toEqual({ layers: [], allocations: 0, resizes: 0 });
    expect(renderer.paint({ ...input, tick: 1 }, targets)).toEqual({ layers: ['stars'], allocations: 0, resizes: 0 });
    expect(first).toHaveBeenCalledTimes(1);
    expect(renderer.paint({ ...input, columns: 61 }, targets)).toEqual({ layers: [...PUBLIC_ASTRID_SKY_LAYERS], allocations: 4, resizes: 4 });
    renderer.dispose();
    expect(renderer.paint({ ...input, columns: 61 }, targets).allocations).toBe(4);
  });

  it('reads every canvas before publishing any writes, and ignores sun-only quiet changes', () => {
    const events: string[] = [];
    const renderer = createPublicAstridSkyRenderer();
    const targets = canvases(events);
    const sun = { ...input, state: skyState(12, { sunrise: 7.25, sunset: 19 }) };
    renderer.paint(sun, targets);
    expect(events.lastIndexOf('read')).toBeLessThan(events.indexOf('write'));
    expect(events.lastIndexOf('allocate')).toBeLessThan(events.indexOf('write'));
    expect(renderer.paint({ ...sun, quiet: new Uint8Array(input.columns * input.rows) }, targets).layers).toEqual(['stars', 'far', 'near']);
  });

  it('preserves pixel output through reuse and clears old pixels when strength becomes zero', () => {
    const cache = createPublicAstridSkyRasterCache();
    const output = new Uint8ClampedArray(input.columns * input.rows * 4);
    for (const layer of PUBLIC_ASTRID_SKY_LAYERS) {
      for (const hours of [1, 12, 19.6]) {
        const next = { ...input, layer, state: skyState(hours, { sunrise: 7.25, sunset: 19 }), quiet: new Uint8Array(input.columns * input.rows).fill(2) };
        expect(renderPublicAstridSky(next, output, cache)).toBe(output);
        expect(output).toEqual(renderPublicAstridSky(next));
      }
    }
    const mask = cache.mask;
    renderPublicAstridSky({ ...input, layer: 'stars' }, output, cache);
    expect(cache.mask).toBe(mask);
    renderPublicAstridSky({ ...input, intensity: 0 }, output, cache);
    expect(output.every((value) => value === 0)).toBe(true);
  });

  it('releases renderer images on Site disposal and supports StrictMode remount', () => {
    const session = createPublicAstridSkySession({ environment: { visible: true, reducedMotion: true, phone: false } });
    const targets = canvases();
    session.mount();
    session.renderer.paint(input, targets);
    session.destroy();
    session.mount();
    expect(session.renderer.paint(input, targets)).toEqual({ layers: [...PUBLIC_ASTRID_SKY_LAYERS], allocations: 4, resizes: 0 });
    session.destroy();
  });
});
