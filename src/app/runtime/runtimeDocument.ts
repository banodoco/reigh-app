const VIDEO_EDITOR_ROUTE = '/tools/video-editor';
const IMAGE_GENERATION_ROUTE = '/tools/image-generation';
const RUNTIME_DOCUMENT_ROUTES = new Set([VIDEO_EDITOR_ROUTE, IMAGE_GENERATION_ROUTE]);

/**
 * An explicit Runtime editor document owns its session and data authority.
 * Keep this predicate narrow so query parameters cannot bypass auth on other
 * protected routes or on an incomplete document URL. The image-generation
 * tool is included because the editor's explicit "Go to Image Generation"
 * action keeps the same Runtime document authority.
 */
export function isRuntimeDocumentMode(
  search = typeof window === 'undefined' ? '' : window.location.search,
  pathname = typeof window === 'undefined' ? '' : window.location.pathname,
): boolean {
  if (!RUNTIME_DOCUMENT_ROUTES.has(pathname)) return false;
  const params = new URLSearchParams(search);
  return params.get('runtime') === '1'
    && Boolean(params.get('runtimeProject')?.trim())
    && Boolean(params.get('runtimeTimeline')?.trim());
}

/** Return the URL-owned Runtime project for an explicit document route. */
export function getRuntimeDocumentProjectId(
  search = typeof window === 'undefined' ? '' : window.location.search,
  pathname = typeof window === 'undefined' ? '' : window.location.pathname,
): string | null {
  if (!isRuntimeDocumentMode(search, pathname)) return null;
  return new URLSearchParams(search).get('runtimeProject')?.trim() || null;
}

/** Carry the explicit Runtime document identity onto another tool route. */
export function withRuntimeDocumentParams(path: string, search: string): string {
  const source = new URLSearchParams(search);
  if (
    source.get('runtime') !== '1'
    || !source.get('runtimeProject')?.trim()
    || !source.get('runtimeTimeline')?.trim()
  ) {
    return path;
  }
  const target = new URL(path, 'http://runtime.local');
  target.searchParams.set('runtime', '1');
  target.searchParams.set('runtimeProject', source.get('runtimeProject')!.trim());
  target.searchParams.set('runtimeTimeline', source.get('runtimeTimeline')!.trim());
  return `${target.pathname}${target.search ? target.search : ''}${target.hash}`;
}
