# Subjective Review Triage: 57.3 → 95

**Current state:** 105 open issues, strict score 57.3/100 (100% subjective, mechanical at 100%)
**Target:** 95/100

## Duplicate/Overlapping Issues (20 issues → 10 unique fixes)

These issues appear in multiple dimensions but share a single root fix:

| Primary ID | Duplicate IDs | Shared Fix |
|-----------|---------------|------------|
| b1cb3561 (abstraction) | 646ebbb9 (low_elegance) | useInlineEditState field-forwarding |
| fbaecf94 (abstraction) | 98ba9cca (low_elegance) | useShotEditorLayoutPayloadModel passthrough |
| fccc5172 (abstraction) | 86ba65fc (low_elegance) | useVideoEditPanelModel rename-only useMemo |
| 4f0bd7b9 (logic_clarity) | 931d5799 (low_elegance) | ShotImageManagerContainer JSX duplication |
| 8d67a5a4 (contract) | a9bb2369 (mid_elegance) | deriveInputImages duplication |
| 698fc050 (contract) | 965911b4 (contract), b1afc6c5 (type_safety) | Logger typed as unknown |
| 84709769 (high_elegance) | 3d7e4601 (cross_module) | media-lightbox mega-domain |
| bbe45e27 (design) | 7b754d1b (low_elegance) | useAddNewPresetTabController mixed concerns |
| 53415016 (design) | (overlaps bbe45e27) | useAddNewPresetTabController effects |
| 2e3f5fe9 (abstraction) | — | LightboxLayout model (related to 3e2f3be5) |

**Net unique issues after dedup: ~85**

## Root Cause Clusters (ordered by score impact)

### RC1: Orchestrator Field-Forwarding (resolves ~12 issues, biggest lever)
**Dimensions:** Elegance (-20.2 pts combined), Abstraction (-5.2 pts), Design (-4.0 pts)
**Root cause:** Hooks that assemble sub-hooks, destructure returns, and repack into new interfaces without adding logic.

| Issue | File | Fix |
|-------|------|-----|
| b1cb3561+646ebbb9 | useInlineEditState (469 LOC) | Flatten: consumers import sub-hooks directly |
| fbaecf94+98ba9cca | useShotEditorLayoutPayloadModel (340 LOC) | Flatten or group into typed sub-interfaces |
| fccc5172+86ba65fc | useVideoEditPanelModel | Delete; consumers use source hook directly |
| 3e2f3be5 | useSharedLightboxState triple-layer | Collapse to 2 layers max |
| 014e348d | useEditSettingsPersistence wrappers | Inline pass-throughs |
| 9c08382b | useGenerationsPaneController spread merge | Use typed sub-interfaces |

### RC2: Wide Interface Sprawl (resolves ~6 issues)
**Dimensions:** Design coherence (-4.0 pts)

| Issue | File | Fix |
|-------|------|-----|
| cd42e514 | ReferenceActionHandlersInput (29 fields) | Group into sub-interfaces by concern |
| 3af45467 | UseFormSubmissionProps (26 fields) | Group into sub-interfaces |
| 44c932d2 | ReferenceManagementOutput dual exports | Export handlers only, drop raw setters |
| 87c222e3 | PaneControlTab (20 props) | Group into position/state/callback bags |
| d431cbf9 | SegmentSlotModeData (~60 fields) | Decompose into 4-5 sub-interfaces |
| d21969e7 | ShotBatchItemDesktop | Pre-compute booleans in parent |

### RC3: Error Handling Inconsistency (resolves ~7 issues)
**Dimensions:** Error consistency (-5.0 pts), API coherence (-4.4 pts)

| Issue | File | Fix |
|-------|------|-----|
| 4a07fb7b | dual toast systems (19 vs 67 files) | Migrate remaining 19 to sonner |
| 6c908e15 | 4 error normalization functions | Consolidate to 2: normalizeAndPresent + normalizeAndLog |
| 9856803d | useShareActions bypass | Use normalizeAndPresentError |
| 71093d52 | useApplySettingsHandler bypass | Use normalizeAndPresentError |
| dc524154 | useHuggingFaceUpload ad-hoc result | Use OperationResult |
| a84399bd | lightbox mixed error contracts | Standardize on catch-and-present |
| c7de46fc | useAutoTopupState silent errors | Add error toast |

### RC4: Code Duplication (resolves ~8 issues)
**Dimensions:** Elegance (-20.2 pts), Logic clarity (-2.3 pts)

