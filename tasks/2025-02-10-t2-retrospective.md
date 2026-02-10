# T2 Cleanup Retrospective

**Date:** 2025-02-10
**Score:** 66 → 84 (+18 points)
**T2:** 472 open → 0 open (1639 fixed, 24 wontfix/false_positive)
**Commits:** 8 commits, ~240 files changed, ~2500 lines deleted

## Retrospective Questions

### 1. What was confusing, slow, or error-prone?

**Cascading findings were the main friction.** Every fix could create new findings:
- Removing an export → function now unused locally
- Removing a function → its types/imports now unused
- Deleting a component → its imports (ToolTypeFilter) now orphaned

This meant 4 scan-fix-commit cycles after the "final" batch. Each cycle was fast but the iteration felt unnecessary.

**Sub-agent quality was inconsistent.** Some agents:
- Prefixed vars with `_` instead of removing them (scanner doesn't honor `_` convention)
- Changed arrow functions to function declarations (doesn't help)
- Claimed to fix things but the scanner still found them

**The resolve CLI was confusing at first.** The argument order is `resolve {fixed|wontfix} PATTERN --note "..."` not `resolve PATTERN --status fixed`. This tripped me up.

### 2. What information was missing that would have helped?

- **No list of which findings auto-fix can handle.** Had to guess what `fix unused-vars` would do vs what needed manual work.
- **No way to see finding details in batch.** `next --count 50 --output json` works but doesn't show the actual code context. Had to read each file separately.
- **No "cascade preview"** — would be useful to know "if you delete this function, 3 more findings will appear" before committing.

### 3. Were there patterns the auto-fixer should have handled but didn't?

Yes, several:

| Pattern | Count | Why auto-fixer missed it |
|---------|-------|-------------------------|
| Unused function params (positional) | ~15 | Can prefix with `_` automatically |
| Unused `const x = ...` standalone vars | ~50 | Could delete the line if no side effects |
| Unused destructured vars from hooks | ~200 | Could remove from destructuring pattern |
| Dead local functions (not exported) | ~10 | Could delete entire function body |
| Dead `useEffect` with empty body | 3 | Could detect `useEffect(() => {}, [...])` pattern |
| Empty if/else chains | 6 | Could detect and delete |
| Unused catch params | ~10 | Could prefix with `_` |

**Biggest miss:** Destructured vars from hooks. `const { a, b, unused } = useHook()` → `const { a, b } = useHook()` is mechanical and safe. This was 40%+ of all findings.

### 4. Did the sub-agent batch approach work well? What instructions were unclear?

**It worked well for throughput** — 30 agents processed ~438 findings in parallel, taking ~5 minutes total wall time. Without parallelism this would have been hours.

**Problems:**
- **`_` prefix convention mismatch:** Agents prefixed unused params with `_` (standard TS convention) but the scanner doesn't honor this. Need either: scanner ignores `_` prefixed vars, or agent instructions say "remove, don't prefix."
- **Agents couldn't run tsc.** Each agent made edits but couldn't verify they compiled. Some edits were wrong (removing vars that were actually used via spread patterns).
- **Batch boundaries caused missed cascades.** Agent A removes a function, Agent B tries to fix a var inside that function — edit fails because the code was already removed.
- **No idempotency.** If an agent partially fails, re-running it may double-edit files.

**Better approach:** Give each agent a single file (not a batch of files) and let it run `tsc` on that file after editing. Or: have a coordinator agent that processes findings sequentially with tsc validation between each.

### 5. Were the wontfix criteria clear enough, or were there gray areas?

**Clear cases:**
- Positional callback params (needed for later args) — wontfix
- Hook side effects (prefetch, cache priming) — wontfix
- Interface implementation params — wontfix

**Gray areas:**
- `usePageVisibility` dead_useeffect — had to read the code to determine it was a false_positive (had real body with VisibilityManager subscription)
- Dead exports of used-internally functions — is it "dead export" or intentional API surface? Decided to remove exports and keep functions.
- `_useUpdateTaskStatus` — prefixed with `_` meaning "intentionally unused" but scanner disagrees. Ended up deleting the whole function since it was truly dead code.

### 6. What nudges/prompts would have helped at decision points?

- **"This finding has been reopened 2x — consider wontfixing"** — for yo-yo findings
- **"Removing this will cascade to N more findings"** — preview before acting
- **"This file has 0 remaining findings after this fix"** — motivation signal
- **"Similar fix was applied in file X — apply same pattern?"** — cross-file suggestions

---

## Concrete Improvement Plan for Decruftify Tooling

### Priority 1: New auto-fixer patterns

1. **`fix unused-destructured`** — Remove unused vars from destructuring patterns:
   ```
   const { a, b, unused } = useHook() → const { a, b } = useHook()
   ```
   This covers 40%+ of T2 findings. Safe because destructuring is structural.

2. **`fix unused-params`** — Prefix unused function/callback params with `_`:
   ```
   onError: (err, variables, context) → onError: (_err, _variables, context)
   ```
   Only prefix, never remove (positional semantics).

3. **`fix dead-useeffect`** — Delete `useEffect(() => {}, [deps])` where body is empty or contains only comments.

4. **`fix empty-if-chain`** — Delete `if (cond) { }` blocks with empty bodies.

### Priority 2: Scanner improvements

5. **Ignore `_` prefixed vars** — Don't flag `_err`, `_variables` etc. as unused. These are intentionally unused by convention.

6. **Cascade preview in resolve output** — After resolving a finding, show "This may cascade to N related findings in the same file."

7. **Batch resolve** — `decruftify resolve wontfix PATTERN1 PATTERN2 PATTERN3 --note "..."` — accept multiple IDs in one command.

### Priority 3: Agent workflow improvements

8. **Agent instruction template** — Standard prompt for "clean unused vars in file X" that says:
   - Remove from destructuring (don't prefix)
   - Delete standalone unused `const` lines
   - Delete entire unused functions/hooks
   - Prefix positional callback params with `_`
   - Never prefix when you can remove

9. **Post-batch cascade resolver** — After a batch of fixes, automatically re-scan and identify cascading findings. Group them by file so the next batch can pick them up.

10. **Dry-run mode for agent batches** — Have agents report what they'd change without making edits. Human reviews, then applies.
