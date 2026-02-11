"""Python language configuration for decruftify."""

from __future__ import annotations

import sys
from pathlib import Path

from .. import register_lang
from ..base import (DetectorPhase, LangConfig,
                    add_structural_signal, merge_structural_signals,
                    make_single_use_findings, make_cycle_findings,
                    make_orphaned_findings, make_smell_findings,
                    make_passthrough_findings)
from ...utils import c, find_source_files, rel


# ── Phase runners ──────────────────────────────────────────


def _stderr(msg: str):
    print(c(msg, "dim"), file=sys.stderr)


def _phase_unused(path: Path, lang: LangConfig) -> list[dict]:
    from .unused import detect_unused
    from ..base import make_unused_findings
    return make_unused_findings(detect_unused(path), _stderr)


def _phase_structural(path: Path, lang: LangConfig) -> list[dict]:
    """Merge large + complexity + god classes into structural findings."""
    from ...detectors.large import detect_large_files
    from ...detectors.complexity import detect_complexity
    from ...detectors.gods import detect_gods
    from ...detectors.passthrough import detect_passthrough_functions
    from ...detectors.base import GodRule, ComplexitySignal
    from .extractors import (extract_py_classes, compute_max_params,
                             compute_nesting_depth, compute_long_functions)

    structural: dict[str, dict] = {}

    for e in detect_large_files(path, file_finder=lang.find_files,
                                threshold=lang.large_threshold):
        add_structural_signal(structural, e["file"], f"large ({e['loc']} LOC)",
                              {"loc": e["loc"]})

    # Python complexity signals
    py_signals = [
        ComplexitySignal("imports", r"^(?:import |from )", weight=1, threshold=20),
        ComplexitySignal("many_params", None, weight=2, threshold=7,
                         compute=compute_max_params),
        ComplexitySignal("deep_nesting", None, weight=3, threshold=4,
                         compute=compute_nesting_depth),
        ComplexitySignal("long_functions", None, weight=1, threshold=80,
                         compute=compute_long_functions),
        ComplexitySignal("many_classes", r"^class\s+\w+", weight=3, threshold=3),
        ComplexitySignal("nested_comprehensions",
                         r"\[.*\bfor\b.*\bfor\b.*\]|\{.*\bfor\b.*\bfor\b.*\}",
                         weight=2, threshold=2),
        ComplexitySignal("TODOs", r"#\s*(?:TODO|FIXME|HACK|XXX)", weight=2, threshold=0),
    ]
    for e in detect_complexity(path, signals=py_signals, file_finder=lang.find_files,
                               threshold=lang.complexity_threshold):
        add_structural_signal(structural, e["file"], f"complexity score {e['score']}",
                              {"complexity_score": e["score"],
                               "complexity_signals": e["signals"]})

    # Python god class rules
    py_god_rules = [
        GodRule("methods", "methods", lambda c: len(c.methods), 15),
        GodRule("attributes", "attributes", lambda c: len(c.attributes), 10),
        GodRule("base_classes", "base classes", lambda c: len(c.base_classes), 3),
        GodRule("long_methods", "long methods (>50 LOC)",
                lambda c: sum(1 for m in c.methods if m.loc > 50), 1),
    ]
    for e in detect_gods(extract_py_classes(path), py_god_rules):
        add_structural_signal(structural, e["file"], e["signal_text"], e["detail"])

    results = merge_structural_signals(structural, _stderr)

    # Passthrough functions
    results.extend(make_passthrough_findings(
        detect_passthrough_functions(path), "function", "total_params", _stderr))

    return results


