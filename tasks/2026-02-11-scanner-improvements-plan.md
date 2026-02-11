# Scanner Improvements Plan: Road to 90%+ Strict Score

## Current State (after today's fixes)

| Lang | Score | Strict | Open | Total |
|------|-------|--------|------|-------|
| TS   | 89    | 89     | 284  | 3260  |
| Py   | 55    | 55     | 75   | 157   |

**Both scores are artificially depressed by scanner bugs.** The strict score is always identical to the regular score because there are only 11 wontfix items (0.4% weight difference — invisible at integer precision).

---

## Part 1: Scanner Bugs (fix these first — they corrupt the score)

### Bug 1: Cross-language state contamination (CRITICAL)
**Impact: Causes 212 findings to ping-pong between resolved/reopened**

TS and Python scans share one `state.json`. They share detector names (`unused`, `structural`, `smells`, `dupes`, `cycles`). When a TS scan runs, it can't see Python-only findings, so `merge_scan` auto-resolves them. Then a Python scan reopens them. Repeat forever.

This explains: "212 findings reopened — was a previous fix reverted?"

**Fix:** Add a `lang` field to each finding (set from the LangConfig). In `merge_scan`, only auto-resolve findings matching the current scan's language. Alternatively, use separate state files per language.

### Bug 2: Partial scans auto-resolve out-of-scope findings (HIGH)
**Impact: `scan --path src/shared/hooks` auto-resolves findings in `src/tools/`**

`merge_scan` auto-resolves any finding not in the current scan's results, regardless of whether the finding's file was in the scan path.

**Fix:** In `merge_scan`, when auto-resolving disappeared findings, check if `finding["file"]` starts with the current scan path. Only auto-resolve findings whose files are within scope.

### Bug 3: Orphan detector returns 0 in scan phase but 2 standalone (MEDIUM)
**Impact: 70 stale TS orphaned findings stuck open, bloating open count**

`detect orphaned` standalone finds 2 real orphans. But the scan's coupling phase produces 0 orphaned findings. The suspect-detector safety then prevents auto-resolving the 70 stale ones. The same issue affects Python (36 stale orphaned findings).

**Fix:** Investigate why `_phase_coupling`'s call to `detect_orphaned_files` returns different results from `cmd_orphaned`. Likely a graph construction difference.

### Bug 4: Suspect detector threshold is too aggressive (LOW)
**Impact: Stale findings can never be auto-resolved once a detector hits 0**

The check `prev_count >= 3 and current == 0` means: if orphaned previously had 36 open findings and now legitimately finds 0, those 36 are frozen forever. No escape hatch.

**Fix:** Add a ratio-based threshold (`current / previous < 0.1`), or a `--force-resolve` flag to manually clear suspect findings, or age-out findings after N scans with 0 results.

### Bug 5: Docstring says T1 > T4 but code does T4 > T1 (TRIVIAL)
`_recompute_stats` docstring claims "T1 fixes are worth 4x a T4 fix" — the opposite of the actual `TIER_WEIGHTS = {1: 1, 2: 2, 3: 3, 4: 4}`.

---

## Part 2: Scoring System Improvements

### Strict score is invisible
With 11 wontfix items at integer precision, strict always equals regular. Options:
- **Show 1 decimal place** (97.0 vs 96.6) — minimal change, makes the feature visible
- **Exclude auto_resolved from strict** — currently 1,335 auto_resolved findings count toward strict. If strict only counted manually-confirmed fixes (`fixed` + `false_positive`), it would be a genuinely different metric. Current strict is 89, true-strict would be much lower.
- **Both** — show 1dp AND make strict mean "manually confirmed"

### State file grows unboundedly
2.4 MB with 3,260 findings (97% resolved). No pruning. After hundreds of scans this becomes unwieldy. Consider archiving findings resolved >10 scans ago with no reopens.

---

## Part 3: What to Actually Fix (after scanner bugs are resolved)

### Current TS open findings breakdown (284 total)

| Detector | Open | Tier | Action |
|----------|------|------|--------|
| props | 90 | T3 | Investigate — is this detector too noisy? 90 findings is a LOT |
| structural | 86 | T3 | Legitimate large files. Some decomposable, some acceptable |
| orphaned | 70 | T3 | **Mostly stale** — fix Bug 3, then re-check (only 2 real orphans) |
| smells | 10 | T3 | Real findings — fix or wontfix individually |
| react | 8 | T3 | State sync anti-patterns — real findings |
| patterns | 5 | T3 | Check if real or noisy |
| coupling | 4 | T2-T3 | Real findings — cross-tool imports |
| cycles | 3 | T3-T4 | Real import cycles (the deferred-import fix only applied to Python) |
| deprecated | 3 | T3 | Real deprecated usage |
| dupes | 3 | T3 | Real near-duplicates |
| single use | 2 | T3 | Real single-use abstractions |
| unused | 0 | T1 | Clean |

### Path to 90%+ strict

**If we fix the scanner bugs first:**
- Bug 1 (cross-lang contamination): prevents 212 findings from ping-ponging
- Bug 3 (orphan detector): resolves ~68 of 70 stale orphaned findings
- Together: ~280 fewer bogus open findings → score jumps significantly

**Then for real findings (remaining ~80-100):**
1. **Props detector (90 items):** Read a sample — if >50% are noise, tune the detector. If real, fix in batches by area
2. **Structural (86 items):** These are real large/complex files. Triage: decompose the worst ones (T4s first), wontfix the ones that are inherently complex
3. **Smells + react + patterns (23 items):** Fix individually — these are specific, actionable findings

### Score math to 90%+

Current TS: 89/100 with total_weight ≈ 7,860
- Open weight ≈ 852 (284 items × ~3 avg tier weight)
- Need open weight < 786 (10% of total) for 90%
- That means resolving ~22 T3 findings (22 × 3 = 66 weight reduction: 852 → 786)

**Fixing Bug 3 alone (68 orphan false positives resolved) would push past 90%.**

---

## Recommended Execution Order

- [ ] **1. Fix cross-language state contamination** (Bug 1) — add `lang` field to findings, scope auto-resolve
- [ ] **2. Fix orphan detector discrepancy** (Bug 3) — investigate graph difference
- [ ] **3. Fix partial scan auto-resolve** (Bug 2) — scope by scan path
- [ ] **4. Fix suspect detector threshold** (Bug 4) — add ratio + force-resolve
- [ ] **5. Fix docstring** (Bug 5) — trivial
- [ ] **6. Show strict score at 1 decimal** — make the metric visible
- [ ] **7. Re-scan** — should be 90%+ after bugs are fixed
- [ ] **8. Triage props detector** — read findings, tune or fix
- [ ] **9. Fix remaining real findings** — smells, react, patterns, dupes
