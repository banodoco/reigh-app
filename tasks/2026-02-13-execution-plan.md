# Execution Plan: Deploying Sub-Agents Across All 6 Themes

> This is the operational plan for HOW to execute the work in P1-P6.
> Goal: maximum parallelism, zero file conflicts between concurrent agents.

## Dependency Graph

```
Wave 1 (all independent)
├── Agent A: Dead hooks (P1:1-4)
├── Agent B: useUpscale cleanup (P1:6)
├── Agent C: Type field cleanup (P1:7-8)
├── Agent D: Hardcoded colors (P3:2)
├── Agent E: imagesPerPrompt fix (P3:1)
├── Agent F: LoRA types + task creation dedup (P2:A+C)
├── Agent G: complete_task query optimization (P3:3)
└── Agent H: ReferenceSectionProps → context (P3:4)

Wave 2 (after Wave 1, all independent)
├── Agent I: Device detection consolidation (P2:D)
├── Agent J: PanesContext lock setter unification (P4:C)
├── Agent K: PaymentSuccessPage state machine (P4:D)
├── Agent L: Edge functions @ts-nocheck removal (P2:B partial — 7 functions)
└── Agent M: Task status guards (P5:F)

Wave 3 (after Wave 2, I→N dependency)
├── Agent N: Mobile timeout extraction (P4:B) — depends on I (device detection)
├── Agent O: Edge functions auth standardization (P2:B remaining)
├── Agent P: Rate limiting fix — ai-prompt user ID (P5:B)
├── Agent Q: Billing logic consolidation (P5:E)
└── Agent R: Window globals cleanup (P5:D)

Wave 4 (after Wave 3, N→S dependency)
├── Agent S: ProjectContext decomposition (P5:A) — depends on N (timeout extracted)
├── Agent T: App.tsx auth gate + provider grouping (P5:C)
└── Agent U: Edge functions logging + CORS (P2:B final pass)

Wave 5 (P6 monolith decomposition — each independent, do in priority order)
├── Agent V: ImageEditContext → split into 4 sub-contexts (P6:4)
├── Agent W: SegmentSettingsForm → extract sub-forms (P6:1)
├── Agent X: MediaGallery → config object + context (P6:3)
└── ... (remaining P6 items, 2-3 per wave)
```

## Wave Details

### Wave 1 — Quick Wins (8 parallel agents)

All touch completely different files. Zero overlap risk.

| Agent | Plan Items | Files Modified | Est. Effort |
|-------|-----------|----------------|-------------|
| A | P1:1-4 (dead hooks + invalidation) | ToolPageHeaderContext.tsx, GenerationTaskContext.tsx, useGenerationInvalidation.ts, data_fetching.md | Tiny — delete ~60 lines |
| B | P1:6 (useUpscale dead fields) | useUpscale.ts, InlineEditView.tsx, BottomLeftControls (find) | Small — delete ~30 lines, update 2 consumers |
| C | P1:7-8 (type fields + DEPRECATED comments) | image-generation/settings.ts, ImageGenerationForm/types.ts, travel-between-images/settings.ts | Tiny — delete 4 fields, update 3 comments |
| D | P3:2 (hardcoded colors) | OnboardingModal.tsx, DatasetBrowserModal.tsx | Small — replace ~15 color values with theme tokens |
| E | P3:1 (imagesPerPrompt) | ImageGenerationForm.tsx (only lines 70-76) | Tiny — store per-mode values |
| F | P2:A+C (LoRA types + task dedup) | shared/types/lora.ts (NEW), annotatedImageEdit.ts, imageInpaint.ts, imageGeneration.ts, magicEdit.ts, zImageTurboI2I.ts, taskCreation.ts | Medium — create shared types, extract buildHiresFixParams, migrate imageInpaint inline batch to shared |
| G | P3:3 (complete_task query) | complete_task/index.ts (lines 42-81 only) | Small — merge 2 queries into 1, add FK migration if needed |
| H | P3:4 (ReferenceSectionProps) | reference/types.ts, ReferenceSection.tsx, ReferenceModeControls, ReferenceGrid, LoraGrid | Medium — remove props, add context consumption |

