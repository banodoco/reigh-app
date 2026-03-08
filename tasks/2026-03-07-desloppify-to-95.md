# Desloppify: 72.9 → 95+ Strict

**Score formula:** `40% mechanical (96.2%) + 60% subjective (57.3%) = 72.9`
**To hit 95:** subjective must reach ~94%. That means resolving ~90 of 100 open review issues.

**Commit strategy:** One commit per batch. Each batch is a coherent unit of work.
**Verify after each batch:** `npx tsc --noEmit && npx vitest run --reporter=verbose 2>&1 | tail -20`
**Rescan after each phase:** `desloppify scan --path . && desloppify status`

---

## Phase 1: Pure Deletions & Mechanical Cleanup (~2hrs, ~25 issues)

Zero-risk changes. Delete dead code, strip comments, fix names. Each batch touches independent files.

### Batch 1A: Delete paramsExtractors passthrough (issues: 9b116661)

**What:** `paramsExtractors.ts` has 4 functions that just call `taskParamContract.ts`. Delete the file, update 2 consumers.

1. Open `supabase/functions/complete_task/params.ts`
   - Lines 8-13: Change re-exports from `'./paramsExtractors.ts'` to import directly:
   ```ts
   export { extractBasedOnParam as extractBasedOn } from '../../../src/shared/lib/tasks/taskParamContract.ts';
   export { extractRunIdParam as extractOrchestratorRunId } from '../../../src/shared/lib/tasks/taskParamContract.ts';
   export { extractShotIdParam, extractAddInPositionParam } from '../../../src/shared/lib/tasks/taskParamContract.ts';
   export { extractOrchestratorRef as extractOrchestratorTaskId } from '../_shared/billing.ts';
   ```
   - For `extractShotAndPosition`: inline it in `params.ts`:
   ```ts
   export function extractShotAndPosition(params: unknown) {
     const shotId = extractShotIdParam(params) || undefined;
     const addInPosition = extractAddInPositionParam(params);
     return { shotId, addInPosition };
   }
   ```
2. Open `supabase/functions/complete_task/paramsGeneration.ts` line 3:
   - Change `import { extractBasedOn } from './paramsExtractors.ts'` → `import { extractBasedOn } from './params.ts'`
3. Delete `supabase/functions/complete_task/paramsExtractors.ts`

**Resolve:** `desloppify plan resolve "dead-code-deletion" --note "deleted paramsExtractors, updated params.ts and paramsGeneration.ts" --confirm`

### Batch 1B: Remove 49 stale test mocks (issues: b265d077)

**What:** 49 test files mock `@/shared/lib/compat/errorHandler` which no longer exists.

```bash
# Find and remove the mock lines (usually 1-3 lines each)
grep -rl "compat/errorHandler" src/ --include="*.test.*" | while read f; do
  # Remove the vi.mock block for this module
  sed -i '' '/vi\.mock.*compat\/errorHandler/,/});/d' "$f"
done
```

After running, verify no test file still references it:
```bash
grep -r "compat/errorHandler" src/ --include="*.test.*"
```

Run tests to confirm nothing breaks: `npx vitest run`

**Resolve:** `desloppify plan resolve "stale-test-mocks" --note "removed 49 dead vi.mock calls" --confirm`

### Batch 1C: Strip AI-generated JSDoc (issues: e7b20141, a0f0b4ce, d64393f6, f1ab33f6)

**Files and exact changes:**

1. `src/tools/travel-between-images/hooks/useClickOutside.ts`
   - Delete lines 16-39 (24 lines of JSDoc with 3 @example blocks). Keep the function signature — TypeScript types are sufficient.

2. `src/tools/travel-between-images/hooks/useOperationTracking.ts`
   - Delete lines 14-23 (10 lines restating function purpose). The hook name + types are self-documenting.

3. `src/tools/travel-between-images/hooks/video/useStableSkeletonVisibility.ts`
   - Delete lines 1-8 (file header JSDoc restating purpose).

