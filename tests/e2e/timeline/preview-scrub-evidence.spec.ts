import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  BRIDGE_ORIGIN,
  EDITOR_URL,
  EDITOR_SETTLE_MS,
  PROJECT_SLUG,
  TIMELINE_SLUG,
  browserEvidencePath,
} from './support';

const execFileAsync = promisify(execFile);
const FPS = 30;
const PREVIEW = '[data-testid="video-editor-preview-surface"]';
const RULER = '[data-testid="timeline-ruler"]';
const TIMELINE_URL = `${BRIDGE_ORIGIN}/projects/${PROJECT_SLUG}/timelines/${TIMELINE_SLUG}`;
const SOURCE_ROOT = process.cwd();

type EvidenceRecord = {
  label: string;
  requestedTime: number;
  observedTime: number;
  dispatchCount: number;
  inputToDispatchMs: number;
  inputToPixelMatchMs: number;
  screenshot: string;
  expected: string;
  rmse: number;
  oldRmse?: number;
};

type PlayerSeekDispatch = { at: number; time: number; frame: number; configGeneration: number };
type EvidenceState = {
  currentTimeSets: number;
  playCalls: number;
  autoResumeCalls: number;
  inputStartedAt: number | null;
  dispatches: PlayerSeekDispatch[];
};
type FixtureClip = { id: string; asset?: string; from?: number; to?: number; [key: string]: unknown };
type FixtureConfig = { clips: FixtureClip[]; [key: string]: unknown };
type FixtureTimeline = { config: FixtureConfig; registry: Record<string, unknown>; config_version: number };
type EvidenceWindow = Window & { __SCRUB_EVIDENCE__: EvidenceState };
type RulerMap = { x1: number; time1: number; pixelsPerSecond: number };
type SeekEvidence = { observedTime: number; inputStartedAt: number; dispatchCount: number; inputToDispatchMs: number };
type SourceProbe = { previewSources: string[]; resourceEntries: string[] };

async function run(command: string, args: string[]): Promise<string> {
  const result = await execFileAsync(command, args, { maxBuffer: 8 * 1024 * 1024 });
  return `${result.stdout}${result.stderr}`.trim();
}

async function runMetric(command: string, args: string[]): Promise<string> {
  try {
    return await run(command, args);
  } catch (error) {
    const result = error as { stdout?: string; stderr?: string; message?: string };
    return `${result.stdout ?? ''}${result.stderr ?? result.message ?? ''}`.trim();
  }
}

async function currentTime(page: Page): Promise<number> {
  const value = Number(await page.locator(PREVIEW).getAttribute('data-current-time'));
  if (!Number.isFinite(value)) throw new Error(`preview current time is not finite: ${value}`);
  return value;
}

async function previewSourceProbe(page: Page, filename: string): Promise<SourceProbe> {
  return page.evaluate(({ selector, filename: target }) => {
    const previewSources = Array.from(document.querySelectorAll(selector))
      .map((node) => node instanceof HTMLImageElement || node instanceof HTMLVideoElement
        ? (node.currentSrc || node.src)
        : '')
      .filter((source) => source.includes(target));
    const resourceEntries = performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => name.includes(target));
    return { previewSources, resourceEntries };
  }, { selector: `${PREVIEW} img, ${PREVIEW} video, ${PREVIEW} canvas`, filename });
}

async function rulerMap(page: Page): Promise<RulerMap> {
  const labels = await page.locator(`${RULER} span`).evaluateAll((nodes) => nodes.map((node) => {
    const match = node.textContent?.trim().match(/^(\d+):(\d{2})\.(\d{2})$/);
    // The label is rendered at tick+6px and has 4px horizontal padding; use
    // its positioned parent and remove the intentional 6px label inset to get
    // the actual pointer-to-time tick coordinate without seeking to calibrate.
    const rect = node.parentElement?.getBoundingClientRect() ?? node.getBoundingClientRect();
    return match ? { time: Number(match[1]) * 60 + Number(match[2]) + Number(match[3]) / 100, x: rect.left - 6 } : null;
  }).filter((label): label is { time: number; x: number } => label !== null));
  const first = labels[0];
  const second = labels.find((label) => label.time > (first?.time ?? -1));
  if (!first || !second) throw new Error(`timeline ruler has insufficient rendered labels: ${JSON.stringify(labels)}`);
  const pixelsPerSecond = (second.x - first.x) / (second.time - first.time);
  if (!Number.isFinite(pixelsPerSecond) || pixelsPerSecond <= 0) throw new Error(`ruler map failed: ${JSON.stringify(labels)}`);
  return { x1: first.x, time1: first.time, pixelsPerSecond };
}