**Deployment:** Send all 8 agents simultaneously. Each gets a detailed prompt with:
- Exact file paths and line numbers
- What to delete/modify
- What NOT to touch
- How to verify the change (e.g., "grep for removed identifiers to confirm no remaining references")

---

### Wave 2 — Consistency & Mobile (5 parallel agents)

No overlap with each other. Some files were modified in Wave 1 but those agents are done.

| Agent | Plan Items | Files Modified | Est. Effort |
|-------|-----------|----------------|-------------|
| I | P2:D (device detection) | use-mobile.tsx, useDeviceDetection.ts | Medium — merge hooks, add exports |
| J | P4:C (PanesContext) | PanesContext.tsx | Small — extract factory function, replace 3 setters |
| K | P4:D (PaymentSuccessPage) | PaymentSuccessPage.tsx | Medium — replace 4 timeouts with state machine |
| L | P2:B partial (@ts-nocheck) | 7 edge functions: ai-prompt, ai-voice-prompt, broadcast-realtime, generate-pat, revoke-pat, stripe-webhook, tasks-list | Medium — add types, remove @ts-nocheck |
| M | P5:F (task status guards) | update-task-status/index.ts, possibly new migration | Small — add Complete→Queued/InProgress guards |

---

### Wave 3 — Mobile Architecture + Edge Functions (5 parallel agents)

Agent N depends on Wave 2's Agent I (device detection must be consolidated first).
All others are independent.

| Agent | Plan Items | Files Modified | Est. Effort |
|-------|-----------|----------------|-------------|
| N | P4:B (mobile timeout) | ProjectContext.tsx, UserSettingsContext.tsx, AuthContext.tsx, NEW: useMobileTimeoutFallback.ts | Medium — extract shared hook, refactor 3 contexts |
| O | P2:B (auth standardization) | ~10 edge functions switching to authenticateRequest | Medium — mechanical but many files |
| P | P5:B (rate limiting) | ai-prompt/index.ts | Tiny — change `clientIp` to `user.id` |
| Q | P5:E (billing consolidation) | _shared/orchestrator.ts (NEW), calculate-task-cost/index.ts, update-task-status/index.ts | Medium — extract shared utility, replace 3 inline implementations |
| R | P5:D (window globals) | browser-extensions.d.ts, client.ts, AuthStateManager.ts, ProjectContext.tsx, TasksPane.tsx, mobileProjectDebug.ts | Small-Medium — type properly, gate behind DEV, document |

**Note:** Agent R touches ProjectContext.tsx (window global only), Agent N touches ProjectContext.tsx (mobile timeout). These must NOT run concurrently — N first, R after (or R handles only non-ProjectContext globals, and the ProjectContext global is handled in Wave 4).

**Revised:** Run N and R sequentially on ProjectContext, or split R to avoid ProjectContext (handle that global in Wave 4 with Agent S).

---

### Wave 4 — Structural Refactors (3 parallel agents)

These are the heavy lifts. ProjectContext decomposition depends on Wave 3 (mobile timeout extracted).

| Agent | Plan Items | Files Modified | Est. Effort |
|-------|-----------|----------------|-------------|
| S | P5:A (ProjectContext decomposition) | ProjectContext.tsx → useProjectCRUD.ts, useProjectSelection.ts, useProjectDefaults.ts, useProjectSettings.ts | High — 653 lines → 5 files |
| T | P5:C (App.tsx restructuring) | App.tsx, possibly AuthGate.tsx (NEW) | Medium — add auth gate, reorder providers |
| U | P2:B final (logging + CORS) | Remaining edge functions not yet standardized | Medium — add SystemLogger, standardize CORS |

---

### Wave 5 — Monolith Decomposition (2-3 per wave, ongoing)

Each component is independent. Do in priority order. These are the biggest individual items.

**Wave 5a (3 parallel):**
| Agent | Target | Strategy |
|-------|--------|----------|
| V | ImageEditContext (319 lines → 4 sub-contexts) | Split by concern: EditMode, BrushTool, Canvas, EditForm |
| W | SegmentSettingsForm (1044 lines) | Extract AdvancedSettings, StructureVideoSection, PromptField |
| X | MediaGallery (752 lines, 119 props) | Create GalleryConfig object, extract LightboxCoordinator |

