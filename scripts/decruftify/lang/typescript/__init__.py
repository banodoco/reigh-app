"""TypeScript/React language configuration for decruftify."""

from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

from .. import register_lang
from ..base import (BoundaryRule, DetectorPhase, FixerConfig, LangConfig,
                    add_structural_signal, merge_structural_signals,
                    make_single_use_findings, make_cycle_findings,
                    make_orphaned_findings, make_smell_findings)
from ...state import make_finding
from ...utils import c, find_ts_files, get_area, rel


# ── Phase runners ──────────────────────────────────────────


def _stderr(msg: str):
    print(c(msg, "dim"), file=sys.stderr)


def _phase_logs(path: Path, lang: LangConfig) -> list[dict]:
    from .logs import detect_logs
    log_entries = detect_logs(path)
    log_groups: dict[tuple, list] = defaultdict(list)
    for e in log_entries:
        log_groups[(e["file"], e["tag"])].append(e)
    results = []
    for (file, tag), entries in log_groups.items():
        results.append(make_finding(
            "logs", file, tag,
            tier=1, confidence="high",
            summary=f"{len(entries)} tagged logs [{tag}]",
            detail={"count": len(entries), "lines": [e["line"] for e in entries[:20]]},
        ))
    _stderr(f"         {len(log_entries)} instances → {len(results)} findings")
    return results


def _phase_unused(path: Path, lang: LangConfig) -> list[dict]:
    from .unused import detect_unused
    from ..base import make_unused_findings
    return make_unused_findings(detect_unused(path), _stderr)


def _phase_exports(path: Path, lang: LangConfig) -> list[dict]:
    from .exports import detect_dead_exports
    export_entries = detect_dead_exports(path)
    results = []
    for e in export_entries:
        results.append(make_finding(
            "exports", e["file"], e["name"],
            tier=2, confidence="high",
            summary=f"Dead export: {e['name']}",
            detail={"line": e.get("line"), "kind": e.get("kind")},
        ))
    _stderr(f"         {len(export_entries)} instances → {len(results)} findings")
    return results


def _phase_deprecated(path: Path, lang: LangConfig) -> list[dict]:
    from .deprecated import detect_deprecated
    dep_entries = detect_deprecated(path)
    results = []
    for e in dep_entries:
        if e["kind"] == "property":
            continue
        tier = 1 if e["importers"] == 0 else 3
        results.append(make_finding(
            "deprecated", e["file"], e["symbol"],
            tier=tier, confidence="high",
            summary=f"Deprecated: {e['symbol']} ({e['importers']} importers)"
                    + (" → safe to delete" if e["importers"] == 0 else ""),
            detail={"importers": e["importers"], "line": e["line"]},
        ))
    _stderr(f"         {len(dep_entries)} instances → {len(results)} findings (properties suppressed)")
    return results


def _phase_structural(path: Path, lang: LangConfig) -> list[dict]:
    from ...detectors.large import detect_large_files
    from ...detectors.complexity import detect_complexity
    from ...detectors.gods import detect_god_components
    from .concerns import detect_mixed_concerns
    from .props import detect_prop_interface_bloat

    structural: dict[str, dict] = {}

    for e in detect_large_files(path):
        add_structural_signal(structural, e["file"], f"large ({e['loc']} LOC)",
                              {"loc": e["loc"], "imports": e["imports"], "functions": e["functions"]})

    for e in detect_complexity(path):
        add_structural_signal(structural, e["file"], f"complexity score {e['score']}",
                              {"complexity_score": e["score"], "complexity_signals": e["signals"]})

    for e in detect_god_components(path):
        add_structural_signal(structural, e["file"],
                              f"{e['hook_total']} hooks ({', '.join(e['reasons'][:2])})",
                              {"hook_total": e["hook_total"], "hook_reasons": e["reasons"]})

    for e in detect_mixed_concerns(path):
        add_structural_signal(structural, e["file"],
                              f"mixed: {', '.join(e['concerns'][:3])}",
                              {"concerns": e["concerns"]})

    results = merge_structural_signals(structural, _stderr)

    # TS-specific: props bloat
    for e in detect_prop_interface_bloat(path):
        results.append(make_finding(
            "props", e["file"], e["interface"],
            tier=3, confidence="medium",
            summary=f"Bloated props: {e['interface']} ({e['prop_count']} props)",
            detail={"prop_count": e["prop_count"], "line": e["line"]},
        ))

    # TS-specific: passthrough components
    from ...detectors.passthrough import detect_passthrough_components
    for e in detect_passthrough_components(path):
        results.append(make_finding(
            "props", e["file"], f"passthrough::{e['component']}",
            tier=e["tier"], confidence=e["confidence"],
            summary=f"Passthrough component: {e['component']} "
                    f"({e['passthrough']}/{e['total_props']} props forwarded, {e['ratio']:.0%})",
            detail={
                "passthrough": e["passthrough"], "total_props": e["total_props"],
                "ratio": e["ratio"], "line": e["line"],
                "passthrough_props": e["passthrough_props"],
                "direct_props": e["direct_props"],
            },
        ))
    return results


