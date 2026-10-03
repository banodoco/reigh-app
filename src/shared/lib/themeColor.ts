/** Sets the browser's theme colour (its tab strip, title bar and, when installed, window chrome). */
export function setThemeColor(color: string): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
  }
  if (meta.content !== color) meta.content = color;
}

/** Matches the browser's theme colour to the page background, once the current theme has applied. */
export function syncThemeColorToBackground(): void {
  setThemeColor(getComputedStyle(document.body).backgroundColor);
}
