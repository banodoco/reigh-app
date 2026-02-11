"""Base abstractions for multi-language support."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from ..state import make_finding
from ..utils import rel


@dataclass
class DetectorPhase:
    """A single phase in the scan pipeline.

    Each phase runs one or more detectors and returns normalized findings.
    The `run` function handles both detection AND normalization (converting
    raw detector output to findings with tiers/confidence).
    """
    label: str
    run: Callable[[Path, LangConfig], list[dict]]
    slow: bool = False


@dataclass
class FixerConfig:
    """Configuration for an auto-fixer."""
    label: str
    detect: Callable
    fix: Callable
    detector: str           # finding detector name (for state resolution)
    verb: str = "Fixed"
    dry_verb: str = "Would fix"
    post_fix: Callable | None = None


@dataclass
class BoundaryRule:
    """A coupling boundary: `protected` dir should not be imported from `forbidden_from`."""
    protected: str          # e.g. "shared/"
    forbidden_from: str     # e.g. "tools/"
    label: str              # e.g. "shared→tools"


@dataclass
class LangConfig:
    """Language configuration — everything the pipeline needs to scan a codebase."""

    name: str
    extensions: list[str]
    exclusions: list[str]
    default_src: str                                    # relative to PROJECT_ROOT

    # Dep graph builder (language-specific import parsing)
    build_dep_graph: Callable[[Path], dict]

    # Entry points (not orphaned even with 0 importers)
    entry_patterns: list[str]
    barrel_names: set[str]

    # Detector phases (ordered)
    phases: list[DetectorPhase] = field(default_factory=list)

    # Fixer registry
    fixers: dict[str, FixerConfig] = field(default_factory=dict)

    # Area classification (project-specific grouping)
    get_area: Callable[[str], str] | None = None

    # Detector names (for `detect` raw command)
    detector_names: list[str] = field(default_factory=list)

    # Commands for `detect` subcommand (language-specific overrides)
    detect_commands: dict[str, Callable] = field(default_factory=dict)

    # Function extractor (for duplicate detection)
    extract_functions: Callable[[str], list[dict]] | None = None

    # Coupling boundaries (optional, project-specific)
    boundaries: list[BoundaryRule] = field(default_factory=list)

    # Unused detection tool command (for post-fix checklist)
    typecheck_cmd: str = ""


# ── Shared phase helpers ──────────────────────────────────


def make_unused_findings(entries: list[dict], stderr_fn) -> list[dict]:
    """Transform raw unused-detector entries into normalized findings.

    Shared by both Python and TypeScript unused phases.
    """
    results = []
    for e in entries:
        tier = 1 if e["category"] == "imports" else 2
        results.append(make_finding(
            "unused", e["file"], e["name"],
            tier=tier, confidence="high",
            summary=f"Unused {e['category']}: {e['name']}",
            detail={"line": e["line"], "category": e["category"]},
        ))
    stderr_fn(f"         {len(entries)} instances -> {len(results)} findings")
    return results


def make_dupe_findings(entries: list[dict], stderr_fn) -> list[dict]:
    """Transform raw duplicate-detector entries into normalized findings.

    Shared by both Python and TypeScript dupes phases.
    """
    results = []
    for e in entries:
        a, b = e["fn_a"], e["fn_b"]
        if a["loc"] < 8 and b["loc"] < 8:
            continue
        pair = sorted([(a["file"], a["name"]), (b["file"], b["name"])])
        name = f"{pair[0][1]}::{rel(pair[1][0])}::{pair[1][1]}"
        tier = 2 if e["kind"] == "exact" else 3
        conf = "high" if e["kind"] == "exact" else "medium"
        results.append(make_finding(
            "dupes", pair[0][0], name,
            tier=tier, confidence=conf,
            summary=f"{'Exact' if e['kind'] == 'exact' else 'Near'} dupe: "
                    f"{a['name']} ({rel(a['file'])}:{a['line']}) <-> "
                    f"{b['name']} ({rel(b['file'])}:{b['line']}) [{e['similarity']:.0%}]",
            detail={"fn_a": a, "fn_b": b,
                    "similarity": e["similarity"], "kind": e["kind"]},
        ))
    suppressed = sum(1 for e in entries
                     if e["fn_a"]["loc"] < 8 and e["fn_b"]["loc"] < 8)
    stderr_fn(f"         {len(entries)} pairs, {suppressed} suppressed (<8 LOC)")
    return results
