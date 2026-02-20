import { useLayoutEffect } from 'react';

export function useHomePageTheme(userDarkModePref: boolean) {
  useLayoutEffect(() => {
    document.documentElement.classList.add('dark');

    return () => {
      if (!userDarkModePref) {
        document.documentElement.classList.remove('dark');
      }
    };
  }, [userDarkModePref]);
}
