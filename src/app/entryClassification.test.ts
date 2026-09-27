import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { classifyBrowserEntry, isRecognizedOAuthCallbackUrl } from './entryClassification.ts';

describe('browser entry classification', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('selects the dedicated public entry for ordinary WEB root documents', () => {
    expect(classifyBrowserEntry(new URL('https://astrid.test/'), { VITE_APP_ENV: 'WEB' })).toBe('public');
    expect(classifyBrowserEntry(new URL('https://astrid.test/home?source=guard#public'), { VITE_APP_ENV: 'web' })).toBe('public');
  });

  it('preserves app ownership for non-WEB root and protected documents', () => {
    expect(classifyBrowserEntry(new URL('https://astrid.test/'), { VITE_APP_ENV: 'APP' })).toBe('app');
    expect(classifyBrowserEntry(new URL('https://astrid.test/tools/video-editor'), { VITE_APP_ENV: 'WEB' })).toBe('app');
  });

  it('selects the dedicated public entry for ordinary dev and local /home documents', () => {
    expect(classifyBrowserEntry(new URL('https://astrid.test/home'), { VITE_APP_ENV: 'DEV' })).toBe('public');
    expect(classifyBrowserEntry(new URL('https://astrid.test/home?source=desktop'), { VITE_APP_ENV: 'LOCAL' })).toBe('public');
    expect(classifyBrowserEntry(new URL('https://astrid.test/'), { VITE_APP_ENV: 'DEV' })).toBe('app');
    expect(classifyBrowserEntry(new URL('https://astrid.test/'), { VITE_APP_ENV: 'LOCAL' })).toBe('app');
  });

  it('latches existing complete hash-token callbacks to the app for this boot', () => {
    const rootCallback = new URL('https://astrid.test/#access_token=access&refresh_token=refresh');
    const homeCallback = new URL('https://astrid.test/home#access_token=access&refresh_token=refresh');
    expect(isRecognizedOAuthCallbackUrl(rootCallback)).toBe(true);
    expect(classifyBrowserEntry(rootCallback, { VITE_APP_ENV: 'WEB' })).toBe('app');
    expect(classifyBrowserEntry(homeCallback, { VITE_APP_ENV: 'WEB' })).toBe('app');
    expect(classifyBrowserEntry(homeCallback, { VITE_APP_ENV: 'DEV' })).toBe('app');
    expect(classifyBrowserEntry(homeCallback, { VITE_APP_ENV: 'LOCAL' })).toBe('app');
  });

  it('does not let a stale oauthInProgress flag claim an ordinary public document', () => {
    localStorage.setItem('oauthInProgress', 'true');
    expect(classifyBrowserEntry(new URL('https://astrid.test/'), { VITE_APP_ENV: 'WEB' })).toBe('public');
    expect(classifyBrowserEntry(new URL('https://astrid.test/home'), { VITE_APP_ENV: 'WEB' })).toBe('public');
  });

  it('keeps app bootstrap and extension initialization behind dynamic app imports', () => {
    const main = readFileSync(path.join(process.cwd(), 'src/app/main.tsx'), 'utf8');
    const publicBootstrap = readFileSync(path.join(process.cwd(), 'src/app/publicBootstrap.tsx'), 'utf8');
    const shell = readFileSync(path.join(process.cwd(), 'src/pages/Home/PublicAstridShell.tsx'), 'utf8');
    expect(main).toContain("import('@/app/bootstrap')");
    expect(main).toContain("import('@/tools/video-editor/browser/initializeVideoEditorExtensionRuntime.ts')");
    expect(main).not.toMatch(/import\s+\{[^}]*renderApp[^}]*\}\s+from/);
    expect(main).not.toMatch(/import\s+\{[^}]*initializeVideoEditorExtensionRuntime[^}]*\}\s+from/);
    expect(publicBootstrap).not.toContain('@/app/bootstrap');
    expect(publicBootstrap).not.toContain('initializeVideoEditorExtensionRuntime');
    expect(shell).toContain('<PublicAstridQualificationSurface />');
    expect(shell).toContain('href="/tools/video-editor"');
  });
});
