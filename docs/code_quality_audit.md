# Code Quality Audit

Current state assessment of the codebase. Last updated: 2026-02-02.

---

## Summary

| Category | Status | Details |
|----------|--------|---------|
| Giant components (>2000 LOC) | ✅ None | All critical components refactored |
| Components 1000-2000 LOC | ⚠️ 6 remain | Page components and complex galleries |
| Hook-heavy components (60+ hooks) | ⚠️ 2 remain | VideoTravelToolPage (106), ImageGenerationToolPage (62) |
| Type safety (`any` usage) | ❌ ~1,980 instances | Across ~408 files |
| Double-casts (`as unknown as`) | ⚠️ 8 files | Reduced from 15 |
| Cache invalidation | ✅ Centralized | `queryKeys.ts` + domain hooks |
| Error handling | ✅ Standardized | `handleError()` throughout |
| Console logging | ✅ Production-safe | Suppressed via logger system |

---

## Needs Attention

### 1. Hook-Heavy Page Components

Pages with excessive hooks indicating scattered state:

| File | Lines | Hooks |
|------|-------|-------|
| `VideoTravelToolPage.tsx` | 1,823 | 106 |
| `ImageGenerationToolPage.tsx` | 1,174 | 62 |
| `JoinClipsPage.tsx` | 1,824 | 40 |

**Fix:** Extract into composite hooks (`usePageState`, `usePageActions`).

### 2. Large Components (1000-2000 lines)

| File | Lines | Issue |
|------|-------|-------|
| `MediaGalleryItem.tsx` | 1,696 | Rendering + interactions + drag/drop |
| `VideoItem.tsx` | 1,504 | Video item + interactions |
| `SettingsModal.tsx` | 1,320 | Modal + multiple tabs |
| `ImageLightbox.tsx` | 1,303 | Orchestrator (acceptable) |
| `VideoGallery/index.tsx` | 1,202 | Gallery + filtering + actions |
| `ShotEditor/index.tsx` | 1,190 | Orchestrator (acceptable) |
| `VideoLightbox.tsx` | 1,071 | Orchestrator (acceptable) |

**Recently refactored (no longer issues):**
- `PhaseConfigSelectorModal.tsx`: 1,973 → 287 lines ✅
- `GuidanceVideoStrip.tsx`: 1,456 → 683 lines ✅
- `ImageGenerationForm/index.tsx`: 1,164 → 52 lines ✅

### 3. Type Safety

**~1,980 `any` usages** across ~408 files. Top files:

| File | Count |
|------|-------|
| `useLightboxLayoutProps.ts` | 41 |
| `SimpleRealtimeManager.ts` | 39 |
| `SharedMetadataDetails.tsx` | 28 |
| `useSegmentOutputsForShot.ts` | 26 |
| `VideoGallery/index.tsx` | 26 |
| `ShotImageManagerDesktop.tsx` | 25 |
| `useUnifiedGenerations.ts` | 23 |

### 4. Oversized Hooks (>800 lines)

| Hook | Lines |
|------|-------|
| `useGenerationActions.ts` | 1,222 |
| `useGenerations.ts` | 938 |
| `useShotGenerationMutations.ts` | 925 |
| `useReferenceManagement.ts` | 909 |
| `useUnifiedGenerations.ts` | 870 |
| `useRepositionMode.ts` | 859 |
| `useTimelinePositionUtils.ts` | 856 |
| `useGenerationsPageLogic.ts` | 855 |

### 5. Hardcoded Colors

**181 instances** of hex/rgb/hsl literals instead of Tailwind theme:

| File | Count |
|------|-------|
| `GlobalHeader.tsx` | 40 |
| `HeroSection.tsx` | 23 |
| `select.tsx` | 11 |

---

## Good Patterns in Place

| Area | Location | Pattern |
|------|----------|---------|
| Hook decomposition | `src/shared/hooks/shots/` | 10 focused files from monolith |
| Query/mutation separation | `src/shared/hooks/segments/` | Clean split + `useServerForm` |
| Component decomposition | `ShotImagesEditor/` | 3,775 → 32 line index |
| Context for state | `ImageGenerationFormContext` | Eliminates prop drilling |
| Cache keys | `src/shared/lib/queryKeys.ts` | Centralized registry |
| Error handling | `src/shared/lib/errorHandler.ts` | `handleError()` with context |
| Lightbox architecture | `MediaLightbox/` | Shell + orchestrators + contexts |

---

## Recommended Priorities

### Quick Wins
1. Fix 8 double-casts (real type safety improvement)
2. Type the top `any` files (`useLightboxLayoutProps.ts`, `SimpleRealtimeManager.ts`)

### Medium Effort
3. Split `useGenerationActions.ts` (1,222 lines)
4. Split `useGenerations.ts` (938 lines)

### Larger Effort
5. Decompose `VideoTravelToolPage.tsx` (106 hooks)
6. Migrate hardcoded colors to theme (181 instances)

---

## Example Refactors

| Before | After |
|--------|-------|
| `ShotImagesEditor.tsx` (3,775 lines) | `ShotImagesEditor/` (32 line index + 13 files) |
| `useShots.ts` (2,350 lines) | `hooks/shots/` (10 files) |
| `MediaLightbox.tsx` (2,617 lines) | `MediaLightbox/` (189 line shell + 90 files) |
| `useSegmentSettings.ts` (1,160 lines) | `hooks/segments/` (5 files) |
| `PhaseConfigSelectorModal.tsx` (1,973 lines) | `PhaseConfigSelectorModal/` (287 line component) |
| `ImageGenerationForm/index.tsx` (1,164 lines) | Decomposed (52 line index) |
