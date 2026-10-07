import { DEMO_LOCAL_PROJECT, DEMO_LOCAL_TIMELINE } from '@/shared/dev/devSession.ts';

export type BrowserEntryOwner = 'public' | 'app';

export interface BrowserEntryEnvironment {
  VITE_APP_ENV?: string;
}

const PUBLIC_WEB_PATHS = new Set(['/', '/home']);
/** Public pages served by the dedicated public entry in web, dev and local builds. */
const PUBLIC_PAGE_PATHS = new Set(['/home', '/vision']);

export function isRecognizedOAuthCallbackUrl(url: URL): boolean {
  if (!PUBLIC_WEB_PATHS.has(url.pathname)) {
    return false;
  }
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  if (!hash) {
    return false;
  }
  const parameters = new URLSearchParams(hash);
  return Boolean(parameters.get('access_token') && parameters.get('refresh_token'));
}

export function classifyBrowserEntry(
  url: URL,
  environment: BrowserEntryEnvironment,
): BrowserEntryOwner {
  const appEnvironment = (environment.VITE_APP_ENV || 'WEB').toLowerCase();
  if (isRecognizedOAuthCallbackUrl(url)) {
    return 'app';
  }
  if (PUBLIC_PAGE_PATHS.has(url.pathname) && ['web', 'dev', 'local'].includes(appEnvironment)) {
    return 'public';
  }
  return appEnvironment === 'web' && url.pathname === '/' ? 'public' : 'app';
}

/**
 * Where a returning visitor lands once they have chosen the app over the landing page: the local
 * editor. Other app routes send anyone without a signed-in session back to /home, so they would
 * bounce straight back here.
 */
export const APP_ENTRY_PATH = `/tools/video-editor?localProject=${DEMO_LOCAL_PROJECT}&localTimeline=${DEMO_LOCAL_TIMELINE}`;
const APP_ENTRY_PREFERENCE_KEY = 'astrid:prefers-app';

/** Remember that this browser chose the app (installed it, or asked to use it here). */
export function rememberAppEntryPreference(): void {
  try {
    localStorage.setItem(APP_ENTRY_PREFERENCE_KEY, '1');
  } catch {
    // Storage can be unavailable (private windows, blocked site data); the landing page still works.
  }
}

function isRunningInstalled(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: fullscreen)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

export function prefersAppEntry(): boolean {
  if (isRunningInstalled()) return true;
  try {
    return localStorage.getItem(APP_ENTRY_PREFERENCE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Installing from the browser doesn't open the app at its start page: Chrome moves the tab being viewed
 * (usually the landing page) into the new app window, with no reload. When a public page finds itself
 * running as the installed app this way, it hands over to the editor.
 */
export function followIntoInstalledApp(): void {
  let query: MediaQueryList;
  try {
    query = window.matchMedia('(display-mode: standalone)');
  } catch {
    return;
  }
  query.addEventListener('change', () => {
    if (!isRunningInstalled()) return;
    rememberAppEntryPreference();
    window.location.replace(APP_ENTRY_PATH);
  });
}

/**
 * Once someone has installed Astrid or chosen to use it in the browser, the site root opens the app
 * instead of the landing page. /home always shows the landing page.
 */
export function resolveReturningAppEntry(url: URL, prefersApp: boolean): string | null {
  if (!prefersApp || url.pathname !== '/' || isRecognizedOAuthCallbackUrl(url)) return null;
  return APP_ENTRY_PATH;
}
