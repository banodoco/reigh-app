import { useState, useEffect, useCallback } from 'react';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { dispatchAppEvent, useAppEventListener } from '@/shared/lib/typedEvents';

const MAX_LOCAL_STORAGE_ITEM_LENGTH = 4 * 1024 * 1024; // 4MB

// Check if localStorage is available (can fail in iOS Safari private mode)
function isLocalStorageAvailable(): boolean {
  try {
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

export function usePersistentState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    // Mobile Safari in private mode can throw on localStorage access
    if (!isLocalStorageAvailable()) {
      return defaultValue;
    }

    try {
      const storedValue = localStorage.getItem(key);
      if (storedValue) {
        return JSON.parse(storedValue) as T;
      }
    } catch (error) {
      normalizeAndPresentError(error, { context: 'usePersistentState', showToast: false });
    }
    return defaultValue;
  });

  // Listen for updates from other components using the same key
  const handleExternalUpdate = useCallback((detail: { key: string; value: unknown }) => {
    if (detail?.key === key) {
      setState(detail.value as T);
    }
  }, [key]);

  useAppEventListener('persistentStateChange', handleExternalUpdate);

  useEffect(() => {
    // Skip localStorage writes if not available
    if (!isLocalStorageAvailable()) {
      return;
    }

    try {
      const serializedState = JSON.stringify(state);
      if (serializedState.length > MAX_LOCAL_STORAGE_ITEM_LENGTH) {
        toast.warning("Could not save settings locally.", {
          description: "The data size exceeds the 4MB limit for local storage.",
        });
        return;
      }
      localStorage.setItem(key, serializedState);

      // Broadcast change to other hook instances in the same tab
      dispatchAppEvent('persistentStateChange', { key, value: state });
    } catch (error) {
      // Different error message for mobile users
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const errorDescription = isMobile
        ? "Local storage may be disabled in private browsing mode. Settings will be lost when the tab is closed."
        : "There was an error writing to your browser's local storage.";

      normalizeAndPresentError(error, {
        context: 'usePersistentState',
        toastTitle: 'Could not save settings locally.',
        logData: { reason: errorDescription }
      });
    }
  }, [key, state]);

  return [state, setState];
}

