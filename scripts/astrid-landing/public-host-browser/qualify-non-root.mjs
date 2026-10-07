import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const appRoot = path.resolve(new URL('../../..', import.meta.url).pathname);
const output = process.argv[2];
if (!output || !path.isAbsolute(output)) throw new Error('absolute evidence output path is required');
await fs.mkdir(output, { recursive: true });

const node = '/Users/hannahomalley/Documents/Codex/astrid/.otto/tools/node-v20.19.4/node-v20.19.4-darwin-arm64/bin/node';
const port = 44172;
const base = `http://127.0.0.1:${port}/astrid-preview/`;
const env = {
  ...process.env,
  ASTRID_CHECKOUT: '/Users/hannahomalley/Documents/Codex/astrid/.otto/sources/astrid-landing-source-v1',
  ASTRID_PUBLIC_CHECKOUT: '/Users/hannahomalley/Documents/Codex/astrid/.otto/sources/astrid-public-source-v1',
  VITE_DISABLE_REMOTE_FONTS: '1',
};
const args = [
  path.join(appRoot, 'node_modules/vite/bin/vite.js'),
  '--config', path.join(appRoot, 'scripts/astrid-landing/public-host-browser/vite.config.ts'),
  '--host', '127.0.0.1', '--port', String(port), '--strictPort',
];
const server = spawn(node, args, { cwd: appRoot, env, stdio: ['ignore', 'pipe', 'pipe'] });
const serverStdout = [];
const serverStderr = [];
server.stdout.on('data', (data) => serverStdout.push(data));
server.stderr.on('data', (data) => serverStderr.push(data));

const cases = [
  { name: 'frame-overlay-15', effect: 'frame-overlay', frame: 15 },
  { name: 'end-prep-15', effect: 'end-spanning-layer', frame: 15, phase: 'prep' },
  { name: 'end-iteration-45', effect: 'end-spanning-layer', frame: 45, phase: 'iteration' },
  { name: 'end-anchors-75', effect: 'end-spanning-layer', frame: 75, phase: 'anchors' },
  { name: 'end-workflow-105', effect: 'end-spanning-layer', frame: 105, phase: 'workflow' },
];
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const result = {
  schemaVersion: 1,
  sequence: 'V009-G4-non-root-assets-1',
  node,
  nodeVersion: process.version,
  playwrightBrowsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH ?? null,
  harnessBase: base,
  visits: [],
  assertions: {},
  failure: null,
};

async function waitForServer() {
  let last = '';
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(base);
      if (response.ok) return;
      last = `${response.status} ${response.statusText}`;
    } catch (error) {
      last = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`server did not become ready: ${last}`);
}

