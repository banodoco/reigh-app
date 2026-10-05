import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { BASELINE_CLIPS, PROJECT_SLUG, TIMELINE_SLUG, browserEvidencePath, openEditor } from './support';

const FPS = 30;
const PREVIEW_SURFACE = '[data-testid="video-editor-preview-surface"]';
const RULER = '[data-testid="timeline-ruler"]';
const HERO_CLIP = '[data-clip-id="clip-hero"][role="button"]';

type RulerCalibration = {
  x1: number;
  time1: number;
  x2: number;
  time2: number;
  pixelsPerSecond: number;
};

async function currentPreviewTime(page: Page): Promise<number> {
  const raw = await page.locator(PREVIEW_SURFACE).getAttribute('data-current-time');
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`preview has no finite data-current-time: ${String(raw)}`);
  return value;
}

async function clickRulerAndReadTime(
  page: Page,
  x: number,
  requireChange = true,
): Promise<number> {
  const ruler = await page.locator(RULER).boundingBox();
  if (!ruler) throw new Error('timeline ruler has no browser box');
  const before = await currentPreviewTime(page);
  await page.mouse.click(x, ruler.y + ruler.height / 2);
  if (requireChange) {
    await expect.poll(() => currentPreviewTime(page), { timeout: 5_000 }).not.toBe(before);
  } else {
    await page.waitForTimeout(100);
  }
  return currentPreviewTime(page);
}

async function calibrateRuler(page: Page): Promise<RulerCalibration> {
  const ruler = await page.locator(RULER).boundingBox();
  if (!ruler) throw new Error('timeline ruler has no browser box');
  // Two real pointer clicks establish the screen-x to rendered-time mapping
  // for the current zoom. Anchoring from observed frame times accounts for
  // Remotion's frame snapping and avoids relying on stale pixel geometry.
  const x1 = ruler.x + ruler.width * 0.12;
  const x2 = ruler.x + ruler.width * 0.42;
  const time1 = await clickRulerAndReadTime(page, x1, false);
  const time2 = await clickRulerAndReadTime(page, x2, false);
  const pixelsPerSecond = (x2 - x1) / (time2 - time1);
  if (!Number.isFinite(pixelsPerSecond) || pixelsPerSecond <= 0) {
    throw new Error(`ruler calibration did not advance: ${JSON.stringify({ x1, time1, x2, time2 })}`);
  }
  return { x1, time1, x2, time2, pixelsPerSecond };
}

