# Triage Tooling Fixes

Fixes to the desloppify triage flow identified by 5-agent audit. Ranked by impact.

## Master Checklist

- [ ] **1. Path validation in ENRICH gate** (high impact, ~1 day)
- [ ] **2. Effort tag requirement in ENRICH** (medium impact, ~0.5 day)
- [ ] **3. Cross-cluster file overlap warning in ORGANIZE** (medium impact, ~1 day)
- [ ] **4. Step title length cap** (low impact, ~0.5 day)
- [ ] **5. Cluster dependency field support** (medium impact, ~0.5 day)

---

## 1. Path validation in ENRICH gate

**The single most impactful change.** Would have caught 3 of 7 documented failure types.

### Problem
`_shallow_steps()` in `_stage_validation.py:232-247` checks that steps have a `detail` field but never validates that file paths in the detail actually exist on disk. Steps referencing `src/nonexistent/path.ts` pass identically to correct paths.

### Fix

**File:** `desloppify/app/commands/plan/triage/_stage_validation.py`

Add a new function `_steps_with_bad_paths()` that:
1. Iterates all manual cluster steps (same loop shape as `_shallow_steps`)
2. Extracts file paths from `detail` text using regex: `re.findall(r'(?:src|supabase)/[\w./-]+\.\w+', detail)`
3. For each extracted path, checks `Path(repo_root / path).exists()`
4. Also tries common extension swaps: `.ts` ↔ `.tsx`, `.js` ↔ `.jsx`
5. Returns `list[tuple[str, int, list[str]]]` — `(cluster_name, step_index, bad_paths)`

Call it from two places:
- **`_cmd_stage_enrich()`** at line ~436 (after `_shallow_steps` check): if bad paths found, print warning with details but don't block (first pass is advisory)
- **`_confirm_enrich()`** at line ~376 (after `_shallow_steps` re-check): if bad paths found, **block confirmation** with actionable error listing each bad path and which step it's in

```python
import re
from pathlib import Path

_PATH_RE = re.compile(r'(?:src|supabase)/[\w./-]+\.\w+')
_EXT_SWAPS = {'.ts': '.tsx', '.tsx': '.ts', '.js': '.jsx', '.jsx': '.js'}

def _steps_with_bad_paths(plan: dict, repo_root: Path) -> list[tuple[str, int, list[str]]]:
    """Return steps referencing file paths that don't exist on disk."""
    results = []
    for name, cluster in plan.get("clusters", {}).items():
        if cluster.get("auto") or not cluster.get("issue_ids"):
            continue
        for i, step in enumerate(cluster.get("action_steps") or []):
            if not isinstance(step, dict):
                continue
            detail = step.get("detail", "")
            if not detail:
                continue
            bad = []
            for path_str in _PATH_RE.findall(detail):
                p = repo_root / path_str
                if p.exists():
                    continue
                # Try extension swap
                alt_ext = _EXT_SWAPS.get(p.suffix)
                if alt_ext and p.with_suffix(alt_ext).exists():
                    continue
                bad.append(path_str)
            if bad:
                results.append((name, i + 1, bad))
    return results
```

**Repo root resolution:** Use the existing `command_runtime(args).root` or find `.desloppify/` parent.

### Tests
- Step with valid path → not flagged
- Step with bad path → flagged
- Step with `.ts` that exists as `.tsx` → not flagged (extension swap)
- Step with no paths in detail → not flagged
- Auto clusters skipped

---

## 2. Effort tag requirement in ENRICH

### Problem
Steps mix one-line fixes with multi-day refactors. No effort indication anywhere. A PM or executor can't estimate scope.

### Fix

**File:** `desloppify/app/commands/plan/triage/_stage_validation.py`

Add `_steps_without_effort()`:
```python
_VALID_EFFORTS = {"trivial", "small", "medium", "large"}

def _steps_without_effort(plan: dict) -> list[tuple[str, int, int]]:
    """Return (cluster_name, missing_count, total) for steps without effort tags."""
    results = []
    for name, cluster in plan.get("clusters", {}).items():
        if cluster.get("auto") or not cluster.get("issue_ids"):
            continue
        steps = cluster.get("action_steps") or []
        if not steps:
            continue
        missing = sum(
            1 for s in steps
            if isinstance(s, dict) and s.get("effort") not in _VALID_EFFORTS
        )
        if missing:
            results.append((name, missing, len(steps)))
    return results
```