# Python entry-point patterns (used by coupling phase for orphan/single-use suppression)
PY_ENTRY_PATTERNS = [
    "__main__.py", "conftest.py", "manage.py", "setup.py", "setup.cfg",
    "test_", "_test.py", ".test.", "/tests/", "/test/", "/migrations/",
    "settings.py", "config.py", "wsgi.py", "asgi.py",
    "cli.py",           # CLI entry points (loaded via framework/importlib)
    "/commands/",       # CLI subcommands (loaded dynamically)
    "/fixers/",         # Fixer modules (loaded dynamically)
    "/lang/",           # Language modules (loaded dynamically)
    "/extractors/",     # Extractor modules (loaded dynamically)
    "__init__.py",      # Package init files (barrels, not orphans)
]


def _get_py_area(filepath: str) -> str:
    """Derive an area name from a Python file path for grouping."""
    parts = filepath.split("/")
    # Package-based grouping: first two directory levels
    if len(parts) > 2:
        return "/".join(parts[:2])
    return parts[0] if parts else filepath


def _phase_coupling(path: Path, lang: LangConfig) -> list[dict]:
    from .deps import build_dep_graph
    from ...detectors.graph import detect_cycles
    from ...detectors.orphaned import detect_orphaned_files
    from ...detectors.single_use import detect_single_use_abstractions

    graph = build_dep_graph(path)

    results = make_single_use_findings(
        detect_single_use_abstractions(path, graph, barrel_names=lang.barrel_names),
        lang.get_area, stderr_fn=_stderr)
    results.extend(make_cycle_findings(detect_cycles(graph), _stderr))
    results.extend(make_orphaned_findings(
        detect_orphaned_files(path, graph, extensions=lang.extensions,
                              extra_entry_patterns=lang.entry_patterns,
                              extra_barrel_names=lang.barrel_names), _stderr))

    _stderr(f"         -> {len(results)} coupling/structural findings total")
    return results


def _phase_smells(path: Path, lang: LangConfig) -> list[dict]:
    from .smells import detect_smells
    return make_smell_findings(detect_smells(path), _stderr)


def _phase_dupes(path: Path, lang: LangConfig) -> list[dict]:
    from ...detectors.dupes import detect_duplicates
    from ..base import make_dupe_findings
    from .extractors import extract_py_functions

    functions = []
    for filepath in find_source_files(path, [".py"], ["__pycache__", ".venv", "node_modules"]):
        functions.extend(extract_py_functions(filepath))

    return make_dupe_findings(detect_duplicates(functions), _stderr)


# ── Build the config ──────────────────────────────────────


def _py_build_dep_graph(path: Path) -> dict:
    from .deps import build_dep_graph
    return build_dep_graph(path)


def _py_extract_functions(path: Path) -> list:
    """Extract all Python functions for duplicate detection."""
    from .extractors import extract_py_functions
    functions = []
    for filepath in find_source_files(path, [".py"], ["__pycache__", ".venv", "node_modules"]):
        functions.extend(extract_py_functions(filepath))
    return functions


PY_DETECTOR_NAMES = [
    "unused", "complexity", "gods", "passthrough", "smells", "dupes",
    "cycles", "orphaned", "single-use", "naming",
]


def _get_py_detect_commands() -> dict[str, callable]:
    """Build the Python detector command registry (lazy-loaded)."""
    from importlib import import_module
    _det = lambda mod, fn: getattr(import_module(f"scripts.decruftify.detectors.{mod}"), fn)
    return {
        # Generic detectors with PY-specific wrappers
        "passthrough": _det("passthrough", "cmd_passthrough"),
        "orphaned":    _cmd_py_orphaned,
        "single-use":  _cmd_py_single_use,
        "naming":      _cmd_py_naming,
        # Python-specific wrappers (use PY extractors + config)
        "unused":      _cmd_py_unused,
        "complexity":  _cmd_py_complexity,
        "gods":        _cmd_py_gods,
        "smells":      _cmd_py_smells,
        "dupes":       _cmd_py_dupes,
        "cycles":      _cmd_py_cycles,
    }


