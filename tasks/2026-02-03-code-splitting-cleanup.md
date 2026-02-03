# Code Splitting & Bundle Optimization

## Current State
- **Main bundle**: 3.5MB (982KB gzipped) - quite large
- **6 mixed import warnings** from Vite (modules imported both dynamically and statically)
- **4 properly split chunks**: EditImagesPage, PromptEditorModal, TrainingDataHelperPage, jszip

## Key Constraints (discovered during analysis)
- **Safari mobile** has issues with dynamic imports for routes - this is why most tool pages are eagerly loaded
- **TanStack Query** has issues with lazy loaded pages
- These are documented in `src/app/routes.tsx` comments

## Dynamic Import Analysis (16 total)

| Module | Dynamic Imports | Static Imports | Action |
|--------|-----------------|----------------|--------|
| `jszip` | 3 | 0 | ✅ Keep (correct) |
| `supabase/client` | 2 | 90+ | ❌ Remove dynamic |
| `sonner` (toast) | 4 | 60+ | ❌ Remove dynamic |
| `imageUploader` | 1 | 13 | ❌ Remove dynamic |
| `useToolSettings` | 1 | 27 | ❌ Remove dynamic |
| `videoUploader` | 2 | 5 | ❌ Remove dynamic |
| `ReconnectScheduler` | 2 | 1 | ❌ Remove dynamic |
| Test file | 1 | 0 | ✅ Ignore |

## React.lazy Analysis (4 total)

| Usage | Location | Notes |
|-------|----------|-------|
| `EditImagesPage` | routes.tsx | ✅ Correct |
| `TrainingDataHelperPage` | routes.tsx | ✅ Correct |
| `LoraSelectorModal` | ImageGenerationForm | Inconsistent (7 other static imports) |
| `PromptEditorModal` | ImageGenerationForm | ✅ Correct |

## Master Checklist

### Phase 1: Quick Wins - Remove Spurious Dynamic Imports
- [ ] **1.1** Remove dynamic import of `supabase/client.ts` (2 files use dynamic, 90+ use static)
  - `src/shared/components/CreditsManagement/hooks/useTaskLogDownload.ts`
  - `src/shared/lib/logger.ts`
- [ ] **1.2** Remove dynamic import of `sonner` (5 files use dynamic, 60+ use static)
  - `src/shared/components/ShotImageManager/ShotImageManagerMobile.tsx` (3 uses)
  - `src/shared/components/ShotImageManager/hooks/useDragAndDrop.ts`
  - `src/tools/travel-between-images/components/ShotEditor/hooks/useApplySettingsHandler.ts`
- [ ] **1.3** Remove dynamic import of `imageUploader.ts` (1 file uses dynamic)
  - `src/shared/lib/clientThumbnailGenerator.ts`
- [ ] **1.4** Remove dynamic import of `useToolSettings.ts` (1 file uses dynamic)
  - `src/shared/components/ImageGenerationForm/hooks/useGenerationSource.ts`
- [ ] **1.5** Remove dynamic import of `videoUploader.ts` (2 files use dynamic)
  - `src/tools/travel-between-images/components/Timeline/TimelineContainer/components/AddAudioButton.tsx`
  - `src/tools/travel-between-images/components/Timeline/TimelineContainer/components/GuidanceVideoControls.tsx`
- [ ] **1.6** Remove dynamic import of `ReconnectScheduler.ts` (2 files use dynamic)
  - `src/integrations/supabase/auth/AuthStateManager.ts`
  - `src/integrations/supabase/instrumentation/realtime/index.ts`

### Phase 2: Consistent Lazy Loading for Large Optional Components
- [ ] **2.1** Make `LoraSelectorModal` consistently lazy-loaded
  - Currently: 1 dynamic (ImageGenerationForm), 7 static imports
  - Convert all 7 static imports to use `React.lazy()`
  - Files to update:
    - `src/shared/components/LoraManager.tsx`
    - `src/shared/components/MediaLightbox/components/EditModePanel.tsx`
    - `src/shared/components/PhaseConfigSelectorModal/components/sections/PhaseConfigSection.tsx`
    - `src/shared/components/PhaseConfigVertical.tsx`
    - `src/shared/components/SegmentSettingsForm/SegmentSettingsForm.tsx`
    - `src/tools/travel-between-images/components/ShotEditor/sections/ModalsSection.tsx`
    - `src/tools/travel-between-images/components/VideoGenerationModal.tsx`

### Phase 3: Route-Based Code Splitting
- [ ] **3.1** Audit current route lazy loading in `src/app/routes.tsx`
- [ ] **3.2** Ensure all tool pages are lazy loaded:
  - `CharacterAnimatePage`
  - `EditVideoPage`
  - `JoinClipsPage`
  - `ImageGenerationToolPage`
  - `VideoTravelToolPage`
- [ ] **3.3** Add loading fallbacks (Suspense boundaries) at route level

### Phase 4: Manual Chunks Configuration
- [ ] **4.1** Add manual chunks to `vite.config.ts`:
  ```typescript
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-tanstack': ['@tanstack/react-query'],
          'vendor-radix': [/* radix-ui packages */],
          'vendor-konva': ['konva', 'react-konva'],
        }
      }
    }
  }
  ```
