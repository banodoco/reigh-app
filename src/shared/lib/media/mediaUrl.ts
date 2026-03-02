const FULL_URL_PATTERN = /^(https?:|blob:|data:)/;

const withCacheBust = (url: string): string => {
  if (url.includes('?t=')) {
    return url;
  }
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}t=${Date.now()}`;
};

const getEffectiveBaseUrl = (): string => {
  if (typeof window === 'undefined') {
    return import.meta.env.VITE_API_TARGET_URL || '';
  }

  const configuredBase = import.meta.env.VITE_API_TARGET_URL || window.location.origin;
  if (!configuredBase.includes('localhost')) {
    return configuredBase;
  }

  const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  return isLocalHost ? configuredBase : window.location.origin;
};

export const getDisplayUrl = (
  relativePath: string | undefined | null,
  forceRefresh: boolean = false
): string => {
  if (!relativePath) {
    return '/placeholder.svg';
  }

  if (FULL_URL_PATTERN.test(relativePath)) {
    return forceRefresh ? withCacheBust(relativePath) : relativePath;
  }

  const base = getEffectiveBaseUrl().replace(/\/$/, '');
  const normalizedPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  const resolvedUrl = `${base}${normalizedPath}`;

  if (forceRefresh || (relativePath.includes('flipped_') && !relativePath.includes('?t='))) {
    return withCacheBust(resolvedUrl);
  }

  return resolvedUrl;
};

export const stripQueryParameters = (url: string | undefined | null): string => {
  if (!url) return '';
  const questionMarkIndex = url.indexOf('?');
  if (questionMarkIndex === -1) return url;
  return url.substring(0, questionMarkIndex);
};
