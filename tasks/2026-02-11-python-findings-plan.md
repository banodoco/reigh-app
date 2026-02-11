# Python Scan Findings: Evaluation & Action Plan

Scan target: `scripts/decruftify/` (the tool scanning itself)
Raw output: 155 findings across 44 files

## Evaluation: What's Real vs Noise

### Verdict by Category

| Category | Count | Valid | False/Noise | Notes |
|----------|-------|-------|-------------|-------|
| **unused** | 16 | **16** | 0 | All real. Ruff-based, high confidence. |
| **orphaned** | 36 | **~3** | ~33 | **CRITICAL BUG** in import graph builder — misses indented imports |
| **smells** | 55 | **~15** | ~40 | eval/exec is false positive; broad_except is intentional; magic numbers mostly false |
| **structural** | 26 | **~5** | ~21 | Top 5 files (>400 LOC or complexity >40) are real. Tail (score 6-12) is noise. |
| **dupes** | 15 | **~3** | ~12 | 12 are expected typescript.py↔plan.py copies. 3 genuine. |
| **large** | 7 | **7** | 0 | Valid but 100% redundant with structural findings. |
| **TOTAL** | **155** | **~49** | **~106** | **~68% false positive / noise rate** |

### Critical Issues Found

#### 1. Import graph builder misses indented imports (causes 36 false orphans)

**Root cause**: `detectors/py/imports.py` line 29 uses `grep -nE "^(import |from )"` which only matches top-level imports. This codebase uses lazy/deferred imports inside functions everywhere (for startup speed + avoiding circular imports). 31% of import lines are missed.

**Fix**: Change grep pattern to `^\s*(import |from )` — one character fix. Drops orphaned false positives from 36 → ~3.

**Secondary issue**: `from . import X` resolves to `__init__.py` instead of `./X.py`. This misses the `lang/__init__.py` → `lang/typescript.py` / `lang/python.py` connections.

#### 2. eval/exec false positive (string literal match)

**Root cause**: `detectors/py/smells.py` line 48 contains `"label": "eval()/exec() usage"` — the label string itself contains `eval()` which matches the detector's own regex. The detector is detecting its own documentation.

**Fix**: The smell scanner should skip matches inside string literals, or at minimum not scan within `SMELL_CHECKS` constant definitions.

#### 3. Magic number detector over-triggers (~23 false positives)