async function stopServer() {
  if (server.exitCode === null) server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (server.exitCode === null) server.kill('SIGKILL');
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  for (const item of cases) {
    const visit = {
      ...item,
      requestedUrl: `${base}?effect=${item.effect}&frame=${item.frame}`,
      finalUrl: null,
      navigationStatus: null,
      ready: false,
      surface: { count: null, visible: false, box: null },
      qualificationState: null,
      imageInventory: [],
      videoInventory: [],
      canvasInventory: [],
      records: [],
      consoles: [],
      pageErrors: [],
      originalError: null,
      captureErrors: [],
    };
    let context;
    let page;
    try {
      context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      page = await context.newPage();
      page.on('response', (response) => visit.records.push({ event: 'response', url: response.url(), status: response.status(), resourceType: response.request().resourceType() }));
      page.on('requestfailed', (request) => visit.records.push({ event: 'requestfailed', url: request.url(), resourceType: request.resourceType(), failure: request.failure()?.errorText ?? 'unknown' }));
      page.on('console', (message) => visit.consoles.push({ type: message.type(), text: message.text() }));
      page.on('pageerror', (error) => visit.pageErrors.push({ message: error.message, stack: error.stack ?? null }));
      const response = await page.goto(visit.requestedUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      visit.navigationStatus = response?.status() ?? null;
      await page.waitForFunction(() => window.__ASTRID_QUALIFICATION_READY__ === true, null, { timeout: 45000 });
      await page.waitForFunction(({ effect, frame }) => {
        const state = window.__ASTRID_QUALIFICATION_STATE__;
        if (!state || state.requestedFrame !== frame || state.actualPlayerFrame !== frame) return false;
        const expected = state.expectedAssetUrls;
        const allowed = effect === 'frame-overlay'
          ? [expected.frame]
          : [expected.card0, expected.card1, expected.card2, expected.card3, expected.card4, expected.card5];
        const absoluteAllowed = allowed.map((url) => new URL(url, window.location.href).href);
        const images = [...document.images];
        return images.length > 0 && images.every((image) => (
          absoluteAllowed.includes(image.currentSrc)
          && image.complete
          && image.naturalWidth > 0
          && image.naturalHeight > 0
        ));
      }, { effect: item.effect, frame: item.frame }, { timeout: 45000 });
      visit.ready = true;
      visit.finalUrl = page.url();
      const inventory = await page.evaluate(() => ({
        qualificationState: window.__ASTRID_QUALIFICATION_STATE__ ?? null,
        images: [...document.images].map((image) => ({
          src: image.src,
          currentSrc: image.currentSrc,
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
        })),
        videos: [...document.querySelectorAll('video')].map((video) => ({
          src: video.src,
          currentSrc: video.currentSrc,
          readyState: video.readyState,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          currentTime: video.currentTime,
          paused: video.paused,
        })),
        canvases: [...document.querySelectorAll('canvas')].map((canvas) => ({
          width: canvas.width,
          height: canvas.height,
          clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight,
        })),
      }));
      visit.qualificationState = inventory.qualificationState;
      visit.imageInventory = inventory.images;
      visit.videoInventory = inventory.videos;
      visit.canvasInventory = inventory.canvases;
      const surface = page.locator(`main[data-effect="${item.effect}"][data-frame="${item.frame}"]`);
      visit.surface.count = await surface.count();
      visit.surface.visible = visit.surface.count === 1 && await surface.first().isVisible();
      visit.surface.box = visit.surface.count === 1 ? await surface.first().boundingBox() : null;
      if (visit.navigationStatus !== 200) throw new Error(`${item.name} navigation status was ${visit.navigationStatus}`);
      if (!new URL(visit.finalUrl).pathname.startsWith('/astrid-preview/')) throw new Error(`${item.name} escaped non-root base: ${visit.finalUrl}`);
      if (!visit.surface.visible || !visit.surface.box || visit.surface.box.width < 1000 || visit.surface.box.height < 500) throw new Error(`${item.name} rendered surface was not visible`);
      if (visit.pageErrors.length) throw new Error(`${item.name} raised page errors`);
    } catch (error) {
      visit.originalError = { name: error?.name ?? 'Error', message: String(error?.message ?? error), stack: error?.stack ?? null };
    } finally {
      visit.finalUrl = page?.url() ?? visit.finalUrl;
      if (page) {
        try { await fs.writeFile(path.join(output, `${item.name}.html`), await page.content()); } catch (error) { visit.captureErrors.push({ label: 'dom', message: String(error) }); }
        try { await page.screenshot({ path: path.join(output, `${item.name}.png`), fullPage: true, timeout: 5000 }); } catch (error) { visit.captureErrors.push({ label: 'screenshot', message: String(error) }); }
      }
      if (context) {
        try { await context.tracing.stop({ path: path.join(output, `${item.name}.trace.zip`) }); } catch (error) { visit.captureErrors.push({ label: 'trace', message: String(error) }); }
        try { await context.close(); } catch (error) { visit.captureErrors.push({ label: 'context-close', message: String(error) }); }
      }
      await fs.writeFile(path.join(output, `${item.name}.json`), JSON.stringify(visit, null, 2) + '\n');
    }
    result.visits.push(visit);
    if (visit.originalError || visit.captureErrors.length) throw new Error(`${item.name} failed: ${visit.originalError?.message ?? JSON.stringify(visit.captureErrors)}`);
  }

  const records = result.visits.flatMap((visit) => visit.records);
  const responseRecords = records.filter((record) => record.event === 'response');
  const resourceNames = ['card-0.png', 'card-1.png', 'card-2.png', 'card-3.png', 'card-4.png', 'card-5.png', 'frame.png', 'example-video.mp4'];
  const resources = {};
  for (const name of resourceNames) {
    const matches = responseRecords.filter((record) => record.url.includes(name) && (
      name === 'example-video.mp4'
        ? new URL(record.url).pathname === '/astrid-preview/example-video.mp4' && ['media', 'fetch'].includes(record.resourceType)
        : record.resourceType === 'image'
    ));
    if (!matches.length) throw new Error(`non-root request missing: ${name}`);
    if (matches.some((record) => record.status < 200 || record.status >= 400)) throw new Error(`non-root request failed: ${name}`);
    resources[name] = matches;
  }
  if (records.some((record) => /\/card0(?:[?#]|$)/.test(record.url))) throw new Error('unexpected card0 fallback request');
  if (records.some((record) => record.url.includes('sequences/registry'))) throw new Error('non-root public graph loaded installed sequence registry');
  if (records.some((record) => record.url.includes('astrid-landing-source-v1/astrid'))) throw new Error('non-root public graph loaded installed Astrid source');
  if (!records.some((record) => record.url.includes('astrid-public-source-v1/astrid'))) throw new Error('non-root public graph did not load public Astrid source');
  const componentPaths = [
    'animations/fade/component.tsx', 'animations/fade-up/component.tsx', 'animations/scale-in/component.tsx',
    'animations/slide-left/component.tsx', 'animations/slide-up/component.tsx', 'animations/type-on/component.tsx',
    'effects/audio-reactive-colour/component.tsx', 'effects/text-card/component.tsx',
    'transitions/cross-fade/component.tsx', 'transitions/fade/component.tsx',
    'effects/end-spanning-layer/component.tsx', 'effects/frame-overlay/component.tsx',
  ];
  const missingComponents = componentPaths.filter((componentPath) => !records.some((record) => record.url.includes('astrid-public-source-v1/astrid') && record.url.includes(componentPath)));
  if (missingComponents.length) throw new Error(`non-root public graph missed selected components: ${missingComponents.join(', ')}`);
  const failed = records.filter((record) => record.event === 'requestfailed');
  if (failed.length) throw new Error(`non-root requests failed: ${failed.map((record) => record.url).join(', ')}`);
  const expectedAssetUrls = result.visits[0]?.qualificationState?.expectedAssetUrls;
  if (!expectedAssetUrls) throw new Error('non-root harness did not expose expected asset URLs');
  for (const [key, expectedUrl] of Object.entries(expectedAssetUrls)) {
    const absoluteExpected = new URL(expectedUrl, base).href;
    const matches = responseRecords.filter((record) => record.resourceType === 'image' && record.url === absoluteExpected);
    if (!matches.length || matches.some((record) => record.status < 200 || record.status >= 400)) {
      throw new Error(`non-root injected asset URL did not succeed: ${key} -> ${absoluteExpected}`);
    }
  }
  for (const visit of result.visits) {
    if (visit.qualificationState?.actualPlayerFrame !== visit.frame) throw new Error(`${visit.name} player frame mismatch`);
    if (!visit.imageInventory.length) throw new Error(`${visit.name} had no final image inventory`);
    const allowed = (visit.effect === 'frame-overlay'
      ? [expectedAssetUrls.frame]
      : [expectedAssetUrls.card0, expectedAssetUrls.card1, expectedAssetUrls.card2, expectedAssetUrls.card3, expectedAssetUrls.card4, expectedAssetUrls.card5])
      .map((url) => new URL(url, visit.finalUrl).href);
    if (visit.imageInventory.some((image) => !allowed.includes(image.currentSrc) || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0)) {
      throw new Error(`${visit.name} final image state was incomplete or used an unexpected URL`);
    }
  }
  result.assertions = {
    allFiveSurfacesVisible: true,
    allFinalUrlsRetainedNonRootBase: true,
    sevenAssetsAndManagedVideoSucceeded: resources,
    noCard0Fallback: true,
    publicSourceLoaded: true,
    exactSelectedComponentPathsLoaded: componentPaths,
    installedSourceAndSequenceRegistryExcluded: true,
    noFailedRequests: true,
    requestedAndActualPlayerFramesMatch: true,
    finalImagesUseExactExpectedUrlsAndPositiveIntrinsicDimensions: true,
    endSpanningPhaseCaptures: cases.filter((item) => item.phase).map(({ phase, frame }) => ({ phase, frame })),
  };
} catch (error) {
  result.failure = { name: error?.name ?? 'Error', message: String(error?.message ?? error), stack: error?.stack ?? null };
} finally {
  if (browser) await browser.close();
  await stopServer();
  const stdout = Buffer.concat(serverStdout);
  const stderr = Buffer.concat(serverStderr);
  await fs.writeFile(path.join(output, 'non-root-harness.stdout.txt'), stdout);
  await fs.writeFile(path.join(output, 'non-root-harness.stderr.txt'), stderr);
  await fs.writeFile(path.join(output, 'non-root-harness.command.json'), JSON.stringify({
    executable: node,
    argv: args,
    cwd: appRoot,
    environment: {
      ASTRID_CHECKOUT: env.ASTRID_CHECKOUT,
      ASTRID_PUBLIC_CHECKOUT: env.ASTRID_PUBLIC_CHECKOUT,
      VITE_DISABLE_REMOTE_FONTS: env.VITE_DISABLE_REMOTE_FONTS,
    },
    exitCode: server.exitCode,
    signalCode: server.signalCode,
    stdoutSha256: sha256(stdout),
    stderrSha256: sha256(stderr),
  }, null, 2) + '\n');
  await fs.writeFile(path.join(output, 'browser-result.json'), JSON.stringify(result, null, 2) + '\n');
}

if (result.failure) throw new Error(result.failure.message);
