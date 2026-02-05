# Image Preloading System Consolidation Plan

## Current State: Two Parallel Systems

### System A: "New" (partially adopted)
- `useImagePreloading` hook → creates per-instance `PreloadQueue`
- `ImagePreloadManager` component wraps hook + `useCacheCleanup`
- `useProgressiveImageLoading` for staggered display
- Used by: `MediaGalleryGrid`

### System B: "Legacy" (still actively used)
- `smartPreloadImages()`, `clearLegacyPreloadQueue()` → global `legacyQueue`
- Manual `handlePrefetchAdjacentPages` callbacks in page components
- Used by: `ImageGenerationToolPage`, `ShotListView`, `GenerationsPane`

### The Problem
Pages do this dance:
```tsx
const handlePrefetchAdjacentPages = useCallback((prev, next) => {
  // 1. Clear legacy queue
  clearLegacyPreloadQueue();
  // 2. Prefetch React Query data
  queryClient.prefetchQuery({...}).then(() => {
    // 3. Preload images from that data
    smartPreloadImages(cached, 'next', prefetchId, ref);
  });
}, [...]);

// Then pass to MediaGallery
<MediaGallery onPrefetchAdjacentPages={handlePrefetchAdjacentPages} />
```

Meanwhile, `ImagePreloadManager` inside `MediaGalleryGrid` ALSO tries to preload via `useImagePreloading`. Double work, two queues, confusion.

---

## Target State: Single Unified System

```
┌─────────────────────────────────────────────────────────────────┐
│ MediaGallery                                                     │
│  props: projectId, page, itemsPerPage, filters                  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ useAdjacentPagePreloader (NEW - replaces everything)        ││
│  │  - Debounces page changes                                   ││
│  │  - Prefetches React Query data for prev/next pages          ││
│  │  - Preloads images from prefetched data                     ││
│  │  - Single queue, device-aware config                        ││
│  │  - Cleans up distant pages automatically                    ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ useProgressiveImageLoading (keep as-is)                     ││
│  │  - Handles staggered display of current page                ││
│  │  - Checks imageLoadTracker for instant display              ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ imageLoadTracker (renamed from imageCacheManager)               │
│  - Tracks what we've attempted to load                          │
│  - LRU eviction with device-aware limits                        │
│  - No pretense of knowing browser cache state                   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Changes
1. **No more callbacks** - MediaGallery handles everything internally
2. **Single queue** - one PreloadQueue for the entire gallery
3. **React Query prefetch inside hook** - not in page components
4. **Honest naming** - "load tracker" not "cache manager"

---

## Implementation Plan

### Phase 1: Create new unified hook (non-breaking)

#### Task 1.1: Create `useAdjacentPagePreloader` hook
New file: `src/shared/hooks/useAdjacentPagePreloader.ts`

```tsx
interface UseAdjacentPagePreloaderProps {
  projectId: string | null;
  currentPage: number;        // 0-indexed
  itemsPerPage: number;
  filters: GenerationsFilters;
  enabled?: boolean;
  paused?: boolean;           // e.g., when lightbox open
}