def _phase_coupling(path: Path, lang: LangConfig) -> list[dict]:
    from ...detectors.single_use import detect_single_use_abstractions
    from .deps import build_dep_graph
    from ...detectors.graph import detect_cycles
    from ...detectors.coupling import (detect_coupling_violations, detect_boundary_candidates,
                                       detect_cross_tool_imports)
    from ...detectors.orphaned import detect_orphaned_files
    from .patterns import detect_pattern_anomalies
    from ...detectors.naming import detect_naming_inconsistencies

    results = []
    graph = build_dep_graph(path)

    # Single-use (shared helper)
    single_entries = detect_single_use_abstractions(path, graph, barrel_names=lang.barrel_names)
    results.extend(make_single_use_findings(single_entries, lang.get_area, stderr_fn=_stderr))

    # TS-specific: coupling violations
    for e in detect_coupling_violations(path, graph):
        results.append(make_finding(
            "coupling", e["file"], e["target"],
            tier=2, confidence="high",
            summary=f"Backwards coupling: shared imports {e['target']} (tool: {e['tool']})",
            detail={"target": e["target"], "tool": e["tool"], "direction": e["direction"]},
        ))

    # TS-specific: boundary candidates (deduplicated against single-use)
    single_use_emitted = set()
    for e in single_entries:
        is_size_ok = 50 <= e["loc"] <= 200
        is_colocated = lang.get_area and (
            lang.get_area(rel(e["file"])) == lang.get_area(e["sole_importer"]))
        if not is_size_ok and not is_colocated:
            single_use_emitted.add(rel(e["file"]))
    boundary_deduped = 0
    for e in detect_boundary_candidates(path, graph):
        if rel(e["file"]) in single_use_emitted:
            boundary_deduped += 1
            continue
        results.append(make_finding(
            "coupling", e["file"], f"boundary::{e['sole_tool']}",
            tier=3, confidence="medium",
            summary=f"Boundary candidate ({e['loc']} LOC): only used by {e['sole_tool']} "
                    f"({e['importer_count']} importers)",
            detail={"sole_tool": e["sole_tool"], "importer_count": e["importer_count"],
                    "loc": e["loc"]},
        ))
    if boundary_deduped:
        _stderr(f"         ({boundary_deduped} boundary candidates skipped — covered by single_use)")

    # TS-specific: cross-tool imports
    cross_tool = detect_cross_tool_imports(path, graph)
    for e in cross_tool:
        results.append(make_finding(
            "coupling", e["file"], e["target"],
            tier=2, confidence="high",
            summary=f"Cross-tool import: {e['source_tool']}→{e['target_tool']} ({e['target']})",
            detail={"target": e["target"], "source_tool": e["source_tool"],
                    "target_tool": e["target_tool"], "direction": e["direction"]},
        ))
    if cross_tool:
        _stderr(f"         cross-tool: {len(cross_tool)} imports")

    # Cycles + orphaned (shared helpers)
    results.extend(make_cycle_findings(detect_cycles(graph), _stderr))
    results.extend(make_orphaned_findings(
        detect_orphaned_files(path, graph, extensions=lang.extensions), _stderr))

    # TS-specific: pattern consistency
    for e in detect_pattern_anomalies(path):
        results.append(make_finding(
            "patterns", e["area"], e["family"],
            tier=3, confidence=e.get("confidence", "low"),
            summary=f"Competing patterns ({e['family']}): {e['review'][:120]}",
            detail={"family": e["family"], "patterns_used": e["patterns_used"],
                    "pattern_count": e["pattern_count"], "review": e["review"]},
        ))

    # TS-specific: naming consistency
    for e in detect_naming_inconsistencies(path):
        results.append(make_finding(
            "naming", e["directory"], e["minority"],
            tier=3, confidence="low",
            summary=f"Naming inconsistency: {e['minority_count']} {e['minority']} files "
                    f"in {e['majority']}-majority dir ({e['total_files']} total)",
            detail={"majority": e["majority"], "majority_count": e["majority_count"],
                    "minority": e["minority"], "minority_count": e["minority_count"],
                    "outliers": e["outliers"]},
        ))
    _stderr(f"         → {len(results)} coupling/structural findings total")
    return results


def _phase_smells(path: Path, lang: LangConfig) -> list[dict]:
    from ...detectors.smells import detect_smells
    results = make_smell_findings(detect_smells(path), _stderr)

    # TS-specific: React state sync anti-patterns
    from .react import detect_state_sync
    react_entries = detect_state_sync(path)
    for e in react_entries:
        setter_str = ", ".join(e["setters"])
        results.append(make_finding(
            "react", e["file"], setter_str,
            tier=3, confidence="medium",
            summary=f"State sync anti-pattern: useEffect only calls {setter_str}",
            detail={"line": e["line"], "setters": e["setters"]},
        ))
    if react_entries:
        _stderr(f"         react: {len(react_entries)} state sync anti-patterns")
    return results


