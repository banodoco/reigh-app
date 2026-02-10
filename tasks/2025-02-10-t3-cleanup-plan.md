# T3 Cleanup Plan

**Current Score:** 86/100
**Target:** 100/100
**T1:** Done (100%)
**T3:** 521 open / 649 total (20% addressed)
**T4:** 46 open / 356 total (87% addressed)

> **ANTI-LAZINESS RULES** (read before every phase):
> 1. **No blanket wontfixes.** Every item must be read before deciding. "Read" means opening the file and understanding the context, not just looking at the finding metadata.
> 2. **Wontfix notes must be specific.** Not "acceptable" or "fine as-is" — explain WHY for THIS file. If you can't articulate why, you haven't read it.
> 3. **Fix what you can.** If reading a "wontfix candidate" reveals a 2-minute improvement, make it. Don't skip easy wins.
> 4. **Don't inflate the score.** The goal is better code, not a higher number. If you're wontfixing to move the needle, you're gaming the system.
> 5. **Sub-agents are helpers, not rubber stamps.** Review their output. If a sub-agent wontfixed 90% of its batch, something is wrong.
> 6. **When in doubt, fix.** The default should be fixing, not wontfixing. Only wontfix when fixing would make the code worse or when the finding is genuinely a false positive.

## Score Math

| Scenario | Score |
|----------|-------|
| Current state | 84 |
| Fix T1 only (30 items) | 86 |
| Fix T1 + 250 T3 items | 93 |
| Fix/wontfix all T3 | 99 |
| Fix/wontfix all T3 + T4 | 100 |

## T3 Composition

| Detector | Count | Sub-breakdown |
|----------|-------|---------------|
| structural | 156 | 103 "just large", 12 "just complex", 7 "just god", 2 "just mixed", 32 multi-signal |
| props | 138 | 85 mild (≤20), 35 moderate (21-40), 18 bloated (>40) |
| single_use | 112 | 9 tiny (<30 LOC), 20 small (30-49), 83 medium (201-400) |
| smells | 79 | 23 console_error, 18 hardcoded_rgb, 14 any_type, 11 non_null, 7 magic_number, 5 ts_ignore, 1 hardcoded_color |
| dupes | 31 | 16 high-sim (≥90%), 15 moderate (80-89%) |
| deprecated | 4 | 1×135 importers, 1×3 importers, 2×1 importer |

---

## Phases

### Phase 0: T1 Auto-fix (30 items, ~5 min)

Auto-fix 30 unused imports with existing fixer. Highest ROI: T1 items have 4× weight.

```
decruftify fix unused-imports
npx tsc --noEmit
```

**Caveat:** Some of these 30 may be from unstaged Lightbox changes. If the fixer removes an import that unstaged code needs, tsc will catch it — revert those specific removals.

**Score:** 84 → 86

### Phase 1: Smells — Read Every One (79 items, ~1.5 hours)

No blanket decisions. Read each instance, decide individually.

**1a. console_error_no_throw (23 items)**
Read each call site. Three possible outcomes per instance:
- **Should throw:** The error is unrecoverable, add `throw` (or convert to `handleError()`)
- **Should return early:** The function can't continue meaningfully, add `return`
- **Informational logging:** The error is advisory (e.g., non-critical API failure), the code continues correctly → wontfix with note "informational error log, execution continues safely"

Sub-agent approach: batch by file, read 3 lines of context around each console.error.

**1b. any_type (14 items)**
Read each `: any` annotation. Replace with proper type. Common patterns:
- Event handlers → `React.MouseEvent`, `React.ChangeEvent<HTMLInputElement>`
- API responses → `unknown` + type guard, or define response type
- Third-party lib returns → check lib's type exports
- Truly unknown → `unknown` (stricter than `any`)

Sub-agent per file.

**1c. ts_ignore (5 items)**
Read each suppression. Options:
- Fix the underlying type error (best)
- Replace with `@ts-expect-error` + comment explaining why (acceptable)
- Wontfix if it's suppressing a genuine TS limitation

**1d. non_null_assert (11 items)**
Read each `!.` usage. Options:
- Add a null check before the assertion (best)
- If after a guard clause that TS can't narrow → wontfix with note
- If genuinely dangerous (no prior check) → add guard

**1e. magic_number (7 items)**
Read each. Options:
- Extract to named constant if meaning is unclear (`2000` → `DEBOUNCE_MS`)
- Wontfix if meaning is obvious in context (`[0]`, array index; `100` in percentage calc)

**1f. hardcoded_color (1 item) + hardcoded_rgb (18 items)**
Read each. Options:
- In component CSS/style → replace with tailwind class or CSS variable
- In SVG/canvas rendering → often needs exact values, wontfix with note "SVG fill color"
- In shadcn theme override → wontfix with note "theme configuration"

**Score:** 86 → 89

### Phase 2: Near-Duplicates (31 items, ~2 hours)

Review each pair. 16 have ≥90% similarity (strong extraction candidates), 15 are 80-89%.

**For ≥90% pairs:** Extract shared utility/hook. These are nearly identical code that clearly should be one function.