**Wave 5b (3 parallel):**
| Agent | Target | Strategy |
|-------|--------|----------|
| Y | ImageLightbox (1030 lines) | Extract ImageEditOrchestrator, mode-specific panels |
| Z | TimelineContainer (988 lines) | Extract useTimelineInteractions, useTimelineZoom |
| AA | useGenerationActions (727 lines, 14 refs) | Split into useImageAdd, useImageRemove, useImagePosition |

**Wave 5c (remaining):**
- VideoLightbox, InlineEditView, EditModePanel, useAutoSaveSettings, useImageGenForm, useTrainingData

---

## Concurrency Map

```
Time →

Wave 1:  [A][B][C][D][E][F][G][H]  ← 8 parallel, all independent
          │
Wave 2:  [I][J][K][L][M]           ← 5 parallel, all independent
          │
Wave 3:  [N][O][P][Q]  [R*]        ← 4 parallel + R sequential after N
          │
Wave 4:  [S][T][U]                  ← 3 parallel
          │
Wave 5a: [V][W][X]                  ← 3 parallel
Wave 5b: [Y][Z][AA]                 ← 3 parallel
Wave 5c: [remaining]                ← 3 parallel
```

**Total agents:** ~30 agent deployments across 7 waves
**Estimated wall-clock time:** 7 wave-rounds (each wave takes 2-5 minutes for agent execution)

## Agent Prompt Template

Each agent gets:
1. **Context:** "You are refactoring the Reigh codebase. Your specific task is [X]."
2. **Files to modify:** Exact paths and line numbers
3. **What to do:** Step-by-step instructions
4. **What NOT to do:** Don't touch files outside your scope. Don't refactor beyond the task.
5. **Verification:** After changes, grep for removed identifiers / check no broken imports
6. **CLAUDE.md rules:** Remind of "every change should make the codebase smaller or more explicit"

## Risk Mitigation

1. **Git checkpoint between waves:** Commit after each wave before starting next
2. **Wave 1 is all deletions/small fixes** — lowest risk, validates approach
3. **Wave 5 items are independent** — if one fails, others aren't affected
4. **ProjectContext is the serial bottleneck** — touched by N then S, not parallelizable
5. **Edge function changes (waves 2-4)** should be deployed individually after each wave

---

## Post-Wave Evaluation Log

### Wave 1 — Evaluation

**Agents A-E, G:** All clean. Pure deletions and minimal fixes. No over-engineering risk.

**Agent H (ReferenceSection props → context):** Clean win. 35 drilled props → 3. Children consume `useFormCoreContext()` and `useFormReferencesContext()` directly. Standard React pattern, no new abstractions.

**Agent F (LoRA types + hires fix):** Good extraction, but **incomplete coverage**. Created `FalLoraConfig` and `ComfyLoraConfig` but left 10+ inline `{ path: string; strength: number }` occurrences in task creation files. **Fixed post-wave:** Added `PathLoraConfig` to `src/shared/types/lora.ts` and migrated all task creation files (`imageGeneration.ts`, `joinClips.ts`, `individualTravelSegment.ts`, `travelBetweenImages/types.ts`) plus `vaceDefaults.ts`. Remaining UI/hook files use extended shapes (`{ path, strength, id, name }`) — left alone as they need a different type.

**Sense check:** No over-engineering detected. All changes reduce code or increase type safety. `tsc --noEmit` passes clean.

### Wave 2 — Evaluation

**Agent I (Device detection consolidation):** Clean. Added `useIsPhone()`, `useIsTouchDevice()`, `useDeviceInfo()`, `isMobileUA()` to `use-mobile.tsx`. Migrated all 6 consumers of `useDeviceDetection` to use new hooks. Deleted `useDeviceDetection.ts`. The composite `useDeviceInfo()` returns a clean object type. No over-engineering — each individual hook is 5-10 lines.

**Agent J (PanesContext lock factory):** Clean. `createPaneLockSetter` factory replaces 3 identical 20-line functions with one ~25-line factory + 3 `useMemo` derivations. Tasks-specific side effect preserved via `lockKey === 'tasks'` guard. External API unchanged. Net -25 lines.

