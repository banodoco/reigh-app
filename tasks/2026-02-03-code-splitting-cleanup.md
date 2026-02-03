# Code Splitting & Bundle Optimization - Comprehensive Plan

## Executive Summary

**Current State:** 3.5MB main bundle (982KB gzipped)
**Realistic Target:** 600-700KB gzipped (30% reduction)
**Quick Wins Available:** Yes - dead code removal alone could save 50-100KB

## Key Constraints

| Constraint | Impact | Source |
|------------|--------|--------|
| Safari mobile dynamic import bugs | Cannot lazy load routes | `src/app/routes.tsx` comments |
| TanStack Query lazy load issues | Cannot lazy load pages with queries | `src/app/routes.tsx` comments |
| Core UI library (shadcn/radix) | 407 imports, must load | Foundational |
| Supabase client | Used in 90+ files | Foundational |

---

## Analysis Results

### 1. Dynamic Import Issues (12 files to fix)

| Module | Dynamic | Static | Action |
|--------|---------|--------|--------|
| `supabase/client` | 2 | 90+ | Remove dynamic |
| `sonner` (toast) | 4 | 60+ | Remove dynamic |
| `imageUploader` | 1 | 13 | Remove dynamic |
| `useToolSettings` | 1 | 27 | Remove dynamic |
| `videoUploader` | 2 | 5 | Remove dynamic |
| `ReconnectScheduler` | 2 | 1 | Remove dynamic |
| `jszip` | 3 | 0 | ✅ Keep (correct) |

### 2. Dead Code Found (15 unused shadcn components + recharts)

**Unused shadcn components in `src/shared/components/ui/`:**
- `accordion.tsx`
- `alert-dialog.tsx`
- `aspect-ratio.tsx`
- `avatar.tsx`
- `calendar.tsx`
- `carousel.tsx`
- `chart.tsx` ← Also removes **recharts** dependency (~50KB)
- `context-menu.tsx`
- `drawer.tsx`
- `hover-card.tsx`
- `input-otp.tsx`
- `menubar.tsx`
- `navigation-menu.tsx`
- `pagination.tsx`
- `resizable.tsx`

**Estimated savings:** 50-100KB (recharts alone is ~50KB minified)

### 3. Lazy Loading Opportunities

| Component | Current | Usage | Potential Savings |
|-----------|---------|-------|-------------------|
| `ProductTour` (react-joyride) | Eager in Layout | Optional feature | ~40KB |
| `LineageGifModal` (gifenc) | Eager | Optional feature | ~20KB |
| `LoraSelectorModal` | Mixed (1 lazy, 7 static) | Modal | ~15KB |
| Konva (canvas library) | Eager | Edit mode only | ~100KB |

### 4. Large Components (>1000 LOC)

| Component | Lines | Notes |
|-----------|-------|-------|
| `ImageLightbox.tsx` | 1296 | Core feature - difficult to split |
| `VideoLightbox.tsx` | 1064 | Core feature - difficult to split |
| `ShotEditor/index.tsx` | 1200 | Main tool - Safari constraint |
| `VideoGallery/index.tsx` | 1181 | Main tool - Safari constraint |
| `MediaGallery/index.tsx` | 1027 | Core feature |

---

## Master Checklist

### Phase 1: Dead Code Removal (Quick Win - ~100KB savings)
**Effort: Low | Risk: Low | Impact: Medium**

- [ ] **1.1** Delete unused shadcn components:
  ```
  rm src/shared/components/ui/accordion.tsx
  rm src/shared/components/ui/alert-dialog.tsx
  rm src/shared/components/ui/aspect-ratio.tsx
  rm src/shared/components/ui/avatar.tsx
  rm src/shared/components/ui/calendar.tsx
  rm src/shared/components/ui/carousel.tsx
  rm src/shared/components/ui/chart.tsx
  rm src/shared/components/ui/context-menu.tsx
  rm src/shared/components/ui/drawer.tsx
  rm src/shared/components/ui/hover-card.tsx
  rm src/shared/components/ui/input-otp.tsx
  rm src/shared/components/ui/menubar.tsx
  rm src/shared/components/ui/navigation-menu.tsx
  rm src/shared/components/ui/pagination.tsx
  rm src/shared/components/ui/resizable.tsx
  ```