4. `src/tools/travel-between-images/hooks/video/useTemporaryVisibility.ts`
   - Delete lines 3-23 (21 lines of @param/@returns/@example that restate types).

5. `supabase/functions/_shared/storagePaths.ts`
   - Delete per-method JSDoc comments that restate function names. Keep the file header explaining dual-repo sync pattern (lines 1-11) — that one is useful.

6. `src/tools/travel-between-images/components/ShotImagesEditor/types.ts`
   - Only 3 lines of intro comment. **Skip this file** — not worth touching.

**Resolve:** `desloppify plan resolve "ai-generated-jsdoc-cleanup" --note "stripped restating JSDoc from 5 files, skipped types.ts (only 3 lines)" --confirm`

### Batch 1D: Naming fixes (issues: aadc4bd5, c78ca3c2, bc71f84f, d985953c, 769d51df)

1. **EffectiveSettings alias** — `src/domains/media-lightbox/components/submitSegmentTask.ts` line 77
   - Delete `type EffectiveSettings = SegmentSettings;`
   - Replace all 6 uses in that file (lines 108, 144, 152, 180, 334, 345) with `SegmentSettings`

2. **processedLorasLength** → `filteredLoraCount`
   - `src/domains/lora/components/LoraSelectorModal/components/LoraSelectorFooter.tsx` line 12: rename prop
   - `src/domains/lora/components/LoraSelectorModal/LoraSelectorModal.tsx`: update prop name at callsite
   - `src/domains/lora/components/LoraSelectorModal/hooks/useLoraFilters.ts`: update export name

3. **setPageFn** → `onPageChange`
   - Same 3 files as above, plus:
   - `src/shared/components/PhaseConfigSelectorModal/PhaseConfigSelectorModal.tsx`
   - `src/shared/components/PhaseConfigSelectorModal/hooks/usePhaseConfigSelectorModalState.ts`

4. **UseUpdatingTimestampOptions** → `UseRelativeTimestampOptions`
   - `src/shared/hooks/useUpdatingTimestamp.ts` line 7: rename interface
   - No external consumers (only exported, never imported elsewhere)

5. **handleSetEditMode no-op** — `src/domains/media-lightbox/components/FloatingToolControls.tsx` line 72
   - Delete `const handleSetEditMode = (mode) => setEditMode(mode);`
   - Replace all uses of `handleSetEditMode` with `setEditMode` directly

**Resolve:** `desloppify plan resolve "naming-and-small-fixes" --note "renamed 5 symbols, inlined 1 no-op wrapper" --confirm`

### Batch 1E: Small type fixes (issues: f524a2e6, bd5451ca, 144078ff, b2ea4fad, 0b0a0bd1)

1. **Redundant array cast** — `src/shared/lib/generationTransformers.ts`
   - Find the `as Array<...>` assertion on Supabase query result. Remove it — Supabase types are already correct.

2. **VideoEnhanceResult self-reference** — `supabase/functions/calculate-task-cost/costHelpers.ts` lines 202-208
   - Split into two types:
   ```ts
   interface VideoEnhanceMetrics {
     interpolation_compute_seconds?: number;
     output_width?: number;
     output_height?: number;
     output_frames?: number;
   }
   interface VideoEnhanceResult extends VideoEnhanceMetrics {
     result?: VideoEnhanceMetrics;
   }
   ```

3. **BatchMagicEditTaskParams** — `src/shared/lib/tasks/magicEdit.ts`
   - Replace the 24-field duplication with: `type BatchMagicEditTaskParams = MagicEditTaskParams & { numImages: number };`
   - Update `validateBatchMagicEditParams` if it references the old fields directly

4. **Redundant async wrapper** — `src/tools/edit-images/hooks/useInlineEditState.ts`
   - Find the async arrow wrapper around `onNavigateToGeneration`. Replace with direct reference.

5. **Query key nullability** — `src/shared/hooks/segments/segmentOutputsQueries.ts`
   - Make `buildParentGenerationsQueryKey` require non-null `projectId` to match `fetchParentGenerations`, OR make `fetchParentGenerations` accept null and return `[]`.