| Issue | File | Fix |
|-------|------|-----|
| 4f0bd7b9+931d5799 | ShotImageManagerContainer JSX | Extract shared MediaLightbox element |
| b9bf731c | AIInputButton popover JSX | Extract PopoverFormContent |
| 8d67a5a4+a9bb2369 | deriveInputImages | Delete local copy, use shared |
| efffbe4e | generationTaskCache | Use getGenerationId() |
| 4ad5e4c9 | buildTaskParamsPayload | Extract shared optional-field builder |
| 1d1d38f8 | grid column classes (36 copies) | Data-driven lookup |

### RC5: Convention & Naming Cleanup (resolves ~11 issues)
**Dimensions:** Convention drift (-5.2 pts), Naming (-3.3 pts)

| Issue | File | Fix |
|-------|------|-----|
| f51e6bda | 25+ files hardcoded colors | Replace with semantic tokens |
| a9e17165 | MediaLightbox export default | Switch to named export |
| e2bb50ed | utils in hooks/ dirs | Move to lib/ |
| 503b4ed7 | submitSegmentTask in components/ | Move to lib/ |
| 3fc50759 | useVideoLightboxLayoutState non-hook | Rename to buildVideoLightboxLayoutState |
| 373c3327 | type file naming split | Standardize on types.ts |
| aadc4bd5 | EffectiveSettings alias | Delete alias, use SegmentSettings |
| 769d51df | handleSetEditMode no-op wrapper | Inline or remove |
| e547ba48 | inpaintPanelPosition misnomer | Rename to reflect actual semantics |
| c78ca3c2 | processedLorasLength | Rename to filteredLoraCount |
| bc71f84f | setPageFn suffix | Rename to onPageChange |

### RC6: AI-Generated Debt (resolves 6 issues)
**Dimensions:** AI generated debt (-4.6 pts)

| Issue | File | Fix |
|-------|------|-----|
| 32847c25 | 39 identical error extractions | Use getErrorMessage() utility |
| 9b116661 | paramsExtractors.ts wrappers | Delete, call taskParamContract directly |
| a0f0b4ce | restating comments in travel hooks | Delete restating comments |
| d64393f6 | ShotImagesEditor/types.ts JSDoc | Delete restating JSDoc |
| f1ab33f6 | storagePaths.ts edge copy JSDoc | Delete restating JSDoc |
| e7b20141 | useClickOutside 38-line JSDoc | Trim to 5-line JSDoc |

### RC7: Package & Directory Organization (resolves ~8 issues)
**Dimensions:** Package organization (-6.3 pts), Structure nav (-5.6 pts)

| Issue | File | Fix |
|-------|------|-----|
| 349f8378 | shared/lib/ 56 flat files | Group into subdirs: tasks/, generation/, timeline/, shot/ |
| eabc6676 | media-lightbox/hooks/ 51 flat files | Group into video/, lightbox/, edit/ |
| ee2eef1f | shared/hooks/ 30 stragglers | Move to matching existing subdirs |
| b510383b | shared/components/ 38 flat files | Group modals, media widgets |
| d7ecc3b5 | ui/ naming conventions | Standardize to PascalCase |
| 825fa01d | Slot.tsx placement | Move to ui/primitives/ |
| 5d43c264 | directory casing mix | Standardize to PascalCase |
| dd0516f6 | barrel export inconsistency | Add index.ts to component dirs |

### RC8: Architecture Boundaries (resolves ~9 issues)
**Dimensions:** Cross-module arch (-5.2 pts), Structure nav (-5.6 pts), High elegance (-8.9 pts)

| Issue | File | Fix |
|-------|------|-----|
| aefed65e | shared/ imports domains/ (100+ locs) | Move shared domain types to shared/types/ |
| 081f0d04 | Feature-scale modules in shared/ | Move ShotImageManager, ImageGenerationForm, MediaGallery to features/ |
| a027edba | LoraModel via UI barrel (37 files) | Import from domains/lora/types |
| 269d0ba2 | lightbox mutable state cross-boundary | Move state to shared/ or use event |
| 23c8259c | shared/lib domain-specific files | Move to respective domains or features |
| 93d8cb17 | dead re-export shims | Delete |
| f3115f6e | undocumented dirs in structure.md | Document domains/ and features/ |
| e49a68b6 | dead GenerationParams type | Delete |
| e3e7e2cf | vestigial edit-media tool | Delete |

### RC9: Incomplete Migrations (resolves 5 issues)
**Dimensions:** Stale migration (-4.2 pts)

| Issue | File | Fix |
|-------|------|-----|
| b265d077 | 49 stale test mocks | Remove dead mocks |
| 4bd84853 | storagePaths.ts diverged copy | Unify or document intentional divergence |
| f37e6fac | shotImageEntryId deprecated alias (29 files) | Replace with canonical name |
| f84a93f6 | mixed API clients in ai-prompt | Standardize on SDK |
| e8d4da87 | 3 LoRA serialization formats | Document sunset timeline |

