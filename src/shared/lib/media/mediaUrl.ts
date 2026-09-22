const FULL_URL_PATTERN = /^(https?:|blob:|data:)/;
const MANAGED_MEDIA_PATH_PATTERN = /^\/api\/(?:astrid|runtime)(?:\/|$)/;

const withCacheBust = (url: string): string => {
  const hashIndex = url.indexOf('#');
  const urlWithoutHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex);

  if (/(?:\?|&)t=[^&#]*/.test(urlWithoutHash)) {
    return url;
  }
  const separator = urlWithoutHash.includes('?') ? '&' : '?';
  return `${urlWithoutHash}${separator}t=${Date.now()}${hash}`;
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

  // bridgeMediaUrl already resolved managed media to a same-origin byte route.
  // Keep that route intact so display normalization does not send it to the
  // development API target, which may be a different service.
  if (MANAGED_MEDIA_PATH_PATTERN.test(relativePath)) {
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