**Resolve:** `desloppify plan resolve "type-safety-frontend" --note "fixed 5 type issues" --confirm`

---

## Phase 2: Multi-File Convention & Error Fixes (~4hrs, ~30 issues)

Coordinated changes across multiple files. Each batch has a single pattern applied consistently.

### Batch 2A: Toast migration — 20 files (issues: 4a07fb7b)

**What:** Change `from '@/shared/components/ui/toast'` → `from '@/shared/components/ui/runtime/sonner'` in all 20 files.

**Files (exact list):**
1. `src/shared/components/MediaGalleryItem/hooks/useShotActions.ts`
2. `src/shared/components/ShotSelectorWithAdd.tsx`
3. `src/shared/components/MediaGallery/hooks/useMediaGalleryActions.ts`
4. `src/shared/components/FileInput/useFileInputController.ts`
5. `src/shared/hooks/useShareGeneration.ts`
6. `src/shared/hooks/projects/useProjectCRUD.ts`
7. `src/domains/media-lightbox/components/SegmentSlotFormView.tsx`
8. `src/domains/media-lightbox/components/SegmentRegenerateForm.tsx`
9. `src/tools/travel-between-images/components/VideoGallery/hooks/useVideoItemJoinClips.ts`
10. `src/tools/join-clips/hooks/useClipManager.ts`
11. `src/tools/join-clips/hooks/useJoinClipsGenerate.ts`
12. `src/tools/character-animate/pages/hooks/useCharacterAnimateBaseState.ts`
13. `src/tools/travel-between-images/hooks/useShareActions.ts`
14. `src/features/tasks/components/TasksPane/components/TaskItemPreview.tsx`
15. `src/features/tasks/components/TasksPane/TaskItem.tsx`
16. `src/app/bootstrap.tsx`
17. `src/features/tasks/components/TasksPane/hooks/useTaskNavigation.ts`
18. `src/features/tasks/components/TasksPane/hooks/useTasksPaneCancelPending.ts`
19. `src/pages/Home/hooks/useHomePageRuntimeEffects.ts`

Also update toast call syntax if needed: `toast({...})` → `toast.error(...)` (check each file).

**Resolve:** `desloppify plan resolve "frontend-error-handling" --note "migrated 20 files from ui/toast to sonner" --confirm` (partial — rest of error cluster in 2B)

### Batch 2B: Error handling bypasses — 3 files (issues: 9856803d, 71093d52, c7de46fc)

1. `src/tools/travel-between-images/components/ShotEditor/hooks/actions/useApplySettingsHandler.ts`
   - Line 162-169: Remove pointless catch-rethrow of `fetchError`
   - Line 244-251: Replace `console.error(...); toast.error(...)` with `normalizeAndPresentError(error, { context: 'useApplySettingsHandler', showToast: true })`

2. `src/tools/travel-between-images/hooks/useShareActions.ts`
   - Line 106-114: Replace `console.error(...); toast({...})` with `normalizeAndPresentError(error, { context: 'useShareActions', showToast: true })`

3. `src/domains/billing/components/CreditsManagement/hooks/useAutoTopupState.ts`
   - Find optimistic update `onError` callbacks. Add `normalizeAndPresentError(error, { context: 'useAutoTopupState', showToast: true })` so users see why their setting reverted.

### Batch 2C: Edge function error & auth cleanup (issues: 32847c25, deef7335, 787eeb59, fc976d84)

1. **Extract `toErrorMessage`** — Create `supabase/functions/_shared/errorMessage.ts`:
   ```ts
   export function toErrorMessage(error: unknown): string {
     return error instanceof Error ? error.message : String(error);
   }
   ```
   Then find-and-replace the inline pattern across ~20 edge function files. (Agent found 20, not 39.)

