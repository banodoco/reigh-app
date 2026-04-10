import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { requireContextValue } from '@/shared/contexts/contextGuard';
import {
  buildSummary,
  type SelectedMediaClip,
} from '@/tools/video-editor/hooks/useSelectedMediaClips';

type GallerySelectionMediaType = 'image' | 'video';

type GallerySelectionEntry = {
  url: string;
  mediaType: GallerySelectionMediaType;
  generationId: string;
  variantId?: string;
};

export type GallerySelectionMeta = {
  url: string;
  type?: string | null;
  mediaType?: string | null;
  generationId?: string | null;
  variantId?: string | null;
};

export type GallerySelectionItem = GallerySelectionMeta & {
  id: string;
};

type GallerySelectionContextValue = {
  selectedGalleryIds: ReadonlySet<string>;
  gallerySelectionMap: ReadonlyMap<string, GallerySelectionEntry>;
  selectedGalleryClips: SelectedMediaClip[];
  gallerySummary: string;
  selectGalleryItem: (
    id: string,
    meta: GallerySelectionMeta,
    options?: { toggle?: boolean },
  ) => void;
  selectGalleryItems: (
    items: GallerySelectionItem[],
    options?: { append?: boolean },
  ) => void;
  deselectGalleryItems: (ids: Iterable<string>) => void;
  clearGallerySelection: () => void;
  registerPeerClear: (clearPeerSelection: (() => void) | null) => void;
};

const GallerySelectionContext = createContext<GallerySelectionContextValue | null>(null);

function resolveMediaType(value: string | null | undefined): GallerySelectionMediaType | null {
  if (!value) {
    return null;
  }

  if (value.includes('image')) {
    return 'image';
  }

  if (value.includes('video')) {
    return 'video';
  }

  return null;
}

function normalizeSelectionItem(item: GallerySelectionItem): (GallerySelectionEntry & { id: string }) | null {
  const id = item.id.trim();
  const url = item.url.trim();
  const mediaType = resolveMediaType(item.mediaType ?? item.type);
  const generationId = (item.generationId ?? item.id).trim();

  if (!id || !url || !mediaType || !generationId) {
    return null;
  }

  return {
    id,
    url,
    mediaType,
    generationId,
    ...(item.variantId?.trim() ? { variantId: item.variantId.trim() } : {}),
  };
}

function hasSameSelection(
  selectionMap: ReadonlyMap<string, GallerySelectionEntry>,
  items: readonly (GallerySelectionEntry & { id: string })[],
): boolean {
  if (selectionMap.size !== items.length) {
    return false;
  }

  return items.every((item) => {
    const existing = selectionMap.get(item.id);
    return existing?.url === item.url
      && existing.mediaType === item.mediaType
      && existing.generationId === item.generationId
      && existing.variantId === item.variantId;
  });
}

