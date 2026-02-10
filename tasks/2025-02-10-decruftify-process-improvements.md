# Decruftify Process Improvements Plan

## Problem
The decruftify tooling works but doesn't guide the operator (human or agent) toward correct usage. Problems are discovered through manual investigation rather than being surfaced by the tool. We need two things:
1. **Context-aware nudges** — tool output that flags anomalies and suggests next actions based on actual run data
2. **Process memory** — persistent lessons learned that prevent repeat mistakes

---

## Phase 1: Context-Aware Scan Output

### 1a. Post-scan anomaly detection
After every scan, analyze the diff and flag suspicious patterns:

```python
# In cmd_scan, after merge_scan():
if diff["reopened"] > 5:
    print("⚠ {reopened} findings reopened — was a previous fix reverted?")
    print("  Check: git log --oneline -5")

if diff["new"] > 10 and diff["auto_resolved"] < 3:
    print("⚠ {new} new findings with few resolutions — likely cascading effects from recent fixes.")
    print("  Consider: run fixers again to address new items.")

suspect = diff.get("suspect_detectors", [])
if suspect:
    print("⚠ Detectors {suspect} returned 0 — transient failure? Re-run to confirm.")
```

### 1b. Suggested next action
After scan, suggest the highest-value next command based on tier breakdown:

```python
# Look at open counts per tier and suggest
if t1_open > 0:
    print(f"Next: `decruftify fix debug-logs --dry-run` ({t1_open} T1 items)")
elif t2_open > 0:
    # Suggest the fixer that covers the most open T2
    print(f"Next: `decruftify fix dead-exports --dry-run` ({export_open} items)")
```

### 1c. Scan-to-scan delta analysis
Track what changed between scans and surface it:

```
Since last scan:
  - Unused vars: 675 → 460 (-215) — fixes working
  - Dead exports: 356 → 1 (-355) — nearly clear
  - New findings: +19 (likely cascading from export removal)
```

**Files**: `cli.py` (cmd_scan output), `state.py` (store per-detector counts between scans)

---

## Phase 2: Smarter Fixer Feedback

### 2a. Skip reason reporting
When a fixer skips entries, report WHY with counts:

```
Fixed 243 of 675 entries. Skipped 432:
  - 48 standalone hook calls (React hook rules — can't remove)
  - 31 array destructuring (positional — needs _ prefix, not removal)
  - 63 function/callback params (context-dependent)
  - 120 standalone vars with function calls (possible side effects)
  - 170 other patterns (needs manual review)

Consider: Run `decruftify show unused --skip-reasons` for the full list.
```

This requires the fixer to track skip reasons as it processes entries.

**Files**: `fix.py` (add skip_reason tracking to fix_unused_vars), `cli.py` (display skip summary)

### 2b. Cascading effect detection
After any fix, do a quick delta check:

```python
# After fix completes, run a fast detect pass to count new issues
post_count = len(detector(path))
if post_count > pre_count:
    delta = post_count - pre_count
    print(f"⚠ Fix created {delta} new findings (cascading effect).")
    print(f"  Suggestion: run `decruftify fix unused-imports` to clean up.")
```

### 2c. `fix all` command
Chain fixers in dependency order:
1. debug-logs (may orphan imports)
2. unused-imports (clean up after logs)
3. dead-exports (may create unused locals)
4. unused-vars (clean up destructured vars)
5. unused-imports again (cascade from var removal)

Each step shows results before proceeding to the next. Stops if tsc breaks.

**Files**: `cli.py` (new `fix all` subcommand), `fix.py` (no changes needed)

---

## Phase 3: Process Memory (LESSONS.md)

### 3a. Create `scripts/decruftify/LESSONS.md`
A machine-readable (and human-readable) file encoding past learnings:

```markdown
# Decruftify Lessons Learned

## Fix Order Matters
Always run fixers in this order: debug-logs → unused-imports → dead-exports → unused-vars → unused-imports.
Reason: Each fixer can create cascading effects that the next one cleans up.

## Detector Gaps
- Emoji-prefixed console.logs (e.g., `console.log('🔍 [Tag]')`) — widened in logs.py pattern 1
- Template-literal tag variables — added in logs.py pattern 2
- If new log patterns appear in browser console, widen the grep patterns.

## Known Fixer Limitations
- unused-vars skips standalone React hooks (can't remove — would break Rules of Hooks)
- unused-vars skips destructuring with ...rest (removing changes rest object contents)
- unused-vars skips function params (positional — needs context)
- dead-exports skips `export default` (too context-dependent)

## Past Bugs
- _categorize_unused: was walking past blank lines to import statements, miscategorizing consts as imports. Fixed by checking declaration keywords first.
- State note bug: captured prev_status after reassignment. Fixed.
- Score flip-flop: tsc can return 0 results with stale build cache. Fixed with suspect detector guard.
```

### 3b. Reference LESSONS.md in tool output
When the tool encounters a known pattern, reference the relevant lesson:

```python
# In fix_unused_vars, when skipping a hook:
# "Skipped 48 standalone hooks — see LESSONS.md 'Known Fixer Limitations'"
```

---

## Phase 4: Agent-Specific Guidance

### 4a. Machine-readable output for agents
Every command already writes to `.decruftify/query.json`. Enhance this with:
- Explicit `next_action` field suggesting what to do next
- `warnings` array with anomaly descriptions
- `skip_reasons` breakdown for fixers

```json
{
  "command": "fix",
  "next_action": "Run `npx tsc --noEmit` to verify, then `decruftify scan` to update state",
  "warnings": ["19 new findings likely from cascading effects"],
  "skip_reasons": {"standalone_hook": 48, "array_destr": 31, "callback_param": 63}
}
```

### 4b. Pre-flight checklist in CLAUDE.md or LESSONS.md
Encode the correct workflow so agents follow it:

```markdown
## Decruftify Workflow (for agents)
1. `decruftify scan --path src/` — always start with a scan
2. `decruftify status` — check tier breakdown
3. Fix T1 first: `fix debug-logs`, then `fix unused-imports`
4. Fix T2: `fix dead-exports --dry-run` first, verify, then run for real
5. After EVERY fix: `npx tsc --noEmit` to verify
6. After EVERY fix: `git add -A && git commit -m "..." && git push`
7. Rescan: `decruftify scan --path src/`
8. Repeat until T2 is clear, then move to T3 (manual review)
```

---

## Implementation Priority

| Item | Effort | Impact | Do when |
|------|--------|--------|---------|
| 1b. Suggested next action after scan | Small | High | Now |
| 2a. Skip reason reporting | Medium | High | Now |
| 3a. LESSONS.md | Small | Medium | Now |
| 1a. Post-scan anomaly detection | Small | High | Now |
| 2c. `fix all` chained command | Medium | High | Next session |
| 1c. Scan-to-scan delta analysis | Medium | Medium | Next session |
| 2b. Cascading effect detection | Medium | Medium | Next session |
| 4a. Enhanced query.json for agents | Small | Medium | Next session |
| 3b. Reference lessons in output | Small | Low | Later |
| 4b. Workflow in CLAUDE.md | Small | Medium | Later |

## Master Checklist
- [x] Post-scan anomaly detection + suggested next action
- [x] Skip reason reporting in fixers
- [x] Create LESSONS.md with past learnings
- [x] Post-scan reflection prompts
- [x] Enhanced query.json output (warnings, next_action, skip_reasons)
- [ ] `fix all` chained command
- [ ] Scan-to-scan delta tracking
- [ ] Cascading effect detection after fixes
- [ ] Workflow documentation for agents (in LESSONS.md already)