Call from `_cmd_stage_enrich()` — **warning only** (not a blocker, since effort is a new field and we don't want to break existing workflows):
```python
untagged = _steps_without_effort(plan)
if untagged:
    total_missing = sum(n for _, n, _ in untagged)
    print(colorize(f"  Note: {total_missing} step(s) have no effort tag.", "yellow"))
    print(colorize("  Consider: desloppify plan cluster update <name> --update-step N --effort small", "dim"))
```

**File:** `desloppify/app/commands/plan/cluster_handlers.py`

Add `--effort` argument support to `_cmd_cluster_update()`:
- New arg: `effort: str | None = getattr(args, "effort", None)`
- In the `update_step` block (~line 678), add: `if effort: old["effort"] = effort`
- In the `add_step` block (~line 661), add: `if effort: new_step["effort"] = effort`

**File:** `desloppify/app/cli_support/parser_groups_plan_impl.py`

Add `--effort` to the cluster update subparser with `choices=["trivial", "small", "medium", "large"]`.

### Tests
- Steps with effort field → not flagged
- Steps without effort → flagged with count
- `--effort` flag persists on step dict

---

## 3. Cross-cluster file overlap warning in ORGANIZE

### Problem
Clusters touch the same files without knowing it. The sequencing agent found 13 files referenced by 2+ clusters, causing potential merge conflicts and ordering hazards.

### Fix

**File:** `desloppify/app/commands/plan/triage/_stage_validation.py`

Add `_cluster_file_overlaps()`:
```python
def _cluster_file_overlaps(plan: dict) -> list[tuple[str, str, list[str]]]:
    """Return pairs of clusters with overlapping file references in step details."""
    cluster_files: dict[str, set[str]] = {}
    for name, cluster in plan.get("clusters", {}).items():
        if cluster.get("auto") or not cluster.get("issue_ids"):
            continue
        paths = set()
        for step in cluster.get("action_steps") or []:
            if isinstance(step, dict) and step.get("detail"):
                paths.update(_PATH_RE.findall(step["detail"]))
        if paths:
            cluster_files[name] = paths

    overlaps = []
    names = sorted(cluster_files.keys())
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            shared = cluster_files[a] & cluster_files[b]
            if shared:
                overlaps.append((a, b, sorted(shared)))
    return overlaps
```

Call from `_confirm_organize()` in `confirmations.py` — **warning, not blocker**:
```python
overlaps = _cluster_file_overlaps(plan)
if overlaps:
    print(colorize(f"\n  Note: {len(overlaps)} cluster pair(s) reference the same files:", "yellow"))
    for a, b, files in overlaps[:5]:
        print(colorize(f"    {a} ↔ {b}: {len(files)} shared file(s)", "yellow"))
    print(colorize("  Consider adding depends_on_clusters or sequencing notes.", "dim"))
```

### Tests
- Two clusters referencing same file → overlap reported
- Clusters with no file overlap → clean
- Auto clusters excluded

---

## 4. Step title length cap

### Problem
Titles range from 64 to 271 characters. Long titles make the plan unreadable at a glance and unusable as commit messages.

### Fix

**File:** `desloppify/app/commands/plan/cluster_handlers.py`

In `_cmd_cluster_update()`, when setting step title (~line 661 and 681):
```python
MAX_STEP_TITLE = 150
if len(title) > MAX_STEP_TITLE:
    print(colorize(
        f"  Warning: step title is {len(title)} chars (recommended max {MAX_STEP_TITLE}).",
        "yellow",
    ))
    print(colorize("  Move implementation detail to --detail instead.", "dim"))
```

Advisory only — don't block, just warn.

### Tests
- Long title → warning printed
- Short title → no warning

---

## 5. Cluster dependency field support

### Problem
No way to express "do cluster A before cluster B." The sequencing agent found 8 cross-cluster dependencies that aren't documented anywhere in the plan data.

### Fix

**File:** `desloppify/app/commands/plan/cluster_handlers.py`

Add `--depends-on` argument to cluster update:
```python
depends_on: list[str] | None = getattr(args, "depends_on", None)
if depends_on is not None:
    # Validate cluster names exist
    all_clusters = set(plan.get("clusters", {}).keys())
    bad = [n for n in depends_on if n not in all_clusters]
    if bad:
        print(colorize(f"  Unknown cluster(s): {', '.join(bad)}", "red"))
        return
    cluster["depends_on_clusters"] = depends_on
```

**File:** `desloppify/app/cli_support/parser_groups_plan_impl.py`

Add `--depends-on` with `nargs="+"` to the cluster update subparser.

**File:** `desloppify/app/commands/plan/triage/confirmations.py`

In `_confirm_organize()`, after the plan summary, check for dependency violations:
```python
# Check that clusters don't depend on themselves or form cycles
clusters = plan.get("clusters", {})
for name, c in clusters.items():
    deps = c.get("depends_on_clusters", [])
    if name in deps:
        print(colorize(f"  Warning: {name} depends on itself.", "yellow"))
```

### Tests
- `--depends-on` persists on cluster dict
- Invalid cluster name → error
- Self-dependency → warning

---

## Implementation Notes

- All changes are in `desloppify/` (not reigh)
- Run tests: `cd /Users/peteromalley/Documents/desloppify && python -m pytest desloppify/tests/ -x`
- Items 1-2 are the highest value. Item 1 alone would have prevented the majority of failures.
- All new checks start as warnings (not blockers) to avoid breaking existing workflows, except path validation at `_confirm_enrich` time which should block.