### RC10: Init Coupling (resolves 5 issues)
**Dimensions:** Init coupling (-3.8 pts)

| Issue | File | Fix |
|-------|------|-----|
| 75aab84c+9b8946ce | debugConfig.ts module-scope reads + window attach | Lazy-init pattern |
| 705a061a | edge function module-scope SDK clients | Move to handler scope |
| 467a6473 | projectSelectionStore localStorage at import | Lazy read |
| a9786da3 | settingsWriteQueue silent fail | Throw or warn on unconfigured use |

### RC11: Type Safety Fixes (resolves ~5 issues after dedup)
**Dimensions:** Type safety (-3.8 pts)

| Issue | File | Fix |
|-------|------|-----|
| 698fc050+965911b4+b1afc6c5 | logger as unknown | Extract shared TaskLogger interface |
| cb1aa096 | calculateVideoEnhanceCost type mismatch | Fix param type to TaskCostParams |
| 495f215b | useShareGeneration escape casts | Define proper interfaces |
| 787eeb59 | raw status string literals | Use TASK_STATUS constants |
| f524a2e6 | redundant array cast | Remove cast |

### RC12: Test Coverage (resolves 5 issues)
**Dimensions:** Test strategy (-4.5 pts)

| Issue | File | Fix |
|-------|------|-----|
| 46a23967 | orchestratorCore.ts (495 LOC) | Add unit tests |
| 3acacb1d | completionHelpers.ts | Add unit tests |
| 8c6e141c | handler.ts wiring | Add integration test |
| 4044018d | segmentOutputsQueries.ts | Add unit tests |
| ebabd382 | no frontend integration tests | Add 1 cross-module flow test |

### RC13: Remaining Single Fixes (resolves ~8 issues)
**Dimensions:** Various

| Issue | File | Fix |
|-------|------|-----|
| 46148817 | gifenc static import | Dynamic import |
| 08993759 | tool settings 3 locations | Standardize location |
| 84fe9ab5 | useDeleteFromTable string branching | Split into focused functions |
| b2ea4fad | redundant async wrapper | Remove wrapper |
| bd5451ca | VideoEnhanceResult self-reference | Split into two types |
| 0b0a0bd1 | query key/fetch nullability | Align signatures |
| c56f3a99 | invalidation param inconsistency | Standardize to options object |
| 770e4529 | reference params casing | Standardize casing |
| 90e84fbf | cache vs mutation param style | Standardize to options object |
| d985953c | UseUpdatingTimestampOptions name | Rename to UseRelativeTimestampOptions |
| fc976d84 | inline ownership checks | Use taskActorPolicy |
| deef7335 | redundant early auth guards | Remove redundant checks |
| bbe45e27+53415016+7b754d1b | useAddNewPresetTabController | Extract reducer, separate effects |
| 144078ff | BatchMagicEditTaskParams duplication | Extend base type |

---

## Execution Plan (4 phases)

### Phase 1: Quick Wins (single-edit, ~35 issues, ~2 hrs)
Low-risk fixes that each touch 1-3 files. Do these first to rapidly boost score.

- [ ] **1a. Delete dead code** — GenerationParams type, edit-media dir, dead shims, EffectiveSettings alias (4 issues)
- [ ] **1b. Rename/move misnamed files** — useVideoLightboxLayoutState, submitSegmentTask to lib/, Slot.tsx to primitives/ (3 issues)
- [ ] **1c. Fix naming** — processedLorasLength, setPageFn, handleSetEditMode, inpaintPanelPosition (4 issues)
- [ ] **1d. Remove AI debt** — restating comments, excessive JSDoc, paramsExtractors wrappers (5 issues)
- [ ] **1e. Single-line type fixes** — remove redundant cast, fix VideoEnhanceResult self-ref, BatchMagicEdit extend, remove async wrapper (5 issues)
- [ ] **1f. Fix imports/references** — getGenerationId bypass, deriveInputImages local copy, LoraModel import path (3 issues)
- [ ] **1g. Edge function cleanup** — logger interface, raw status strings, module-scope clients, redundant auth guards (6 issues)
- [ ] **1h. Error handling quick fixes** — useShareActions, useApplySettingsHandler, useAutoTopupState, useHuggingFaceUpload (4 issues)
- [ ] **1i. Misc single-edit** — gifenc dynamic import, query key nullability, UseUpdatingTimestampOptions rename (3 issues)

### Phase 2: Multi-File Refactors (~30 issues, ~4 hrs)
Coordinated changes across multiple files, grouped by root cause.