async function beginInput(page: Page): Promise<number> {
  return page.evaluate(() => {
    const state = (window as EvidenceWindow).__SCRUB_EVIDENCE__;
    state.inputStartedAt = performance.now();
    state.dispatches = [];
    return state.inputStartedAt;
  });
}

async function seekByRuler(page: Page, map: RulerMap, targetTime: number): Promise<SeekEvidence> {
  const ruler = await page.locator(RULER).boundingBox();
  if (!ruler) throw new Error('timeline ruler disappeared');
  const inputStartedAt = await beginInput(page);
  let x = map.x1 + (targetTime - map.time1) * map.pixelsPerSecond;
  if (x <= ruler.x + 2 || x >= ruler.x + ruler.width - 2) {
    throw new Error(`target ${targetTime}s is outside the visible ruler: x=${x}`);
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.mouse.click(x, ruler.y + ruler.height / 2);
    await page.waitForTimeout(350);
    const observed = await currentTime(page);
    if (Math.round(observed * FPS) === Math.round(targetTime * FPS)) {
      const evidence = await page.evaluate(() => {
        const state = (window as EvidenceWindow).__SCRUB_EVIDENCE__;
        return { dispatch: state.dispatches.at(-1), dispatchCount: state.dispatches.length };
      });
      if (!evidence.dispatch) throw new Error(`no Player.seekTo dispatch observed for ${targetTime}s`);
      return { observedTime: observed, inputStartedAt, dispatchCount: evidence.dispatchCount, inputToDispatchMs: evidence.dispatch.at - inputStartedAt };
    }
    x += (targetTime - observed) * map.pixelsPerSecond;
  }
  const observed = await currentTime(page);
  expect(Math.abs(observed - targetTime)).toBeLessThan(0.5 / FPS);
  const evidence = await page.evaluate(() => {
    const state = (window as EvidenceWindow).__SCRUB_EVIDENCE__;
    return { dispatch: state.dispatches.at(-1), dispatchCount: state.dispatches.length };
  });
  if (!evidence.dispatch) throw new Error(`no Player.seekTo dispatch observed for ${targetTime}s`);
  return { observedTime: observed, inputStartedAt, dispatchCount: evidence.dispatchCount, inputToDispatchMs: evidence.dispatch.at - inputStartedAt };
}

async function hideTransport(page: Page): Promise<void> {
  await page.locator('.astrid-preview-transport').evaluateAll((nodes) => {
    for (const node of nodes) (node as HTMLElement).style.visibility = 'hidden';
  });
}

async function showTransport(page: Page): Promise<void> {
  await page.locator('.astrid-preview-transport').evaluateAll((nodes) => {
    for (const node of nodes) (node as HTMLElement).style.visibility = '';
  });
}

async function makeReference(
  testInfo: TestInfo,
  source: string,
  kind: 'image' | 'video',
  sourceTime?: number,
): Promise<string> {
  const sourceKey = sourceTime === undefined ? source.split('/').pop()?.replace(/\.[^.]+$/, '') ?? kind : String(sourceTime);
  const path = browserEvidencePath(testInfo, `preview-scrub/reference-${kind}-${sourceKey}.png`);
  await mkdir(path.replace(/\/[^/]+$/, ''), { recursive: true });
  if (kind === 'video') {
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(sourceTime), '-i', source, '-frames:v', '1', path]);
  } else {
    await run('magick', [source, path]);
  }
  return path;
}