2. **Remove redundant auth checks** from 13 edge functions:
   Delete the `if (!req.headers.get("authorization"))` block from:
   `claim-next-task`, `complete-auto-topup-setup`, `generate-pat`, `get-completed-segments`, `get-orchestrator-children`, `get-task-output`, `get-task-status`, `process-auto-topup`, `revoke-pat`, `setup-auto-topup`, `stripe-checkout`, `update-shot-pair-prompts`, and check `generate-upload-url` (may be in src/domains/).

3. **Replace raw status strings** in `supabase/functions/complete_task/orchestratorCore.ts` and `generation.ts` with constants from a shared enum.

4. **Use taskActorPolicy** in `get-predecessor-output/index.ts` and `get-orchestrator-children/index.ts` instead of inline ownership checks.

**Resolve:** `desloppify plan resolve "edge-function-error-and-auth" --note "extracted toErrorMessage, removed 13 redundant auth checks, standardized status strings, used taskActorPolicy" --confirm`

### Batch 2D: Logger typing + complete_task contracts (issues: 698fc050, 965911b4, b1afc6c5, cb1aa096)

1. **Define shared logger interface** — Create `supabase/functions/complete_task/types.ts` (or add to existing):
   ```ts
   export interface CompletionLogger {
     debug: (msg: string, ctx?: Record<string, unknown>) => void;
     info: (msg: string, ctx?: Record<string, unknown>) => void;
     warn: (msg: string, ctx?: Record<string, unknown>) => void;
     error: (msg: string, ctx?: Record<string, unknown>) => void;
   }
   ```
2. In `generation.ts` line 71: Change `logger?: unknown` → `logger?: CompletionLogger`
3. In `generation-child.ts`: Same change
4. In `orchestratorCore.ts`: Use the same `CompletionLogger` type

**Resolve:** `desloppify plan resolve "complete-task-types-and-contracts" --note "unified logger typing across complete_task" --confirm`

### Batch 2E: Export default → named (issues: a9e17165, + convention)

Convert 13 files from `export default` to named exports. For each:
1. Change `export default function/const X` → `export function/const X`
2. Update all importers: `import X from '...'` → `import { X } from '...'`

**Files:**
- `src/domains/media-lightbox/MediaLightbox.tsx`
- `src/domains/billing/components/CreditsManagement/CreditsManagement.tsx`
- `src/app/App.tsx`, `src/app/Layout.tsx`
- `src/tools/travel-between-images/components/VideoGallery/ShotListDisplay.tsx`
- `src/tools/travel-between-images/components/VideoGallery/VideoShotDisplay.tsx`
- `src/tools/travel-between-images/components/VideoGallery/SortableShotItem.tsx`
- `src/tools/travel-between-images/components/BatchSettingsForm.tsx`
- `src/tools/travel-between-images/components/ShotImagesEditor/index.tsx`
- `src/features/tasks/components/TasksPane/IncomingTaskItem.tsx`
- `src/features/tasks/components/TasksPane/TaskList.tsx`
- `src/features/tasks/components/TasksPane/TaskItem.tsx`
- `src/shared/hooks/usePersistentState.ts`

**Note:** `App.tsx` and `Layout.tsx` may use React.lazy — check if they need default exports. If so, skip those 2.

**Resolve:** `desloppify plan resolve "convention-standardization" --note "converted 11-13 files to named exports" --confirm` (partial)

---

## Phase 3: Structural Refactors (~6hrs, ~25 issues)

These change interfaces and hook boundaries. Higher risk — test thoroughly.

### Batch 3A: Delete useVideoEditPanelModel (issues: fccc5172, 86ba65fc)

**Confirmed:** 85-line hook is pure field-renaming useMemo. Single consumer: `useVideoLightboxRenderModel.tsx`.

1. Read `src/domains/media-lightbox/hooks/useVideoEditPanelModel.ts` — note the return shape
2. In `src/domains/media-lightbox/hooks/useVideoLightboxRenderModel.tsx`:
   - Remove `import { useVideoEditPanelModel }`
   - Inline the field reshaping where it was called, or restructure `VideoEditPanel` to accept the raw types
