"""Single-use abstraction detection (imported by exactly 1 file = inline candidate)."""

import json
from pathlib import Path

from ..utils import c, print_table, rel


def detect_single_use_abstractions(
    path: Path,
    graph: dict,
    barrel_names: set[str] | None = None,
) -> list[dict]:
    """Find exported symbols imported by exactly 1 file — candidates for inlining."""
    skip_names = barrel_names or {"index.ts", "index.tsx", "types.ts"}
    entries = []
    for filepath, entry in graph.items():
        if entry["importer_count"] != 1:
            continue
        # Only flag non-trivial files (>50 LOC) that are single-purpose
        try:
            p = Path(filepath)
            if not p.exists():
                continue
            basename = p.name
            if basename in skip_names:
                continue
            loc = len(p.read_text().splitlines())
            if loc < 20 or loc > 300:
                continue
            importer = list(entry["importers"])[0]
            entries.append({
                "file": filepath, "loc": loc,
                "sole_importer": rel(importer),
                "reason": f"Only imported by {rel(importer)} — consider inlining",
            })
        except (OSError, UnicodeDecodeError):
            continue
    return sorted(entries, key=lambda e: -e["loc"])


def cmd_single_use(args):
    from ..lang.typescript.deps import build_dep_graph
    graph = build_dep_graph(Path(args.path))
    entries = detect_single_use_abstractions(Path(args.path), graph)
    if args.json:
        print(json.dumps({"count": len(entries), "entries": entries}, indent=2))
        return
    if not entries:
        print(c("No single-use abstractions found.", "green"))
        return
    print(c(f"\nSingle-use abstractions: {len(entries)} files\n", "bold"))
    rows = []
    for e in entries[:args.top]:
        rows.append([rel(e["file"]), str(e["loc"]), e["sole_importer"]])
    print_table(["File", "LOC", "Only Imported By"], rows, [45, 5, 60])