**For 80-89% pairs:** Read both sides. Decide:
- Same concept with minor variation → extract with parameter for the difference
- Coincidentally similar but different intent → wontfix with note "similar structure, different domain purpose"

Group by file cluster before extracting to avoid cross-cutting conflicts.

**Score:** 89 → 90

### Phase 3: Deprecated Symbols (4 items, ~30 min)

- **GenerationRow (135 importers):** Wontfix — this is a full migration project, not a cleanup item. Note: "135 consumers, requires dedicated migration effort"
- **VideoStructureApiParams (3 importers):** Read the 3 import sites, migrate to replacement type
- **LegacyStructureVideoConfig (1 importer):** Migrate the single consumer
- **isGenerationVideo (1 importer):** Migrate the single consumer

**Score:** 90 → 90 (tiny impact)

### Phase 4: Single-Use Abstractions — Review All (112 items, ~1.5 hours)

No blanket wontfix. Review by size bucket:

**<30 LOC (9 items):** Skim each. Most are tiny utility files (e.g., `useVideoPreload.ts` 31 LOC). Likely fine as-is but check:
- Is it just a re-export or wrapper with no logic? → inline
- Is it a focused utility? → wontfix "small focused utility, extraction aids readability"

**30-49 LOC (20 items):** Read each. These are borderline — small enough to inline but may have been extracted for good reason. Check:
- Does the sole consumer import anything else from the same directory? (if yes, the file is part of a module, fine)
- Is it a React component with its own JSX? → keep extracted
- Is it a 3-line function padded with types/imports? → inline

**201-400 LOC (83 items):** Batch review via sub-agents. For each file, the agent reads:
1. The file itself (is it well-organized? cohesive?)
2. Its sole consumer (would the consumer be better with this code inlined?)

Expected outcomes:
- Most (estimated ~70) will be wontfix "well-structured extraction, aids readability"
- Some (~10) may reveal the consumer should be split instead
- A few (~3) may genuinely be better inlined

Sub-agent approach: batch of 10 files per agent, agent produces triage list.

**Score:** 90 → 94

### Phase 5: Props Interfaces — Review All (138 items, ~3 hours)

Review every flagged interface by size bucket:

**≤20 props (85 items):** Sub-agent batch review. For each interface, the agent checks:
- Are all props distinct and necessary? (not duplicated/redundant)
- Is there prop drilling? (same prop passed through 3+ levels → should use context)
- Are there logical groups? (e.g., 5 `video_*` props → could be a `VideoConfig` sub-object)

Expected outcomes:
- ~60 genuinely fine → wontfix with specific note per interface
- ~15 have prop drilling → flag for context refactoring
- ~10 have groupable sub-objects → extract sub-interfaces

**21-40 props (35 items):** Individual review. These are more likely to benefit from decomposition:
- Check for concern mixing (display props + behavior props + data props all flat)
- Check if component should be split (doing too many things)
- Group into sub-interfaces where natural boundaries exist

**>40 props (18 items):** These definitely need work. Per-file refactoring:

| Props | File | Review approach |
|-------|------|----------------|
| 199 | useLightboxLayoutProps.ts | This is extreme — likely needs architectural rethink (context, composition) |
| 76 | ShotImagesEditor/types.ts | Group by feature area |
| 69 | Timeline.tsx | Extract section-specific sub-props |
| 64 | ControlsPanel.tsx | Split by control category |
| 63 | TimelineContainer/types.ts | Likely overlaps with Timeline.tsx |
| 58 | MediaGallery/types.ts | Split gallery-level vs item-level |
| 56 | BatchModeContent.tsx | Extract settings sub-interface |
| 54 | MediaLightbox.tsx | Use context for shared state |
| 52 | useSharedLightboxState.ts | Split by concern |
| 51 | MediaGalleryItem/types.ts | Split display vs interaction |
| 41-50 | (8 more files) | Review individually |

**Score:** 94 → 97

### Phase 6: Structural Files — Review All (156 T3 + 46 T4, ~3 hours)

**T3 "just large" 300-399 LOC (47 items):** Quick skim. Files barely over the threshold.
- Agent reads each file header (imports, exports, main structure)
- If well-organized with clear sections → wontfix "well-structured, size is appropriate for complexity"
- If obvious split points → note what could be extracted

**T3 "just large" 400-599 LOC (41 items):** More attention. Agent reads full file.
- Look for extractable hooks, utility functions, or sub-components
- Files that do one thing well at this size → wontfix with note
- Files with mixed responsibilities → plan split

**T3 "just large" 600+ LOC (15 items):** These deserve real consideration.
- Read each file fully
- Identify concrete split opportunities (which function/component could be its own file)
- For files that are genuinely cohesive (e.g., a complex form with many fields) → wontfix with note

**T3 non-large single-signal (21 items: 12 complex, 7 god, 2 mixed):** Read each.
- "Just complex" files may need algorithmic simplification or clearer control flow
- "Just god" (7+ hooks) → check if hooks can be composed into custom hooks
- "Just mixed" → check if concerns can be separated into files