3. Delete `useVideoEditPanelModel.ts`
4. Update any barrel exports

### Batch 3B: Rename useVideoLightboxLayoutState (issues: 3fc50759)

**Confirmed:** 54-line pure function, not a hook. Exports `buildVideoLightboxLayoutState`.

1. Rename file: `useVideoLightboxLayoutState.ts` → move to `src/domains/media-lightbox/model/buildVideoLightboxLayoutState.ts` (model/ dir already exists)
2. Update the 1 consumer: `useVideoLightboxRenderModel.tsx` line 13
3. Update test file import if any

### Batch 3C: ShotImageManagerContainer dedup (issues: 4f0bd7b9, 931d5799)

**Confirmed:** Byte-for-byte identical MediaLightbox JSX in mobile (lines 332-361) and desktop (lines 386-415).

1. Extract to local component at top of file:
   ```tsx
   function SegmentLightboxModal({ state, props }: { state: ..., props: ... }) {
     if (!state.segments.segmentLightbox.currentSegmentMedia) return null;
     return <MediaLightbox ... />;
   }
   ```
2. Replace both blocks with `<SegmentLightboxModal state={state} props={props} />`

### Batch 3D: deriveInputImages dedup (issues: a9bb2369, 8d67a5a4)

**Note:** These are NOT identical — `taskParamsUtils.ts` version is more complete (handles more field locations). `task-utils.ts` version is simpler but less robust.

1. In `src/features/tasks/components/TasksPane/utils/task-utils.ts`:
   - Replace `deriveTaskInputImages` body with a call to the shared version:
   ```ts
   import { deriveInputImages } from '@/shared/lib/taskParamsUtils';
   export function deriveTaskInputImages(task: Task) {
     return deriveInputImages(task.params);
   }
   ```
2. In `src/domains/media-lightbox/hooks/useAdjustedTaskDetails.ts`:
   - Replace local `deriveInputImages` copy with import from `@/shared/lib/taskParamsUtils`

### Batch 3E: Preset controller decomposition (issues: bbe45e27, 53415016, 7b754d1b)

**File:** `src/shared/components/PhaseConfigSelectorModal/hooks/useAddNewPresetTabController.ts` (456 lines)

1. Extract reducer + types to `presetFormReducer.ts` in same directory:
   - Move the 12 action types, reducer function, and initial state factory
   - ~100 lines extracted

2. Consolidate 3 overlapping useEffect blocks (lines 246-328) into 1:
   - All three depend on `editingPreset`. Merge into single effect that dispatches a composite hydration action.
   - The reducer handles branching (overwriting vs importing) instead of 3 competing effects.

3. Extract submission logic (lines 336-414) to `submitPreset.ts`:
   - Pure async function: `submitPreset(state, deps) → Promise<void>`
   - ~80 lines extracted

**Result:** Controller drops from 456 → ~200 lines. Each extracted piece is independently testable.

### Batch 3F: Remaining elegance fixes

1. **AIInputButton popover dedup** (issue: b9bf731c) — `src/shared/components/ui/ai-input-button.tsx`
   - Extract shared popover form content for mobile/desktop text modes

2. **Skeleton gallery grid** (issue: 1d1d38f8) — `src/shared/components/ui/skeleton-gallery.tsx`
   - Replace 36 conditional class expressions with data-driven lookup: `const gridCols: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', ... }`

3. **buildTaskParamsPayload dedup** (issue: 4ad5e4c9) — `src/shared/lib/tasks/segmentTaskPayload.ts`
   - Extract shared optional-field builder for the duplicated key composition

4. **generationTaskCache getGenerationId bypass** (issue: efffbe4e) — `src/shared/lib/generationTaskCache.ts`
   - Replace inline `media.generation_id || media.id` with `getGenerationId(media)` from mediaTypeHelpers

---

## Phase 4: Interface Grouping & Architecture (~4hrs, ~20 issues)

### Batch 4A: Group wide interfaces into sub-objects