async function compareScreenshot(
  page: Page,
  testInfo: TestInfo,
  label: string,
  reference: string,
  mediaKind: 'image' | 'video',
): Promise<{ screenshot: string; rmse: number }> {
  await hideTransport(page);
  const screenshot = browserEvidencePath(testInfo, `preview-scrub/${label}.png`);
  // Remotion may present a preview frame through its native element or its
  // browser canvas path; select the visible media primitive, not editor chrome.
  const media = page.locator(
    mediaKind === 'video'
      ? `${PREVIEW} video:visible, ${PREVIEW} canvas:visible, ${PREVIEW} img:visible`
      : `${PREVIEW} img:visible`,
  ).first();
  await expect(media).toBeVisible();
  await media.screenshot({ path: screenshot, animations: 'disabled' });
  const size = (await run('magick', ['identify', '-format', '%wx%h', screenshot])).trim();
  const expected = browserEvidencePath(testInfo, `preview-scrub/${label}-expected.png`);
  const composed = browserEvidencePath(testInfo, `preview-scrub/${label}-composed.png`);
  await run('magick', [reference, '-resize', size, '-background', '#0b0b0b', '-gravity', 'center', '-extent', size, composed]);
  await run('magick', [composed, expected]);
  const output = await runMetric('magick', ['compare', '-metric', 'RMSE', expected, screenshot, 'null:']);
  const metric = Number(output.match(/\(([0-9.]+)\)/)?.[1] ?? Number.POSITIVE_INFINITY);
  if (!Number.isFinite(metric)) throw new Error(`could not parse RMSE for ${label}: ${output}`);
  return { screenshot, rmse: metric };
}

async function matchPixels(
  page: Page,
  testInfo: TestInfo,
  label: string,
  reference: string,
  mediaKind: 'image' | 'video',
  inputStartedAt: number,
  threshold: number,
): Promise<{ screenshot: string; rmse: number; inputToPixelMatchMs: number }> {
  const deadline = Date.now() + 8_000;
  let last: { screenshot: string; rmse: number } | null = null;
  while (Date.now() < deadline) {
    last = await compareScreenshot(page, testInfo, label, reference, mediaKind);
    if (last.rmse < threshold) {
      const inputToPixelMatchMs = await page.evaluate((startedAt) => performance.now() - startedAt, inputStartedAt);
      return { ...last, inputToPixelMatchMs };
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`pixel match timeout for ${label}: last RMSE=${last?.rmse ?? 'none'}, threshold=${threshold}`);
}

async function readTimeline(): Promise<FixtureTimeline> {
  const response = await fetch(TIMELINE_URL);
  if (!response.ok) throw new Error(`timeline GET failed: ${response.status}`);
  return response.json() as Promise<FixtureTimeline>;
}

async function replaceConfig(update: (config: FixtureConfig) => void): Promise<void> {
  const timeline = await readTimeline();
  const config = structuredClone(timeline.config);
  update(config);
  const response = await fetch(`${TIMELINE_URL}/save`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ config, registry: timeline.registry, expected_version: timeline.config_version }),
  });
  if (!response.ok) throw new Error(`timeline save failed: ${response.status} ${await response.text()}`);
}

async function refreshLiveQueries(page: Page): Promise<void> {
  // The local bridge provider intentionally uses the shared 30s timeline
  // refresh cadence and does not expose an imperative query invalidator.
  // Wait one full cadence after the external CAS save; this remains live and
  // avoids a reload or a test-only cache mutation.
  await page.waitForTimeout(31_500);
}

