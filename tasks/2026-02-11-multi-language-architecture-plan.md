# Multi-Language Architecture: Making `decruftify` Truly Pluggable

## Problem Statement

`LangConfig` is 90% of a good abstraction — it covers detection phases, dep graph building, entry patterns, and area classification. But the CLI layer (detect, fix, scan, state) was built for TypeScript and doesn't route through it. The result: 5 scanner bugs + a contributor must edit 5 shared files to add a language.

**Goal:** Creating `lang/<name>.py` with a LangConfig subclass is the ONLY file a contributor needs to create. No shared files need editing.

---

## Changes Made

### 1. State Scoping (fixes Bug 1 + Bug 2)

**Files: `state.py`, `plan.py`, `commands/scan.py`**

- `make_finding()` findings now carry a `lang` field, stamped in `_generate_findings_from_lang()`
- `merge_scan()` accepts `lang` and `scan_path` params
  - Only auto-resolves findings matching the current scan's language
  - Only auto-resolves findings under the current scan path
- TS scan no longer auto-resolves Python findings (or vice versa)
- Partial scan (`--path src/shared/hooks`) no longer auto-resolves findings in `src/tools/`

### 2. Suspect Detector Fix (Bug 4) + Force Resolve

**File: `state.py`**

- Threshold raised from `>= 3` to `>= 5` (small detector clearing is normal)
- Added `force_resolve` param to `merge_scan()` — bypasses suspect check entirely
- Added `--force-resolve` flag to `scan` CLI command

### 3. Scoring Fixes (Bug 5 + strict visibility)

**Files: `state.py`, `commands/scan.py`**

- Fixed docstring: "T4 architectural fixes are weighted 4x a T1 mechanical fix"
- Score and strict_score now at 1 decimal place (89.0 vs 88.7 instead of both showing 89)

### 4. Auto-Detect Default Language

**File: `plan.py`**

- `generate_findings()` now calls `auto_detect_lang()` when no `--lang` is passed
- Go projects with `go.mod` auto-detect to Go, Python projects to Python, etc.

### 5. CLI Routes Through LangConfig

**Files: `commands/detect.py`, `commands/fix_cmd.py`, `cli.py`, `lang/base.py`**

- `detect` command: validates detector name against `lang.detector_names`, checks `lang.detect_commands` for language-specific overrides, falls through to global TS dispatch
- `fix` command: checks `lang.fixers` first, falls through to hardcoded TS fixers
- CLI parser: detector and fixer names accept any string (validated at runtime, not argparse)
- LangConfig gains `detect_commands` field for per-language detect overrides

### 6. Auto-Discover Languages

**File: `lang/__init__.py`**

- `_load_all()` auto-discovers `lang/*.py` modules via `importlib` instead of explicit imports
- No need to edit `__init__.py` when adding a language

### 7. Symmetric State Paths

**File: `cli.py`**

- `_state_path()` uses `state-{lang}.json` for ALL languages when `--lang` is explicit
- No more special-casing TypeScript as "the default"

---

## Contributor Checklist

To add a new language (e.g., Go):

1. Create `scripts/decruftify/lang/go.py` — subclass `LangConfig`, register with `@register_lang("go")`
2. Create `scripts/decruftify/detectors/go/` — language-specific detectors (dep graph builder, unused, smells, etc.)
3. Wire phases in the LangConfig — each phase calls your detectors and returns findings via `make_finding()`
4. Optionally add `fixers`, `detect_commands`, `get_area`

No shared files need editing. Everything routes through your config automatically.

---

## Score Impact

After these changes:
- TS scan no longer corrupts Python state (and vice versa)
- Partial scans no longer auto-resolve out-of-scope findings
- `--force-resolve` clears the ~68 stale orphan findings → TS score jumps past 90%
- Strict score visible at 1dp (no longer identical to regular score at integer precision)