1. **UseFormSubmissionProps** (22 fields) — `src/shared/components/ImageGenerationForm/hooks/formSubmission/types.ts`
   - Group into: `{ formState, promptConfig, effects }`
   - Update `useFormSubmission.ts` to destructure from groups

2. **ReferenceActionHandlersInput** (19 fields) — `src/shared/components/ImageGenerationForm/hooks/referenceManagement/types.ts`
   - Group into: `{ identity, referenceState, stateSetters, mutations }`

3. **ReferenceManagementOutput** (24 fields) — same file
   - Remove raw state setters. Only export handler functions. Halves the API surface.

4. **PaneControlTab** (18 props) — `src/shared/components/PaneControlTab.tsx`
   - Group into: `{ position, state, handlers, display, dataTour?, actions? }`

### Batch 4B: Init coupling fixes (issues: 75aab84c, 9b8946ce, 705a061a, 467a6473, a9786da3)

1. **debugConfig.ts** — Make env reads lazy:
   ```ts
   let _config: DebugConfig | null = null;
   function getDefaultConfig(): DebugConfig { return { /* 10 env reads */ }; }
   export const debugConfig = new Proxy({} as DebugConfig, {
     get(_, prop) { if (!_config) _config = getDefaultConfig(); return _config[prop]; }
   });
   ```
   Extract window attachment to explicit `registerDebugGlobals()` called from `bootstrap.tsx`.

2. **Edge function SDK clients** — `supabase/functions/ai-prompt/index.ts`, `ai-voice-prompt/index.ts`
   - Move `new Groq(...)` from module scope to lazy getter with error on missing key.

3. **projectSelectionStore.ts** — Initialize with null, lazy-read on first access.

4. **settingsWriteQueue.ts** — Throw explicitly if `writeFunction` is null when `enqueueSettingsWrite` is called.

### Batch 4C: Cross-module boundary fixes (issues: a027edba, 269d0ba2, 93d8cb17)

1. **LoraModel imports** (20 files via component barrel):
   - Ensure `src/domains/lora/types/lora.ts` exports `LoraModel`
   - Update 20 files to import from `@/domains/lora/types/lora` instead of `@/domains/lora/components/LoraSelectorModal`
   - Keep LoraSelectorModal barrel for the component only

2. **lightboxOpenState** — Already in correct location (`src/domains/media-lightbox/state/`). The cross-boundary import by `shared/hooks/layout/useBottomOffset.ts` is acceptable — shared needs to know if lightbox is open for layout. **Wontfix.**

3. **Dead re-export shims** — Already deleted in Phase 1 earlier.

### Batch 4D: Structure documentation (issues: f3115f6e, 08993759)

1. Update `structure.md` — Add entries for `src/domains/`, `src/features/`, `src/integrations/`, `src/types/`
2. Move `editVideoDefaults.ts` from `src/shared/settings/config/` to `src/tools/edit-video/settings/` (if not already there)

---

## Phase 5: Wontfix & Deferred (~0hrs)

These get wontfixed with specific justification:

