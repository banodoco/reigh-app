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
const browserPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
const cases = [
  { name: 'dev-home', appEnv: 'DEV', port: 44173 },
  { name: 'local-home', appEnv: 'LOCAL', port: 44174 },
];
const publicModules = [
  '/src/app/publicBootstrap.tsx',
  '/src/pages/Home/PublicAstridShell.tsx',
  '/src/pages/Home/PublicAstridQualificationSurface.tsx',
];
const privateModules = [
  '/src/app/bootstrap.tsx',
  '/src/app/App.tsx',
  '/src/app/routes.tsx',
  '/src/app/providers/',
  '/src/shared/contexts/AuthContext.tsx',
  '/src/integrations/supabase/',
  '/src/tools/video-editor/browser/initializeVideoEditorExtensionRuntime.ts',
];
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const result = {
  schemaVersion: 1,
  sequence: 'V009-nonweb-home-amendment-1',
  node,
  nodeVersion: process.version,
  playwrightBrowsersPath: browserPath ?? null,
  cases: [],
  failure: null,
};

async function waitForServer(base) {
  let last = '';
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(base + '/home');
      if (response.ok) return;
      last = `${response.status} ${response.statusText}`;
    } catch (error) {
      last = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`server did not become ready: ${last}`);
}

async function stopServer(server, record) {
  if (server.exitCode === null) server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (server.exitCode === null) server.kill('SIGKILL');
  record.server.exitCode = server.exitCode;
  record.server.signalCode = server.signalCode;
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const item of cases) {
    const base = `http://127.0.0.1:${item.port}`;
    const args = [
      path.join(appRoot, 'node_modules/vite/bin/vite.js'),
      '--config', path.join(appRoot, 'config/vite/vite.config.ts'),
      '--host', '127.0.0.1', '--port', String(item.port), '--strictPort',
    ];
    const env = {
      ...process.env,
      ASTRID_CHECKOUT: '/Users/hannahomalley/Documents/Codex/astrid/.otto/sources/astrid-landing-source-v1',
      ASTRID_PUBLIC_CHECKOUT: '/Users/hannahomalley/Documents/Codex/astrid/.otto/sources/astrid-public-source-v1',
      VITE_APP_ENV: item.appEnv,
      VITE_DISABLE_REMOTE_FONTS: '1',
    };
    const server = spawn(node, args, { cwd: appRoot, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    server.stdout.on('data', (data) => stdout.push(data));
    server.stderr.on('data', (data) => stderr.push(data));
    const record = {
      name: item.name,
      environment: { VITE_APP_ENV: item.appEnv, VITE_DISABLE_REMOTE_FONTS: '1' },
      requestedUrl: base + '/home',
      finalUrl: null,
      navigationStatus: null,
      marker: { count: null, visible: false },
      publicEntry: { count: null, visible: false },
      requests: [],
      consoles: [],
      pageErrors: [],
      assertions: {},
      originalError: null,
      captureErrors: [],
      server: { command: [node, ...args], cwd: appRoot, exitCode: null, signalCode: null },
    };
    let context;
    let page;
    try {
      await waitForServer(base);
      context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      page = await context.newPage();
      page.on('request', (request) => record.requests.push({ event: 'request', url: request.url(), method: request.method(), resourceType: request.resourceType() }));
      page.on('response', (response) => record.requests.push({ event: 'response', url: response.url(), status: response.status(), resourceType: response.request().resourceType() }));
      page.on('requestfailed', (request) => record.requests.push({ event: 'requestfailed', url: request.url(), resourceType: request.resourceType(), failure: request.failure()?.errorText ?? 'unknown' }));
      page.on('console', (message) => record.consoles.push({ type: message.type(), text: message.text() }));
      page.on('pageerror', (error) => record.pageErrors.push({ message: error.message, stack: error.stack ?? null }));
      const response = await page.goto(record.requestedUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      record.navigationStatus = response?.status() ?? null;
      await page.waitForSelector('[data-astrid-public-host="astrid-public-v1"]', { state: 'visible', timeout: 45000 });
      await page.waitForTimeout(750);
      record.finalUrl = page.url();
      const marker = page.locator('[data-astrid-public-host="astrid-public-v1"]');
      const entry = page.locator('[data-astrid-public-entry="astrid-public-v1"]');
      record.marker.count = await marker.count();
      record.marker.visible = record.marker.count === 1 && await marker.first().isVisible();
      record.publicEntry.count = await entry.count();
      record.publicEntry.visible = record.publicEntry.count === 1 && await entry.first().isVisible();
      const urls = record.requests.map((entry) => entry.url);
      const health = urls.filter((url) => url.includes('/api/astrid/health'));
      const privateHits = urls.filter((url) => privateModules.some((signal) => url.includes(signal)));
      const publicHits = publicModules.filter((signal) => urls.some((url) => url.includes(signal)));
      if (record.navigationStatus !== 200) throw new Error(`${item.name} navigation status was ${record.navigationStatus}`);
      if (new URL(record.finalUrl).pathname !== '/home') throw new Error(`${item.name} changed pathname: ${record.finalUrl}`);
      if (!record.marker.visible || !record.publicEntry.visible) throw new Error(`${item.name} did not mount one visible public entry and host`);
      if (health.length) throw new Error(`${item.name} requested health: ${health.join(', ')}`);
      if (privateHits.length) throw new Error(`${item.name} loaded private modules: ${privateHits.join(', ')}`);
      if (publicHits.length !== publicModules.length) throw new Error(`${item.name} missed public modules: ${publicHits.join(', ')}`);
      if (record.pageErrors.length) throw new Error(`${item.name} raised page errors`);
      record.assertions = {
        status200: true,
        pathnameHome: true,
        publicHostVisible: true,
        publicEntryVisible: true,
        noHealthRequests: true,
        noPrivateModules: true,
        publicModulesLoaded: publicHits,
        noPageErrors: true,
      };
    } catch (error) {
      record.originalError = { name: error?.name ?? 'Error', message: String(error?.message ?? error), stack: error?.stack ?? null };
    } finally {
      record.finalUrl = page?.url() ?? record.finalUrl;
      if (page) {
        try { await fs.writeFile(path.join(output, `${item.name}.html`), await page.content()); } catch (error) { record.captureErrors.push({ label: 'dom', message: String(error) }); }
        try { await page.screenshot({ path: path.join(output, `${item.name}.png`), fullPage: true, timeout: 5000 }); } catch (error) { record.captureErrors.push({ label: 'screenshot', message: String(error) }); }
      }
      if (context) {
        try { await context.tracing.stop({ path: path.join(output, `${item.name}.trace.zip`) }); } catch (error) { record.captureErrors.push({ label: 'trace', message: String(error) }); }
        try { await context.close(); } catch (error) { record.captureErrors.push({ label: 'context-close', message: String(error) }); }
      }
      await stopServer(server, record);
      const stdoutBytes = Buffer.concat(stdout);
      const stderrBytes = Buffer.concat(stderr);
      await fs.writeFile(path.join(output, `${item.name}.server.stdout.txt`), stdoutBytes);
      await fs.writeFile(path.join(output, `${item.name}.server.stderr.txt`), stderrBytes);
      record.server.stdoutSha256 = sha256(stdoutBytes);
      record.server.stderrSha256 = sha256(stderrBytes);
      await fs.writeFile(path.join(output, `${item.name}.json`), JSON.stringify(record, null, 2) + '\n');
    }
    result.cases.push(record);
    if (record.originalError || record.captureErrors.length) {
      throw new Error(`${item.name} failed: ${record.originalError?.message ?? JSON.stringify(record.captureErrors)}`);
    }
  }
} catch (error) {
  result.failure = { name: error?.name ?? 'Error', message: String(error?.message ?? error), stack: error?.stack ?? null };
} finally {
  if (browser) await browser.close();
  await fs.writeFile(path.join(output, 'browser-result.json'), JSON.stringify(result, null, 2) + '\n');
}

if (result.failure) throw new Error(result.failure.message);
