# Video Gallery Preloader Unification Plan

## Current State

Two separate preloading systems exist:

### 1. Shared Preloading Service (`src/shared/lib/preloading/`)
- **Used by**: Gallery pagination, adjacent page preloading
- **Tracking**: By image ID and URL in `tracker.ts`
- **Queue**: `PreloadQueue` with priority and concurrency control
- **Cleanup**: Coordinated via `preloadingService.onProjectChange()`

### 2. Video Gallery Preloader (`useVideoGalleryPreloader` + `useThumbnailLoader`)
- **Used by**: Video travel tool's shot galleries
- **Tracking**: `window.videoGalleryPreloaderCache` with URL sets per project
- **Queue**: Own queue in useRef with `requestIdleCallback`
- **Special**: Keeps `HTMLImageElement` refs to prevent browser cache eviction
- **Cleanup**: Own project switch logic + service clears its cache

### Problems
1. **Duplicate tracking** - Both track "is this URL loaded" separately
2. **Different APIs** - `hasLoadedImage(url)` vs `isInPreloaderCache(url)`
3. **Global window state** - `window.videoGalleryPreloaderCache` is messy
4. **Partial coordination** - Service clears video cache on project switch, but systems don't share state

---

## Design Decisions

### Keep Separate: URL Fetching Logic
`useVideoGalleryPreloader` fetches thumbnail URLs directly from Supabase based on shot/page. This is intentionally separate from React Query because:
- It's preloading data, not display data
- Different sort order requirements
- Doesn't need React Query's refetching/staleness

### Unify: Image Loading + Tracking
Both systems ultimately do the same thing: load images and track what's loaded. Unify this.

### Handle: Image Ref Storage
Video gallery keeps `HTMLImageElement` refs to prevent browser cache eviction. Options:
1. **Add to service** - Service stores refs for all preloaded images
2. **Keep in hook** - Hook stores refs, service just tracks URLs
3. **Remove it** - Trust browser cache (risky on mobile)

**Decision**: Option 1 - Add ref storage to service. It's a legitimate optimization that benefits all preloading.

---

## Implementation Plan

### Phase 1: Extend Tracker to Store Image Refs

**File: `src/shared/lib/preloading/tracker.ts`**

Add ref storage alongside URL tracking:

```typescript
// Existing
const loadedImagesByUrl = new Map<string, { loadedAt: number; width?: number; height?: number }>();

// Add
const imageElementRefs = new Map<string, HTMLImageElement>();

export const markImageLoaded = (
  urlOrImage: string | TrackableImage,
  metadata?: { width?: number; height?: number; element?: HTMLImageElement }
): void => {
  if (typeof urlOrImage === 'string') {
    loadedImagesByUrl.set(urlOrImage, { loadedAt: Date.now(), ...metadata });
    // Store element ref if provided
    if (metadata?.element) {
      imageElementRefs.set(urlOrImage, metadata.element);
    }
    // ... limit enforcement
  }
  // ... rest
};

// Add method to get stored element (for cache verification)
export const getImageElement = (url: string): HTMLImageElement | undefined => {
  return imageElementRefs.get(url);
};

// Update clearAllLoadedImages to also clear refs
export const clearAllLoadedImages = (reason: string): number => {
  const prevSize = loadedImagesById.size;
  loadedImagesById.clear();
  loadedImagesByUrl.clear();
  imageElementRefs.clear();  // Add this
  // ...
};
```

### Phase 2: Update Queue to Store Refs on Load

**File: `src/shared/lib/preloading/queue.ts`**

Modify `loadImage` to return the element:

```typescript
private loadImage(url: string): Promise<HTMLImageElement> {  // Return element
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      img.onload = null;
      img.onerror = null;
      resolve(img);  // Return the element
    };
    img.onerror = () => {
      img.onload = null;
      img.onerror = null;
      reject(new Error(`Failed to load image: ${url}`));
    };
    img.src = url;
  });
}
```

### Phase 3: Update Preloader to Pass Refs to Tracker

**File: `src/shared/lib/preloading/preloader.ts`**

```typescript
try {
  const element = await queue.add(url, priority - idx);
  if (img.id) {
    setImageLoadStatus(img as { id: string }, true);
  }
  // Store the element ref
  markImageLoaded(url, { element });
} catch {
  // Preloading is best-effort
}
```

### Phase 4: Refactor useVideoGalleryPreloader

**File: `src/shared/hooks/useVideoGalleryPreloader.ts`**

Replace custom loading with service calls:

