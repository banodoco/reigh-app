# Image Loading System

**Source of truth**: `src/shared/lib/imageLoadingPriority.ts` (all timing/strategy config)

Progressive image loading with device-adaptive batching. Images cascade top-to-bottom on purpose (time-based, not scroll-dependent) to give immediate feedback, prevent browser overload, and create a predictable reveal pattern.

## Core Files

| File | Purpose |
|------|---------|
| `src/shared/components/ProgressiveLoadingManager.tsx` | Orchestrates progressive revealing via `showImageIndices` |
| `src/shared/components/ImagePreloadManager.tsx` | Background preloading of adjacent pages |
| `src/shared/hooks/useProgressiveImageLoading.ts` | Session management, timing, race-condition protection |
| `src/shared/hooks/useAdjacentPagePreloading.ts` | Priority queue, device adaptation, 1-3 concurrent reqs |
| `src/shared/lib/imageCacheManager.ts` | Cache status tracking, automatic cleanup at 500 images |
| `src/shared/lib/imageLoadingPriority.ts` | Strategy calculation, device detection, config |

## Data Flow

```
MediaGallery
├── ProgressiveLoadingManager (current page)
│   └── useProgressiveImageLoading
│       ├── Gets timing from imageLoadingPriority
│       ├── Checks cache via imageCacheManager
│       └── Provides showImageIndices to children
└── ImagePreloadManager (adjacent pages)
    └── useAdjacentPagePreloading
        ├── Preloads prev/next page images (60ms intervals)
        └── Updates imageCacheManager cache
```

## Device-Adaptive Batching

| Device Type | Initial Batch | Stagger Delay | Max Delay |
|-------------|---------------|---------------|-----------|
| Very Low-End Mobile | 2 images | 60ms | 150ms |
| Low-End / Mobile | 3 images | 40-50ms | 120ms |
| Desktop / High-End | 4 images | 25ms | 100ms |

Device capability detected automatically from memory, CPU cores, and connection speed.

## Loading Priority Order

| Priority | Delay | Condition |
|----------|-------|-----------|
| Preloaded images | 0ms | `isImageCached(image)` returns true |
| First image | 0ms | Always instant |
| Initial batch (2-4) | 8ms increments | 8ms, 16ms, 24ms |
| Remaining images | Device stagger | 25-60ms with device-specific cap |

## Cache Handoff

The critical path for preloaded images bypassing delays:

```
setImageCacheStatus(url, 'loaded')  ->  isImageCached(url) returns true  ->  progressiveDelay = 0
```

Adjacent pages preload in background (400-800ms debounce after navigation). When user navigates to a preloaded page, all images display instantly.

## Performance Auto-Adjustment

The system tracks actual image load times and adjusts delays with a 0.5x-2.0x multiplier:
- Average load time >500ms: delays increase (slower stagger to reduce contention)
- Fast loads: delays decrease toward minimums

## Memory Management

- Cache auto-cleanup triggers at 500 cached images (oldest evicted first)
- `AbortController` cancels in-flight preload fetches on page change
- Unique session IDs prevent race conditions between overlapping load sequences

## Navigation Scenarios

| Scenario | Behavior |
|----------|----------|
| First visit | Images 0-3 instant, rest cascade at 25-40ms intervals |
| Adjacent page | All images instant (preloaded and cached) |
| Distant page | Images 0-3 instant, rest cascade, new adjacent pages start preloading |

## API

```typescript
const strategy = getImageLoadingStrategy(index, {
  isMobile,
  totalImages: images.length,
  isPreloaded: isImageCached(image)
});
// Returns: { shouldLoadInInitialBatch, progressiveDelay, batchGroup }
```

Individual items should NOT invent their own delays -- progressive loading is the single mechanism.

## Debugging

Console log tags:

| Tag | What it shows |
|-----|---------------|
| `[PAGELOADINGDEBUG]` | Progressive loading lifecycle, session IDs |
| `[GalleryDebug]` | Gallery state changes, strategy decisions |
| `[ItemDebug]` | Individual image timing |
| `[PRELOAD]` | Adjacent page preloading operations |

Browser console debugger:

```javascript
window.imageLoadingDebugger.logCurrentIssues()   // comprehensive diagnostics
window.imageLoadingDebugger.getGalleryState()     // current gallery state
window.imageLoadingDebugger.getCacheState()        // cache contents
window.imageLoadingDebugger.diagnoseStuckPage()    // stuck page troubleshooting
```
