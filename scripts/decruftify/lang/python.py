"""Python language configuration for decruftify."""

from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

from . import register_lang
from .base import DetectorPhase, LangConfig
from ..state import make_finding
from ..utils import PROJECT_ROOT, c, find_source_files, rel, resolve_path


# ── Phase runners ──────────────────────────────────────────


def _stderr(msg: str):
    print(c(msg, "dim"), file=sys.stderr)


def _phase_unused(path: Path, lang: LangConfig) -> list[dict]:
    from ..detectors.py.unused import detect_unused
    from .base import make_unused_findings
    return make_unused_findings(detect_unused(path), _stderr)


def _phase_structural(path: Path, lang: LangConfig) -> list[dict]:
    """Merge large + complexity + god classes into structural findings.

    Same merge logic as TS: 3+ signals -> T4, else T3.
    """
    from ..detectors.py.complexity import detect_complexity
    from ..detectors.py.gods import detect_god_classes

    structural: dict[str, dict] = {}

    # Large files (inline, 300 LOC threshold for Python)
    for filepath in find_source_files(path, [".py"], ["__pycache__", ".venv", "node_modules"]):
        try:
            p = Path(filepath) if Path(filepath).is_absolute() else PROJECT_ROOT / filepath
            content = p.read_text()
            loc = len(content.splitlines())
            if loc > 300:
                f = resolve_path(filepath)
                structural.setdefault(f, {"signals": [], "detail": {}})
                structural[f]["signals"].append(f"large ({loc} LOC)")
                structural[f]["detail"]["loc"] = loc
        except (OSError, UnicodeDecodeError):
            continue

    for e in detect_complexity(path):
        f = resolve_path(e["file"])
        structural.setdefault(f, {"signals": [], "detail": {}})
        structural[f]["signals"].append(f"complexity score {e['score']}")
        structural[f]["detail"]["complexity_score"] = e["score"]
        structural[f]["detail"]["complexity_signals"] = e["signals"]

    for e in detect_god_classes(path):
        f = resolve_path(e["file"])
        structural.setdefault(f, {"signals": [], "detail": {}})
        reasons_str = ", ".join(e["reasons"][:2])
        structural[f]["signals"].append(f"god class {e['class_name']} ({reasons_str})")
        structural[f]["detail"]["class_name"] = e["class_name"]
        structural[f]["detail"]["method_count"] = e["method_count"]
        structural[f]["detail"]["attribute_count"] = e["attribute_count"]
        structural[f]["detail"]["god_reasons"] = e["reasons"]

    results = []
    for filepath, data in structural.items():
        if "loc" not in data["detail"]:
            try:
                p = Path(filepath) if Path(filepath).is_absolute() else PROJECT_ROOT / filepath
                data["detail"]["loc"] = len(p.read_text().splitlines())
            except (OSError, UnicodeDecodeError):
                data["detail"]["loc"] = 0

        signal_count = len(data["signals"])
        tier = 4 if signal_count >= 3 else 3
        confidence = "high" if signal_count >= 3 else "medium"
        summary = "Needs decomposition: " + " / ".join(data["signals"])
        results.append(make_finding(
            "structural", filepath, "",
            tier=tier, confidence=confidence,
            summary=summary,
            detail=data["detail"],
        ))

    from ..detectors.passthrough import detect_passthrough_functions
    for e in detect_passthrough_functions(path):
        results.append(make_finding(
            "props", e["file"], f"passthrough::{e['function']}",
            tier=e["tier"], confidence=e["confidence"],
            summary=f"Passthrough function: {e['function']} "
                    f"({e['passthrough']}/{e['total_params']} params forwarded, {e['ratio']:.0%})",
            detail={
                "passthrough": e["passthrough"], "total_params": e["total_params"],
                "ratio": e["ratio"], "line": e["line"],
                "passthrough_params": e["passthrough_params"],
                "direct_params": e["direct_params"],
                "has_kwargs_spread": e["has_kwargs_spread"],
            },
        ))

    _stderr(f"         -> {len(results)} structural findings")
    return results