- [ ] **1.2** Remove `recharts` from package.json (unused after chart.tsx removal)
- [ ] **1.3** Verify build succeeds
- [ ] **1.4** Measure bundle size change

### Phase 2: Fix Mixed Dynamic Imports (Cleanup - minimal size impact)
**Effort: Low | Risk: Low | Impact: Low (removes warnings)**

- [ ] **2.1** `supabase/client` - convert to static:
  - `src/shared/components/CreditsManagement/hooks/useTaskLogDownload.ts`
  - `src/shared/lib/logger.ts`
- [ ] **2.2** `sonner` - convert to static:
  - `src/shared/components/ShotImageManager/ShotImageManagerMobile.tsx` (3 places)
  - `src/shared/components/ShotImageManager/hooks/useDragAndDrop.ts`
  - `src/tools/travel-between-images/components/ShotEditor/hooks/useApplySettingsHandler.ts`
- [ ] **2.3** `imageUploader` - convert to static:
  - `src/shared/lib/clientThumbnailGenerator.ts`
- [ ] **2.4** `useToolSettings` - convert to static:
  - `src/shared/components/ImageGenerationForm/hooks/useGenerationSource.ts`
- [ ] **2.5** `videoUploader` - convert to static:
  - `src/tools/travel-between-images/components/Timeline/TimelineContainer/components/AddAudioButton.tsx`
  - `src/tools/travel-between-images/components/Timeline/TimelineContainer/components/GuidanceVideoControls.tsx`
- [ ] **2.6** `ReconnectScheduler` - convert to static:
  - `src/integrations/supabase/auth/AuthStateManager.ts`
  - `src/integrations/supabase/instrumentation/realtime/index.ts`
- [ ] **2.7** Verify all Vite warnings are gone

### Phase 3: Lazy Load Optional Features (~60KB savings)
**Effort: Medium | Risk: Medium | Impact: Medium**

#### 3.1 ProductTour (react-joyride) - ~40KB
- [ ] Create `LazyProductTour.tsx` wrapper
- [ ] Modify `src/app/Layout.tsx` to use lazy version
- [ ] Add Suspense boundary
- [ ] Test tour functionality

```typescript
// src/shared/components/ProductTour/LazyProductTour.tsx
import { lazy, Suspense } from 'react';

const ProductTour = lazy(() => import('./index'));

export const LazyProductTour = () => (
  <Suspense fallback={null}>
    <ProductTour />
  </Suspense>
);
```

#### 3.2 LineageGifModal (gifenc) - ~20KB
- [ ] Convert to lazy import in `VariantSelector/index.tsx`
- [ ] Add Suspense boundary
- [ ] Test GIF creation functionality

```typescript
const LineageGifModal = lazy(() =>
  import('@/shared/components/LineageGifModal')
);
```

### Phase 4: Consistent Lazy Loading for LoraSelectorModal (~15KB savings)
**Effort: Medium | Risk: Medium | Impact: Low**

Convert all 7 static imports to lazy:
- [ ] `src/shared/components/LoraManager.tsx`
- [ ] `src/shared/components/MediaLightbox/components/EditModePanel.tsx`
- [ ] `src/shared/components/PhaseConfigSelectorModal/components/sections/PhaseConfigSection.tsx`
- [ ] `src/shared/components/PhaseConfigVertical.tsx`
- [ ] `src/shared/components/SegmentSettingsForm/SegmentSettingsForm.tsx`
- [ ] `src/tools/travel-between-images/components/ShotEditor/sections/ModalsSection.tsx`
- [ ] `src/tools/travel-between-images/components/VideoGenerationModal.tsx`

### Phase 5: Lazy Load Konva for Edit Mode (~100KB savings)
**Effort: High | Risk: High | Impact: High**

