# Multi-Language Decruftify Plan

## Core Insight

The **pipeline** (state, scoring, CLI, commands, plan generation) is already language-agnostic. The **detectors** are language-specific but share the same output format. The right abstraction is a thin language config that tells the pipeline which detectors to run and how to discover files — not a deep plugin interface.

---

## What's Actually Generic vs Language-Specific

### Already language-agnostic (zero changes needed)
- `state.py` — findings are dicts with `{id, detector, file, tier, confidence, summary, detail, status}`
- All commands (`scan`, `status`, `show`, `next`, `resolve`, `ignore`, `plan`, `tree`, `viz`)
- Scoring (tier weighting, strict score)
- Finding matching, ignore patterns, merge logic
- `make_finding()`, `match_findings()`, `resolve_findings()`

### Needs parameterization (small changes)
- `utils.py` — `find_ts_files()` and `grep()` hardcode extensions
- `plan.py` — `generate_findings()` hardcodes 8 TS-specific phases
- `cli.py` — `DETECTOR_NAMES` and fixer list are TS-specific
- `deps.py` — import parsing is TS-specific, but Tarjan's and graph algorithms are generic
- `fix_cmd.py` — fixer registry is TS-specific

### Entirely language-specific (parallel implementations needed)
- Import parsing (TS `from "..."` vs Python `import foo` / `from foo import bar`)
- Unused detection (tsc vs ruff)
- Export/public API analysis (TS exports vs Python public symbols)
- Structural signals (React hooks/god components vs Python god classes)
- Smell catalogs (different smells per language)
- Fixers (different syntax manipulation per language)

---

## The LangConfig Abstraction

A language config is a simple dataclass that bundles everything the pipeline needs:

```python
@dataclass
class LangConfig:
    name: str                           # "typescript", "python"
    extensions: list[str]               # [".ts", ".tsx"] or [".py"]
    exclusions: list[str]               # ["node_modules"] or ["__pycache__", ".venv"]
    default_src: str                    # "src" or "." — relative to PROJECT_ROOT

    # Dep graph
    build_dep_graph: Callable[[Path], dict]   # language-specific import parsing → graph

    # Entry points (for orphaned detection)
    entry_patterns: list[str]           # ["/pages/", "/main.tsx"] or ["__main__.py", "manage.py"]
    barrel_names: set[str]              # {"index.ts"} or {"__init__.py"}

    # Detector phases (ordered)
    phases: list[DetectorPhase]

    # Fixer registry
    fixers: dict[str, FixerConfig]

    # Area classification (optional, project-specific)
    get_area: Callable[[str], str] | None  # filepath → area name

    # Detector names (for `detect` command)
    detector_names: list[str]


@dataclass
class DetectorPhase:
    label: str                          # "Unused (ruff)"
    run: Callable[[Path, LangConfig], list[dict]]  # returns normalized findings
    slow: bool = False                  # skip with --skip-slow


@dataclass
class FixerConfig:
    label: str                          # "unused imports"
    detect: Callable                    # detector function
    fix: Callable                       # fixer function
    detector: str                       # finding detector name (for state resolution)
    verb: str                           # "Removed"
    dry_verb: str                       # "Would remove"
    post_fix: Callable | None = None    # optional cascade
```

### Why this shape?

1. **Phases are self-contained.** Each phase's `run()` function handles both detection AND normalization (converting raw detector output to findings with tiers). This keeps normalization logic close to the detector that produces it, instead of a generic normalizer trying to handle all formats.

2. **The dep graph is special.** It's built once and reused by ~6 detectors. The language config provides the builder, and phases that need it can call it (with caching).

3. **Area classification is project-specific, not language-specific.** A Python Django project groups by `apps/`, a Flask project by `blueprints/`, etc. The default is simple path-based grouping; the TS config overrides with the current Reigh-specific `get_area()`.