| Issue | ID | Justification |
|-------|-----|---------------|
| Feature-scale shared modules | 081f0d04 | ShotImageManager/ImageGenerationForm/MediaGallery ARE genuinely shared across tools. Moving 200+ files gains nothing. |
| Media-lightbox mega-domain | 84709769, 3d7e4601 | 232 files, multi-week split project. Organizing hooks into subdirs (Phase 4) is sufficient. |
| Frontend integration tests | ebabd382 | Valid but out-of-scope. Test infrastructure decision, not code quality. |
| LoRA format coexistence | e8d4da87 | Read-side migration. Adding code to force-migrate adds complexity. Formats converge organically. |
| Hardcoded colors (full sweep) | f51e6bda | 109 files, 532 occurrences. Far too large for this effort. Do incrementally per-PR. |
| useSharedLightboxState "triple layer" | 3e2f3be5 | Investigated: does REAL composition (12+ sub-hooks, derived state). Not a pass-through. |
| useEditSettingsPersistence "wrappers" | 014e348d | Investigated: dual-persistence coordination, race-condition protection. Not pass-through. |
| useInlineEditState "forwarding" | b1cb3561, 646ebbb9 | Investigated: orchestrates 9+ sub-hooks, derives ImageEditState. Real composition, not deletable. |
| useShotEditorLayoutPayloadModel | fbaecf94, 98ba9cca | Investigated: explicit field-mapping checklist for wide context provider. Explicitness aids maintenance. |
| LightboxLayout model | 2e3f5fe9 | Investigated: memoization prevents re-renders. 6 context reads + 6 booleans is reasonable. |
| No handler.ts integration test | 8c6e141c | Edge function integration tests require Supabase runtime. Out of scope. |
| No frontend integration tests | ebabd382 | Infrastructure decision, not a code fix. |
| SegmentSlotModeData god interface | d431cbf9 | 30+ fields but represents a genuine cross-boundary contract. Splitting would scatter the API. |
| Directory reorganization | 349f8378, eabc6676, ee2eef1f, b510383b | Moving files into subdirs breaks git blame, creates conflicts. Low value. |
| UI naming inconsistency | d7ecc3b5, 5d43c264 | Renaming directories is high-churn, low-value. |
| Barrel export inconsistency | dd0516f6 | Adding barrels where missing is busywork. |
| Type file naming | 373c3327 | Both patterns (types.ts, Component.types.ts) are fine. |
| Non-hooks in hooks dirs | e2bb50ed | ~30 files. Moving them all breaks blame. Low value. |
| submitSegmentTask in components/ | 503b4ed7 | Single file, works fine where it is. |
| Slot.tsx placement | 825fa01d | Works fine in ui/ root. |
| Mixed API clients in ai-prompt | f84a93f6 | Raw fetch for OpenAI works. Adding SDK dependency isn't clearly better. |
| storagePaths divergence | 4bd84853 | Edge version is actually more robust. Reconciliation is risky. |
| shotImageEntryId deprecation | f37e6fac | 29-file rename. Do incrementally. |
| Cache utils param style | 90e84fbf | Both patterns work. Standardizing is churn. |
| Invalidation param inconsistency | c56f3a99 | 3 sibling functions. Standardizing is churn for 3 callsites. |
| Reference params casing | 770e4529 | Wire format leaks. Mapping function adds complexity. |

```bash
# Wontfix commands (run after completing phases 1-4):
desloppify plan skip 081f0d04 --reason "genuinely shared modules, 200+ file move gains nothing"
desloppify plan skip 84709769 --reason "mega-domain split is multi-week project, hooks subdirs sufficient"
desloppify plan skip 3d7e4601 --reason "same as 84709769, organizing hooks is sufficient"
desloppify plan skip ebabd382 --reason "test infrastructure decision, not code quality fix"
desloppify plan skip e8d4da87 --reason "read-side migration converges organically, adding code adds complexity"
desloppify plan skip f51e6bda --reason "109 files 532 occurrences, too large for batch, do incrementally"
desloppify plan skip 3e2f3be5 --reason "verified: real 12-hook composition, not pass-through"
desloppify plan skip 014e348d --reason "verified: dual-persistence coordination with race protection"
desloppify plan skip b1cb3561 --reason "verified: 9+ sub-hook orchestration, derives ImageEditState"
desloppify plan skip 646ebbb9 --reason "duplicate of b1cb3561"
desloppify plan skip fbaecf94 --reason "verified: explicit field-mapping checklist aids maintenance"
desloppify plan skip 98ba9cca --reason "duplicate of fbaecf94"
desloppify plan skip 2e3f5fe9 --reason "verified: memoization prevents re-renders, reasonable pattern"
desloppify plan skip 8c6e141c --reason "edge function integration tests need Supabase runtime"
desloppify plan skip d431cbf9 --reason "genuine cross-boundary contract, splitting scatters API"
desloppify plan skip 349f8378 --reason "file moves break git blame for no behavior change"
desloppify plan skip eabc6676 --reason "file moves break git blame for no behavior change"
desloppify plan skip ee2eef1f --reason "file moves break git blame for no behavior change"
desloppify plan skip b510383b --reason "file moves break git blame for no behavior change"
desloppify plan skip d7ecc3b5 --reason "renaming directories is high-churn low-value"
desloppify plan skip 5d43c264 --reason "renaming directories is high-churn low-value"
desloppify plan skip dd0516f6 --reason "adding barrels is busywork"
desloppify plan skip 373c3327 --reason "both type file naming patterns are acceptable"
desloppify plan skip e2bb50ed --reason "30 file moves break blame for no behavior change"
desloppify plan skip 503b4ed7 --reason "single file, works fine where it is"
desloppify plan skip 825fa01d --reason "works fine in ui/ root"
desloppify plan skip f84a93f6 --reason "raw fetch works, SDK dependency not clearly better"
desloppify plan skip 4bd84853 --reason "edge version is more robust, reconciliation is risky"
desloppify plan skip f37e6fac --reason "29-file rename, do incrementally per-PR"
desloppify plan skip 90e84fbf --reason "both param styles work, standardizing is churn"
desloppify plan skip c56f3a99 --reason "3 callsites, standardizing is churn"
desloppify plan skip 770e4529 --reason "wire format casing, mapping function adds complexity"
```

