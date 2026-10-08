import { describe, expect, it } from 'vitest';
import { blendHslToken, DUSK_SWITCH, moonPhase, moonPhaseName, pageDusk, pagePaperFor, renderPublicAstridSky, skyLevelBounds, skyState, themeForDarkness } from './publicAstridSkyRender';

const OCTOBER = { sunrise: 7.25, sunset: 19 };

const litPixels = (pixels: Uint8ClampedArray) => {
  let count = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) count++;
  return count;
};

describe('public Astrid sky', () => {
  it('reads the real moon phase from the date', () => {
    expect(moonPhaseName(moonPhase(new Date(Date.UTC(2026, 8, 26, 16, 49))))).toBe('Full moon');
    expect(moonPhaseName(moonPhase(new Date(Date.UTC(2026, 9, 1, 12))))).toBe('Waning gibbous');
  });

  it('shows the sun by day, an empty twilight, then the moon', () => {
    expect(skyState(13, OCTOBER)).toMatchObject({ body: 'sun' });
    expect(skyState(13, OCTOBER).altitude).toBeGreaterThan(0.95);
    expect(skyState(19.3, OCTOBER).body).toBe('none');
    expect(skyState(23.5, OCTOBER)).toMatchObject({ body: 'moon', rising: true });
    expect(skyState(3, OCTOBER)).toMatchObject({ body: 'moon', rising: false });
    expect(skyState(6.8, OCTOBER).body).toBe('none');
  });

  it('derives the fixed brightness range from first light to full dark', () => {
    expect(skyLevelBounds(OCTOBER)).toEqual({ firstLight: 6.5, fullDark: 20.9 });
  });

  it('fades stars in through dusk and out before sunrise, and turns clouds to night silhouettes', () => {
    expect(skyState(13, OCTOBER)).toMatchObject({ stars: 0, clouds: 1, night: 0 });
    expect(skyState(1, OCTOBER)).toMatchObject({ clouds: 1, night: 1 });
    expect(skyState(19.1, OCTOBER).stars).toBe(0);
    expect(skyState(19.6, OCTOBER).stars).toBeGreaterThan(0);
    expect(skyState(19.6, OCTOBER).stars).toBeLessThan(1);
    expect(skyState(1, OCTOBER).stars).toBe(1);
    expect(skyState(6.5, OCTOBER).stars).toBeLessThan(skyState(5, OCTOBER).stars);
    expect(skyState(7.2, OCTOBER).stars).toBeLessThan(0.05);
  });

  it('fills an empty twilight sky with stars', () => {
    const pixels = renderPublicAstridSky({
      columns: 100, rows: 64, state: skyState(19.6, OCTOBER), phase: 0.6, intensity: 0.5,
    });
    expect(skyState(19.6, OCTOBER).body).toBe('none');
    expect(litPixels(pixels)).toBeGreaterThan(5);
  });

  it('leaves the sky transparent when nothing is up', () => {
    const pixels = renderPublicAstridSky({
      columns: 40, rows: 25, state: { body: 'none', altitude: 0, progress: 0, rising: false, hours: 19.3, stars: 0, clouds: 0, night: 1 }, phase: 0.5, intensity: 0.7,
    });
    expect(litPixels(pixels)).toBe(0);
  });

  it('paints a body that fills much of the viewport without covering it entirely', () => {
    for (const hours of [18.3, 18.6]) {
      const pixels = renderPublicAstridSky({
        columns: 100, rows: 64, state: skyState(hours, OCTOBER), phase: 0.6, intensity: 0.7,
      });
      const share = litPixels(pixels) / (100 * 64);
      expect(share).toBeGreaterThan(0.1);
      expect(share).toBeLessThan(0.95);
    }
  });

  it('can hide the selected body without hiding the rest of the sky', () => {
    const state = { ...skyState(13, OCTOBER), clouds: 0, stars: 0 };
    const body = renderPublicAstridSky({ columns: 100, rows: 64, state, phase: 0.6, intensity: 0.7, showEnvironment: false });
    const hidden = renderPublicAstridSky({ columns: 100, rows: 64, state, phase: 0.6, intensity: 0.7, showSun: false, showEnvironment: false });
    expect(litPixels(body)).toBeGreaterThan(0);
    expect(litPixels(hidden)).toBe(0);
  });

  it('can hide the environment while keeping a body visible', () => {
    const state = skyState(13, OCTOBER);
    const withEnvironment = renderPublicAstridSky({ columns: 100, rows: 64, state, phase: 0.6, intensity: 0.7 });
    const withoutEnvironment = renderPublicAstridSky({ columns: 100, rows: 64, state, phase: 0.6, intensity: 0.7, showEnvironment: false });
    expect(litPixels(withoutEnvironment)).toBeGreaterThan(0);
    expect(litPixels(withEnvironment)).toBeGreaterThan(litPixels(withoutEnvironment));
  });

  it('sinks the sun fully below the horizon before it is gone', () => {
    const lit = (hours: number) => litPixels(renderPublicAstridSky({
      columns: 100, rows: 64, state: { ...skyState(hours, OCTOBER), clouds: 0 }, phase: 0.6, intensity: 0.5,
    }));
    expect(lit(16)).toBeGreaterThan(lit(18));
    expect(lit(18)).toBeGreaterThan(lit(18.9));
    expect(lit(18.98)).toBeLessThan(100 * 64 * 0.03);
  });

  it('twinkles some stars without touching the rest', () => {
    const at = (tick: number) => renderPublicAstridSky({
      columns: 120, rows: 80, state: { body: 'none', altitude: 0, progress: 0, rising: false, hours: 1, stars: 1, clouds: 0, night: 1 },
      phase: 0.6, intensity: 0.5, tick,
    });
    // A full twinkle cycle over an open sky.
    const frames = Array.from({ length: 12 }, (_, tick) => at(tick));
    let changed = 0;
    let steady = 0;
    for (let i = 3; i < frames[0].length; i += 4) {
      if (!frames[0][i]) continue;
      if (frames.some((frame) => frame[i] !== frames[0][i])) changed++;
      else steady++;
    }
    expect(changed).toBeGreaterThan(0);
    expect(steady).toBeGreaterThan(changed);
  });

  it('drifts the sun from left to right across the day on the arc path', () => {
    // The disc is wider than the screen, so track where the top of its dome sits.
    const peakX = (hours: number) => {
      const columns = 120;
      const pixels = renderPublicAstridSky({
        columns, rows: 80, state: { ...skyState(hours, OCTOBER), clouds: 0 }, phase: 0.6, intensity: 1, path: 'arc',
      });
      for (let y = 0; y < 80; y++) {
        const xs: number[] = [];
        for (let x = 0; x < columns; x++) if (pixels[(y * columns + x) * 4 + 3]) xs.push(x);
        if (xs.length) return (xs[0] + xs[xs.length - 1]) / 2;
      }
      return NaN;
    };
    expect(peakX(9)).toBeLessThan(peakX(13));
    expect(peakX(13)).toBeLessThan(peakX(17));
  });

  it('sets the page palette from how dark the sky is, deepening continuously within each', () => {
    expect(themeForDarkness(skyState(13, OCTOBER).night)).toBe('light');
    expect(themeForDarkness(skyState(1, OCTOBER).night)).toBe('dark');
    // Mid-twilight, where the palette changes, is about 35 minutes after sunset (19:00 here).
    expect(skyState(19.58, OCTOBER).night).toBeCloseTo(0.5, 1);
    expect(themeForDarkness(skyState(19.2, OCTOBER).night)).toBe('light');
    const lightness = (darkness: number) => pagePaperFor(darkness).match(/\d+/g)!.map(Number).reduce((a, b) => a + b);
    expect(lightness(0)).toBeGreaterThan(lightness(0.3));
    expect(lightness(0.3)).toBeGreaterThan(lightness(0.49));
    expect(lightness(0.6)).toBeGreaterThan(lightness(1));
  });

  it('switches paper and ink together at dusk so the page never enters dark-on-dark', () => {
    const before = pageDusk(DUSK_SWITCH.at - 0.001);
    const after = pageDusk(DUSK_SWITCH.at);
    expect(before.ink).toBe(0);
    expect(before.inkPage).toBe(0);
    expect(after.ink).toBe(1);
    expect(after.inkPage).toBe(1);
    expect(before.paper).not.toBe(after.paper);
  });

  it('paints each depth layer on its own', () => {
    const at = (layer: 'sky' | 'stars' | 'far' | 'near') => litPixels(renderPublicAstridSky({
      columns: 120, rows: 80, state: skyState(13, OCTOBER), phase: 0.6, intensity: 0.5, layer, path: 'arc',
    }));
    expect(at('sky')).toBeGreaterThan(0);
    expect(at('far')).toBeGreaterThan(0);
    expect(at('near')).toBeGreaterThan(at('far'));
  });

  it('keeps far clouds behind near ones, never showing through them', () => {
    for (const hours of [2, 10, 13, 16, 23]) {
      const frame = (layer: 'far' | 'near') => renderPublicAstridSky({
        columns: 200, rows: 140, state: { ...skyState(hours, OCTOBER), hours }, phase: 0.6, intensity: 0.5, layer, path: 'arc',
      });
      const far = frame('far');
      const near = frame('near');
      for (let i = 3; i < far.length; i += 4) expect(far[i] && near[i]).toBeFalsy();
    }
  });

  it('blends design tokens through greys, never a saturated in-between', () => {
    // Day card is near-white at full saturation; a straight HSL blend would pass through ochre.
    const [, saturation, lightness] = blendHslToken('48 100% 99%', '33 11% 17%', 0.5).replace(/%/g, '').split(' ').map(Number);
    expect(saturation).toBeLessThan(30);
    expect(lightness).toBeGreaterThan(40);
    expect(lightness).toBeLessThan(70);
    expect(blendHslToken('48 100% 99%', '33 11% 17%', 0)).toBe('48 100% 99%');
  });

  it('keeps clouds and stars still as the clock passes midnight', () => {
    const frame = (hours: number) => renderPublicAstridSky({
      columns: 120, rows: 80, state: { ...skyState(hours, OCTOBER), hours }, phase: 0.6, intensity: 0.5, layer: 'stars',
    });
    const before = frame(23.999);
    const after = frame(0.001);
    let differing = 0;
    for (let i = 3; i < before.length; i += 4) if (Boolean(before[i]) !== Boolean(after[i])) differing++;
    expect(differing).toBeLessThan(5);
    for (const layer of ['near', 'far'] as const) {
      const at = (hours: number) => renderPublicAstridSky({
        columns: 120, rows: 80, state: { ...skyState(hours, OCTOBER), hours }, phase: 0.6, intensity: 0.5, layer,
      });
      const a = at(23.999);
      const b = at(0.001);
      let moved = 0;
      for (let i = 3; i < a.length; i += 4) if (Boolean(a[i]) !== Boolean(b[i])) moved++;
      expect(moved).toBeLessThan(10);
    }
  });

  it('fades stars in gradually through dusk rather than switching them on', () => {
    const starAlpha = (hours: number) => {
      const pixels = renderPublicAstridSky({
        columns: 120, rows: 80, state: { ...skyState(hours, OCTOBER), body: 'none', clouds: 0 }, phase: 0.6, intensity: 0.5, layer: 'stars',
      });
      let sum = 0;
      for (let i = 3; i < pixels.length; i += 4) sum += pixels[i];
      return sum;
    };
    // Every few minutes through dusk the starfield changes by a small step, never a sudden jump. (Star
    // colour eases slightly dimmer for the dark page, so the total may dip a touch as well as rise.)
    let previous = starAlpha(19.3);
    for (let hours = 19.35; hours <= 20.2; hours += 0.05) {
      const now = starAlpha(hours);
      expect(now).toBeGreaterThanOrEqual(previous * 0.97);
      expect(now - previous).toBeLessThan(Math.max(4000, previous * 0.6));
      previous = now;
    }
  });

  describe('quieting behind the page text', () => {
    const columns = 200;
    const rows = 140;
    /** Full quiet over a block of the sky, as the page marks it behind a line of text. */
    const quietBlock = (x0: number, y0: number, x1: number, y1: number) => {
      const field = new Uint8Array(columns * rows);
      for (let y = y0; y < y1; y++) field.fill(3, y * columns + x0, y * columns + x1);
      return field;
    };
    const changedPixels = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
      const changed: number[] = [];
      for (let i = 0; i < a.length; i += 4) {
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) changed.push(i / 4);
      }
      return changed;
    };
    const inBlock = (pixel: number, [x0, y0, x1, y1]: readonly number[]) => {
      const x = pixel % columns;
      const y = Math.floor(pixel / columns);
      return x >= x0 && x < x1 && y >= y0 && y < y1;
    };

    it('fades the moon\'s craters and seas evenly across their shapes, and never changes the moon itself', () => {
      const frame = (quiet?: Uint8Array) => renderPublicAstridSky({
        columns, rows, state: skyState(1, OCTOBER), phase: 0.5, intensity: 0.5, layer: 'sky', path: 'arc', moonScale: 0.6, quiet,
      });
      const plain = frame();
      // A thin strip across the moon, like one line of text: features it touches fade in full.
      let lit = 0;
      let sumX = 0;
      let sumY = 0;
      for (let i = 3; i < plain.length; i += 4) if (plain[i]) { lit++; sumX += ((i - 3) / 4) % columns; sumY += Math.floor((i - 3) / 4 / columns); }
      const cx = Math.round(sumX / lit);
      const cy = Math.round(sumY / lit);
      const block = [cx - 20, cy - 2, cx + 20, cy + 2] as const;
      const quieted = frame(quietBlock(...block));
      const changed = changedPixels(plain, quieted);
      expect(changed.length).toBeGreaterThan(0);
      // Whole features: the fading reaches well past the strip, so nothing is cut along its edge...
      expect(changed.some((pixel) => !inBlock(pixel, block))).toBe(true);
      // ...at the moon's own strength: only feature tones change, never the moon's outline or opacity.
      for (const pixel of changed) expect(quieted[pixel * 4 + 3]).toBe(plain[pixel * 4 + 3]);
      // Nothing disappears: every faded pixel keeps part of its own tone, never becoming the plain surface
      // outright (a fully faded pixel would match the plain lit tone, the most common lit tone).
      const counts = new Map<string, number>();
      for (let i = 0; i < plain.length; i += 4) if (plain[i + 3]) { const key = plain.slice(i, i + 3).join(','); counts.set(key, (counts.get(key) ?? 0) + 1); }
      const plainTone = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      for (const pixel of changed) expect(quieted.slice(pixel * 4, pixel * 4 + 3).join(',')).not.toBe(plainTone);
    });

    it('barely touches a feature that only brushes the text', () => {
      const frame = (quiet?: Uint8Array) => renderPublicAstridSky({
        columns, rows, state: skyState(1, OCTOBER), phase: 0.5, intensity: 0.5, layer: 'sky', path: 'arc', moonScale: 0.6, quiet,
      });
      const plain = frame();
      // Sample one-pixel touches spread across the whole moon.
      const moonPixels: number[] = [];
      for (let i = 3; i < plain.length; i += 4) if (plain[i]) moonPixels.push((i - 3) / 4);
      const samples = moonPixels.filter((_, i) => i % Math.ceil(moonPixels.length / 40) === 0);
      expect(samples.length).toBeGreaterThan(20);
      let biggest = 0;
      for (const pixel of samples) {
        const quieted = frame(quietBlock(pixel % columns, Math.floor(pixel / columns), pixel % columns + 1, Math.floor(pixel / columns) + 1));
        for (let j = 0; j < plain.length; j += 4) biggest = Math.max(biggest, Math.abs(plain[j] - quieted[j]));
      }
      // One pixel of text against a whole crater or sea: a nudge at most, never a jump.
      expect(biggest).toBeLessThanOrEqual(4);
    });

    it('thins each cloud as a whole, by the same amount throughout', () => {
      const frame = (quiet?: Uint8Array) => renderPublicAstridSky({
        columns, rows, state: skyState(13, OCTOBER), phase: 0.5, intensity: 0.5, layer: 'near', path: 'arc', quiet,
      });
      const plain = frame();
      let first = -1;
      for (let i = 3; i < plain.length && first < 0; i += 4) if (plain[i]) first = (i - 3) / 4;
      const x = first % columns;
      const y = Math.floor(first / columns);
      // A patch of the cloud's top edge is behind the text.
      const block = [x - 6, y, x + 6, y + 3] as const;
      const quieted = frame(quietBlock(...block));
      const changed = changedPixels(plain, quieted);
      expect(changed.some((pixel) => !inBlock(pixel, block))).toBe(true);
      const ratios = new Set(changed.map((pixel) => (quieted[pixel * 4 + 3] / plain[pixel * 4 + 3]).toFixed(1)));
      expect(ratios.size).toBe(1);
      expect([...ratios][0]).not.toBe('1.0');
    });

    it('leaves the sky exactly as drawn where there is no text', () => {
      const frame = (quiet?: Uint8Array) => renderPublicAstridSky({
        columns, rows, state: skyState(1, OCTOBER), phase: 0.5, intensity: 0.5, path: 'arc', moonScale: 0.6, quiet,
      });
      expect(changedPixels(frame(), frame(new Uint8Array(columns * rows)))).toHaveLength(0);
    });
  });
});