def _phase_dupes(path: Path, lang: LangConfig) -> list[dict]:
    from ...detectors.dupes import detect_duplicates
    from ..base import make_dupe_findings
    from .extractors import extract_ts_functions

    functions = []
    for filepath in find_ts_files(path):
        if "node_modules" in filepath or ".d.ts" in filepath:
            continue
        functions.extend(extract_ts_functions(filepath))

    return make_dupe_findings(detect_duplicates(functions), _stderr)


# ── Fixer wiring ──────────────────────────────────────────


def _get_ts_fixers() -> dict[str, FixerConfig]:
    """Build the TypeScript fixer registry (lazy-loaded)."""
    return {
        "unused-imports": FixerConfig(
            label="unused imports",
            detect=lambda path: __import__("scripts.decruftify.lang.typescript.unused", fromlist=["detect_unused"]).detect_unused(path, category="imports"),
            fix=lambda entries, **kw: __import__("scripts.decruftify.fixers", fromlist=["fix_unused_imports"]).fix_unused_imports(entries, **kw),
            detector="unused",
            verb="Removed", dry_verb="Would remove",
        ),
    }


# ── Build the config ──────────────────────────────────────


def _ts_build_dep_graph(path: Path) -> dict:
    from .deps import build_dep_graph
    return build_dep_graph(path)


def _ts_extract_functions(path: Path) -> list:
    """Extract all TS functions for duplicate detection."""
    from .extractors import extract_ts_functions
    functions = []
    for filepath in find_ts_files(path):
        if "node_modules" in filepath or ".d.ts" in filepath:
            continue
        functions.extend(extract_ts_functions(filepath))
    return functions


TS_DETECTOR_NAMES = [
    "logs", "unused", "exports", "deprecated", "large", "complexity",
    "gods", "single-use", "props", "passthrough", "concerns", "deps", "dupes", "smells",
    "coupling", "patterns", "naming", "cycles", "orphaned", "react",
]


def _get_ts_detect_commands() -> dict[str, callable]:
    """Build the TypeScript detector command registry (lazy-loaded)."""
    from importlib import import_module
    _det = lambda mod, fn: getattr(import_module(f"scripts.decruftify.detectors.{mod}"), fn)
    _ts = lambda mod, fn: getattr(import_module(f"scripts.decruftify.lang.typescript.{mod}"), fn)
    return {
        "logs":       _ts("logs", "cmd_logs"),
        "unused":     _ts("unused", "cmd_unused"),
        "exports":    _ts("exports", "cmd_exports"),
        "deprecated": _ts("deprecated", "cmd_deprecated"),
        "large":      _det("large", "cmd_large"),
        "complexity": _det("complexity", "cmd_complexity"),
        "gods":       _det("gods", "cmd_god_components"),
        "single-use": _det("single_use", "cmd_single_use"),
        "props":      _ts("props", "cmd_props"),
        "passthrough": _det("passthrough", "cmd_passthrough"),
        "concerns":   _ts("concerns", "cmd_concerns"),
        "deps":       _ts("deps", "cmd_deps"),
        "dupes":      _det("dupes", "cmd_dupes"),
        "smells":     _det("smells", "cmd_smells"),
        "coupling":   _det("coupling", "cmd_coupling"),
        "patterns":   _ts("patterns", "cmd_patterns"),
        "naming":     _det("naming", "cmd_naming"),
        "cycles":     _ts("deps", "cmd_cycles"),
        "orphaned":   _det("orphaned", "cmd_orphaned"),
        "react":      _ts("react", "cmd_react"),
    }


@register_lang("typescript")
class TypeScriptConfig(LangConfig):
    def __init__(self):
        super().__init__(
            name="typescript",
            extensions=[".ts", ".tsx"],
            exclusions=["node_modules", ".d.ts"],
            default_src="src",
            build_dep_graph=_ts_build_dep_graph,
            entry_patterns=[
                "/pages/", "/main.tsx", "/main.ts", "/App.tsx",
                "vite.config", "tailwind.config", "postcss.config",
                ".d.ts", "/settings.ts", "/__tests__/", ".test.", ".spec.", ".stories.",
            ],
            barrel_names={"index.ts", "index.tsx"},
            phases=[
                DetectorPhase("Logs", _phase_logs),
                DetectorPhase("Unused (tsc)", _phase_unused),
                DetectorPhase("Dead exports", _phase_exports),
                DetectorPhase("Deprecated", _phase_deprecated),
                DetectorPhase("Structural analysis", _phase_structural),
                DetectorPhase("Coupling + single-use + patterns + naming", _phase_coupling),
                DetectorPhase("Code smells", _phase_smells),
                DetectorPhase("Duplicates", _phase_dupes, slow=True),
            ],
            fixers={},
            get_area=get_area,
            detector_names=TS_DETECTOR_NAMES,
            detect_commands=_get_ts_detect_commands(),
            boundaries=[
                BoundaryRule("shared/", "tools/", "shared→tools"),
            ],
            typecheck_cmd="npx tsc --noEmit",
            find_files=lambda path: find_ts_files(path),
            large_threshold=500,
            complexity_threshold=15,
            extract_functions=_ts_extract_functions,
        )