export function GallerySelectionProvider({ children }: { children: ReactNode }) {
  const [gallerySelectionMap, setGallerySelectionMap] = useState<Map<string, GallerySelectionEntry>>(
    () => new Map(),
  );
  const peerClearRef = useRef<(() => void) | null>(null);

  const registerPeerClear = useCallback((clearPeerSelection: (() => void) | null) => {
    peerClearRef.current = clearPeerSelection;
  }, []);

  const selectGalleryItem = useCallback((
    id: string,
    meta: GallerySelectionMeta,
    options?: { toggle?: boolean },
  ) => {
    const normalized = normalizeSelectionItem({ id, ...meta });
    if (!normalized) {
      return;
    }

    if (!options?.toggle) {
      peerClearRef.current?.();
    }

    setGallerySelectionMap((previous) => {
      if (!options?.toggle) {
        if (hasSameSelection(previous, [normalized])) {
          return previous;
        }

        return new Map([
          [
            normalized.id,
            {
              url: normalized.url,
              mediaType: normalized.mediaType,
              generationId: normalized.generationId,
              variantId: normalized.variantId,
            },
          ],
        ]);
      }

      const next = new Map(previous);
      if (next.has(normalized.id)) {
        next.delete(normalized.id);
        return next;
      }

      next.set(normalized.id, {
        url: normalized.url,
        mediaType: normalized.mediaType,
        generationId: normalized.generationId,
        variantId: normalized.variantId,
      });
      return next;
    });
  }, []);

  const selectGalleryItems = useCallback((
    items: GallerySelectionItem[],
    options?: { append?: boolean },
  ) => {
    const normalizedItems = items
      .map(normalizeSelectionItem)
      .filter((item): item is GallerySelectionEntry & { id: string } => item !== null);

    if (!options?.append) {
      peerClearRef.current?.();
    }

    setGallerySelectionMap((previous) => {
      if (!normalizedItems.length) {
        return options?.append || previous.size === 0 ? previous : new Map();
      }

      const next = options?.append ? new Map(previous) : new Map<string, GallerySelectionEntry>();
      let changed = !options?.append && !hasSameSelection(previous, normalizedItems);
      for (const item of normalizedItems) {
        const nextEntry = {
          url: item.url,
          mediaType: item.mediaType,
          generationId: item.generationId,
          variantId: item.variantId,
        };
        const previousEntry = previous.get(item.id);
        if (
          !previousEntry
          || previousEntry.url !== nextEntry.url
          || previousEntry.mediaType !== nextEntry.mediaType
          || previousEntry.generationId !== nextEntry.generationId
          || previousEntry.variantId !== nextEntry.variantId
        ) {
          changed = true;
        }
        next.set(item.id, nextEntry);
      }

      if (!changed && next.size === previous.size) {
        return previous;
      }

      return next;
    });
  }, []);

  const clearGallerySelection = useCallback(() => {
    setGallerySelectionMap((previous) => (previous.size === 0 ? previous : new Map()));
  }, []);

  const deselectGalleryItems = useCallback((ids: Iterable<string>) => {
    const idsToRemove = new Set(ids);
    if (idsToRemove.size === 0) {
      return;
    }

    setGallerySelectionMap((previous) => {
      let changed = false;
      const next = new Map(previous);
      idsToRemove.forEach((id) => {
        if (next.delete(id)) {
          changed = true;
        }
      });

      return changed ? next : previous;
    });
  }, []);

  const selectedGalleryIds = useMemo<ReadonlySet<string>>(
    () => new Set(gallerySelectionMap.keys()),
    [gallerySelectionMap],
  );

  const selectedGalleryClips = useMemo<SelectedMediaClip[]>(() => (
    Array.from(gallerySelectionMap.entries()).map(([id, item]) => ({
      clipId: `gallery-${item.generationId || id}`,
      assetKey: '',
      url: item.url,
      mediaType: item.mediaType,
      isTimelineBacked: false,
      generationId: item.generationId,
      variantId: item.variantId,
    }))
  ), [gallerySelectionMap]);

  const gallerySummary = useMemo(() => {
    return buildSummary(selectedGalleryClips);
  }, [selectedGalleryClips]);

  const value = useMemo<GallerySelectionContextValue>(() => ({
    selectedGalleryIds,
    gallerySelectionMap,
    selectedGalleryClips,
    gallerySummary,
    selectGalleryItem,
    selectGalleryItems,
    deselectGalleryItems,
    clearGallerySelection,
    registerPeerClear,
  }), [
    clearGallerySelection,
    deselectGalleryItems,
    gallerySelectionMap,
    gallerySummary,
    registerPeerClear,
    selectGalleryItem,
    selectGalleryItems,
    selectedGalleryClips,
    selectedGalleryIds,
  ]);

  return (
    <GallerySelectionContext.Provider value={value}>
      {children}
    </GallerySelectionContext.Provider>
  );
}

export function useGallerySelectionOptional(): GallerySelectionContextValue | null {
  return useContext(GallerySelectionContext);
}

export function useGallerySelection(): GallerySelectionContextValue {
  return requireContextValue(
    useGallerySelectionOptional(),
    'useGallerySelection',
    'GallerySelectionProvider',
  );
}
