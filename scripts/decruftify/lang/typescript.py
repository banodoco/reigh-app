"""TypeScript/React language configuration for decruftify."""

from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

from . import register_lang
from .base import BoundaryRule, DetectorPhase, FixerConfig, LangConfig
from ..state import make_finding
from ..utils import PROJECT_ROOT, c, get_area, rel, resolve_path


# ── Phase runners ──────────────────────────────────────────
# Each wraps the existing detector + normalization logic from plan.py


def _stderr(msg: str):
    print(c(msg, "dim"), file=sys.stderr)


def _phase_logs(path: Path, lang: LangConfig) -> list[dict]:
    from ..detectors.logs import detect_logs
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
    from ..detectors.unused import detect_unused
    from .base import make_unused_findings
    return make_unused_findings(detect_unused(path), _stderr)


def _phase_exports(path: Path, lang: LangConfig) -> list[dict]:
    from ..detectors.exports import detect_dead_exports
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
    from ..detectors.deprecated import detect_deprecated
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
    from ..detectors.large import detect_large_files
    from ..detectors.complexity import detect_complexity
    from ..detectors.gods import detect_god_components
    from ..detectors.concerns import detect_mixed_concerns
    from ..detectors.props import detect_prop_interface_bloat

    structural: dict[str, dict] = {}
    for e in detect_large_files(path):
        f = resolve_path(e["file"])
        structural.setdefault(f, {"signals": [], "detail": {}})
        structural[f]["signals"].append(f"large ({e['loc']} LOC)")
        structural[f]["detail"]["loc"] = e["loc"]
        structural[f]["detail"]["imports"] = e["imports"]
        structural[f]["detail"]["functions"] = e["functions"]

    for e in detect_complexity(path):
        f = resolve_path(e["file"])
        structural.setdefault(f, {"signals": [], "detail": {}})
        structural[f]["signals"].append(f"complexity score {e['score']}")
        structural[f]["detail"]["complexity_score"] = e["score"]
        structural[f]["detail"]["complexity_signals"] = e["signals"]

    for e in detect_god_components(path):
        f = resolve_path(e["file"])
        structural.setdefault(f, {"signals": [], "detail": {}})
        structural[f]["signals"].append(f"{e['hook_total']} hooks ({', '.join(e['reasons'][:2])})")
        structural[f]["detail"]["hook_total"] = e["hook_total"]
        structural[f]["detail"]["hook_reasons"] = e["reasons"]

    for e in detect_mixed_concerns(path):
        f = resolve_path(e["file"])
        structural.setdefault(f, {"signals": [], "detail": {}})
        structural[f]["signals"].append(f"mixed: {', '.join(e['concerns'][:3])}")
        structural[f]["detail"]["concerns"] = e["concerns"]

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
        summary = "Needs decomposition: " + " · ".join(data["signals"])
        results.append(make_finding(
            "structural", filepath, "",
            tier=tier, confidence=confidence,
            summary=summary,
            detail=data["detail"],
        ))

    for e in detect_prop_interface_bloat(path):
        results.append(make_finding(
            "props", e["file"], e["interface"],
            tier=3, confidence="medium",
            summary=f"Bloated props: {e['interface']} ({e['prop_count']} props)",
            detail={"prop_count": e["prop_count"], "line": e["line"]},
        ))

    from ..detectors.passthrough import detect_passthrough_components
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
    _stderr(f"         → {len(results)} structural findings")
    return results


SMELL_TIER_MAP = {
    "high": 2,
    "medium": 3,
    "low": 3,
}


