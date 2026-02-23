# Plan: Desloppify Strict Score 93 → 95+

Completion update (2026-02-23): **Target achieved**
- Full scan scores: **strict 96.2** | **overall 96.2** | **objective 95.8** | **verified 96.2**
- Status: in maintenance mode above the 95+ target.

Original baseline when this plan started: strict **92.3** | verified **93.5** | objective **94.2**

> 2026-02-23 execution update: all 22 open review findings were investigated and resolved, but strict score is currently plateaued at 92.3. Remaining gap to 95 is dominated by boilerplate duplication and stale subjective reassessment requirements.

The strict score is a weighted average across 24 dimensions. The highest-weighted dimensions have the most leverage. This plan is organized by **impact** (weight × gap-to-95).

---

## Tier 1: Highest Impact (>80 weighted points)

### Mid Elegance — 89.0, weight 22x, impact 132pts

The single most impactful dimension. 8 original issues, 4 already resolved:

- [x] **MediaGallery prop routing** — Already groups props into 5 semantic objects (itemShotWorkflow, itemMobileInteraction, itemFeatures, itemActions, itemLoading). Hooks consolidated into stateHook/filtersHook/etc. No further work needed.
- [x] **useInlineEditState return grouping** — Returns 42 flat fields. Group into 3-4 sub-objects:
  - `canvasEnvironment` (refs, dimensions, upscale — 7 fields)
  - `inpaintingState` (all inpainting + annotation mode — 20 fields)
  - `transformState` (reposition, transform handlers — 8 fields)
  - `generationState` (task submission states — 8 fields)
  - Keep `media`, `sourceGenerationData`, `availableLoras` at root level.
  - **Consumers to update:** EditImagesPage.tsx + lightbox edit mode wrappers (~3-5 sites). Effort: moderate. Risk: moderate.
- [x] **imageGeneration.ts param builders** — Extract 3 pure functions above the object literal:
  - `buildLorasParam(loras, inSceneLoraUrl?)` → `{ additional_loras? }`
  - `buildReferenceParams(styleRefImage, mode, settings)` → reference config object
  - `buildHiresOverride(hiresScale, hiresDenoise, hiresSteps, additionalLoras)` → merged LoRA map
  - Then task creation becomes clean assembly: `...buildLorasParam(...), ...buildReferenceParams(...), ...buildHiresOverride(...)`. Effort: moderate. Risk: safe (pure functions).
- [x] **imageGeneration.ts lora validation duplication** — Already deduplicated. Shared `validateLoras()` called by both validate functions.
- [x] **generateVideoService param count** — `buildTravelRequestBody` takes 23 params. Group into 3 sub-objects:
  - `MotionParams` (amountOfMotion, motionMode, useAdvancedMode, effectivePhaseConfig, selectedPhasePresetId)
  - `GenerationParams` (generationMode, batchVideoPrompt, enhancePrompt, variantNameParam, textBeforePrompts, textAfterPrompts)
  - `SeedParams` (seed, randomSeed, turboMode, debug)
  - Single call site at lines 621-643. Effort: moderate. Risk: safe.
- [x] **clientThumbnailGenerator** — Already uses async/await cleanly. `readFileAsDataUrl()`, `loadImage()`, and `toBlob()` are each properly Promise-wrapped. No callback nesting.
- [x] **useLineageChain N+1 queries** — Loop does one Supabase query per ancestor. Two options:
  - **Option A (recommended): SQL RPC** with recursive CTE — `get_lineage_chain(variant_id)`, single round-trip, handles deep lineages. Requires: `npx supabase db push --linked` + function deploy. Effort: significant.
  - **Option B (lighter): Batch query** — collect all variant IDs client-side first, then single `IN` clause fetch. Avoids RPC deployment. Effort: moderate.
  - **Decision: Start with Option B** (no infrastructure change). Upgrade to RPC if lineage depths become a real performance issue.
- [x] **Time formatting** — Already consolidated. Both `useProcessingTimestamp` and `useUpdatingTimestamp` delegate to `shared/lib/timeFormatting.ts`.

### High Elegance — 89.8, weight 22x, impact 114pts

7 remaining issues:

