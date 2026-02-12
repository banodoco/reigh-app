# P1: Dead Code & Vestigial Patterns Cleanup

> Parent: `2026-02-13-master-ugliness-plan.md`
> Effort: Low (1 session)
> Risk: Low — removing confirmed-dead code

## Master Checklist

- [ ] 1. Remove `useToolPageHeader` from `ToolPageHeaderContext.tsx`
- [ ] 2. Remove `useGenerationTaskPreloader` from `GenerationTaskContext.tsx`
- [ ] 3. Remove `useEnhancedGenerations` from `GenerationTaskContext.tsx`
- [ ] 4. Remove `invalidateGenerationUpdate` from `useGenerationInvalidation.ts` + update `data_fetching.md` docs
- [ ] 5. Remove empty useEffect in `ProjectContext.tsx` (~lines 148-153)
- [ ] 6. Clean `useUpscale` dead fields — remove 5 backwards-compat stubs + update consumers
- [ ] 7. Remove `promptsByShot` and `masterPromptByShot` type fields (migration debris)
- [ ] 8. Fix misleading DEPRECATED comments on `dimensionSource`/`customWidth`/`customHeight` (still actively used)

---

## Item Details

### 1. useToolPageHeader
- **File:** `src/shared/contexts/ToolPageHeaderContext.tsx` lines 16-25
- **Status:** Dead, marked with `void useToolPageHeader;`
- **Action:** Delete the function. `useHeaderState` (lines 51-57) is the active replacement.

### 2-3. useGenerationTaskPreloader + useEnhancedGenerations
- **File:** `src/shared/contexts/GenerationTaskContext.tsx` lines 93-121
- **Status:** Both dead, both marked with `void` pattern
- **Action:** Delete both functions and their void markers.

### 4. invalidateGenerationUpdate
- **File:** `src/shared/hooks/invalidation/useGenerationInvalidation.ts` lines 277-314
- **Status:** Dead, not exported, but documented in `data_fetching.md`
- **Action:** Delete function + void marker. Remove from `data_fetching.md` table.
- **Note:** Sister function `invalidateVariantChange` IS used — don't touch it.

### 5. Empty useEffect in ProjectContext
- **File:** `src/shared/contexts/ProjectContext.tsx` ~lines 148-153
- **Status:** Empty body, empty cleanup. Comment says "CRITICAL: Log component mount/unmount" but does nothing.
- **Action:** Delete the useEffect.

### 6. useUpscale backwards-compat stubs
- **File:** `src/shared/components/MediaLightbox/hooks/useUpscale.ts` lines 119-132
- **Dead fields:** `showingUpscaled`, `handleToggleUpscaled`, `sourceUrlForTasks`, `isPendingUpscale`, `hasUpscaledVersion`, `upscaledUrl`
- **Consumers:** `InlineEditView.tsx` passes dead fields to `BottomLeftControls` (lines 808-812)
- **Action:**
  1. Remove dead fields from `UseUpscaleReturn` interface
  2. Remove stub implementations from return object
  3. Remove dead props from `BottomLeftControls` component
  4. Remove dead prop passing from `InlineEditView.tsx`

### 7. promptsByShot / masterPromptByShot
- **Files:** `src/tools/image-generation/settings.ts` lines 38,49,63,78; `ImageGenerationForm/types.ts` line 80-81
- **Status:** Type-only, never used at runtime. Being actively deleted in `projectSettingsInheritance.ts`.
- **Action:** Remove from type definitions. Verify no runtime code references them (confirmed none).

### 8. Misleading DEPRECATED comments
- **File:** `src/tools/travel-between-images/settings.ts` lines 40-42
- **Status:** `dimensionSource`, `customWidth`, `customHeight` marked "DEPRECATED" but actively used in `ShotEditorView.tsx`, `VideoGenerationModal.tsx`, `BatchSettingsForm.tsx`
- **Action:** Update comments to say "Legacy — used by travel tool, may be replaced with aspect-ratio-only in future" instead of DEPRECATED.
