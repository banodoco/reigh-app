import type { MouseEvent as ReactMouseEvent } from 'react';

export const GITHUB_URL = 'https://github.com/banodoco/reigh-app';
export const DISCORD_URL = 'https://discord.gg/D5K2c6kfhy';
// TODO(astrid-landing): Astrid's X account is not in the repo yet; replace this placeholder before launch.
export const X_URL = '#';

/** Vision & Issues, shown in place over the home page (see PublicAstridSite.tsx). */
export const VISION_PATH = '/vision';

/** Follows a link in place for a plain click; modified clicks (new tab, new window) keep the browser's own handling. */
export function followInPage(event: ReactMouseEvent<HTMLAnchorElement>, go?: () => void) {
  if (!go || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  go();
}
