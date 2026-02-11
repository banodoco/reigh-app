"""Coupling analysis: shared→tools imports and boundary candidates."""

import json
from pathlib import Path

from ..utils import c, print_table, rel, SRC_PATH
from ..lang.typescript.deps import build_dep_graph


def detect_coupling_violations(path: Path, graph: dict) -> list[dict]:
    """Find shared/ files that import from tools/ (backwards coupling).

    These are always wrong — shared code must not depend on tool-specific code.
    """
    entries = []
    src = str(SRC_PATH)
    shared_prefix = f"{src}/shared/"
    tools_prefix = f"{src}/tools/"

    for filepath, entry in graph.items():
        if not filepath.startswith(shared_prefix):
            continue
        for target in entry["imports"]:
            if target.startswith(tools_prefix):
                # Extract tool name from path
                remainder = target[len(tools_prefix):]
                tool = remainder.split("/")[0] if "/" in remainder else remainder
                entries.append({
                    "file": filepath,
                    "target": rel(target),
                    "tool": tool,
                    "direction": "shared→tools",
                })
    return sorted(entries, key=lambda e: (e["file"], e["target"]))


def detect_boundary_candidates(path: Path, graph: dict) -> list[dict]:
    """Find shared/ files whose importers ALL come from a single tool.

    These are candidates for moving into that tool's directory — they're
    "shared" in name only.
    """
    entries = []
    src = str(SRC_PATH)
    shared_prefix = f"{src}/shared/"
    tools_prefix = f"{src}/tools/"

    for filepath, entry in graph.items():
        if not filepath.startswith(shared_prefix):
            continue
        # Skip index files and ui/ components (intentionally shared)
        basename = Path(filepath).name
        if basename in ("index.ts", "index.tsx"):
            continue
        if f"{src}/shared/components/ui/" in filepath:
            continue
        # Skip files with zero importers (caught by other detectors)
        if entry["importer_count"] == 0:
            continue

        # Classify all importers by tool area
        tool_areas = set()
        has_non_tool_importer = False
        for imp in entry["importers"]:
            if imp.startswith(tools_prefix):
                remainder = imp[len(tools_prefix):]
                tool = remainder.split("/")[0]
                tool_areas.add(tool)
            else:
                has_non_tool_importer = True

        # Only flag if ALL importers are from a single tool
        if len(tool_areas) == 1 and not has_non_tool_importer:
            try:
                loc = len(Path(filepath).read_text().splitlines())
            except (OSError, UnicodeDecodeError):
                loc = 0
            entries.append({
                "file": filepath,
                "sole_tool": f"src/tools/{list(tool_areas)[0]}",
                "importer_count": entry["importer_count"],
                "loc": loc,
            })

    return sorted(entries, key=lambda e: -e["loc"])


def detect_cross_tool_imports(path: Path, graph: dict) -> list[dict]:
    """Find tools/A files that import from tools/B (cross-tool coupling).

    Tools should only share code through shared/ — direct tool→tool imports
    create hidden coupling.
    """
    entries = []
    tools_prefix = f"{SRC_PATH}/tools/"

    for filepath, entry in graph.items():
        if not filepath.startswith(tools_prefix):
            continue
        # Skip root-level tools/ files (registry/barrel) — they're inherently cross-tool
        remainder = filepath[len(tools_prefix):]
        if "/" not in remainder:
            continue
        source_tool = remainder.split("/")[0]
        for target in entry["imports"]:
            if not target.startswith(tools_prefix):
                continue
            target_tool = target[len(tools_prefix):].split("/")[0]
            if source_tool != target_tool:
                entries.append({
                    "file": filepath,
                    "target": rel(target),
                    "source_tool": source_tool,
                    "target_tool": target_tool,
                    "direction": "tools→tools",
                })
    return sorted(entries, key=lambda e: (e["source_tool"], e["file"]))


def cmd_coupling(args):
    """Raw detector access: show coupling violations and boundary candidates."""
    graph = build_dep_graph(Path(args.path))

    violations = detect_coupling_violations(Path(args.path), graph)
    candidates = detect_boundary_candidates(Path(args.path), graph)

    if args.json:
        print(json.dumps({
            "violations": len(violations),
            "boundary_candidates": len(candidates),
            "coupling_violations": violations,
            "boundary_candidates_detail": [
                {**e, "file": rel(e["file"])} for e in candidates
            ],
        }, indent=2))
        return

    # Violations
    if violations:
        print(c(f"\nCoupling violations (shared → tools): {len(violations)}\n", "bold"))
        rows = []
        for e in violations[:args.top]:
            rows.append([rel(e["file"]), e["target"], e["tool"]])
        print_table(["Shared File", "Imports From", "Tool"], rows, [50, 50, 20])
    else:
        print(c("\nNo coupling violations (shared → tools).", "green"))

    # Cross-tool imports
    cross_tool = detect_cross_tool_imports(Path(args.path), graph)
    print()
    if cross_tool:
        print(c(f"Cross-tool imports (tools → tools): {len(cross_tool)}\n", "bold"))
        rows = []
        for e in cross_tool[:args.top]:
            rows.append([rel(e["file"]), e["target"], f"{e['source_tool']}→{e['target_tool']}"])
        print_table(["Source File", "Imports From", "Direction"], rows, [50, 50, 20])
    else:
        print(c("No cross-tool imports.", "green"))

    # Boundary candidates
    print()
    if candidates:
        print(c(f"Boundary candidates (shared files used by 1 tool): {len(candidates)}\n", "bold"))
        rows = []
        for e in candidates[:args.top]:
            rows.append([rel(e["file"]), str(e["loc"]), e["sole_tool"],
                         str(e["importer_count"])])
        print_table(["Shared File", "LOC", "Only Used By", "Importers"], rows,
                    [50, 5, 30, 9])
    else:
        print(c("No boundary candidates found.", "green"))
    print()
