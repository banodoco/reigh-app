const VIDEO_EDITOR_ROUTE = '/tools/video-editor';

/**
 * An explicit Runtime editor document owns its session and data authority.
 * Keep this predicate narrow so query parameters cannot bypass auth on other
 * protected routes or on an incomplete editor URL.
 */
export function isRuntimeDocumentMode(
  search = typeof window === 'undefined' ? '' : window.location.search,
  pathname = typeof window === 'undefined' ? '' : window.location.pathname,
): boolean {
  if (pathname !== VIDEO_EDITOR_ROUTE) return false;
  const params = new URLSearchParams(search);
  return params.get('runtime') === '1'
    && Boolean(params.get('runtimeProject')?.trim())
    && Boolean(params.get('runtimeTimeline')?.trim());
}
