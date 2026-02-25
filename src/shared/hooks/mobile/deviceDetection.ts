export const MOBILE_BREAKPOINT = 768;

const TABLET_UA_RE = /iPad|Tablet|Android(?!.*Mobile)|Silk|Kindle|PlayBook/i;

type MobileErrorReporter = (key: string, error: unknown) => void;

function runSafe<T>(
  key: string,
  callback: () => T,
  onError?: MobileErrorReporter,
  fallback?: T,
): T {
  try {
    return callback();
  } catch (error) {
    onError?.(key, error);
    return fallback as T;
  }
}

const hasCoarsePointer = (onError?: MobileErrorReporter): boolean => {
  if (typeof window === 'undefined') return false;
  return runSafe('hasCoarsePointer', () => {
    return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }, onError, false);
};

const isIpadOsLike = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
};

const isTabletUA = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return TABLET_UA_RE.test(navigator.userAgent || '');
};

export const computeIsTablet = (onError?: MobileErrorReporter): boolean => {
  if (typeof window === 'undefined') return false;
  const width = window.innerWidth;
  const isTabletSize = width >= MOBILE_BREAKPOINT && width < 1200;
  return Boolean(isIpadOsLike() || isTabletUA() || (isTabletSize && hasCoarsePointer(onError)));
};

export const computeIsMobile = (onError?: MobileErrorReporter): boolean => {
  if (typeof window === 'undefined') return false;
  return Boolean(window.innerWidth < MOBILE_BREAKPOINT || hasCoarsePointer(onError) || isIpadOsLike() || isTabletUA());
};

export const computeIsTouchDevice = (onError?: MobileErrorReporter): boolean => {
  if (typeof window === 'undefined') return false;
  return Boolean(hasCoarsePointer(onError) || isTabletUA() || isIpadOsLike() || (navigator.maxTouchPoints || 0) > 0);
};

export const computeOrientation = (onError?: MobileErrorReporter): 'portrait' | 'landscape' => {
  if (typeof window === 'undefined') return 'portrait';
  return runSafe(
    'computeOrientation',
    () => (window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape'),
    onError,
    'portrait',
  );
};

export const computeIsPortraitMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.innerHeight > window.innerWidth;
};

export function isMobileUA(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}