export function useAdjacentPagePreloader({
  projectId,
  currentPage,
  itemsPerPage,
  filters,
  enabled = true,
  paused = false,
}: UseAdjacentPagePreloaderProps): void {
  const queryClient = useQueryClient();
  const queueRef = useRef<PreloadQueue>(null);
  const config = useMemo(() => getPreloadConfig(), []);

  // Initialize queue once
  if (!queueRef.current) {
    queueRef.current = new PreloadQueue(config.maxConcurrent);
  }

  useEffect(() => {
    if (!enabled || paused || !projectId) return;

    const queue = queueRef.current!;
    queue.clear(); // Cancel pending from previous page

    const timer = setTimeout(async () => {
      const totalPages = /* get from React Query cache or estimate */;

      // Prefetch next page
      if (currentPage < totalPages - 1) {
        const nextPage = currentPage + 2; // 1-indexed for API
        await queryClient.prefetchQuery({
          queryKey: queryKeys.unified.byProject(projectId, nextPage, itemsPerPage, filters),
          queryFn: () => fetchGenerations(projectId, itemsPerPage, (nextPage - 1) * itemsPerPage, filters),
          staleTime: 30_000,
        });
        const data = queryClient.getQueryData<GenerationsPaginatedResponse>(
          queryKeys.unified.byProject(projectId, nextPage, itemsPerPage, filters)
        );
        if (data?.items) {
          preloadImages(data.items, queue, config, PRIORITY_VALUES.high);
        }
      }

      // Prefetch previous page (lower priority)
      if (currentPage > 0) {
        const prevPage = currentPage; // 1-indexed
        await queryClient.prefetchQuery({...});
        // preloadImages with PRIORITY_VALUES.normal
      }

      // Cleanup distant pages
      cleanupDistantPages(queryClient, projectId, currentPage, 2);

    }, config.debounceMs);

    return () => {
      clearTimeout(timer);
      queue.clear();
    };
  }, [projectId, currentPage, itemsPerPage, filters, enabled, paused, queryClient, config]);
}
```

#### Task 1.2: Add `cleanupDistantPages` utility
Extract from `useCacheCleanup` into a standalone function that can be called imperatively.

#### Task 1.3: Rename `imageCacheManager` → `imageLoadTracker`
- Rename file
- Update all imports
- Rename functions for clarity:
  - `isImageCached` → `hasLoadedImage`
  - `markImageAsCached` → `markImageLoaded`
  - `setImageCacheStatus` → `setImageLoadStatus`
  - `clearCacheForImages` → `clearLoadedImages`

### Phase 2: Integrate into MediaGallery

#### Task 2.1: Update MediaGallery to use new hook
```tsx
// In MediaGallery or MediaGalleryGrid
useAdjacentPagePreloader({
  projectId,
  currentPage: serverPage ? serverPage - 1 : page,
  itemsPerPage,
  filters: generationsFilters,
  enabled: enableAdjacentPagePreloading,
  paused: isLightboxOpen,
});
```

#### Task 2.2: Remove `onPrefetchAdjacentPages` prop
- Remove from MediaGallery props
- Remove from MediaGalleryGrid
- Remove from ImagePreloadManager (or delete component entirely)

### Phase 3: Clean up page components

#### Task 3.1: Clean up ImageGenerationToolPage
- Remove `handlePrefetchAdjacentPages` callback
- Remove `prefetchOperationsRef`
- Remove imports of legacy functions
- Just pass `projectId`, `filters`, etc. to MediaGallery

#### Task 3.2: Clean up ShotListView
- Same cleanup as above

#### Task 3.3: Clean up GenerationsPane
- Same cleanup as above

### Phase 4: Delete legacy code

#### Task 4.1: Delete legacy exports from `useAdjacentPagePreloading.ts`
- Remove `smartPreloadImages`
- Remove `smartCleanupOldPages`
- Remove `clearLegacyPreloadQueue`
- Remove `initializePrefetchOperations`
- Remove `triggerImageGarbageCollection`

#### Task 4.2: Delete the file entirely
- `useAdjacentPagePreloading.ts` should be empty after removing exports
- Delete the file

#### Task 4.3: Delete `ImagePreloadManager` component
- No longer needed if MediaGallery handles preloading internally

#### Task 4.4: Potentially merge `useCacheCleanup` into new hook
- If only used by the new hook, inline it

---

## Files Changed Summary

### New Files
- `src/shared/hooks/useAdjacentPagePreloader.ts`

### Renamed Files
- `src/shared/lib/imageCacheManager.ts` → `src/shared/lib/imageLoadTracker.ts`

### Modified Files
- `src/shared/components/MediaGallery/index.tsx` - add hook, remove callback prop
- `src/shared/components/MediaGalleryGrid.tsx` - remove ImagePreloadManager
- `src/tools/image-generation/pages/ImageGenerationToolPage.tsx` - remove callback
- `src/tools/travel-between-images/pages/ShotListView.tsx` - remove callback
- `src/shared/components/GenerationsPane/GenerationsPane.tsx` - remove callback
- `src/shared/hooks/useProgressiveImageLoading.ts` - update imports

### Deleted Files
- `src/shared/hooks/useAdjacentPagePreloading.ts`
- `src/shared/components/ImagePreloadManager.tsx`
- `src/shared/hooks/useCacheCleanup.ts` (maybe - or inline)
- `src/shared/hooks/useImagePreloading.ts` (replaced by new hook)

---

## Risk Assessment

### Low Risk
- Renaming `imageCacheManager` - purely cosmetic
- Creating new hook - additive, non-breaking

### Medium Risk
- Removing callback prop from MediaGallery - need to update all callers
- Deleting legacy functions - need to ensure nothing else imports them

### Mitigation
- Phase 1 is completely non-breaking
- Phase 2-3 can be done incrementally per-page
- Keep legacy code until all pages migrated
- Run full test suite after each phase

---

## Success Criteria

1. **Single code path** - One hook handles all preloading
2. **No manual callbacks** - Pages don't manage preloading
3. **Fewer files** - Delete 3-4 files
4. **Honest naming** - "load tracker" not "cache manager"
5. **Same or better UX** - Images still preload smoothly
6. **Mobile works** - Conservative config still applies

---

## Open Questions

1. **Should we keep `useVideoGalleryPreloader`?**
   - It's specialized for shot thumbnails with global caching
   - Could potentially be merged if we add "preload all thumbnails" capability

2. **Should progressive loading be part of the same hook?**
   - Currently separate (`useProgressiveImageLoading`)
   - Could combine but increases complexity

3. **Should we use `<link rel="preload">` instead of hidden `<img>`?**
   - More browser-native approach
   - But less control over priority/cancellation
