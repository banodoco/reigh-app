import { useAppTheme } from './useAppTheme';

/**
 * Whether the app is currently dark, from its time-of-day theme (see useAppTheme). Setting it fixes the
 * theme at a day or night moment; painting the page is left to useApplyAppTheme at the app's root.
 */
export function useDarkMode() {
  const { darkMode, setTime } = useAppTheme();
  const setDarkMode = (dark: boolean) => setTime(dark ? 0.75 : 0.25);
  const toggle = () => setDarkMode(!darkMode);
  return { darkMode, setDarkMode, toggle };
}
