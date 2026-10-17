import { useCallback, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY_PREFIX = 'astrid-hidden-shots:';

function getStorageKey(projectId: string | undefined): string | null {
  if (!projectId) {
    return null;
  }

  return `${STORAGE_KEY_PREFIX}${projectId}`;
}

function readHiddenIds(projectId: string | undefined): Set<string> {
  const storageKey = getStorageKey(projectId);

  if (!storageKey || typeof window === 'undefined') {
    return new Set();
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);

    if (!rawValue) {
      return new Set();
    }

    const parsedValue = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return new Set();
    }

    return new Set(parsedValue.filter((value): value is string => typeof value === 'string'));
  } catch {
    return new Set();
  }
}

interface UseHiddenShotsResult {
  hiddenIds: Set<string>;
  isHidden: (id: string) => boolean;
  hide: (id: string) => void;
  unhide: (id: string) => void;
  toggle: (id: string) => void;
}

export function useHiddenShots(projectId: string | undefined): UseHiddenShotsResult {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => readHiddenIds(projectId));

  useEffect(() => {
    setHiddenIds(readHiddenIds(projectId));
  }, [projectId]);

  useEffect(() => {
    const storageKey = getStorageKey(projectId);

    if (!storageKey || typeof window === 'undefined') {
      return;
    }

    try {
      if (hiddenIds.size === 0) {
        window.localStorage.removeItem(storageKey);
        return;
      }

      window.localStorage.setItem(storageKey, JSON.stringify(Array.from(hiddenIds)));
    } catch {
      // Swallow storage errors so list rendering still works when persistence is unavailable.
    }
  }, [hiddenIds, projectId]);

  const isHidden = useCallback(
    (id: string) => hiddenIds.has(id),
    [hiddenIds],
  );

  const hide = useCallback(
    (id: string) => {
      if (!projectId) {
        return;
      }

      setHiddenIds((current) => {
        if (current.has(id)) {
          return current;
        }

        const next = new Set(current);
        next.add(id);
        return next;
      });
    },
    [projectId],
  );

  const unhide = useCallback(
    (id: string) => {
      if (!projectId) {
        return;
      }

      setHiddenIds((current) => {
        if (!current.has(id)) {
          return current;
        }

        const next = new Set(current);
        next.delete(id);
        return next;
      });
    },
    [projectId],
  );

  const toggle = useCallback(
    (id: string) => {
      if (!projectId) {
        return;
      }

      setHiddenIds((current) => {
        const next = new Set(current);

        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }

        return next;
      });
    },
    [projectId],
  );

  return useMemo(
    () => ({
      hiddenIds,
      isHidden,
      hide,
      unhide,
      toggle,
    }),
    [hiddenIds, isHidden, hide, unhide, toggle],
  );
}
