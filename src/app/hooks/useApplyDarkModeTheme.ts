import { useEffect } from 'react';
import { usePersistentState } from '@/shared/hooks/usePersistentState';

export function useApplyDarkModeTheme() {
  const [darkMode] = usePersistentState<boolean>('dark-mode', true);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    if (favicon) {
      favicon.href = darkMode ? '/favicon-dark.ico' : '/favicon-light.ico';
    }
  }, [darkMode]);
}