**T3 multi-signal (32 items):** These are the real refactoring targets. Read each file.
- Identify the PRIMARY issue (usually "large + god" = component does too much)
- For each, decide: practical split plan vs wontfix
- Files appearing in multiple detector types (e.g., structural + props + dupes) get highest priority

**T4 items (46 items, all 3+ signals):** These are the worst offenders. Top 10 by LOC:
- ImageLightbox.tsx (1261 LOC, 11 hooks, 3 concerns, complex:7)
- ShotEditor/index.tsx (1137 LOC, 20 hooks, 3 concerns, complex:20)
- PhilosophyPane.tsx (1103 LOC, 23 hooks, 3 concerns)
- VideoLightbox.tsx (1077 LOC, 8 hooks, complex:6)
- ImageGenerationForm.tsx (1070 LOC, 22 hooks, 3 concerns, complex:34)
- InlineEditVideoView.tsx (1048 LOC, 16 hooks, 4 concerns, complex:15)
- SegmentSettingsForm.tsx (1044 LOC, 7 hooks, 3 concerns, complex:9)
- TimelineContainer.tsx (975 LOC, 3 concerns, complex:5)
- MediaGallery/index.tsx (953 LOC, 10 hooks, 3 concerns, complex:13)
- CharacterAnimatePage.tsx (932 LOC, 24 hooks, 3 concerns, complex:26)

For T4, review the top 15 for easy wins (hook extraction, sub-component extraction). The rest: wontfix with a specific note explaining what a future refactoring would target. These are NOT lazy wontfixes — each gets a specific note like: "Primary issue: 20 hooks in one component. Recommended refactor: extract useStructureVideo, useShotDrag, and useKeyboardShortcuts into separate hooks. Not done now because it requires testing the complex interaction between them."

**Score:** 97 → 100

---

## Execution Strategy

### Principles
1. **No blanket wontfixes.** Every item gets at least a skim-read before a decision.
2. **Wontfix notes must be specific.** Not "acceptable" — explain WHY it's acceptable for THIS file.
3. **Fix what can be fixed.** If reading a "wontfix candidate" reveals an easy improvement, make it.
4. **Sub-agents for throughput, not shortcuts.** Agents review and triage; the output is reviewed before resolving.

### Sub-agent Batching
- **Smells (Phase 1):** 1 agent per smell type. Agent reads all instances, proposes fix or wontfix per instance.
- **Dupes (Phase 2):** 1 agent per file cluster. Agent reads both files, proposes extraction.
- **Single-use (Phase 4):** Agents of 10 files each. Agent reads file + consumer, proposes triage.
- **Props (Phase 5):** Agents of 10 interfaces each. Agent reads interface + component, proposes fix or wontfix.
- **Structural (Phase 6):** Agents of 5 files each. Agent reads file, identifies split opportunities.

### Verification Loop
After each phase:
1. `npx tsc --noEmit` — must pass
2. `decruftify scan` — update state and score
3. `git diff --stat` — sanity check
4. Commit

### Phase Order (by ROI)
1. Phase 0 (T1 auto-fix) — 5 min, +2 points
2. Phase 1 (smells) — 1.5 hrs, +3 points
3. Phase 4 (single-use review) — 1.5 hrs, +4 points
4. Phase 5 (props review) — 3 hrs, +3 points
5. Phase 2 (dupes) — 2 hrs, +1 point
6. Phase 3 (deprecated) — 30 min, tiny
7. Phase 6 (structural + T4) — 3 hrs, +3 points

Total estimated: ~12 hours for 100/100.

## Master Checklist

- [ ] **Phase 0:** Fix 30 T1 unused imports (auto-fix)
- [ ] **Phase 1a:** Review + fix/wontfix 23 console_error_no_throw
- [ ] **Phase 1b:** Review + fix 14 any_type
- [ ] **Phase 1c:** Review + fix 5 ts_ignore
- [ ] **Phase 1d:** Review + fix/wontfix 11 non_null_assert
- [ ] **Phase 1e:** Review + fix/wontfix 7 magic_number
- [ ] **Phase 1f:** Review + fix/wontfix 19 hardcoded_color/rgb
- [ ] **Phase 2:** Review + extract/wontfix 31 near-duplicates
- [ ] **Phase 3:** Review + migrate/wontfix 4 deprecated symbols
- [ ] **Phase 4a:** Review 9 tiny single-use (<30 LOC)
- [ ] **Phase 4b:** Review 20 small single-use (30-49 LOC)
- [ ] **Phase 4c:** Review 83 medium single-use (201-400 LOC)
- [ ] **Phase 5a:** Review + fix/wontfix 85 props ≤20
- [ ] **Phase 5b:** Review + fix/wontfix 35 props 21-40
- [ ] **Phase 5c:** Decompose 18 props >40
- [ ] **Phase 6a:** Review 124 T3 single-signal structural
- [ ] **Phase 6b:** Review 32 T3 multi-signal structural
- [ ] **Phase 6c:** Review + plan 46 T4 structural (top 15 for easy wins)