**Agent K (PaymentSuccessPage state machine):** Good refactor. 4 competing timeouts → explicit state machine with `PaymentState` type and named constants. Functional state updates prevent race conditions. The state machine is simple and documented with a comment at top of file. Auto-redirect was removed in favor of explicit "Return to Tool" button — this is an improvement (auto-redirect after payment is jarring). No over-engineering.

**Agent L (@ts-nocheck removal):** Completed 5 of 7 targeted functions (ai-voice-prompt, broadcast-realtime, generate-pat, revoke-pat, tasks-list) before hitting rate limit. Remaining: ai-prompt, stripe-webhook (the two largest/most complex). Changes are minimal — just type annotations and `error: unknown` catches. Deferred items will be addressed in Wave 3 alongside other ai-prompt work.

**Agent M (Task status transition guards):** Clean. Replaced ad-hoc "don't overwrite Complete" and "don't overwrite Cancelled" guards with a proper `validTransitions` lookup table. Returns 409 Conflict with the allowed transitions in the response. `In Progress → Queued` is allowed (requeue via clear_worker). No new files or abstractions.

**Sense check:** No over-engineering. All changes are appropriate in scope. `tsc --noEmit` passes clean.

### Wave 3 — Evaluation

**Agent N (Mobile timeout extraction):** Clean. Created `useMobileTimeoutFallback.ts` hook. ProjectContext and UserSettingsContext now use the shared hook instead of inline UA sniffing + timeout patterns. Inline `navigator.userAgent` regex replaced with `isMobileUA()` from `use-mobile.tsx`. ~40 lines removed from each context.

**Agent P (ai-prompt rate limit fix):** Clean. Changed `getClientIp(req)` → `user.id` for rate limiting. Also removed `@ts-nocheck`, added minimal types (`body: Record<string, unknown>` instead of `any`, safe property extraction instead of destructuring). Good two-for-one.

**Agent R (Window globals cleanup):** Clean. Centralized all `window.__*` type declarations in `browser-extensions.d.ts` with `[structural]` vs `[debug]` category annotations. Removed scattered `declare global` blocks from individual files. Gated debug globals behind `import.meta.env.DEV`. No behavior changes.

**Agent O (Auth standardization):** Clean. Migrated 7 edge functions from manual JWT extraction to shared `authenticateRequest()`: ai-voice-prompt, generate-pat, revoke-pat, delete-project, huggingface-upload, setup-auto-topup, stripe-checkout. Each function now has ~10 fewer lines. Functions that legitimately need different auth (stripe-webhook) were correctly skipped.

**Agent Q (Billing consolidation):** Good extraction. Created `_shared/billing.ts` (127 lines) with 4 exports: `extractOrchestratorRef`, `getSubTaskOrchestratorId`, `buildSubTaskFilter`, `triggerCostCalculation`. Updated `calculate-task-cost`, `update-task-status`, and `complete_task/billing.ts` to use shared module. One minor improvement: `complete_task` now uses UUID-validated sub-task detection instead of raw extraction.

**Sense check:** No over-engineering. The billing extraction is the largest new abstraction but justified — the duplicated sub-task detection logic was error-prone and the shared filter string was 200+ chars repeated 5 times. `tsc --noEmit` passes clean.

### Wave 4 — Evaluation

**Agent S (ProjectContext decomposition):** Good decomposition. ProjectContext 653→128 lines (thin provider). Three extracted hooks:
- `useProjectCRUD.ts` (327 lines): project list state, fetch/create/update/delete. `determineProjectIdToSelect` exported as utility.
- `useProjectSelection.ts` (150 lines): selectedProjectId state, localStorage persistence, cross-device sync.
- `useProjectDefaults.ts` (65 lines): side-effect orchestrator — fetch trigger, cross-device sync, prefetch, mobile timeout fallback.

Context shape is unchanged — all consumers (`useProject()`) get the exact same `ProjectContextType`. The callback pattern (onProjectsLoaded/Created/Deleted) is necessary for CRUD→selection communication. Not circular — `useProjectSelection` provides callbacks, `useProjectCRUD` calls them.

**Agent T (App.tsx auth gate):** Clean. `AuthGate` is a 6-line component that returns `null` during auth check, preventing data-dependent providers (UserSettings, Project, Realtime, etc.) from rendering before auth state is known. This is NOT an auth wall — unauthenticated users still render normally once auth check completes.