Konva is only needed for inpainting/annotation. Files using Konva:
- `src/shared/components/MediaLightbox/components/StrokeOverlay.tsx`
- `src/shared/components/MediaLightbox/hooks/inpainting/*.ts`

Strategy:
- [ ] **5.1** Create `LazyStrokeOverlay` wrapper
- [ ] **5.2** Modify `ImageLightbox` to lazy load edit features
- [ ] **5.3** Add loading state for edit mode transition
- [ ] **5.4** Extensive testing of inpaint functionality

**Risk:** This is the highest-impact change but also highest-risk. The edit mode experience could feel slower.

### Phase 6: Vendor Chunk Optimization (Caching improvement)
**Effort: Low | Risk: Low | Impact: Medium (repeat visits)**

Add to `vite.config.ts`:
```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks(id) {
        if (id.includes('node_modules/react') ||
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-router')) {
          return 'vendor-react';
        }
        if (id.includes('node_modules/@supabase')) {
          return 'vendor-supabase';
        }
        if (id.includes('node_modules/@tanstack')) {
          return 'vendor-tanstack';
        }
        if (id.includes('node_modules/@radix-ui')) {
          return 'vendor-radix';
        }
        if (id.includes('node_modules/konva') ||
            id.includes('node_modules/react-konva')) {
          return 'vendor-konva';
        }
      }
    }
  }
}
```

- [ ] **6.1** Add manual chunks configuration
- [ ] **6.2** Verify chunk output
- [ ] **6.3** Test caching behavior

### Phase 7: Package Cleanup (Optional)
**Effort: Low | Risk: Low | Impact: Low**

Review and potentially remove unused dependencies:
- [ ] `@ffmpeg/core` - appears unused in src/
- [ ] `openai` - appears unused in src/ (Edge Functions only?)
- [ ] `drizzle-kit`, `drizzle-orm` - server-side only?
- [ ] `sharp` - server-side only?
- [ ] `postgres`, `pg` - server-side only?

---

## Implementation Order (Recommended)

| Order | Phase | Effort | Risk | Savings | Notes |
|-------|-------|--------|------|---------|-------|
| 1 | Phase 1 | Low | Low | ~100KB | Quick win, safe |
| 2 | Phase 2 | Low | Low | ~0KB | Cleanup, removes warnings |
| 3 | Phase 6 | Low | Low | Caching | Improves repeat visits |
| 4 | Phase 3 | Medium | Medium | ~60KB | Good ROI |
| 5 | Phase 4 | Medium | Medium | ~15KB | Consistency fix |
| 6 | Phase 7 | Low | Low | Varies | Audit only |
| 7 | Phase 5 | High | High | ~100KB | Only if needed |

---

## Expected Results

| Metric | Before | After Phase 1-4 | After All |
|--------|--------|-----------------|-----------|
| Main bundle (gzip) | 982KB | ~850KB | ~700KB |
| Build warnings | 6 | 0 | 0 |
| Vendor caching | Poor | Good | Good |
| First paint | Baseline | -5% | -15% |

---

## Testing Checklist

After each phase:
- [ ] `npm run build` succeeds
- [ ] No new TypeScript errors
- [ ] App loads correctly
- [ ] Core features work:
  - [ ] Image generation
  - [ ] Video travel
  - [ ] Gallery browsing
  - [ ] Lightbox/editing
  - [ ] Settings

After Phase 3-5:
- [ ] ProductTour works when triggered
- [ ] LineageGif modal creates GIFs
- [ ] LoraSelectorModal opens correctly
- [ ] Inpainting/annotation works

---

## Rollback Plan

Each phase can be reverted independently:
- Phase 1: `git checkout -- src/shared/components/ui/` + restore package.json
- Phase 2-4: Simple `git revert` of individual commits
- Phase 5-6: Revert vite.config.ts changes

---

## Notes

- Always measure bundle size after each phase
- Keep phases in separate commits for easy rollback
- Phase 5 (Konva) should only be attempted if other phases don't meet targets
- Safari constraints mean route-level splitting is limited
