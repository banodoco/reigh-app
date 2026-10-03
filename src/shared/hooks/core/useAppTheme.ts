import { useEffect, useState } from 'react';
import { duskTokens, skyDarknessAt, themeForDarkness } from '@/pages/Home/publicAstridSkyRender';
import { usePersistentState } from '@/shared/hooks/usePersistentState';
import { syncThemeColorToBackground } from '@/shared/lib/themeColor';

/**
 * The app's colours, in Astrid's palette, set by the time of day as on the public site. Until someone
 * picks otherwise (in onboarding or settings) the app follows the sky where they are: light by day,
 * through dusk, to dark by night. They can instead fix it at a moment of their choosing, from midday
 * (0) to midnight (1), and it stays there.
 */
export const APP_THEME_TIME_KEY = 'theme-time-of-day';
/** null: follow the time of day; a number: a fixed moment, 0 midday … 1 midnight. */
export type AppThemeTime = number | null;
/** How often the app checks the sky while following it. */
const SKY_CHECK_MS = 60_000;

export function readStoredAppThemeTime(): AppThemeTime {
  try {
    const stored = localStorage.getItem(APP_THEME_TIME_KEY);
    const value = stored ? JSON.parse(stored) : null;
    return typeof value === 'number' ? value : null;
  } catch {
    return null;
  }
}

/** How dark the app is drawn for a choice: the sky's own darkness, or the chosen moment. */
export function appThemeDarkness(time: AppThemeTime, now = new Date()): number {
  return time === null ? skyDarknessAt(now) : Math.min(1, Math.max(0, time));
}

/** Paints the app for a darkness: every design token, the dark class its components key off, and the
 *  browser's own chrome. */
export function applyAppTheme(darkness: number): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(duskTokens(darkness))) root.style.setProperty(name, value);
  root.classList.toggle('dark', themeForDarkness(darkness) === 'dark');
  syncThemeColorToBackground();
}

export function useAppTheme() {
  const [time, setTime] = usePersistentState<AppThemeTime>(APP_THEME_TIME_KEY, null);
  const followsSky = time === null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!followsSky) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), SKY_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [followsSky]);
  const darkness = appThemeDarkness(time, new Date(now));
  return {
    /** The stored choice: null while following the sky. */
    time,
    setTime,
    followsSky,
    followSky: () => setTime(null),
    darkness,
    darkMode: themeForDarkness(darkness) === 'dark',
  };
}

/** Keeps the page painted for the current theme; mounted once, at the app's root. */
export function useApplyAppTheme(): void {
  const { darkness } = useAppTheme();
  useEffect(() => {
    applyAppTheme(darkness);
  }, [darkness]);
}