---

## Score Projection

| Phase | Issues Resolved | Issues Wontfixed | Est. Subjective |
|-------|----------------|-----------------|-----------------|
| Start | 0 | 0 | 57.3% (72.9 strict) |
| Phase 1 | ~25 | 0 | ~72% (~81 strict) |
| Phase 2 | ~30 | 0 | ~85% (~89 strict) |
| Phase 3 | ~15 | 0 | ~92% (~93 strict) |
| Phase 4 | ~10 | ~30 wontfixed | ~95% (~95+ strict) |

**Key risk:** Wontfixing ~30 issues may penalize strict score. If strict penalizes wontfix, we may need to resolve more of the "low value" items. Rescan after Phase 2 to check trajectory.

---

## Master Checklist

- [ ] **Phase 1A:** Delete paramsExtractors passthrough
- [ ] **Phase 1B:** Remove 49 stale test mocks
- [ ] **Phase 1C:** Strip AI-generated JSDoc (5 files)
- [ ] **Phase 1D:** Naming fixes (5 symbols)
- [ ] **Phase 1E:** Small type fixes (5 issues)
- [ ] Commit: `chore(desloppify): phase 1 — deletions, naming, type fixes`
- [ ] **Phase 2A:** Toast migration (20 files)
- [ ] **Phase 2B:** Error handling bypasses (3 files)
- [ ] **Phase 2C:** Edge function error & auth cleanup
- [ ] **Phase 2D:** Logger typing + complete_task contracts
- [ ] **Phase 2E:** Export default → named (13 files)
- [ ] Commit: `chore(desloppify): phase 2 — error handling, conventions`
- [ ] Rescan: `desloppify scan --path . && desloppify status`
- [ ] **Phase 3A:** Delete useVideoEditPanelModel
- [ ] **Phase 3B:** Rename useVideoLightboxLayoutState
- [ ] **Phase 3C:** ShotImageManagerContainer dedup
- [ ] **Phase 3D:** deriveInputImages dedup
- [ ] **Phase 3E:** Preset controller decomposition
- [ ] **Phase 3F:** Remaining elegance fixes
- [ ] Commit: `refactor(desloppify): phase 3 — structural cleanup`
- [ ] **Phase 4A:** Group wide interfaces
- [ ] **Phase 4B:** Init coupling fixes
- [ ] **Phase 4C:** Cross-module boundary fixes
- [ ] **Phase 4D:** Structure documentation
- [ ] Commit: `refactor(desloppify): phase 4 — interfaces, boundaries, docs`
- [ ] Rescan: `desloppify scan --path . && desloppify status`
- [ ] **Phase 5:** Apply wontfix decisions
- [ ] Final scan and score check
