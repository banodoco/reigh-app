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

const appPort = 44171;
const appBase = 'http://127.0.0.1:' + appPort;
const node = '/Users/hannahomalley/Documents/Codex/astrid/.otto/tools/node-v20.19.4/node-v20.19.4-darwin-arm64/bin/node';
const commonEnv = {
  ...process.env,
  ASTRID_CHECKOUT: '/Users/hannahomalley/Documents/Codex/astrid/.otto/sources/astrid-landing-source-v1',
  ASTRID_PUBLIC_CHECKOUT: '/Users/hannahomalley/Documents/Codex/astrid/.otto/sources/astrid-public-source-v1',
  VITE_APP_ENV: 'WEB',
  VITE_DISABLE_REMOTE_FONTS: '1',
};

const args = [
  path.join(appRoot, 'node_modules/vite/bin/vite.js'),
  '--config', path.join(appRoot, 'config/vite/vite.config.ts'),
  '--host', '127.0.0.1',
  '--port', String(appPort),
  '--strictPort',
];
const server = spawn(node, args, { cwd: appRoot, env: commonEnv, stdio: ['ignore', 'pipe', 'pipe'] });
const serverStdout = [];
const serverStderr = [];
server.stdout.on('data', (data) => serverStdout.push(data));
server.stderr.on('data', (data) => serverStderr.push(data));

const waitForServer = async () => {
  let last = '';
  for (let index = 0; index < 120; index += 1) {
    try {
      const response = await fetch(appBase + '/');
      if (response.ok) return;
      last = response.status + ' ' + response.statusText;
    } catch (error) {
      last = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('server did not become ready: ' + last);
};

const privateModuleSignals = [
  '/src/app/bootstrap.tsx',
  '/src/app/App.tsx',
  '/src/app/routes.tsx',
  '/src/app/providers/',
  '/src/shared/contexts/AuthContext.tsx',
  '/src/integrations/supabase/',
  '/src/tools/video-editor/browser/initializeVideoEditorExtensionRuntime.ts',
];
const publicModuleSignals = [
  '/src/app/publicBootstrap.tsx',
  '/src/pages/Home/PublicAstridShell.tsx',
  '/src/pages/Home/PublicAstridQualificationSurface.tsx',
];

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const bounded = async (label, action, captureErrors, fallback) => {
  try {
    return await Promise.race([
      action(),
      new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' capture timed out')), 5000)),
    ]);
  } catch (error) {
    captureErrors.push({ label, message: String(error?.message ?? error) });
    return fallback;
  }
};

const result = {
  schemaVersion: 2,
  sequence: 'V009-public-entry-recovery-1',
  node,
  nodeVersion: process.version,
  appBase,
  visits: [],
  assertions: {},
  failure: null,
};
const cleanupErrors = [];
let browser;
let originalError = null;