**Agent U (Edge function logging + CORS):** Mechanical. Added `SystemLogger` (buffered DB logging) to 18 edge functions. Changes are consistent: import → create logger → replace console.log/error → add `await logger.flush()` before error responses. Console output is preserved (SystemLogger writes to both console and DB). Functions that already had SystemLogger were skipped.

**Post-wave review fixes applied:**
1. **BUG FIX:** `window.__PROJECT_CONTEXT__` was incorrectly DEV-gated on write (by Wave 3 Agent R) but read in production by `useProjectGenerations`, `useTasks`, and `ImageGenerationToolPage`. Removed DEV gate — this is a `[structural]` global, not debug-only.
2. **Anti-pattern fix:** PanesContext `savePaneLocks` moved outside `setLocks` state updater to avoid side effects in updater functions (React StrictMode double-invocation safe).
3. **Stale comments:** Updated 3 references to deleted `useDeviceDetection` → `useDeviceInfo`.

**Sense check:** The ProjectContext decomposition is the largest structural change. Reviewed for over-engineering — the hook boundaries are clean and each hook has a single responsibility. `useProjectDefaults` is a bag of side effects by design (the orchestrator pattern keeps the other hooks pure). `tsc --noEmit` passes clean.

### Wave 5a — Evaluation

**Agent V (ImageEditContext → 3 sub-contexts):** Clean decomposition. Original 319-line monolithic context split into:
- `ImageEditCanvasContext.tsx` (182 lines): mode, brush, annotation, canvas, reposition, display refs. Consumers: LightboxLayout, FloatingToolControls, MediaDisplayWithCanvas, InfoPanel.
- `ImageEditFormContext.tsx` (105 lines): prompts, strengths, LoRA, model, advanced settings. Consumer: EditModePanel only.
- `ImageEditStatusContext.tsx` (76 lines): 10 generation loading/success booleans. Consumer: EditModePanel only.
- `ImageEditContext.tsx` (234 lines): composed provider with `useMemo` slices. Backward-compatible `useImageEditSafe()` preserved.

Split strategy was 3 contexts instead of planned 4 — correct decision since mode/brush/annotation/canvas/reposition are always consumed together by canvas components. The natural boundary is canvas vs. form vs. status. Consumers migrated to specific hooks. `tsc --noEmit` passes clean.

**Pre-existing issue found:** InlineEditView renders FloatingToolControls without wrapping in ImageEditProvider. FloatingToolControls reads from context (gets defaults), and the props InlineEditView passes are silently ignored. This predates our changes — FloatingToolControls was already context-only before Wave 5a.

**Agent W (SegmentSettingsForm → 3 sub-components):** Good extraction. Original 1044 lines → parent 376 lines + 3 extracted components:
- `AdvancedSettingsSection.tsx` (396 lines): collapsible advanced panel with motion/LoRA/structure video. Owns its own `savingField` state and LoRA handlers.
- `PromptSection.tsx` (116 lines): prompt textarea with enhanced/default badges and field controls.
- `StructureVideoSection.tsx` (429 lines): video upload, preview, treatment selector, strength/percent sliders, DatasetBrowser modal.

Total is 1334 lines (up from 1044) due to interface definitions and imports — expected overhead of decomposition. Each file has a clear single responsibility. No new contexts or abstractions — pure prop drilling at 1 level.

**Agent X (MediaGallery GalleryConfig object):** Clean. 17 individual boolean props → single `config?: Partial<GalleryConfig>` prop with `DEFAULT_GALLERY_CONFIG` defaults. Migrated 8 callers across 7 files. Internal components (Grid, Header, Lightbox) still accept individual props — correct since they're internal, and a second level of config-object indirection would add complexity for no benefit. `tsc --noEmit` passes clean. Net prop count: MediaGalleryProps went from ~50 fields to ~35.

**Sense check:** No over-engineering. All three decompositions are justified — each addressed a genuine monolith (>300 LOC or >40 props). The ImageEditContext split is the most impactful (re-render reduction for canvas components). SegmentSettingsForm extraction makes the code navigable. MediaGallery config object is a standard pattern. `tsc --noEmit` passes clean.