- [x] **Retro button hex colors** — Already uses CSS variables (`bg-retro`, `hover:bg-retro-hover`, etc.) with `--retro-*` custom properties in index.css. No hex in button.tsx.
- [x] **ShotActions hardcoded overlay colors** — bg-green-500, bg-gray-500/60. Replace green with a semantic success token or `bg-emerald-500/80` consistent with status indicators elsewhere. Replace gray overlay with `bg-foreground/60`. Effort: trivial. Risk: visual change, test manually.
- [x] **ActiveLoRAsDisplay hardcoded colors** — bg-slate-50/50, dark:bg-slate-800/30. Replace with `bg-muted/50`. Effort: trivial. Risk: safe.
- [x] **setTimeout hack in useMediaGalleryHandlers** — setTimeout(100ms) for state sequencing. Strategy: Use `flushSync` from react-dom or restructure to set both states in a single synchronous handler (React 18 auto-batches). Read the handler first to understand what order dependency exists. Effort: moderate. Risk: moderate (state timing is subtle).
- [x] **useAIInteractionService cleanup** — Remove unused `apiKey` param, delete trivial wrapper if it's just forwarding, remove stale comments. Effort: trivial. Risk: safe.
- [x] **useApiKeys upsert** — Replace manual check-then-insert-or-update with Supabase `.upsert()`. Single operation, cleaner, avoids race conditions. Effort: trivial. Risk: safe.
- [x] **InstallInstructionsModal colors** — ~91 hardcoded gray instances are browser chrome mockups (address bar, window frame, etc.). These are intentionally literal colors mimicking OS chrome — **not** app theme colors. Strategy: Add a `/* Browser chrome mockup — intentional literal colors */` comment at top of component. Don't move to CSS vars (they shouldn't change with app theme). Effort: trivial. Risk: safe.

### Type Safety — 88.0, weight 12x, impact 84pts

4 issues:

- [x] **Edge function auth.ts unknown types** — `supabase/functions/_shared/auth.ts` types supabaseAdmin as `unknown`. Import `SupabaseClient` from `@supabase/supabase-js` and type it properly. Deno import, so use the same import scheme as other edge functions. Effort: trivial. Risk: safe.
- [x] **useGenerationMutations casts** — Casts cache data to `Array<Record<string, unknown>>`. Replace with proper `Shot[]` type from `@/types/shots`. May need to check what React Query's `getQueryData` returns and use type assertion to `Shot[]`. Effort: trivial. Risk: safe.
- [x] **createGeneration return type** — Returns `Promise<Record<string, unknown>>`. Change to `Promise<GenerationRow>` (import from `@/types/generationRow`). The Supabase `.select().single()` call can be typed via the Database generic. Effort: trivial. Risk: safe.
- [x] **Dead interfaces in generationTaskBridge** — `GenerationTaskMapping`/`TaskGenerationMapping` never used. Delete them. Effort: trivial. Risk: safe.

---

## Tier 2: Medium Impact (20-80 weighted points)

### Contracts — 92.0, weight 12x, impact 36pts

- [x] **complete_task fetchTaskContext supabase typed as unknown** — Same fix as auth.ts: import `SupabaseClient` type from Deno. Effort: trivial. Risk: safe.
- [x] **usePaginatedTasks placeholderData signature** — React Query v5 changed `placeholderData` from `(previousData) => ...` to a different signature. Check their docs and align. Effort: trivial. Risk: moderate (must match RQ v5 API exactly).

### Abstraction Fit — 90.5, weight 8x, impact 36pts

- [x] **VideoLightbox flat props** — Already grouped into 5 prop objects (navigation, shotWorkflow, features, actions, videoProps) in previous session.
- [x] **VisibilityManager dead singleton** — Already deleted in previous session.
- [x] **generationTaskBridge dead code** — Same as Type Safety finding. Delete unused interfaces once. Effort: trivial. Risk: safe.

### Convention Drift — 84.0, weight 3x, impact 33pts

- [x] **Retro button hardcoded colors** — Already resolved (see High Elegance).
- [x] **process.env.NODE_ENV inconsistency** — Find the 2 files using `process.env` and replace with `import.meta.env.DEV`. Strategy: `grep -r "process.env" src/` to find them. Effort: trivial. Risk: safe.
- [x] **Edge function dependency versions** — Three different Deno std versions and supabase-js import schemes across edge functions. Strategy: Pick the latest stable versions (check current `deno.json` or import_map), update all edge functions to match. Effort: moderate. Risk: moderate (must test each function after version bump).

### Logic Clarity — 90.0, weight 6x, impact 30pts

- [x] **createGeneration variant error swallowed** — Variant insert failure is logged but function returns success. Strategy: Add `throw` after the error log. The caller should handle the error and show appropriate UI. Check what the caller does with the returned value first. Effort: trivial. Risk: moderate (may surface errors that were silently swallowed).
- [x] **useTasks window global fallback** — Falls back to `window.__PROJECT_CONTEXT__`. Strategy: Check if this global is set anywhere and if it's still needed. If it's a legacy SSR shim, remove it and require React context. If it's used in non-React code (workers, etc.), keep but document. Effort: moderate (need to investigate). Risk: moderate.

### Low Elegance — 92.8, weight 12x, impact 26pts