4. **No inheritance or abstract classes.** A language config is just data + callables. Adding a new language means writing a new config file — you don't need to understand a class hierarchy.

---

## File Structure Changes

### Phase 1: Extract abstraction (no file moves, no breakage)

```
decruftify/
  lang/                          # NEW
    __init__.py                  # get_lang(name), auto_detect_lang()
    base.py                      # LangConfig, DetectorPhase, FixerConfig
    typescript.py                # TS config referencing existing detectors
  detectors/
    graph.py                     # NEW: extracted from deps.py (Tarjan's, fan-in/out)
    ... (existing files unchanged)
  utils.py                       # add find_source_files(path, extensions)
  plan.py                        # generate_findings() accepts LangConfig
  cli.py                         # add --lang flag
```

### Phase 2: Add Python support

```
  lang/
    python.py                    # Python config
  detectors/
    py_unused.py                 # ruff-based unused detection
    py_imports.py                # Python import parsing → dep graph
    py_gods.py                   # god class detection
    py_concerns.py               # mixed concerns (Python-style)
    py_smells.py                 # Python smell catalog
    py_complexity.py             # Python complexity signals
    py_exports.py                # public API analysis
  fixers/
    py_imports.py                # Python unused import removal
```

### Why flat `py_*.py` instead of `py/` subdirectory?

Simpler imports, less nesting, consistent with existing flat structure. The `py_` prefix is unambiguous. If it gets crowded later, we can move to a subdirectory.

### Why NOT move existing TS detectors?

- Avoids a giant rename commit
- Existing imports all work
- The TS config just references them by their current paths

---

## What Each Python Detector Would Do

### `py_unused.py` — Unused imports/variables via ruff

```
ruff check --select F401,F841 --output-format json <path>
```

Returns same shape as TS unused: `{file, line, name, category}` where category is "imports" or "vars".

Ruff is the standard Python linter (fast, Rust-based). If not installed, falls back to pyflakes.

### `py_imports.py` — Python import graph

Parses:
- `import foo` → resolves `foo.py` or `foo/__init__.py`
- `from foo import bar` → resolves `foo/bar.py` or `foo.py`
- `from . import bar` → relative, resolves from source dir
- `from .foo import bar` → relative

Resolution: tries `.py`, then `/__init__.py`, then package directory.

Builds the same graph structure as TS: `{resolved_path: {imports: set, importers: set}}`.

### `py_gods.py` — God classes

Signals (any 2+ or extreme single):
- **Many methods**: >15 methods in a class
- **Many attributes**: >10 `self.x` assignments in `__init__`
- **Deep inheritance**: class inherits from >2 non-mixin bases
- **High method LOC**: any method >50 LOC

Returns: `{file, class_name, loc, method_count, attribute_count, reasons}`

### `py_concerns.py` — Mixed concerns

Signals (3+ = finding):
- **DB access**: ORM queries, raw SQL, `cursor.execute`
- **HTTP handling**: route decorators, `request.` access, response building
- **Business logic**: non-trivial functions (>20 LOC, not handlers/models)
- **Serialization**: JSON/serializer construction
- **File I/O**: `open()`, `Path.read_text()`, etc.

Returns: `{file, loc, concerns, concern_count}`

### `py_smells.py` — Python smell catalog

| ID | Pattern | Severity |
|---|---|---|
| `bare_except` | `except:` (no exception type) | high |
| `broad_except` | `except Exception:` (too broad) | medium |
| `mutable_default` | `def f(x=[])` or `def f(x={})` | high |
| `global_keyword` | `global x` | medium |
| `star_import` | `from x import *` | medium |
| `type_ignore` | `# type: ignore` | medium |
| `eval_exec` | `eval()` or `exec()` | high |
| `assert_in_prod` | `assert` outside tests | low |
| `string_concat_loop` | `+=` on string in loop | medium |
| `nested_with` | 3+ nested `with` statements | low |
| `magic_number` | bare numbers >100 in logic | low |
| `empty_except` | `except: pass` | high |
| `todo_fixme` | `TODO`, `FIXME`, `HACK` comments | low |