- [ ] **2a. Error system consolidation** — migrate 19 files to sonner, consolidate 4 normalize functions to 2, standardize lightbox error contracts (3 issues)
- [ ] **2b. Edge function error boilerplate** — replace 39 identical expressions with getErrorMessage (1 issue, 26 files)
- [ ] **2c. Hardcoded colors** — replace 25+ files with semantic tokens (1 issue, 25+ files)
- [ ] **2d. Stale test mocks** — remove 49 mocks for nonexistent errorHandler (1 issue, 49 files)
- [ ] **2e. shotImageEntryId migration** — replace deprecated alias in 29 files (1 issue, 29 files)
- [ ] **2f. Wide interface decomposition** — group ReferenceActionHandlersInput, UseFormSubmissionProps, PaneControlTab, SegmentSlotModeData into sub-interfaces (4 issues)
- [ ] **2g. JSX deduplication** — ShotImageManagerContainer, AIInputButton popover, grid column lookup (3 issues)
- [ ] **2h. useAddNewPresetTabController** — extract reducer, separate init effects (3 issues)
- [ ] **2i. Convention standardization** — type file naming, barrel exports, directory casing, export default outliers (4 issues)
- [ ] **2j. API param consistency** — invalidation params, cache utils, reference params casing (3 issues)
- [ ] **2k. Auth consolidation** — inline ownership → taskActorPolicy (1 issue)
- [ ] **2l. Init coupling fixes** — debugConfig lazy-init, projectSelectionStore, settingsWriteQueue (3 issues)
- [ ] **2m. storagePaths unification** — unify frontend/edge divergence (1 issue)
- [ ] **2n. Share generation type casts** — define proper interfaces (1 issue)

### Phase 3: Orchestrator Flattening (~12 issues, ~4 hrs)
The highest-impact structural work. Each fix resolves issues across 2-3 dimensions.

- [ ] **3a. useVideoEditPanelModel** — delete hook, consumers use source directly (2 issues)
- [ ] **3b. useInlineEditState** — flatten to sub-hooks consumed directly (2 issues)
- [ ] **3c. useShotEditorLayoutPayloadModel** — group into typed sub-interfaces or flatten (2 issues)
- [ ] **3d. useSharedLightboxState** — collapse triple-layer to 2-layer (1 issue)
- [ ] **3e. useEditSettingsPersistence** — inline pass-through wrappers (1 issue)
- [ ] **3f. useGenerationsPaneController** — typed sub-interfaces (1 issue)
- [ ] **3g. LightboxLayout model** — pass context values directly (1 issue)
- [ ] **3h. ReferenceManagementOutput** — export handlers only (1 issue)

### Phase 4: Architecture & Tests (~15 issues, ~6 hrs)
Large moves and new test files. Biggest risk, do last.

- [ ] **4a. Document structure** — add domains/ and features/ to structure.md, standardize tool settings (2 issues)
- [ ] **4b. Directory organization** — group shared/lib, media-lightbox/hooks, shared/hooks, shared/components flat files (4 issues)
- [ ] **4c. Type boundary fix** — move GenerationRow, Shot, LoraModel types to shared/types or a shared domain types dir (1 issue)
- [ ] **4d. shared/lib domain leakage** — move domain-specific files to respective domains (1 issue)
- [ ] **4e. Test coverage** — orchestratorCore, completionHelpers, handler.ts, segmentOutputsQueries tests (4 issues)
- [ ] **4f. Integration test** — 1 cross-module flow test (realtime → invalidation → UI) (1 issue)
- [ ] **4g. Remaining migrations** — standardize ai-prompt API clients, document LoRA format sunset (2 issues)

### Phase 4+ (wontfix candidates)
Issues where fixing would cause more churn than benefit:

- **media-lightbox mega-domain** (84709769, 3d7e4601) — Splitting 232 files is a massive effort with high regression risk. Better to organize hooks within it (Phase 4b) and track as long-term goal.
- **Feature-scale modules in shared/** (081f0d04) — Moving ShotImageManager (65 files), ImageGenerationForm (97 files), MediaGallery (49 files) to features/ is 200+ file moves with high blast radius. Better to fix the import direction first (Phase 4c).

---

## Score Projection

| Phase | Issues Resolved | Est. Score After |
|-------|----------------|-----------------|
| Current | 0/105 | 57.3 |
| Phase 1 | ~35 | ~72 |
| Phase 2 | ~30 | ~84 |
| Phase 3 | ~12 | ~91 |
| Phase 4 | ~15 | ~95+ |

## Master Checklist

- [ ] Phase 1: Quick wins (35 issues)
- [ ] Phase 2: Multi-file refactors (30 issues)
- [ ] Phase 3: Orchestrator flattening (12 issues)
- [ ] Phase 4: Architecture & tests (15 issues)
- [ ] Rescan after each phase: `desloppify scan`
- [ ] Final target: strict score >= 95
