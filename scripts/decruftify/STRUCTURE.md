# Decruftify — Technical Internals

Multi-language codebase health scanner. See README.md for usage.

## Directory Layout

```
scripts/decruftify/
├── cli.py              # Argparse, main(), shared helpers
├── plan.py             # Detector orchestration + finding normalization
├── state.py            # Persistent state: load/save, merge_scan, scoring
├── utils.py            # File discovery, path helpers, formatting
├── visualize.py        # tree + viz commands
│
├── detectors/          # Layer 1: Generic algorithms (zero language knowledge)
│   ├── base.py         # Shared data types: FunctionInfo, ClassInfo, ComplexitySignal, GodRule, SmellRule
│   ├── dupes.py        # detect_duplicates(functions, threshold) → pairs
│   ├── gods.py         # detect_gods(classes, rules) → god entries
│   ├── complexity.py   # detect_complexity(path, signals, file_finder) → scored files
│   ├── large.py        # detect_large_files(path, file_finder, threshold) → large files
│   ├── graph.py        # detect_cycles(graph), get_coupling_score(file, graph)
│   ├── orphaned.py     # detect_orphaned_files(path, graph, extensions, ...)
│   ├── single_use.py   # detect_single_use_abstractions(path, graph, barrel_names)
│   ├── coupling.py     # detect_coupling_violations(graph, shared_prefix, tools_prefix)
│   ├── naming.py       # detect_naming_inconsistencies(path, file_finder, skip_names)
│   └── passthrough.py  # _classify_params(params, body, pattern_fn) — shared core
│
├── lang/               # Layer 2 + 3: Language plugins (auto-discovered)
│   ├── __init__.py     # Registry: @register_lang, get_lang, auto-detect
│   ├── base.py         # LangConfig + shared finding helpers (make_*_findings)
│   │
│   ├── typescript/     # Everything TypeScript/React
│   │   ├── __init__.py # TypeScriptConfig + phase runners + config data (signals, rules)
│   │   ├── commands.py # detect-subcommand wrappers + command registry
│   │   ├── extractors.py  # extract_ts_functions, extract_ts_components, detect_passthrough_components
│   │   ├── smells.py   # TS smell rules + brace-tracked multi-line helpers
│   │   ├── deps.py     # TS import graph builder + dynamic import detection
│   │   ├── unused.py   # tsc-based unused detection
│   │   └── ...         # logs, exports, deprecated, react, concerns, patterns, props
│   │
│   └── python/         # Everything Python
│       ├── __init__.py # PythonConfig + phase runners + config data (signals, rules)
│       ├── commands.py # detect-subcommand wrappers + command registry
│       ├── extractors.py  # extract_py_functions, extract_py_classes, detect_passthrough_functions
│       ├── smells.py   # PY smell rules + indentation-tracked multi-line helpers
│       ├── deps.py     # Python import graph builder
│       └── unused.py   # ruff-based unused detection
│
├── commands/           # One file per CLI subcommand
└── fixers/             # One file per auto-fixer
```

## Three-Layer Architecture

```
Layer 1: detectors/       Generic algorithms. Data-in, data-out. Zero language knowledge.
Layer 2: lang/base.py     Shared finding helpers. Normalize raw results → tiered findings.
Layer 3: lang/<name>/     Language orchestration. Config + phase runners + extractors + CLI wrappers.
```

**Import direction**: `lang/` → `detectors/`. Never the reverse. Enforced — no `detectors/` file imports from `lang/`.

## Data Flow

```
scan:    LangConfig.phases → generate_findings() → merge_scan(lang=, scan_path=) → state-{lang}.json
fix:     LangConfig.fixers → fixer.fix() → resolve in state
detect:  LangConfig.detect_commands[name](args) → display
```

## Contracts

**Detector**: `detect_*(data, config) → list[dict]` — generic algorithm. All params required (no defaults that assume a language).

**Extractor**: `extract_*(filepath) → list[FunctionInfo|ClassInfo]` — language-specific parsing that produces shared data types.

**Phase runner**: `_phase_*(path, lang) → list[dict]` — thin orchestrators: extractors → generic algorithms → shared normalization helpers. Config data (signals, rules, thresholds) lives as module-level constants in `__init__.py`.

**Cmd wrapper**: `cmd_<name>(args) → None` — CLI display function in `lang/<name>/commands.py`. Each language owns all its cmd wrappers — no generic cmd_* in `detectors/`.

**LangConfig**: Dataclass in `lang/<name>/__init__.py`. Key fields: `phases`, `build_dep_graph`, `detect_commands`, `file_finder`, `extract_functions`, `entry_patterns`, `barrel_names`. Auto-discovered — adding a language requires zero changes to shared code.

## Non-Obvious Behavior

- **State scoping**: `merge_scan` only auto-resolves findings matching the scan's `lang` and `scan_path`. A Python scan never touches TS state.
- **Suspect guard**: If a detector drops from >=5 findings to 0, its disappearances are held (bypass: `--force-resolve`).
- **Scoring**: Weighted by tier (T4=4x, T1=1x). Strict score excludes wontfix from both numerator and denominator.
- **Finding ID format**: `detector::file::name` — if a detector changes naming, findings lose state continuity.
- **Cascade effects**: Fixing one category (e.g. dead exports) can create work for the next (unused vars). Score can temporarily drop.
