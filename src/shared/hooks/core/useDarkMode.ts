import { useAppTheme } from './useAppTheme';

/**
 * Whether the app is currently dark, from its time-of-day theme (see useAppTheme). Setting it fixes the
 * theme at a day or night moment; painting the page is left to useApplyAppTheme at the app's root.
 */
export function useDarkMode() {
  const { darkMode, setTime } = useAppTheme();
  // Fixing the theme picks a time: late evening for dark, midday for light.
  const setDarkMode = (dark: boolean) => setTime(dark ? 23 : 12);
  const toggle = () => setDarkMode(!darkMode);
  return { darkMode, setDarkMode, toggle };
}