def _cmd_py_unused(args):
    """Run Python unused detection (ruff)."""
    import json
    from .unused import detect_unused
    entries = detect_unused(Path(args.path))
    if getattr(args, "json", False):
        print(json.dumps({"count": len(entries), "entries": entries}, indent=2))
        return
    if not entries:
        print(c("No unused symbols found.", "green"))
        return
    print(c(f"\nUnused symbols: {len(entries)}\n", "bold"))
    for e in entries[:getattr(args, "top", 20)]:
        print(f"  {rel(e['file'])}:{e['line']}  {e['category']}: {e['name']}")


def _cmd_py_complexity(args):
    """Run Python complexity detection with PY-specific signals."""
    import json
    from ...detectors.complexity import detect_complexity
    from ...detectors.base import ComplexitySignal
    from .extractors import compute_max_params, compute_nesting_depth, compute_long_functions
    py_signals = [
        ComplexitySignal("imports", r"^(?:import |from )", weight=1, threshold=20),
        ComplexitySignal("many_params", None, weight=2, threshold=7, compute=compute_max_params),
        ComplexitySignal("deep_nesting", None, weight=3, threshold=4, compute=compute_nesting_depth),
        ComplexitySignal("long_functions", None, weight=1, threshold=80, compute=compute_long_functions),
        ComplexitySignal("many_classes", r"^class\s+\w+", weight=3, threshold=3),
        ComplexitySignal("nested_comprehensions",
                         r"\[.*\bfor\b.*\bfor\b.*\]|\{.*\bfor\b.*\bfor\b.*\}",
                         weight=2, threshold=2),
        ComplexitySignal("TODOs", r"#\s*(?:TODO|FIXME|HACK|XXX)", weight=2, threshold=0),
    ]
    file_finder = lambda path: find_source_files(path, [".py"], ["__pycache__", ".venv", "node_modules"])
    entries = detect_complexity(Path(args.path), signals=py_signals,
                                file_finder=file_finder, threshold=25)
    if getattr(args, "json", False):
        print(json.dumps({"count": len(entries), "entries": entries}, indent=2))
        return
    if not entries:
        print(c("No significant complexity signals found.", "green"))
        return
    from ...utils import print_table, rel
    print(c(f"\nComplexity signals: {len(entries)} files\n", "bold"))
    rows = []
    for e in entries[:getattr(args, "top", 20)]:
        sigs = ", ".join(e["signals"][:4])
        rows.append([rel(e["file"]), str(e["loc"]), str(e["score"]), sigs])
    print_table(["File", "LOC", "Score", "Signals"], rows, [55, 5, 6, 45])


def _cmd_py_gods(args):
    """Run Python god class detection."""
    import json
    from ...detectors.gods import detect_gods
    from ...detectors.base import GodRule
    from .extractors import extract_py_classes
    py_rules = [
        GodRule("methods", "methods", lambda c: len(c.methods), 15),
        GodRule("attributes", "attributes", lambda c: len(c.attributes), 10),
        GodRule("base_classes", "base classes", lambda c: len(c.base_classes), 3),
        GodRule("long_methods", "long methods (>50 LOC)",
                lambda c: sum(1 for m in c.methods if m.loc > 50), 1),
    ]
    entries = detect_gods(extract_py_classes(Path(args.path)), py_rules)
    if getattr(args, "json", False):
        print(json.dumps({"count": len(entries), "entries": entries}, indent=2))
        return
    if not entries:
        print(c("No god classes found.", "green"))
        return
    from ...utils import print_table, rel
    print(c(f"\nGod classes: {len(entries)}\n", "bold"))
    rows = []
    for e in entries[:getattr(args, "top", 20)]:
        reasons = ", ".join(e["reasons"])
        rows.append([rel(e["file"]), e["name"], str(e["loc"]), reasons])
    print_table(["File", "Class", "LOC", "Why"], rows, [50, 20, 5, 40])