# Python entry-point patterns (used by coupling phase for orphan/single-use suppression)
PY_ENTRY_PATTERNS = [
    "__main__.py", "conftest.py", "manage.py", "setup.py", "setup.cfg",
    "test_", "_test.py", ".test.", "/tests/", "/test/", "/migrations/",
    "settings.py", "config.py", "wsgi.py", "asgi.py",
    "cli.py",           # CLI entry points (loaded via framework/importlib)
    "/commands/",       # CLI subcommands (loaded dynamically)
    "/fixers/",         # Fixer modules (loaded dynamically)
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
    from ..detectors.py.imports import build_dep_graph
    from ..detectors.graph import detect_cycles
    from ..detectors.orphaned import detect_orphaned_files
    from ..detectors.single_use import detect_single_use_abstractions

    results = []
    graph = build_dep_graph(path)

    # Single-use abstractions
    single_entries = detect_single_use_abstractions(path, graph)
    n_before = len(results)
    colocated_suppressed = 0
    for e in single_entries:
        if 50 <= e["loc"] <= 200:
            continue
        src_area = _get_py_area(rel(e["file"]))
        imp_area = _get_py_area(e["sole_importer"])
        if src_area == imp_area:
            colocated_suppressed += 1
            continue
        results.append(make_finding(
            "single_use", e["file"], "",
            tier=3, confidence="medium",
            summary=f"Single-use ({e['loc']} LOC): only imported by {e['sole_importer']}",
            detail={"loc": e["loc"], "sole_importer": e["sole_importer"]},
        ))
    suppressed = len(single_entries) - (len(results) - n_before)
    coloc_note = f", {colocated_suppressed} co-located" if colocated_suppressed else ""
    _stderr(f"         single-use: {len(single_entries)} found, {suppressed} suppressed (50-200 LOC{coloc_note})")

    # Import cycles
    cycles = detect_cycles(graph)
    for cy in cycles:
        cycle_files = [rel(f) for f in cy["files"]]
        name = "::".join(cycle_files[:4])
        if len(cycle_files) > 4:
            name += f"::+{len(cycle_files) - 4}"
        tier = 3 if cy["length"] <= 3 else 4
        results.append(make_finding(
            "cycles", cy["files"][0], name,
            tier=tier, confidence="high",
            summary=f"Import cycle ({cy['length']} files): {' -> '.join(cycle_files[:5])}"
                    + (f" -> +{len(cycle_files) - 5}" if len(cycle_files) > 5 else ""),
            detail={"files": cycle_files, "length": cy["length"]},
        ))
    if cycles:
        _stderr(f"         cycles: {len(cycles)} import cycles")

    # Orphaned files (pass lang-specific entry patterns + barrel names)
    orphaned = detect_orphaned_files(
        path, graph,
        extra_entry_patterns=lang.entry_patterns,
        extra_barrel_names=lang.barrel_names,
    )
    for e in orphaned:
        results.append(make_finding(
            "orphaned", e["file"], "",
            tier=3, confidence="medium",
            summary=f"Orphaned file ({e['loc']} LOC): zero importers, not an entry point",
            detail={"loc": e["loc"]},
        ))
    if orphaned:
        _stderr(f"         orphaned: {len(orphaned)} files with zero importers")

    _stderr(f"         -> {len(results)} coupling/structural findings total")
    return results


SMELL_TIER_MAP = {"high": 2, "medium": 3, "low": 3}


def _phase_smells(path: Path, lang: LangConfig) -> list[dict]:
    from ..detectors.py.smells import detect_smells
    smell_entries = detect_smells(path)
    results = []
    for e in smell_entries:
        by_file: dict[str, list] = defaultdict(list)
        for m in e["matches"]:
            by_file[m["file"]].append(m)
        for file, matches in by_file.items():
            conf = "medium" if e["severity"] != "low" else "low"
            tier = SMELL_TIER_MAP.get(e["severity"], 3)
            results.append(make_finding(
                "smells", file, e["id"],
                tier=tier, confidence=conf,
                summary=f"{len(matches)}x {e['label']}",
                detail={"smell_id": e["id"], "severity": e["severity"],
                        "count": len(matches),
                        "lines": [m["line"] for m in matches[:10]]},
            ))
    _stderr(f"         -> {len(results)} smell findings")
    return results


def _phase_dupes(path: Path, lang: LangConfig) -> list[dict]:
    from ..detectors.py.dupes import detect_duplicates
    from .base import make_dupe_findings
    return make_dupe_findings(detect_duplicates(path), _stderr)


# ── Build the config ──────────────────────────────────────


def _py_build_dep_graph(path: Path) -> dict:
    from ..detectors.py.imports import build_dep_graph
    return build_dep_graph(path)


PY_DETECTOR_NAMES = [
    "unused", "complexity", "gods", "passthrough", "smells", "dupes",
    "cycles", "orphaned", "single-use", "naming",
]


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
            boundaries=[],
            typecheck_cmd="",
        )