Plus multi-line detectors:
- **Swallowed errors**: `except` that only logs (same concept as TS)
- **Long functions**: >80 LOC (lower bar than files since Python functions tend shorter)

### `py_complexity.py` — Complexity signals

| Signal | Threshold |
|---|---|
| Many imports | >20 imports |
| Many function params | any function with >7 params |
| Deep nesting | >4 levels of indentation |
| Long function | >80 LOC |
| Many classes | >3 classes in one file |
| Many decorators stacked | >4 decorators on one function |
| Nested comprehensions | 2+ nested list/dict comprehensions |

### `py_exports.py` — Public API analysis

Python doesn't have explicit exports, but we can detect:
1. **Symbols in `__all__` never imported externally** — dead public API
2. **Public functions (no `_` prefix) never imported** — candidates for making private
3. **Unused `__all__` entries** — stale after refactoring

### `py_orphaned.py` — Entry points

Python entry point patterns (not orphaned even with 0 importers):
- `__main__.py`, `conftest.py`, `manage.py`, `setup.py`
- Files with `if __name__ == "__main__":`
- CLI entry points from `pyproject.toml` `[project.scripts]`
- Test files (`test_*.py`, `*_test.py`)
- Migration files (`migrations/`)
- Config files (`settings.py`, `config.py`)

---

## How plan.py Orchestration Changes

Current `generate_findings()`:
```python
def generate_findings(path, *, include_slow=True):
    findings = []
    findings += _findings_from_logs(path, stderr)
    findings += _findings_from_unused(path, stderr)
    # ... 8 hardcoded phases
    return findings
```

New:
```python
def generate_findings(path, lang: LangConfig, *, include_slow=True):
    findings = []
    phases = lang.phases
    if not include_slow:
        phases = [p for p in phases if not p.slow]
    for i, phase in enumerate(phases):
        stderr(f"  [{i+1}/{len(phases)}] {phase.label}...")
        results = phase.run(path, lang)
        findings += results
        stderr(f"         → {len(results)} findings")
    return findings
```

Each phase's `run` function encapsulates detection + normalization. For TS, these are essentially the existing `_findings_from_*` functions wrapped as phase runners.

### Dep graph sharing across phases

Several phases need the dep graph (coupling, cycles, orphaned, single-use, boundary). Rather than building it in each phase:

```python
# In LangConfig or as a helper
_graph_cache = {}

def get_dep_graph(path, lang):
    key = str(path)
    if key not in _graph_cache:
        _graph_cache[key] = lang.build_dep_graph(path)
    return _graph_cache[key]
```

Phases that need it call `get_dep_graph(path, lang)`.

### Structural signal merging

The "merge large + complexity + gods + concerns → per-file structural finding" logic is conceptually universal. It stays as a shared helper:

```python
def merge_structural_signals(signals_by_file: dict[str, list[str]],
                              details_by_file: dict[str, dict]) -> list[dict]:
    """Merge per-file structural signals into findings.

    3+ signals → T4 (needs decomposition)
    1-2 signals → T3 (advisory)
    """
    # Same logic as current _findings_from_structural
```

Each language's structural phase calls its own structural detectors (gods, concerns, complexity, etc.), then feeds the results into this shared merger.

---

## How CLI Changes

```
# Auto-detect (reads package.json, pyproject.toml, etc.)
decruftify scan

# Explicit
decruftify scan --lang python
decruftify scan --lang typescript

# Python with custom source root
decruftify scan --lang python --path ./src
```

Auto-detection logic:
1. `package.json` exists → typescript
2. `pyproject.toml` or `setup.py` or `setup.cfg` exists → python
3. `go.mod` → go (future)
4. Otherwise → error, require `--lang`