def _cmd_py_smells(args):
    """Run Python smell detection."""
    import json
    from .smells import detect_smells
    entries = detect_smells(Path(args.path))
    if getattr(args, "json", False):
        print(json.dumps({"entries": entries}, indent=2))
        return
    if not entries:
        print(c("No code smells detected.", "green"))
        return
    from ...utils import print_table
    total = sum(e["count"] for e in entries)
    print(c(f"\nCode smells: {total} instances across {len(entries)} patterns\n", "bold"))
    rows = []
    for e in entries[:getattr(args, "top", 20)]:
        sev_color = {"high": "red", "medium": "yellow", "low": "dim"}.get(e["severity"], "dim")
        rows.append([c(e["severity"].upper(), sev_color), e["label"], str(e["count"]), str(e["files"])])
    print_table(["Sev", "Pattern", "Count", "Files"], rows, [8, 40, 6, 6])


def _cmd_py_dupes(args):
    """Run Python duplicate detection."""
    import json
    from ...detectors.dupes import detect_duplicates
    from .extractors import extract_py_functions
    functions = []
    for filepath in find_source_files(Path(args.path), [".py"], ["__pycache__", ".venv", "node_modules"]):
        functions.extend(extract_py_functions(filepath))
    entries = detect_duplicates(functions, threshold=getattr(args, "threshold", None) or 0.8)
    if getattr(args, "json", False):
        print(json.dumps({"count": len(entries), "entries": entries}, indent=2))
        return
    if not entries:
        print(c("No duplicate functions found.", "green"))
        return
    from ...utils import print_table, rel
    print(c(f"\nDuplicate functions: {len(entries)} pairs\n", "bold"))
    rows = []
    for e in entries[:getattr(args, "top", 20)]:
        a, b = e["fn_a"], e["fn_b"]
        rows.append([
            f"{a['name']} ({rel(a['file'])}:{a['line']})",
            f"{b['name']} ({rel(b['file'])}:{b['line']})",
            f"{e['similarity']:.0%}", e["kind"],
        ])
    print_table(["Function A", "Function B", "Sim", "Kind"], rows, [40, 40, 5, 14])


def _cmd_py_cycles(args):
    """Run Python import cycle detection."""
    import json
    from .deps import build_dep_graph
    from ...detectors.graph import detect_cycles
    graph = build_dep_graph(Path(args.path))
    cycles = detect_cycles(graph)
    if getattr(args, "json", False):
        print(json.dumps({"count": len(cycles), "cycles": cycles}, indent=2))
        return
    if not cycles:
        print(c("No import cycles found.", "green"))
        return
    from ...utils import rel
    print(c(f"\nImport cycles: {len(cycles)}\n", "bold"))
    for cy in cycles[:getattr(args, "top", 20)]:
        files = [rel(f) for f in cy["files"]]
        print(f"  [{cy['length']} files] {' -> '.join(files[:6])}"
              + (f" -> +{len(files) - 6}" if len(files) > 6 else ""))


@register_lang("python")
class PythonConfig(LangConfig):
    def __init__(self):
        super().__init__(
            name="python",
            extensions=[".py"],
            exclusions=["__pycache__", ".venv", "node_modules", ".eggs", "*.egg-info"],
            default_src=".",
            build_dep_graph=_py_build_dep_graph,
            entry_patterns=PY_ENTRY_PATTERNS,
            barrel_names={"__init__.py"},
            phases=[
                DetectorPhase("Unused (ruff)", _phase_unused),
                DetectorPhase("Structural analysis", _phase_structural),
                DetectorPhase("Coupling + cycles + orphaned", _phase_coupling),
                DetectorPhase("Code smells", _phase_smells),
                DetectorPhase("Duplicates", _phase_dupes, slow=True),
            ],
            fixers={},
            get_area=_get_py_area,
            detector_names=PY_DETECTOR_NAMES,
            detect_commands=_get_py_detect_commands(),
            boundaries=[],
            typecheck_cmd="",
            find_files=lambda path: find_source_files(path, [".py"], ["__pycache__", ".venv", "node_modules"]),
            large_threshold=300,
            complexity_threshold=25,
            extract_functions=_py_extract_functions,
        )
