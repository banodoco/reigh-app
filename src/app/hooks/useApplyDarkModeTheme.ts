import { useApplyAppTheme } from '@/shared/hooks/core/useAppTheme';

/** Paints the app in Astrid's palette for the time of day, or the moment the person chose. */
export function useApplyDarkModeTheme() {
  useApplyAppTheme();
}