- [ ] **4.2** Test bundle output after manual chunks

### Phase 5: Large Component Analysis (Requires Careful Consideration)

**Large components identified:**
| Component | Lines | Notes |
|-----------|-------|-------|
| `ImageLightbox.tsx` | 1296 | Core feature, used frequently |
| `VideoLightbox.tsx` | 1064 | Core feature, used frequently |
| `ShotEditor/index.tsx` | 1200 | Main editing interface |
| `VideoGallery/index.tsx` | 1181 | Core gallery view |
| `MediaGallery/index.tsx` | 1027 | Core gallery view |

- [ ] **5.1** Evaluate if Konva (canvas library, 9 imports) can be lazy loaded
  - Only needed for inpainting/annotation features
  - Files using Konva:
    - `src/shared/components/MediaLightbox/components/StrokeOverlay.tsx`
    - `src/shared/components/MediaLightbox/hooks/inpainting/*.ts`
  - Could lazy load the entire inpaint mode feature
- [ ] **5.2** Consider splitting lightbox into shell + content
  - Load shell immediately, lazy load heavy content
  - Tricky due to state management
- [ ] **5.3** Evaluate SettingsModal lazy loading (276 lines - lower priority)

### Phase 6: Additional Cleanup (Optional)
- [ ] **6.1** Remove unused exports from barrel files
- [ ] **6.2** Audit for circular dependencies
- [ ] **6.3** Check if any shadcn components can use tree-shaking better

---

## Task Details

### 1.1 Remove dynamic import of supabase/client.ts

**Files to modify:**
- `src/shared/components/CreditsManagement/hooks/useTaskLogDownload.ts`
- `src/shared/lib/logger.ts`

**Change from:**
```typescript
const { supabase } = await import('@/integrations/supabase/client');
```

**Change to:**
```typescript
import { supabase } from '@/integrations/supabase/client';
```

**Rationale:** This module is used in 90+ places statically. Dynamic imports provide zero benefit.

---

### 1.2 Remove dynamic import of sonner

**Files to modify:**
- `src/shared/components/ShotImageManager/ShotImageManagerMobile.tsx`
- `src/shared/components/ShotImageManager/hooks/useDragAndDrop.ts`
- `src/tools/travel-between-images/components/ShotEditor/hooks/useApplySettingsHandler.ts`

**Change from:**
```typescript
const { toast } = await import('sonner');
```

**Change to:**
```typescript
import { toast } from 'sonner';
```

**Rationale:** Toast is used throughout the app. No benefit to dynamic import.

---

### 2.1 Make LoraSelectorModal consistently lazy

**Pattern to use:**
```typescript
// In each file that imports LoraSelectorModal
const LoraSelectorModal = lazy(() =>
  import('@/shared/components/LoraSelectorModal').then(m => ({ default: m.LoraSelectorModal }))
);

// Wrap usage in Suspense
<Suspense fallback={<LoadingSpinner />}>
  {showLoraModal && <LoraSelectorModal ... />}
</Suspense>
```

**Rationale:** LoraSelectorModal is large and only shown when user clicks a button. Perfect candidate for lazy loading.

---

### 4.1 Manual Chunks Configuration

**Add to `vite.config.ts`:**
```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React ecosystem
          if (id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react-router')) {
            return 'vendor-react';
          }
          // Supabase
          if (id.includes('node_modules/@supabase')) {
            return 'vendor-supabase';
          }
          // TanStack Query
          if (id.includes('node_modules/@tanstack')) {
            return 'vendor-tanstack';
          }
          // Radix UI
          if (id.includes('node_modules/@radix-ui')) {
            return 'vendor-radix';
          }
          // Konva (canvas library)
          if (id.includes('node_modules/konva') ||
              id.includes('node_modules/react-konva')) {
            return 'vendor-konva';
          }
        }
      }
    }
  }
});
```

---

## Expected Impact

| Phase | Effort | Main Bundle Reduction | Load Time Impact |
|-------|--------|----------------------|------------------|
| Phase 1 | Low | ~0% (cleanup only) | Cleaner builds, removes warnings |
| Phase 2 | Medium | ~2-5% | Faster initial load |
| Phase 3 | Low | Limited due to Safari | Audit only |
| Phase 4 | Low | Better caching | Faster repeat visits |
| Phase 5 | High | ~10-20% (if Konva lazy) | Significant for non-edit users |

**Realistic Target:** Reduce main bundle from 982KB to ~700-800KB gzipped.

**Why not 500KB?** Safari mobile constraints prevent lazy loading most routes. The bulk of the bundle is:
- Core UI (shadcn/radix) - 407 imports, can't reduce
- TanStack Query - 119 imports, can't reduce
- Supabase client - used everywhere
- Tool pages - can't lazy load (Safari)

---

## Notes

- Phase 1 is quick wins that can be done in a single session
- Phase 2 requires careful testing of each modal
- Phase 4 may require iteration to find optimal chunk boundaries
- Always verify builds work after each change