State files:
- Default (no `--lang`): `.decruftify/state.json` (backward compatible)
- `--lang python`: `.decruftify/state-python.json`
- `--lang typescript`: `.decruftify/state-typescript.json`

The `status` command could show combined view across languages, or per-language. Start simple: per-language only.

---

## Dep Graph: What's Shared vs Language-Specific

### Extracted into `detectors/graph.py` (shared):

```python
# Graph algorithms — language-agnostic
def detect_cycles(graph: dict) -> list[dict]:
    """Tarjan's SCC → cycles."""
    # Exactly the current code from deps.py

def get_coupling_score(filepath: str, graph: dict) -> dict:
    """Fan-in, fan-out, instability metric."""
    # Exactly the current code from deps.py
```

### Stays in language-specific modules:

**TS** (`deps.py` → keeps `build_dep_graph()`):
- Grep for `from "..."` / `from '...'`
- Resolve: relative imports, `@/` alias, `.ts`/`.tsx`/`/index.ts` extensions

**Python** (`py_imports.py` → new `build_dep_graph()`):
- Grep for `import ` / `from ... import`
- Resolve: `foo.py`, `foo/__init__.py`, relative imports, package paths
- Handle: `sys.path` isn't parsed (too dynamic) — resolve based on directory structure

### Detectors that consume the graph (all shared):
- `single_use.py` — already uses graph generically
- `orphaned.py` — needs language-specific entry points, but graph traversal is generic
- `coupling.py` — needs project-specific directory boundaries, graph traversal is generic
- `naming.py` — doesn't use graph at all

For coupling: the TS config provides `tools/` and `shared/` as boundary definitions. Python config provides whatever the project uses (e.g., `apps/` and `core/`). Could be a config field:

```python
# In LangConfig or project config
boundaries: list[BoundaryRule] = [
    BoundaryRule(protected="shared/", forbidden_from="tools/", label="shared→tools"),
]
```

---

## Fixers

### Shared infrastructure (`fixers/common.py` — already exists):
- `find_balanced_end()`, `extract_body_between_braces()`
- `apply_fixer()`, `collapse_blank_lines()`

### TS fixers (unchanged):
- `imports.py`, `exports.py`, `vars.py`, `params.py`, `logs.py`, `useeffect.py`, `if_chain.py`

### Python fixers (new):

**`py_imports.py`** — Remove unused imports:
- Option A: `ruff check --select F401 --fix <path>` (let ruff do it)
- Option B: Manual regex removal (same approach as TS fixer but for Python import syntax)
- Option A is simpler and more reliable. Fall back to B if ruff unavailable.

**`py_vars.py`** — Remove unused variables:
- Similar to TS: remove the assignment, or prefix with `_`
- Simpler in Python (no `const`/`let`, no destructuring patterns to worry about)

**Other Python fixers** (later):
- Remove star imports (replace with explicit imports)
- Fix mutable defaults (replace `[]` with `None` + `if x is None: x = []`)
- Remove bare excepts (add `Exception` type)

---

## Migration Path

### Step 1: Create `lang/` with TS config (backward compatible)

- Create `lang/base.py`, `lang/typescript.py`, `lang/__init__.py`
- `typescript.py` wraps all existing detectors into `DetectorPhase` objects
- All existing `_findings_from_*` functions become phase runners
- `generate_findings()` gets a `lang` parameter with a default
- `cli.py` gets `--lang` flag but defaults to auto-detect (→ typescript for this project)
- **Zero behavior change** for existing usage

### Step 2: Parameterize utils

- Add `find_source_files(path, extensions, exclusions)` to `utils.py`
- Existing `find_ts_files()` becomes a thin wrapper
- `grep()` gets an `extensions` parameter
- Detectors that currently call `find_ts_files()` directly still work

### Step 3: Extract graph algorithms

- Create `detectors/graph.py` with `detect_cycles()` and `get_coupling_score()`
- `deps.py` imports from `graph.py` instead of defining them inline
- No behavior change