test.describe('seeded browser preview samples', () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test('asserts eight distinct observed frames across zoom and blend boundaries', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await openEditor(page);
    await expect(page.locator(RULER)).toBeVisible();
    await expect(page.locator(PREVIEW_SURFACE)).toBeVisible();

    // The deterministic fixture has a V2 video clip over V1 from frame 45
    // (1.5s) through frame 194; frame 195 starts the next V1 still. The
    // samples straddle both ends of that compositing interval. The middle
    // samples are seed-derived and the later boundaries run after a zoom-in.
    const seed = 'timeline-preview-seed-20261005';
    let seedState = [...seed].reduce((hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16_777_619), 2_166_136_261) >>> 0;
    const nextSeededFrame = (min: number, max: number): number => {
      seedState ^= seedState << 13;
      seedState ^= seedState >>> 17;
      seedState ^= seedState << 5;
      return min + ((seedState >>> 0) % (max - min + 1));
    };
    const seededFrames = [
      nextSeededFrame(5, 35),
      44, 45, 46,
      nextSeededFrame(70, 170),
      194, 195,
      nextSeededFrame(240, 300),
    ];
    const labels = [
      'seed-interior-before-blend',
      'blend-entry-before',
      'blend-entry',
      'blend-entry-after',
      'seed-interior-during-blend',
      'blend-exit-before',
      'blend-exit',
      'seed-interior-after-blend',
    ];
    const baselineExtent = BASELINE_CLIPS.reduce((end, clip) => Math.max(end, clip.at + clip.hold), 0);
    expect(seededFrames.every((frame) => frame / FPS < baselineExtent)).toBe(true);
    expect(new Set(seededFrames).size).toBe(8);

    const records: Array<Record<string, unknown>> = [];
    let calibration = await calibrateRuler(page);
    let zoomBefore = await page.locator(HERO_CLIP).evaluate((el) => el.getBoundingClientRect().width);

    for (let index = 0; index < seededFrames.length; index += 1) {
      if (index === 4) {
        await page.getByRole('button', { name: 'Zoom in timeline' }).first().click();
        await expect.poll(
          () => page.locator(HERO_CLIP).evaluate((el) => el.getBoundingClientRect().width),
          { timeout: 5_000 },
        ).toBeGreaterThan(zoomBefore);
        zoomBefore = await page.locator(HERO_CLIP).evaluate((el) => el.getBoundingClientRect().width);
        calibration = await calibrateRuler(page);
      }

      const requestedFrame = seededFrames[index]!;
      const requestedTime = requestedFrame / FPS;
      const label = labels[index]!;
      let x = calibration.x1 + ((requestedTime - calibration.time1) * calibration.pixelsPerSecond);
      const rulerBox = await page.locator(RULER).boundingBox();
      if (!rulerBox) throw new Error(`no ruler box for ${label}`);
      expect(x, `${label}: requested frame ${requestedFrame} must be reachable on the visible ruler`).toBeGreaterThan(rulerBox.x + 2);
      expect(x, `${label}: requested frame ${requestedFrame} must be reachable on the visible ruler`).toBeLessThan(rulerBox.x + rulerBox.width - 2);

      let observedTime = -1;
      let observedFrame = -1;
      let adjustments = 0;
      for (; adjustments < 4; adjustments += 1) {
        observedTime = await clickRulerAndReadTime(page, x, adjustments === 0);
        observedFrame = Math.round(observedTime * FPS);
        if (observedFrame === requestedFrame) break;
        x += (requestedTime - observedTime) * calibration.pixelsPerSecond;
        expect(x, `${label}: calibrated correction must stay on the visible ruler`).toBeGreaterThan(rulerBox.x + 2);
        expect(x, `${label}: calibrated correction must stay on the visible ruler`).toBeLessThan(rulerBox.x + rulerBox.width - 2);
      }

      expect(
        Math.abs(observedTime - requestedTime),
        `${label}: requested ${requestedTime.toFixed(6)}s/frame ${requestedFrame}, observed ${observedTime.toFixed(6)}s/frame ${observedFrame}`,
      ).toBeLessThan(0.5 / FPS);
      expect(observedFrame, `${label}: requested frame ${requestedFrame}, observed frame ${observedFrame}`).toBe(requestedFrame);
      expect(adjustments).toBeLessThan(4);

      const screenshotPath = browserEvidencePath(testInfo, `seeded-preview/${String(index + 1).padStart(2, '0')}-${label}.png`);
      await mkdir(dirname(screenshotPath), { recursive: true });
      await page.locator(PREVIEW_SURFACE).screenshot({ path: screenshotPath, animations: 'disabled' });
      records.push({
        index: index + 1,
        label,
        seed,
        requestedFrame,
        requestedTime,
        observedTime,
        observedFrame,
        zoomPixelsPerSecond: calibration.pixelsPerSecond,
        correctionClicks: adjustments,
        screenshot: screenshotPath,
      });
    }

    expect(new Set(records.map((sample) => sample.observedFrame)).size).toBe(8);
    const manifestPath = browserEvidencePath(testInfo, 'seeded-preview/manifest.json');
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify({
      seed,
      project: PROJECT_SLUG,
      timeline: TIMELINE_SLUG,
      fps: FPS,
      timelineExtentSeconds: baselineExtent,
      zoomLevels: [...new Set(records.map((sample) => sample.zoomPixelsPerSecond))],
      sampleCount: records.length,
      samples: records,
    }, null, 2)}\n`);
  });
});