Most "magic numbers" flagged are:
- `* 100` / `/ 100` — percentage conversion (universal constant)
- `50`, `200` — documented threshold bounds for heuristics (explained in output messages)
- `300`, `500` — detector thresholds (the raison d'être of the tool)

Only ~2 genuine magic numbers found (e.g., `bar_len = 15` for progress bar width).

**Fix**: Exclude `100` (percentage scale), or require 4+ digits, or add allowlist for common threshold patterns.

#### 4. Large + structural double-counting

All 7 "large" findings also appear in the 26 "structural" findings. The structural detector already includes LOC as a signal. Having a separate "large" phase produces pure redundancy.

**Fix**: Either (a) remove the separate `_phase_large` and let structural handle it, or (b) suppress structural findings that only have "large" as their sole signal.

#### 5. Broad except is intentional pattern (22 findings, all low-value)

Every detector file has `except Exception: continue` in its file-iteration loop. For a tool scanning hundreds of files, silently skipping unreadable files is the right call. These are technically true but not actionable — you don't want the scanner to crash on one bad file.

**Could improve to**: `except (OSError, UnicodeDecodeError, ValueError):` for specificity.

#### 6. Complexity threshold too low

Score of 6 triggers findings (minimum threshold in `detect_complexity`). 12 files have complexity 6-12. For small/medium files, this is noise.

**Fix**: Raise minimum complexity score from 5 to 15+, or require score > LOC/20.

---

## Action Plan

### Phase 1: Tool Quality Fixes (fix the tool before acting on findings)

These improve the Python scan quality so we can trust the results.

#### 1a. Fix import graph builder — indented imports ✦ CRITICAL
- **File**: `detectors/py/imports.py` line 29
- **Change**: `^(import |from )` → `^\s*(import |from )`
- **Also fix**: `from . import X` resolution in `_resolve_relative_import`
- **Test**: Re-scan, verify orphaned drops from 36 → <5

#### 1b. Fix eval/exec false positive
- **File**: `detectors/py/smells.py`
- **Change**: Add `# noqa` awareness or skip matches inside triple-quoted strings / assignment RHS
- **Simpler approach**: In the regex-based smell scanner, skip lines where the match appears inside a string literal (rough heuristic: line contains `r"` before the match)

#### 1c. Remove redundant large phase
- **File**: `lang/python.py`
- **Change**: Remove `_phase_large` from phases list. The structural phase already detects large files.
- **Impact**: -7 redundant findings

#### 1d. Tune magic number detector
- **File**: `detectors/py/smells.py` SMELL_CHECKS
- **Change**: Require 4+ digits instead of 3+ (`\d{4,}` instead of `\d{3,}`), OR exclude `100` specifically
- **Rationale**: 3-digit numbers in a config/threshold tool are almost always intentional

#### 1e. Raise complexity threshold
- **File**: `detectors/py/complexity.py`
- **Change**: Raise minimum score from 5 → 15
- **Impact**: Cuts ~12 low-value structural findings

#### 1f. Add entry_patterns for CLI-loaded modules
- **File**: `lang/python.py` PY_ENTRY_PATTERNS
- **Add**: `cli.py`, `__main__.py` (already there), `commands/` directory pattern
- **Rationale**: CLI commands loaded via importlib are entry points, not orphans

### Phase 2: Fix Valid Findings (act on what the tool correctly found)

#### 2a. Remove unused imports (16 findings → 0) ✦ QUICK WIN
All ruff-verified, mechanical removal:

| File | Unused Import |
|------|--------------|
| `detectors/smells.py` | `..utils.log`, `..utils.grep` |
| `plan.py` | `.utils.log`, `.lang.base.LangConfig` |
| `visualize.py` | `.utils.SRC_PATH`, `.utils.resolve_path` |
| `commands/fix_cmd.py` | `..state.save_state` |
| `commands/next.py` | `..plan.TIER_LABELS` |
| `commands/status.py` | `..plan.TIER_LABELS` |
| `detectors/coupling.py` | `..utils.get_area` |
| `detectors/deps.py` | unused var `resolved` (line 73) |
| `detectors/orphaned.py` | `..utils.SRC_PATH` |
| `detectors/py/unused.py` | `...utils.rel` |
| `fixers/exports.py` | `collections.defaultdict` |
| `lang/base.py` | `typing.Any` |
| `lang/typescript.py` | `..utils.SRC_PATH` |

#### 2b. Fix empty except / swallowed errors (10 findings)
- **Empty except** (6 instances): Convert `except Exception: pass` to `except (OSError, UnicodeDecodeError): pass`
- **Swallowed errors** (4 in fixers): Convert `except Exception as e: print(e)` to either re-raise or use specific exceptions

Files: `visualize.py`, `fix_cmd.py`, `deprecated.py`, `unused.py`, `lang/__init__.py`, `fixers/{vars,params,common,logs}.py`

#### 2c. Consolidate plan.py legacy ↔ typescript.py dupes (12 findings → 0)
The 12 near-duplicates between `plan.py` `_findings_from_*` functions and `lang/typescript.py` `_phase_*` functions exist because we copied the logic during the multi-language refactor.

**Action**: Make the default (no `--lang`) path use `lang/typescript.py` instead of the legacy functions. Then delete all `_findings_from_*` functions from `plan.py`. This is ~200 lines of dead code.

**Risk**: Need to verify the lang-based TS path produces identical results to legacy. We already tested this (`--lang typescript` vs no flag both give 128 findings / 96 score).

#### 2d. Refactor _detect_empty_except / _detect_swallowed_errors (1 genuine dupe)
In `detectors/py/smells.py`, these two functions are 84% similar. Extract shared `_walk_except_blocks()` helper that yields `(line_num, except_line, body_lines)`, then each function just applies its specific check.

#### 2e. Decompose top structural offenders
Only the top files warrant attention:

| File | LOC | Complexity | Action |
|------|-----|-----------|--------|
| `visualize.py` | 562 | 12 | Extract chart renderers into submodules |
| `plan.py` | 555 | 76 | Delete legacy `_findings_from_*` after 2c |
| `detectors/smells.py` | 466 | 22 | Fine as-is (it's a list of patterns + 2 multi-line detectors) |
| `lang/typescript.py` | 424 | 67 | Fine — 8 phase runners, each is self-contained |
| `commands/fix_cmd.py` | 354 | 13 | Could extract individual fixers, but low ROI |

After 2c (deleting legacy functions), `plan.py` drops from 555 → ~350 LOC and complexity drops significantly.

---

## Execution Order

```
Phase 1 (tool fixes) — can be done in parallel:
  1a. Fix import graph builder        [15 min]
  1b. Fix eval/exec false positive     [5 min]
  1c. Remove redundant large phase     [5 min]
  1d. Tune magic number threshold      [5 min]
  1e. Raise complexity threshold       [5 min]
  1f. Add entry patterns               [5 min]

→ Re-scan to verify improved signal quality

Phase 2 (fix findings) — sequential where noted:
  2a. Remove unused imports            [10 min, parallelizable]
  2b. Fix except patterns              [15 min, parallelizable]
  2c. Delete legacy plan.py functions  [20 min, depends on re-scan verification]
  2d. Refactor except block helpers    [10 min]
  2e. Decompose visualize.py           [20 min]

→ Final re-scan to verify score improvement
```

## Expected Outcome

After Phase 1: ~155 findings → ~50 (eliminate ~105 false positives/noise)
After Phase 2: ~50 findings → ~15 (fix 35 real issues, ~15 remaining are acceptable broad_except patterns)

Target score: 70+/100