const runVisit = async ({ name, pathname, protectedHandoff }) => {
  const visit = {
    name,
    requestedUrl: appBase + pathname,
    protectedHandoff,
    navigationStatus: null,
    finalUrl: null,
    marker: { count: null, visible: false },
    publicEntry: { count: null, visible: false },
    documentNavigations: [],
    records: [],
    consoles: [],
    pageErrors: [],
    captureErrors: [],
    originalError: null,
    dom: null,
    assertions: {},
  };
  let context;
  let page;
  let traceStopped = false;
  let activeDocument = 0;
  const requestDocuments = new WeakMap();

  try {
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    page = await context.newPage();

    page.on('request', (request) => {
      if (request.isNavigationRequest() && request.resourceType() === 'document') {
        activeDocument += 1;
        visit.documentNavigations.push({
          documentIndex: activeDocument,
          url: request.url(),
          method: request.method(),
        });
      }
      requestDocuments.set(request, activeDocument);
      visit.records.push({
        event: 'request',
        documentIndex: activeDocument,
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
      });
    });
    page.on('response', (response) => {
      const request = response.request();
      visit.records.push({
        event: 'response',
        documentIndex: requestDocuments.get(request) ?? activeDocument,
        url: response.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        status: response.status(),
      });
    });
    page.on('requestfailed', (request) => {
      visit.records.push({
        event: 'requestfailed',
        documentIndex: requestDocuments.get(request) ?? activeDocument,
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        failure: request.failure()?.errorText ?? 'unknown',
      });
    });
    page.on('console', (message) => {
      visit.consoles.push({ type: message.type(), text: message.text(), url: page.url() });
    });
    page.on('pageerror', (error) => {
      visit.pageErrors.push({ message: error.message, stack: error.stack ?? null, url: page.url() });
    });

    try {
      const response = await page.goto(visit.requestedUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });
      visit.navigationStatus = response?.status() ?? null;
      await page.waitForSelector('[data-astrid-public-host="astrid-public-v1"]', {
        timeout: 45000,
        state: 'visible',
      });
      await page.waitForTimeout(750);

      const marker = page.locator('[data-astrid-public-host="astrid-public-v1"]');
      const publicEntry = page.locator('[data-astrid-public-entry="astrid-public-v1"]');
      visit.marker.count = await marker.count();
      visit.marker.visible = visit.marker.count > 0 && await marker.first().isVisible();
      visit.publicEntry.count = await publicEntry.count();
      visit.publicEntry.visible = visit.publicEntry.count > 0 && await publicEntry.first().isVisible();
      visit.finalUrl = page.url();

      const publicDocument = protectedHandoff ? 2 : 1;
      const publicRecords = visit.records.filter((item) => item.documentIndex === publicDocument);
      const publicUrls = publicRecords.map((item) => item.url);
      const healthRequests = publicUrls.filter((url) => url.includes('/api/astrid/health'));
      const privateModules = publicUrls.filter((url) => privateModuleSignals.some((signal) => url.includes(signal)));
      const publicModules = publicModuleSignals.filter((signal) => publicUrls.some((url) => url.includes(signal)));
      const supabaseErrors = [
        ...visit.pageErrors.map((item) => item.message),
        ...visit.consoles.map((item) => item.text),
      ].filter((text) => text.includes('Supabase runtime is not initialized'));

      if (visit.marker.count !== 1 || !visit.marker.visible) {
        throw new Error(name + ' did not mount one visible public host');
      }
      if (visit.publicEntry.count !== 1 || !visit.publicEntry.visible) {
        throw new Error(name + ' did not mount one visible public entry');
      }
      if (healthRequests.length !== 0) {
        throw new Error(name + ' public document requested /api/astrid/health');
      }
      if (privateModules.length !== 0) {
        throw new Error(name + ' public document loaded private app modules: ' + privateModules.join(', '));
      }
      if (publicModules.length !== publicModuleSignals.length) {
        throw new Error(name + ' public document missed public modules: ' + publicModules.join(', '));
      }
      if (supabaseErrors.length !== 0 || visit.pageErrors.length !== 0) {
        throw new Error(name + ' public document reported page errors');
      }

      visit.assertions.publicHostVisible = true;
      visit.assertions.publicEntryVisible = true;
      visit.assertions.noPublicHealthRequests = true;
      visit.assertions.noPublicPrivateModules = true;
      visit.assertions.publicModulesLoaded = publicModules;
      visit.assertions.noSupabaseOrPageErrors = true;

      if (protectedHandoff) {
        const initialRecords = visit.records.filter((item) => item.documentIndex === 1);
        const initialUrls = initialRecords.map((item) => item.url);
        const initialHealth = initialUrls.filter((url) => url.includes('/api/astrid/health'));
        const initialBootstrap = initialUrls.some((url) => url.includes('/src/app/bootstrap.tsx'));
        const initialExtension = initialUrls.some((url) => url.includes('/src/tools/video-editor/browser/initializeVideoEditorExtensionRuntime.ts'));
        if (visit.documentNavigations.length !== 2) {
          throw new Error(name + ' expected exactly two documents, saw ' + visit.documentNavigations.length);
        }
        if (new URL(visit.finalUrl).pathname !== '/home') {
          throw new Error(name + ' final document was not /home: ' + visit.finalUrl);
        }
        if (initialHealth.length === 0) {
          throw new Error(name + ' initial app document did not own a health probe');
        }
        if (!initialBootstrap || !initialExtension) {
          throw new Error(name + ' initial app document missed bootstrap or extension initialization');
        }
        visit.assertions.exactlyOneDocumentHandoff = true;
        visit.assertions.finalPublicPath = '/home';
        visit.assertions.initialAppHealthProbeCount = initialHealth.length;
        visit.assertions.initialAppBootstrapLoaded = true;
        visit.assertions.initialExtensionRuntimeLoaded = true;
        visit.assertions.postHandoffPublicIsolated = true;
      } else {
        if (visit.documentNavigations.length !== 1) {
          throw new Error(name + ' expected one document, saw ' + visit.documentNavigations.length);
        }
        if (new URL(visit.finalUrl).pathname !== new URL(visit.requestedUrl).pathname) {
          throw new Error(name + ' changed pathname unexpectedly: ' + visit.finalUrl);
        }
        visit.assertions.singleDocument = true;
      }
    } catch (error) {
      visit.originalError = {
        name: error?.name ?? 'Error',
        message: String(error?.message ?? error),
        stack: error?.stack ?? null,
      };
    } finally {
      visit.finalUrl = page?.url() ?? visit.finalUrl;
      if (page && visit.marker.count === null) {
        const marker = page.locator('[data-astrid-public-host="astrid-public-v1"]');
        visit.marker.count = await bounded(name + '-marker-count', () => marker.count(), visit.captureErrors, null);
        visit.marker.visible = visit.marker.count > 0
          ? await bounded(name + '-marker-visible', () => marker.first().isVisible(), visit.captureErrors, false)
          : false;
      }
      if (page && visit.publicEntry.count === null) {
        const publicEntry = page.locator('[data-astrid-public-entry="astrid-public-v1"]');
        visit.publicEntry.count = await bounded(name + '-public-entry-count', () => publicEntry.count(), visit.captureErrors, null);
        visit.publicEntry.visible = visit.publicEntry.count > 0
          ? await bounded(name + '-public-entry-visible', () => publicEntry.first().isVisible(), visit.captureErrors, false)
          : false;
      }
      const dom = page ? await bounded(name + '-dom', () => page.content(), visit.captureErrors, '') : '';
      const domBytes = Buffer.byteLength(dom);
      const boundedDom = domBytes <= 2000000 ? dom : dom.slice(0, 2000000) + '\n<!-- TRUNCATED -->';
      visit.dom = {
        path: name + '.html',
        capturedBytes: Buffer.byteLength(boundedDom),
        originalBytes: domBytes,
        truncated: domBytes > 2000000,
      };
      await fs.writeFile(path.join(output, name + '.html'), boundedDom);
      if (page) {
        await bounded(name + '-screenshot', () => page.screenshot({
          path: path.join(output, name + '.png'),
          fullPage: true,
          timeout: 5000,
        }), visit.captureErrors, null);
      }
      if (context) {
        await bounded(name + '-trace', async () => {
          await context.tracing.stop({ path: path.join(output, name + '.trace.zip') });
          traceStopped = true;
        }, visit.captureErrors, null);
      }
      if (context) {
        try {
          await context.close();
        } catch (error) {
          visit.captureErrors.push({ label: name + '-context-close', message: String(error?.message ?? error) });
        }
      }
      if (!traceStopped) {
        visit.captureErrors.push({ label: name + '-trace', message: 'trace was not preserved' });
      }
      await fs.writeFile(path.join(output, name + '.json'), JSON.stringify(visit, null, 2) + '\n');
    }
  } catch (error) {
    if (!visit.originalError) {
      visit.originalError = {
        name: error?.name ?? 'Error',
        message: String(error?.message ?? error),
        stack: error?.stack ?? null,
      };
    }
  }

  result.visits.push(visit);
  if (visit.originalError || visit.captureErrors.length > 0) {
    const detail = visit.originalError?.message ?? JSON.stringify(visit.captureErrors);
    throw new Error(name + ' failed: ' + detail);
  }
};

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const cases = [
    { name: 'web-root', pathname: '/', protectedHandoff: false },
    { name: 'web-home', pathname: '/home', protectedHandoff: false },
    { name: 'protected-handoff', pathname: '/tools/image-generation', protectedHandoff: true },
  ];
  for (const item of cases) {
    await runVisit(item);
  }
  result.assertions.freshRootAndHomeMountedSamePublicHost = true;
  result.assertions.protectedGuardHandoffSeparated = true;
  result.assertions.browserCasesCompleted = cases.map((item) => item.name);
} catch (error) {
  originalError = {
    name: error?.name ?? 'Error',
    message: String(error?.message ?? error),
    stack: error?.stack ?? null,
  };
  result.failure = originalError;
} finally {
  if (browser) {
    try {
      await browser.close();
    } catch (error) {
      cleanupErrors.push({ label: 'browser-close', message: String(error?.message ?? error) });
    }
  }
  server.kill('SIGTERM');
  await new Promise((resolve) => {
    if (server.exitCode !== null) return resolve();
    server.once('exit', resolve);
    setTimeout(() => {
      server.kill('SIGKILL');
      resolve();
    }, 3000).unref();
  });
  await fs.writeFile(path.join(output, 'app.stdout.txt'), Buffer.concat(serverStdout));
  await fs.writeFile(path.join(output, 'app.stderr.txt'), Buffer.concat(serverStderr));
  await fs.writeFile(path.join(output, 'app.command.json'), JSON.stringify({
    executable: node,
    argv: args,
    cwd: appRoot,
    environment: {
      ASTRID_CHECKOUT: commonEnv.ASTRID_CHECKOUT,
      ASTRID_PUBLIC_CHECKOUT: commonEnv.ASTRID_PUBLIC_CHECKOUT,
      PLAYWRIGHT_BROWSERS_PATH: commonEnv.PLAYWRIGHT_BROWSERS_PATH ?? null,
      VITE_APP_ENV: commonEnv.VITE_APP_ENV,
      VITE_DISABLE_REMOTE_FONTS: commonEnv.VITE_DISABLE_REMOTE_FONTS,
    },
    exitCode: server.exitCode,
  }, null, 2) + '\n');
  await fs.writeFile(path.join(output, 'cleanup-errors.json'), JSON.stringify(cleanupErrors, null, 2) + '\n');
  result.cleanupErrors = cleanupErrors;
  const encoded = JSON.stringify(result, null, 2) + '\n';
  await fs.writeFile(path.join(output, 'browser-result.json'), encoded);
  await fs.writeFile(path.join(output, 'browser-result.sha256'), sha256(encoded) + '  browser-result.json\n');
}

if (originalError) {
  const error = new Error(originalError.message);
  error.name = originalError.name;
  error.stack = originalError.stack;
  throw error;
}

console.log(JSON.stringify({
  sequence: result.sequence,
  assertions: result.assertions,
  visits: result.visits.map((visit) => ({
    name: visit.name,
    requestedUrl: visit.requestedUrl,
    finalUrl: visit.finalUrl,
    navigationStatus: visit.navigationStatus,
    documents: visit.documentNavigations.length,
  })),
  resultSha256: sha256(JSON.stringify(result, null, 2) + '\n'),
}, null, 2));
