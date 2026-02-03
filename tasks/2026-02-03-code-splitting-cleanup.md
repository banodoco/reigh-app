# Code Splitting & Bundle Optimization - Comprehensive Plan

## Executive Summary

**Initial State:** 3.5MB main bundle (982KB gzipped)
**Current State:** 2.9MB main bundle (783KB gzipped) - **~20% reduction achieved**
**Target:** 600-700KB gzipped (30% reduction)

## Completed Work

### Phase 1: Dead Code Removal - COMPLETED
- Deleted 12 unused shadcn components (3 were actually used: alert-dialog, hover-card, pagination)
- Removed recharts, embla-carousel-react, react-day-picker, input-otp, react-resizable-panels
- Removed @radix-ui packages for deleted components

### Phase 2: Fix Mixed Dynamic Imports - COMPLETED
- Fixed `sonner` in ShotImageManagerMobile.tsx, useDragAndDrop.ts, useApplySettingsHandler.ts
- Fixed `imageUploader` in clientThumbnailGenerator.ts
- Fixed `useToolSettings` in useGenerationSource.ts
- Fixed `videoUploader` in AddAudioButton.tsx, GuidanceVideoControls.tsx
- **Intentionally kept dynamic:**
  - `supabase/client` in logger.ts (circular dependency avoidance)
  - `ReconnectScheduler` in AuthStateManager.ts, realtime/index.ts (intentional lazy loading in async callbacks)

### Phase 3: Lazy Load Optional Features - COMPLETED
- Lazy loaded `ProductTour` in Layout.tsx with Suspense
- Lazy loaded `LineageGifModal` in VariantSelector/index.tsx with Suspense
- Added ProductTour preload when onboarding modal opens (user request)

### Phase 6: Vendor Chunk Optimization - COMPLETED
Added manual chunks in vite.config.ts:
- `vendor-react` (157KB) - react-dom, scheduler
- `vendor-query` (44KB) - @tanstack/react-query
- `vendor-radix` (133KB) - @radix-ui components
- `vendor-dnd` (58KB) - @dnd-kit
- `vendor-supabase` (109KB) - @supabase client
- `vendor-date` (10KB) - date-fns

## Remaining Build Warnings (Intentional)

These warnings are for valid patterns and should not be "fixed":

1. **ReconnectScheduler** - Dynamic imports inside async callbacks for lazy loading
2. **supabase/client** - Dynamic import in logger.ts for circular dependency avoidance
3. **LoraSelectorModal** - Type imported statically, component imported via React.lazy (correct pattern)

---

## Remaining Work (Optional)

### Phase 4: Consistent Lazy Loading for LoraSelectorModal (~15KB savings)
**Status:** Optional - the current mixed pattern is valid (type static, component lazy)

### Phase 5: Lazy Load Konva for Edit Mode (~100KB savings)
**Status:** Optional - high risk, only if needed

### Phase 7: Package Cleanup
**Status:** Optional - audit dependencies

---

## Results Summary

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Main bundle (raw) | 3,526 KB | 2,892 KB | -18% |
| Main bundle (gzip) | 982 KB | 783 KB | -20% |
| Build warnings (actionable) | 6 | 0 | Resolved |
| Code-split chunks | 4 | 8 | Better caching |
| Vendor chunks | 0 | 6 | Improved repeat visits |

---

## Key Constraints (Reference)

| Constraint | Impact | Source |
|------------|--------|--------|
| Safari mobile dynamic import bugs | Cannot lazy load routes | `src/app/routes.tsx` comments |
| TanStack Query lazy load issues | Cannot lazy load pages with queries | `src/app/routes.tsx` comments |
| Core UI library (shadcn/radix) | 407 imports, must load | Foundational |
| Supabase client | Used in 90+ files | Foundational |