### Step 4: Add Python language config

- Create `lang/python.py` with phases
- Create `py_*.py` detectors
- Create `py_*.py` fixers
- Wire into CLI

### Step 5: Project-specific config (optional, later)

- Allow `decruftify.toml` or `[tool.decruftify]` in `pyproject.toml`
- Define: boundaries, pattern families, entry points, area mapping
- This decouples Reigh-specific coupling rules from the TypeScript language config

---

## What Python Support Looks Like Day 1

The minimum viable Python support:

1. **File discovery** — find `.py` files, exclude `__pycache__`, `.venv`, `node_modules`
2. **Import graph** — parse `import`/`from` statements, resolve to files, build graph
3. **Unused detection** — via ruff (F401 imports, F841 vars)
4. **Large files** — shared detector, just different extensions
5. **Duplication** — shared detector, needs Python function extraction (`def` blocks)
6. **Smells** — Python smell catalog (bare except, mutable defaults, etc.)
7. **God classes** — method/attribute counting
8. **Cycles** — shared algorithm on Python import graph
9. **Orphaned** — shared logic, Python entry points
10. **Naming** — shared detector, different extensions
11. **Complexity** — Python signals (deep nesting, long functions, many params)

This gives you a useful tool immediately. More sophisticated detectors (mixed concerns, coupling, patterns) can come later since they need project-specific configuration.

---

## Scaling to More Languages

Adding a third language (e.g., Go) would require:

1. **One file**: `lang/go.py` defining the config + phases
2. **Detector files**: `go_unused.py`, `go_imports.py`, `go_smells.py`, etc.
3. **Import parser**: Go imports (`import "fmt"`, `import ("fmt"; "os")`)
4. **Unused detection**: `go vet` or `golangci-lint`

The pipeline, state, scoring, CLI — all unchanged. No touching existing TS or Python code.

This is the real test of the abstraction: **can you add a language by adding files, without modifying existing files?** With this design, yes — as long as:
- `lang/__init__.py` has a registry that auto-discovers language configs
- The CLI's `--lang` flag accepts any registered language
- Shared detectors accept extensions as parameters

---

## Open Questions

1. **Project-specific config format**: Should boundaries, pattern families, and area mapping go in `decruftify.toml`, `pyproject.toml`, or be hardcoded per language config? For now, hardcode in language config; extract to config file when a second project wants the same language with different rules.

2. **Combined status view**: When you have both TS and Python state, should `decruftify status` (no `--lang`) show combined? Probably yes — combine findings from all state files, recompute score. But this is a nice-to-have.

3. **Monorepo support**: Scanning `./frontend` (TS) and `./backend` (Python) separately is fine. Auto-detecting per subdirectory would be nice but isn't needed for v1.

4. **Function extraction for dupes**: The `dupes.py` detector extracts function bodies using TS regex patterns (`function X`, `const X = () =>`). Python uses `def X():`. This needs language-specific extractors plugged into the shared dedup algorithm. Add a `extract_functions: Callable` to `LangConfig`.

---

## Estimated Work

| Step | What | Effort |
|------|------|--------|
| 1 | `lang/` + TS config (backward compatible) | ~2 hours |
| 2 | Parameterize utils | ~30 min |
| 3 | Extract graph algorithms | ~30 min |
| 4a | Python import parser + dep graph | ~2 hours |
| 4b | Python unused (ruff) | ~30 min |
| 4c | Python smells | ~1 hour |
| 4d | Python god classes + complexity | ~1 hour |
| 4e | Python function extraction (for dupes) | ~1 hour |
| 4f | Wire up Python lang config + phases | ~1 hour |
| 4g | Python fixers (imports at minimum) | ~1 hour |
| **Total** | | **~10 hours** |

Steps 1-3 can be done independently (and tested against current TS usage). Steps 4a-4g can be done incrementally — each adds one more detector to the Python pipeline.
