const VIDEO_EDITOR_ROUTE = '/tools/video-editor';

/**
 * `dev:local` sets this client flag after verifying the Astrid workspace
 * runtime. In that product mode the Video Editor is the whole Astrid App app
 * surface; cloud builds and ordinary app routes keep their normal shell.
 */
export function isAstridEditorOnlyWorkspace(): boolean {
  return import.meta.env.VITE_ASTRID_WORKSPACE_V1 === '1';
}

export function isAstridEditorOnlyShellPath(pathname: string): boolean {
  return isAstridEditorOnlyWorkspace() && pathname === VIDEO_EDITOR_ROUTE;
}

/**
 * Local Astrid workspace launches expose only the Video Editor tool. Preserve
 * a selected project/timeline when a stale or bookmarked tool URL is opened.
 */
export function astridEditorOnlyRedirectTarget(pathname: string, search: string): string | null {
  if (!isAstridEditorOnlyWorkspace()) return null;
  if (pathname === VIDEO_EDITOR_ROUTE) return null;

  const current = new URLSearchParams(search);
  const editorParams = new URLSearchParams();
  for (const key of ['localProject', 'localTimeline', 'runtime', 'runtimeProject', 'runtimeTimeline', 'timeline']) {
    const value = current.get(key);
    if (value !== null) editorParams.set(key, value);
  }
  const query = editorParams.toString();
  return `${VIDEO_EDITOR_ROUTE}${query ? `?${query}` : ''}`;
}
