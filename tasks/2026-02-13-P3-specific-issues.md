# P3: Notable Specific Issues

> Parent: `2026-02-13-master-ugliness-plan.md`
> Effort: Medium (1-2 sessions)
> Risk: Low — targeted fixes

## Master Checklist

- [ ] 1. Fix `imagesPerPrompt` silent change on prompt mode toggle
- [ ] 2. Fix hardcoded colors in OnboardingModal and DatasetBrowserModal
- [ ] 3. Optimize complete_task double query to single join
- [ ] 4. Fix ReferenceSectionProps 35-field prop drilling → use existing context
- [ ] 5. Document ImageLightbox state mirroring workaround (or fix root cause)
- [ ] 6. Document useGenerationActions 14-ref pattern (architectural note for P6)

---

## Item Details

### 1. imagesPerPrompt Silent Change

**Location:** `src/shared/components/ImageGenerationForm/ImageGenerationForm.tsx` lines 70-76

```tsx
form.setEffectivePromptMode(mode);
if (mode === 'automated') {
  form.setImagesPerPrompt(8);
} else if (mode === 'managed') {
  form.setImagesPerPrompt(1);
}
```

**Problem:** Switching prompt mode silently resets `imagesPerPrompt` without telling the user. If they had manually set it to 4, switching to managed drops it to 1 with no indication.

**Fix options:**
- **A (Minimal):** Add a toast or inline note: "Images per prompt set to {n} for {mode} mode"
- **B (Better):** Remember per-mode values — store `automatedImagesPerPrompt` and `managedImagesPerPrompt` separately, restore on switch
- **C (Best):** Don't auto-set at all; just change the default for new sessions

**Recommendation:** Option B — store separate values per mode.

### 2. Hardcoded Colors

**OnboardingModal:** Need to locate and replace hardcoded hex/rgb values with Tailwind theme tokens (`bg-background`, `text-foreground`, `border-border`, etc.)

**DatasetBrowserModal:** Same treatment.

**Action:** Search each component for hardcoded color values, replace with semantic tokens from the design system.

### 3. complete_task Double Query

**Location:** `supabase/functions/complete_task/index.ts` lines 42-81

```ts
// Query 1: Fetch task
const { data: task } = await supabase
  .from("tasks")
  .select(`id, task_type, project_id, params`)
  .eq("id", taskId)
  .single();

// Query 2: Fetch task_types metadata (comment: "no FK relationship exists")
const { data: typeData } = await supabase
  .from("task_types")
  .select("tool_type, category, content_type, variant_type")
  .eq("name", task.task_type)
  .single();
```

**The comment says "no FK" but you CAN join on string columns.** The `task_type` column holds the task type name, and `task_types.name` is the PK.

**Fix:** Single query with embedded select:
```ts
const { data: task } = await supabase
  .from("tasks")
  .select(`id, task_type, project_id, params, task_types!tasks_task_type_fkey(tool_type, category, content_type, variant_type)`)
  .eq("id", taskId)
  .single();
```

**Or** if no FK constraint exists, add one in a migration first (or use `.select()` with a manual join via RPC). Either way, this saves a round-trip on every task completion.

### 4. ReferenceSectionProps Prop Drilling

**Problem:** 35 fields drilled through `ReferenceSection` → 5 child components, when `ImageGenerationFormContext` already provides `FormReferenceState`, `FormReferenceHandlers`, `FormLoraState`, and `FormLoraHandlers`.

**File:** `src/shared/components/ImageGenerationForm/components/reference/types.ts` (lines 61-96)

**Drilling chain:** `ImageGenerationForm.tsx` → `ReferenceSection` → `ReferenceModeControls` (16 props), `ReferenceGrid` (9 props), `LoraGrid` (4 props), etc.

**Fix:** Have child components consume `useImageGenerationFormContext()` directly instead of receiving props. The context already contains all the reference/LoRA state and handlers.

**Approach:**
1. In `ReferenceModeControls`, `ReferenceGrid`, `LoraGrid` — import and use context directly
2. Remove context-sourced props from `ReferenceSectionProps` interface
3. Keep only truly local/override props in the interface
4. `ReferenceSection` itself becomes a thin layout wrapper

### 5. ImageLightbox State Mirroring

**Problem:** ImageLightbox creates local state that mirrors hook returns via useEffect sync, causing a one-frame delay.

**Root cause:** Hook ordering — some state isn't available during the render where it's needed, so it's "pushed" via useEffect into local state.

**Action for now:** Add a code comment explaining the workaround and what the proper fix would be (likely restructuring the hook dependency chain). Full fix deferred to P6 (ImageLightbox decomposition).

### 6. useGenerationActions 14 Refs

**Location:** `src/tools/travel-between-images/components/ShotEditor/hooks/useGenerationActions.ts` (727 lines)

**Problem:** 14 `useRef` declarations to work around stale closures. The callbacks need stable references but the data they read changes frequently.

**Root cause:** The component boundary is wrong — too many concerns in one hook, with data flowing through refs instead of through React's render cycle.

**Action for now:** Document as architectural note for P6. The proper fix is decomposing useGenerationActions into smaller hooks with narrower data dependencies (e.g., separate hooks for add/remove/duplicate/position operations).
