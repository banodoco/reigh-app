import usePersistentState from '../usePersistentState';

/**
 * Hook to manage persisted dark mode preference.
 */
export function useDarkMode() {
  const [darkMode, setDarkMode] = usePersistentState<boolean>('dark-mode', true);

  const toggle = () => setDarkMode((prev) => !prev);

  return { darkMode, setDarkMode, toggle };
}

// NOTE: Default export removed - use named export { useDarkMode } instead