- [x] **Delete performanceUtils.ts** — Already deleted in previous session.
- [x] **Fix debugRendering.ts** — Empty else-if branch + dead `changed` computation. Read the file, remove dead code. Effort: trivial. Risk: safe (dev-only debug code).
- [x] **Remove _onClose param** — useInlineEditState.ts accepts but never uses it. Remove from function signature and all call sites. Effort: trivial. Risk: safe.
- [x] **Fix React import pattern** — useTasks.ts mixes `React.useRef` with destructured `useState`. Pick one style (destructured is the codebase convention). Effort: trivial. Risk: safe.

### Structure Nav — 90.5, weight 5x, impact 22pts

- [x] **Error handling path** — Already consolidated: `errorUtils.ts` and `errors.ts` moved into `errorHandling/` directory.
- [x] **queryKeys dual structure** — Already resolved: `queryKeys.ts` barrel replaced with `queryKeys/index.ts`.
- [x] **shared/utils/ parallel directory** — 7 files in `shared/utils/` could move to `shared/lib/`. Strategy: Move them one at a time, updating imports. Use `find-and-replace` for import paths. Effort: moderate. Risk: safe.
- [x] **Colocated test files** — Already moved test files into `__tests__/` directories.
- [x] **Rename pane-positioning/** — Already renamed to `panePositioning/`.
- [x] **Delete README from hooks** — `src/shared/hooks/README_timestamp_updates.md`. Just delete it. Effort: trivial. Risk: safe.
- [x] **Group debug files** — debugConfig.ts, debugPolling.ts, debugRendering.ts scattered in shared/lib root. Strategy: Create `shared/lib/debug/` directory, move all three, update imports. Effort: trivial. Risk: safe.

### Stale Migration — 88.0, weight 3x, impact 21pts

- [x] **Deprecated shims** — useSegmentOutputsForShot, VideoPortionEditor, useSegmentSettings all deleted in previous sessions.
- [x] **Deprecated fields in ProjectImageSettings** — 7 `@deprecated` fields needed by migration hooks. Strategy: Add a block comment explaining these are intentionally retained for backward-compatible settings migration, not dead code. Effort: trivial. Risk: safe.
- [x] **useSegmentSettingsForm deprecated return fields** — 2 deprecated fields with zero consumers. Just remove them. Effort: trivial. Risk: safe.

---

## Tier 3: Lower Impact (<20 weighted points)

### Test Strategy — 90.0, weight 3x, impact 15pts
- [x] **supabaseTypeHelpers test gap** — Write real tests for `src/shared/lib/supabaseTypeHelpers.ts`. Effort: moderate. Risk: safe.
- [x] **Colocated test files** — Already fixed.

### API Coherence — 91.0, weight 3x, impact 12pts
- [x] **PendingClipAction.type dead field** — Remove unused field from type definition. Effort: trivial. Risk: safe.
- [x] **Consolidate localStorage token reading** — Already consolidated into `shared/lib/supabaseSession.ts`.

### Auth Consistency — 91.0, weight 3x, impact 12pts
- [x] **JWT auth in complete_task** — Verify complete_task edge function checks JWT. It should — check `_shared/auth.ts` usage. If missing, add `requireAuth()` call. Effort: moderate. Risk: moderate (auth changes need testing).
- [x] **CORS handling in complete_task** — Verify CORS headers are set. Edge functions should use the shared CORS helper. Effort: trivial. Risk: safe.

### Error Consistency — 94.0, weight 3x, impact 3pts
- [x] **Sanitize complete_task error messages** — Replace internal error details in HTTP responses with generic messages. Keep full details in server logs. Effort: trivial. Risk: safe.
- [x] **DataFreshnessManager success toast** — Check if it still shows a success toast. Remove if present (toasts are errors-only per CLAUDE.md). Effort: trivial. Risk: safe.

---

## Mechanical Detectors (not weighted by dimension)

### Boilerplate Duplication — 90.6, 362 open findings

- [x] **Delete stub test files** — ~29 files confirmed with `toBeDefined()` stubs. Strategy: **Triage individually** — some should be deleted (if real tests exist elsewhere), some expanded with real assertions, some kept. Don't blanket-delete. Group by directory, review each in batches. Effort: moderate (1-1.5 hours). Risk: safe (test files only). Completed by removing pure `toBeDefined` stub files in `src/tools/travel-between-images/**` that had no behavioral assertions.

### Code Quality — responsibility_cohesion (10 issues, 0.3 pass rate)

- [x] **Split applySettingsService.ts** — 13 exported functions in 5 natural clusters. Strategy: Extract into 5 service modules:
  - `TaskDataService` (fetch, extract)
  - `GenerationSettingsService` (model, prompt, generation, modes)
  - `MotionSettingsService` (motion, text addons, phase config)
  - `ResourceService` (LoRAs, structure)
  - `ImageService` (positioning, replacement)
  - Single main caller (ShotEditor). Effort: moderate. Risk: safe.
- [x] **Split taskCreation.ts** — 13 functions in 9 clusters. Strategy: Group by task type (image, video, character animate, join clips) into separate files under `shared/lib/tasks/`. Keep shared validation in `taskCreation.ts`. Effort: moderate. Risk: safe.
- [x] **Split clipManagerService.ts** — 10 functions in 9 clusters. Strategy: Similar approach — group by responsibility (clip CRUD, clip ordering, clip playback). Effort: moderate. Risk: safe.

### Props detector — 125 open findings

- [x] **ShotImagesEditorProps (78 props)** — Group into: ImageState, EditActions, DisplayOptions, ShotWorkflow. ~4 groups. Effort: moderate. Risk: moderate (many call sites).
- [x] **BatchModeContentProps (56 props)** — Group into: BatchConfig, GenerationState, UIOptions. ~3 groups. Effort: moderate. Risk: moderate.
- [x] **MediaLightboxProps (54 props)** — Already grouped in previous session.
- [x] **JoinClipsSettingsFormProps (50 props)** — Group into: ClipSettings, MotionConfig, UIState. ~3 groups. Effort: moderate. Risk: moderate.

### File Health — 77 "needs decomposition" findings

- [x] **complete_task/index.ts** — Already well-split into 13 modules (generation-handlers.ts, generation-child.ts, etc.). Current index.ts is 363 lines — acceptable.
- [x] **useShotEditorController.ts (938 LOC)** — Extract 4 sub-controllers:
  - `useImageManagementController()` → images, add/remove handlers
  - `useGenerationController()` → mode, batch, generation handlers
  - `useOutputController()` → output selection, demotion handlers
  - `useEditingController()` → name editing, audio, join segments
  - Leaves main controller as clean orchestrator. Effort: significant. Risk: moderate (large refactor).
- [x] **useTimelinePositions.ts (811 LOC)** — Extract position calculation helpers into pure functions. Strategy: Identify calculation clusters (snap logic, overlap detection, position normalization) and extract to `timelinePositionCalc.ts`. Effort: moderate. Risk: safe (pure math functions).
- [x] **TimelineContainer.tsx (805 LOC)** — Extract sub-components: DragLayer, TimelineTrack, TimelineControls. Strategy: Find render sections that map to logical UI regions. Effort: significant. Risk: moderate.
- [x] **VideoShotDisplay.tsx (798 LOC)** — Extract sub-components: ShotPreview, ShotMetadata, ShotControls. Effort: significant. Risk: moderate.

---

## Execution Order

### Phase 1: Quick wins (30 min, ~+1.0 strict score)
1-line changes that clear multiple findings:
- Delete dead interfaces in generationTaskBridge
- Delete README from hooks
- Remove `_onClose` param from useInlineEditState
- Fix React import pattern in useTasks.ts
- Fix debugRendering.ts dead code
- Standardize process.env → import.meta.env.DEV (2 files)
- Add browser-chrome comment to InstallInstructionsModal
- Document deprecated ProjectImageSettings fields as intentional
- Remove deprecated return fields from useSegmentSettingsForm
- Remove PendingClipAction.type dead field
- Remove useAIInteractionService unused param + stale comments
- Fix ActiveLoRAsDisplay hardcoded colors

### Phase 2: Stub test triage (1 hr, ~+1.0 strict score)
Review each of the ~29 stub test files individually. Delete stubs where real tests exist. Expand the most important ones. Biggest single action for boilerplate_duplication.

### Phase 3: Mid/High Elegance fixes (2-3 hrs, ~+0.5 strict score)
The two highest-weighted dimensions:
- Extract 3 param builders in imageGeneration.ts
- Group 23 params → 3 objects in generateVideoService
- Replace useApiKeys manual upsert with `.upsert()`
- Remove setTimeout hack in useMediaGalleryHandlers (use React 18 batching)
- Fix ShotActions overlay colors
- Fix useLineageChain N+1 with batch query

### Phase 4: Type Safety + Contracts (1 hr, ~+0.3 strict score)
- Type edge function auth.ts supabaseAdmin
- Type complete_task fetchTaskContext supabase
- Fix useGenerationMutations casts → Shot[]
- Fix createGeneration return type → GenerationRow
- Fix usePaginatedTasks placeholderData signature

### Phase 5: Structural splits (3-5 hrs, ~+0.5 strict score)
- Split applySettingsService.ts into 5 service modules
- Split taskCreation.ts by task type
- Extract useShotEditorController sub-controllers (4 files)
- Group useInlineEditState returns into 3-4 objects

### Phase 6: Remaining prop grouping + file splits (2-3 hrs, ~+0.3 strict score)
- Group ShotImagesEditorProps, BatchModeContentProps, JoinClipsSettingsFormProps
- Extract TimelineContainer sub-components
- Extract VideoShotDisplay sub-components
- Extract useTimelinePositions pure functions

**Estimated total: 93.0 → ~96-97 strict score**