test.describe('preview scrubbing pixel evidence', () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test('correlates cold/repeat, drag, pause, and replacement seeks with real pixels', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await page.addInitScript(() => {
      const state: EvidenceState = { currentTimeSets: 0, playCalls: 0, autoResumeCalls: 0, inputStartedAt: null, dispatches: [] };
      Object.defineProperty(window, '__SCRUB_EVIDENCE__', { value: state, configurable: true });
      Object.defineProperty(window, '__REIGH_TEST_PLAYER_SEEK__', {
        value: {
          onDispatch: (event: Omit<PlayerSeekDispatch, 'at'>) => state.dispatches.push({ ...event, at: performance.now() }),
          onAutoResume: () => { state.autoResumeCalls += 1; },
        },
        configurable: true,
      });
      const currentTime = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
      if (currentTime?.set && currentTime.get) {
        Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
          configurable: true,
          get: currentTime.get,
          set(value: number) {
            state.currentTimeSets += 1;
            currentTime.set!.call(this, value);
          },
        });
      }
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function wrappedPlay(...args) {
        state.playCalls += 1;
        return play.apply(this, args);
      };
    });
    // The source-pinned Astrid checkout can take longer than the shared
    // helper's normal 9s settle while Vite transforms the full editor graph.
    // Wait for the same local-test contract explicitly before exercising the
    // preview; this keeps the evidence test deterministic without changing
    // production or shared harness timing.
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => Boolean(window.__REIGH_LOCAL_TEST__?.enabled), undefined, { timeout: 60_000 });
    await page.waitForTimeout(EDITOR_SETTLE_MS);
    await expect(page.locator(PREVIEW)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(RULER)).toBeVisible({ timeout: 30_000 });

    const image1 = await makeReference(testInfo, `${SOURCE_ROOT}/public/example-image1.jpg`, 'image');
    const image2 = await makeReference(testInfo, `${SOURCE_ROOT}/public/example-image2.jpg`, 'image');
    const video = `${SOURCE_ROOT}/public/example-video.mp4`;
    const records: EvidenceRecord[] = [];
    const negativeControls: Array<{ label: string; targetRmse: number; wrongTimeRmse: number; threshold: number }> = [];
    const map = await rulerMap(page);
    const imageThreshold = 0.15;
    const videoThreshold = 0.15;

    // The initial preview frame is the hero still. Detail is a distinct source
    // mounted only by its 6.5s Sequence (premountFor is one second), so this
    // probe proves image cold starts without a prior image2 seek or resource.
    const imageColdTime = 7;
    const imageColdProbe = await previewSourceProbe(page, 'example-image2.jpg');
    expect(imageColdProbe.previewSources, 'image2 must not already be mounted').toHaveLength(0);
    expect(imageColdProbe.resourceEntries, 'image2 must not already be fetched').toHaveLength(0);
    const imageColdSeek = await seekByRuler(page, map, imageColdTime);
    const imageCold = await matchPixels(page, testInfo, 'image-cold', image2, 'image', imageColdSeek.inputStartedAt, imageThreshold);
    records.push({ label: 'image-cold', requestedTime: imageColdTime, observedTime: imageColdSeek.observedTime, dispatchCount: imageColdSeek.dispatchCount, inputToDispatchMs: imageColdSeek.inputToDispatchMs, ...imageCold, expected: image2 });
    const imageRepeatSeek = await seekByRuler(page, map, imageColdTime);
    const imageRepeat = await matchPixels(page, testInfo, 'image-repeat', image2, 'image', imageRepeatSeek.inputStartedAt, imageThreshold);
    records.push({ label: 'image-repeat', requestedTime: imageColdTime, observedTime: imageRepeatSeek.observedTime, dispatchCount: imageRepeatSeek.dispatchCount, inputToDispatchMs: imageRepeatSeek.inputToDispatchMs, ...imageRepeat, expected: image2 });

    // The first video seek exercises decoder cold behavior; the second repeats
    // the same long-GOP target without warming the ruler or calibrating by seek.
    // The V1 hero still covers the V2 video until 4s; use the first target
    // where the long-GOP video is the visible primitive.
    const videoColdTime = 5.2;
    const videoColdProbe = await previewSourceProbe(page, 'example-video.mp4');
    expect(videoColdProbe.previewSources, 'video must not already be mounted').toHaveLength(0);
    expect(videoColdProbe.resourceEntries, 'video must not already be fetched').toHaveLength(0);
    const videoColdReference = await makeReference(testInfo, video, 'video', videoColdTime - 1.5);
    const videoColdSeek = await seekByRuler(page, map, videoColdTime);
    const videoCold = await matchPixels(page, testInfo, 'video-cold', videoColdReference, 'video', videoColdSeek.inputStartedAt, videoThreshold);
    records.push({ label: 'video-cold', requestedTime: videoColdTime, observedTime: videoColdSeek.observedTime, dispatchCount: videoColdSeek.dispatchCount, inputToDispatchMs: videoColdSeek.inputToDispatchMs, ...videoCold, expected: videoColdReference });
    const videoRepeatSeek = await seekByRuler(page, map, videoColdTime);
    const videoRepeat = await matchPixels(page, testInfo, 'video-repeat', videoColdReference, 'video', videoRepeatSeek.inputStartedAt, videoThreshold);
    records.push({ label: 'video-repeat', requestedTime: videoColdTime, observedTime: videoRepeatSeek.observedTime, dispatchCount: videoRepeatSeek.dispatchCount, inputToDispatchMs: videoRepeatSeek.inputToDispatchMs, ...videoRepeat, expected: videoColdReference });

    const dragTarget = 5.2;
    const dragInputStartedAt = await beginInput(page);
    const dragRuler = await page.locator(RULER).boundingBox();
    if (!dragRuler) throw new Error('ruler missing for drag');
    const dragStart = map.x1 + (4.2 - map.time1) * map.pixelsPerSecond;
    const dragEnd = map.x1 + (dragTarget - map.time1) * map.pixelsPerSecond;
    await page.mouse.move(dragStart, dragRuler.y + dragRuler.height / 2);
    await page.mouse.down();
    for (let step = 1; step <= 10; step += 1) {
      await page.mouse.move(dragStart + ((dragEnd - dragStart) * step) / 10, dragRuler.y + dragRuler.height / 2);
    }
    await page.mouse.up();
    await expect.poll(async () => Math.abs((await currentTime(page)) - dragTarget), { timeout: 5_000 }).toBeLessThan(0.5 / FPS);
    const dragObserved = await currentTime(page);
    const dragEvidence = await page.evaluate(() => {
      const state = (window as EvidenceWindow).__SCRUB_EVIDENCE__;
      return { dispatch: state.dispatches.at(-1), dispatchCount: state.dispatches.length };
    });
    if (!dragEvidence.dispatch) throw new Error('no Player.seekTo dispatch observed for rapid drag');
    const dragReference = await makeReference(testInfo, video, 'video', dragTarget - 1.5);
    const dragPixels = await matchPixels(page, testInfo, 'rapid-drag-final', dragReference, 'video', dragInputStartedAt, videoThreshold);
    records.push({ label: 'rapid-drag-final', requestedTime: dragTarget, observedTime: dragObserved, dispatchCount: dragEvidence.dispatchCount, inputToDispatchMs: dragEvidence.dispatch.at - dragInputStartedAt, ...dragPixels, expected: dragReference });
    const wrongTimeReference = await makeReference(testInfo, video, 'video', 0.7);
    const wrongTimePixels = await compareScreenshot(page, testInfo, 'rapid-drag-wrong-time-negative-control', wrongTimeReference, 'video');
    expect(wrongTimePixels.rmse, 'wrong-time video reference must be rejected').toBeGreaterThan(videoThreshold);
    expect(wrongTimePixels.rmse, 'wrong-time video reference must differ from the target match').toBeGreaterThan(dragPixels.rmse);
    negativeControls.push({ label: 'rapid-drag-final', targetRmse: dragPixels.rmse, wrongTimeRmse: wrongTimePixels.rmse, threshold: videoThreshold });

    await showTransport(page);
    const playButton = page.getByRole('button', { name: 'Play' });
    await playButton.click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    const beforePause = await page.evaluate(() => (window as EvidenceWindow).__SCRUB_EVIDENCE__.playCalls);
    const pauseRuler = await page.locator(RULER).boundingBox();
    if (!pauseRuler) throw new Error('ruler missing for pause');
    const pauseTarget = 5.8;
    const pauseInputStartedAt = await beginInput(page);
    const pauseStart = map.x1 + (4.8 - map.time1) * map.pixelsPerSecond;
    const pauseEnd = map.x1 + (pauseTarget - map.time1) * map.pixelsPerSecond;
    await page.mouse.move(pauseStart, pauseRuler.y + pauseRuler.height / 2);
    await page.mouse.down();
    // Start the seek while playback is active, then pause before releasing the
    // pointer. This keeps a real active/pending seek alive across the explicit
    // pause instead of testing only a pause that precedes input.
    await page.mouse.move(pauseStart + (pauseEnd - pauseStart) * 0.4, pauseRuler.y + pauseRuler.height / 2);
    const autoResumeBeforePause = await page.evaluate(() => (window as EvidenceWindow).__SCRUB_EVIDENCE__.autoResumeCalls);
    await page.getByRole('button', { name: 'Pause' }).evaluate((button) => (button as HTMLButtonElement).click());
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    await page.mouse.move(pauseEnd, pauseRuler.y + pauseRuler.height / 2);
    await page.mouse.up();
    const afterPause = await page.evaluate(() => (window as EvidenceWindow).__SCRUB_EVIDENCE__.playCalls);
    await page.waitForTimeout(500);
    const settledPause = await page.evaluate(() => (window as EvidenceWindow).__SCRUB_EVIDENCE__.playCalls);
    expect(settledPause).toBe(afterPause);
    expect(afterPause).toBeGreaterThanOrEqual(beforePause);
    await expect.poll(async () => Math.abs((await currentTime(page)) - pauseTarget), { timeout: 5_000 }).toBeLessThan(0.5 / FPS);
    const pauseObserved = await currentTime(page);
    const pauseEvidence = await page.evaluate(() => {
      const state = (window as EvidenceWindow).__SCRUB_EVIDENCE__;
      return { dispatch: state.dispatches.at(-1), dispatchCount: state.dispatches.length, autoResumeCalls: state.autoResumeCalls };
    });
    if (!pauseEvidence.dispatch) throw new Error('no Player.seekTo dispatch observed for paused drag');
    expect(pauseEvidence.autoResumeCalls).toBe(autoResumeBeforePause);
    const pauseReference = await makeReference(testInfo, video, 'video', pauseTarget - 1.5);
    const pausePixels = await matchPixels(page, testInfo, 'paused-drag', pauseReference, 'video', pauseInputStartedAt, videoThreshold);
    records.push({ label: 'paused-drag', requestedTime: pauseTarget, observedTime: pauseObserved, dispatchCount: pauseEvidence.dispatchCount, inputToDispatchMs: pauseEvidence.dispatch.at - pauseInputStartedAt, ...pausePixels, expected: pauseReference });

    await replaceConfig((config) => {
      const hero = config.clips.find((clip) => clip.id === 'clip-hero');
      if (!hero) throw new Error('hero clip missing');
      hero.asset = 'demo-detail';
    });
    await refreshLiveQueries(page);
    const replacementTime = 0.75;
    const replacementSeek = await seekByRuler(page, map, replacementTime);
    const replacementPixels = await matchPixels(page, testInfo, 'image-source-replacement', image2, 'image', replacementSeek.inputStartedAt, imageThreshold);
    const oldImagePixels = await compareScreenshot(page, testInfo, 'image-source-replacement-old-reference', image1, 'image');
    expect(oldImagePixels.rmse).toBeGreaterThan(replacementPixels.rmse);
    records.push({ label: 'image-source-replacement', requestedTime: replacementTime, observedTime: replacementSeek.observedTime, dispatchCount: replacementSeek.dispatchCount, inputToDispatchMs: replacementSeek.inputToDispatchMs, ...replacementPixels, expected: image2, oldRmse: oldImagePixels.rmse });

    await replaceConfig((config) => {
      const videoClip = config.clips.find((clip) => clip.id === 'clip-video');
      if (!videoClip) throw new Error('video clip missing');
      videoClip.from = 2;
      videoClip.to = 4;
      const hero = config.clips.find((clip) => clip.id === 'clip-hero');
      if (!hero) throw new Error('hero clip missing for video replacement');
      hero.hold = 1;
    });
    await refreshLiveQueries(page);
    const trimTime = 2.6;
    const trimSeek = await seekByRuler(page, map, trimTime);
    const trimReference = await makeReference(testInfo, video, 'video', 2 + (trimTime - 1.5));
    const trimPixels = await matchPixels(page, testInfo, 'video-trim-replacement', trimReference, 'video', trimSeek.inputStartedAt, videoThreshold);
    records.push({ label: 'video-trim-replacement', requestedTime: trimTime, observedTime: trimSeek.observedTime, dispatchCount: trimSeek.dispatchCount, inputToDispatchMs: trimSeek.inputToDispatchMs, ...trimPixels, expected: trimReference });

    const artifactName = (path: string) => path.split('/').at(-1) ?? path;
    const durableRecords = records.map(({ screenshot, expected, ...record }) => ({
      ...record,
      screenshot: artifactName(screenshot),
      expected: artifactName(expected),
    }));
    await writeFile(browserEvidencePath(testInfo, 'preview-scrub/manifest.json'), `${JSON.stringify({
      fps: FPS,
      media: { image1: artifactName(image1), image2: artifactName(image2), video: 'public/example-video.mp4', videoLongGop: true },
      records: durableRecords,
      negativeControls,
      pause: { beforePlayCalls: beforePause, afterPausePlayCalls: afterPause, settledPlayCalls: settledPause, autoResumeBeforePause, autoResumeCalls: pauseEvidence.autoResumeCalls },
      limitations: [
        'input timestamps begin immediately before Playwright pointer input; pixel-match latency is bounded by 100ms polling and includes screenshot/ImageMagick work',
        'negative control rejects a distinctly wrong video time after actual scaling; this does not claim frame-exact neighboring-time discrimination',
        'retry recovery and transient blanking are assessed from existing readiness code but are not separately browser-covered because no verified defect was found',
      ],
    }, null, 2)}\n`);
  });
});
