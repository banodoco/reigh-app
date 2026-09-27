export type BrowserEntryOwner = 'public' | 'app';

export interface BrowserEntryEnvironment {
  VITE_APP_ENV?: string;
}

const PUBLIC_WEB_PATHS = new Set(['/', '/home']);

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
  if (url.pathname === '/home' && ['web', 'dev', 'local'].includes(appEnvironment)) {
    return 'public';
  }
  return appEnvironment === 'web' && url.pathname === '/' ? 'public' : 'app';
}