```typescript
// Before
const preloadImage = useCallback((url: string): Promise<void> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      window.videoGalleryPreloaderCache!.preloadedImageRefs.set(url, img);
      resolve();
    };
    // ...
  });
}, []);

// After
import { preloadingService, PRIORITY } from '@/shared/lib/preloading';

// In the preload task:
const preloadTask = async () => {
  const urls = await buildThumbnailUrlsForPage(shotId, pageIndex);

  // Convert URLs to PreloadableImage format
  const images = urls.map(url => ({ url, thumbUrl: url }));

  // Use shared service (it handles tracking, queueing, ref storage)
  await preloadingService.preloadImages(images, PRIORITY.low);

  // Mark page as preloaded (shot-specific tracking stays here)
  if (!preloadedPagesByShot.current[shotId]) {
    preloadedPagesByShot.current[shotId] = new Set();
  }
  preloadedPagesByShot.current[shotId].add(pageIndex);
};
```

**Key changes:**
- Remove `window.videoGalleryPreloaderCache.preloadedUrlSetByProject` - use shared tracker
- Remove `window.videoGalleryPreloaderCache.preloadedImageRefs` - service handles this
- Keep `preloadedPagesByShot` as local ref (shot-specific, not needed globally)
- Keep `hasStartedPreloadForProject` as local ref
- Remove custom queue processing - service handles concurrency

### Phase 5: Refactor useThumbnailLoader

**File: `src/tools/travel-between-images/components/VideoGallery/hooks/useThumbnailLoader.ts`**

Replace custom cache checks with shared tracker:

```typescript
// Before
import { ... } from somewhere
const isInPreloaderCache = (url: string): boolean => {
  const cache = window.videoGalleryPreloaderCache;
  // ... check cache.preloadedUrlSetByProject
};

// After
import { hasLoadedImage, getImageElement } from '@/shared/lib/preloading';

const isImagePreloaded = (url: string): boolean => {
  return hasLoadedImage(url);
};

const isInBrowserCache = (url: string): boolean => {
  // First check stored ref from preloading
  const storedImg = getImageElement(url);
  if (storedImg?.complete && storedImg.naturalWidth > 0) {
    return true;
  }
  // Fallback to creating test image
  // ...
};
```

### Phase 6: Remove Global Cache

**File: `src/shared/hooks/useVideoGalleryPreloader.ts`**

Remove:
```typescript
// DELETE THIS
if (!window.videoGalleryPreloaderCache) {
  window.videoGalleryPreloaderCache = { ... };
}
```

**File: `src/shared/lib/preloading/service.ts`**

Remove legacy cache cleanup:
```typescript
// DELETE THIS from onProjectChange
if (typeof window !== 'undefined' && window.videoGalleryPreloaderCache) {
  const cache = window.videoGalleryPreloaderCache;
  cache.preloadedUrlSetByProject = {};
  // ...
}
```

**File: Global type declarations**

Remove `Window.videoGalleryPreloaderCache` interface declarations from both files.

### Phase 7: Update Exports

**File: `src/shared/lib/preloading/index.ts`**

Add new export:
```typescript
export { getImageElement } from './tracker';
```

---

## Migration Checklist

- [ ] Phase 1: Add ref storage to tracker
- [ ] Phase 2: Update queue to return elements
- [ ] Phase 3: Update preloader to store refs
- [ ] Phase 4: Refactor useVideoGalleryPreloader
- [ ] Phase 5: Refactor useThumbnailLoader
- [ ] Phase 6: Remove window.videoGalleryPreloaderCache
- [ ] Phase 7: Update exports
- [ ] TypeScript compilation check
- [ ] Test: Video gallery thumbnails load without flash
- [ ] Test: Project switch clears all preload state
- [ ] Test: Back navigation shows cached thumbnails instantly

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/shared/lib/preloading/tracker.ts` | Add imageElementRefs Map, getImageElement export |
| `src/shared/lib/preloading/queue.ts` | Return HTMLImageElement from loadImage |
| `src/shared/lib/preloading/preloader.ts` | Pass element to markImageLoaded |
| `src/shared/lib/preloading/service.ts` | Remove legacy cache cleanup |
| `src/shared/lib/preloading/index.ts` | Export getImageElement |
| `src/shared/hooks/useVideoGalleryPreloader.ts` | Use service instead of custom loading |
| `src/tools/.../useThumbnailLoader.ts` | Use shared tracker instead of window cache |

---

## Risks

1. **Browser cache behavior** - Storing refs works, but behavior varies across browsers. Test on Safari/mobile.
2. **Memory pressure** - Storing all preloaded image refs could use more memory. Mitigated by existing limit enforcement.
3. **Race conditions** - Service clears on project switch; ensure useThumbnailLoader doesn't read stale state.

---

## Verification

1. `npx tsc --noEmit` - TypeScript compiles
2. Navigate video gallery pages - thumbnails preload without flash
3. Switch projects - `__PRELOADING_SERVICE__.getDiagnostics()` shows clean state
4. Back navigation - cached thumbnails appear instantly
5. Mobile testing - no memory issues, thumbnails still cached
