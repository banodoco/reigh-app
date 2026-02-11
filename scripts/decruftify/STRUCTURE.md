# Decruftify — Technical Internals

Multi-language codebase health scanner. See README.md for usage and "Adding a New Language" for contributor guide.

## Directory Layout

```
scripts/decruftify/
├── cli.py              # Argparse, main(), shared helpers (_state_path, _resolve_lang)
├── plan.py             # Detector orchestration + finding normalization
├── state.py            # Persistent state: load/save, merge_scan, match/resolve, scoring
├── utils.py            # File discovery, path helpers, formatting
├── visualize.py        # tree + viz commands
├── lang/               # Language plugins (auto-discovered via importlib)
│   ├── base.py         # LangConfig dataclass + @register_lang registry
│   ├── typescript.py   # TS/React: phases, dep graph, area grouping
│   └── python.py       # Python: phases, dep graph, fixers, detect_commands
├── commands/           # One file per CLI subcommand
├── detectors/          # One file per detector (+ lang-specific subdirs: py/, etc.)
└── fixers/             # One file per auto-fixer
```

## Data Flow

```
scan:    LangConfig.phases → generate_findings() → merge_scan(lang=, scan_path=) → state-{lang}.json
fix:     LangConfig.fixers → fixer.fix() → resolve in state
detect:  LangConfig.detect_commands → display
```

## Contracts

**Detector**: `detect_*(path) → list[dict]` — raw dicts, normalized to findings by `plan.py`.

**Fixer**: `fix_*(entries, *, dry_run=False) → list[{file, removed, lines_removed}]`. Most use `apply_fixer()` from `fixers/common.py`.

**LangConfig**: Dataclass in `lang/<name>.py`. Key fields: `phases` (detection functions), `build_dep_graph`, `fixers`, `detect_commands`. Auto-discovered — no shared files need editing.

## Non-Obvious Behavior

- **State scoping**: `merge_scan` only auto-resolves findings matching the scan's `lang` and `scan_path`. A Python scan never touches TS state.
- **Suspect guard**: If a detector drops from >=5 findings to 0, its disappearances are held (bypass: `--force-resolve`).
- **Scoring**: Weighted by tier (T4=4x, T1=1x). Strict score excludes wontfix from both numerator and denominator. 1 decimal place.
- **Finding ID format**: `detector::file::name` — if a detector changes naming, findings lose state continuity.
- **Cascade effects**: Fixing one category (e.g. dead exports) can create work for the next (unused vars). Score can temporarily drop.
