import type { NavigatorWithDeviceInfo } from '@/types/browser-extensions';

export function isStandaloneDisplayMode(): boolean {
  const nav = navigator as NavigatorWithDeviceInfo;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    nav.standalone === true
  );
}