def _phase_coupling(path: Path, lang: LangConfig) -> list[dict]:
    from ..detectors.single_use import detect_single_use_abstractions
    from ..detectors.deps import build_dep_graph
    from ..detectors.graph import detect_cycles
    from ..detectors.coupling import (detect_coupling_violations, detect_boundary_candidates,
                                       detect_cross_tool_imports)
    from ..detectors.orphaned import detect_orphaned_files
    from ..detectors.patterns import detect_pattern_anomalies
    from ..detectors.naming import detect_naming_inconsistencies

    results = []
    graph = build_dep_graph(path)

    # Single-use
    single_entries = detect_single_use_abstractions(path, graph)
    colocated_suppressed = 0
    n_before = len(results)
    for e in single_entries:
        if 50 <= e["loc"] <= 200:
            continue
        if get_area(rel(e["file"])) == get_area(e["sole_importer"]):
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

    # Coupling violations + boundary candidates
    for e in detect_coupling_violations(path, graph):
        results.append(make_finding(
            "coupling", e["file"], e["target"],
            tier=2, confidence="high",
            summary=f"Backwards coupling: shared imports {e['target']} (tool: {e['tool']})",
            detail={"target": e["target"], "tool": e["tool"], "direction": e["direction"]},
        ))

    single_use_emitted = set()
    for e in single_entries:
        is_size_ok = 50 <= e["loc"] <= 200
        is_colocated = get_area(rel(e["file"])) == get_area(e["sole_importer"])
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

    # Cross-tool imports
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
            summary=f"Import cycle ({cy['length']} files): {' → '.join(cycle_files[:5])}"
                    + (f" → +{len(cycle_files) - 5}" if len(cycle_files) > 5 else ""),
            detail={"files": cycle_files, "length": cy["length"]},
        ))
    if cycles:
        _stderr(f"         cycles: {len(cycles)} import cycles")

    # Orphaned files
    orphaned = detect_orphaned_files(path, graph)
    for e in orphaned:
        results.append(make_finding(
            "orphaned", e["file"], "",
            tier=3, confidence="medium",
            summary=f"Orphaned file ({e['loc']} LOC): zero importers, not an entry point",
            detail={"loc": e["loc"]},
        ))
    if orphaned:
        _stderr(f"         orphaned: {len(orphaned)} files with zero importers")

    # Pattern consistency
    for e in detect_pattern_anomalies(path):
        results.append(make_finding(
            "patterns", e["area"], e["family"],
            tier=3, confidence=e.get("confidence", "low"),
            summary=f"Competing patterns ({e['family']}): {e['review'][:120]}",
            detail={"family": e["family"], "patterns_used": e["patterns_used"],
                    "pattern_count": e["pattern_count"], "review": e["review"]},
        ))

    # Naming consistency
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
    from ..detectors.smells import detect_smells
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
    # React anti-patterns
    from ..detectors.react import detect_state_sync
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
    _stderr(f"         → {len(results)} smell findings")
    return results


def _phase_dupes(path: Path, lang: LangConfig) -> list[dict]:
    from ..detectors.dupes import detect_duplicates
    from .base import make_dupe_findings
    return make_dupe_findings(detect_duplicates(path), _stderr)


# ── Fixer wiring ──────────────────────────────────────────


def _get_ts_fixers() -> dict[str, FixerConfig]:
    """Build the TypeScript fixer registry (lazy-loaded)."""
    return {
        "unused-imports": FixerConfig(
            label="unused imports",
            detect=lambda path: __import__("scripts.decruftify.detectors.unused", fromlist=["detect_unused"]).detect_unused(path, category="imports"),
            fix=lambda entries, **kw: __import__("scripts.decruftify.fixers", fromlist=["fix_unused_imports"]).fix_unused_imports(entries, **kw),
            detector="unused",
            verb="Removed", dry_verb="Would remove",
        ),
        # Fixers are loaded lazily via fix_cmd.py's existing _get_fixer() — no need to duplicate here
    }


# ── Build the config ──────────────────────────────────────


def _ts_build_dep_graph(path: Path) -> dict:
    from ..detectors.deps import build_dep_graph
    return build_dep_graph(path)


TS_DETECTOR_NAMES = [
    "logs", "unused", "exports", "deprecated", "large", "complexity",
    "gods", "single-use", "props", "passthrough", "concerns", "deps", "dupes", "smells",
    "coupling", "patterns", "naming", "cycles", "orphaned", "react",
]


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
            fixers={},  # TS fixers are still handled by fix_cmd.py's _get_fixer() for now
            get_area=get_area,
            detector_names=TS_DETECTOR_NAMES,
            boundaries=[
                BoundaryRule("shared/", "tools/", "shared→tools"),
            ],
            typecheck_cmd="npx tsc --noEmit",
        )
