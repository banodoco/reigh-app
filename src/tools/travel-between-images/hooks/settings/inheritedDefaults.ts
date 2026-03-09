import { useMemo, useRef } from 'react';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

interface UseInheritedDefaultsOptions<T> {
  shotId: string | null | undefined;
  storageKeyForShot: (shotId: string) => string;
  mergeDefaults: (defaults: Record<string, unknown>) => T;
  context: string;
}

export function useSessionInheritedDefaults<T>({
  shotId,
  storageKeyForShot,
  mergeDefaults,
  context,
}: UseInheritedDefaultsOptions<T>): T | null {
  const appliedShotRef = useRef<string | null>(null);

  return useMemo(() => {
    if (!shotId || typeof window === 'undefined') return null;
    if (appliedShotRef.current === shotId) return null;

    const storageKey = storageKeyForShot(shotId);
    const rawDefaults = sessionStorage.getItem(storageKey);
    if (!rawDefaults) return null;

    try {
      const parsedDefaults = JSON.parse(rawDefaults) as Record<string, unknown>;
      sessionStorage.removeItem(storageKey);
      appliedShotRef.current = shotId;
      return mergeDefaults(parsedDefaults);
    } catch (error) {
      normalizeAndPresentError(error, { context, showToast: false });
      sessionStorage.removeItem(storageKey);
      return null;
    }
  }, [shotId, storageKeyForShot, mergeDefaults, context]);
}
