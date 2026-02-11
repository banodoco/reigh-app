"""Large file detection (>500 LOC)."""

import json
import re
from pathlib import Path

from ..utils import PROJECT_ROOT, c, find_ts_files, print_table, rel


def detect_large_files(path: Path, threshold: int = 500) -> list[dict]:
    """Find .ts/.tsx files exceeding a line count threshold."""
    entries = []
    for filepath in find_ts_files(path):
        try:
            p = Path(filepath) if Path(filepath).is_absolute() else PROJECT_ROOT / filepath
            lines = p.read_text().splitlines()
            loc = len(lines)
            if loc > threshold:
                # Count imports, exports, functions for a quick complexity profile
                content = p.read_text()
                import_count = len(re.findall(r"^import\s", content, re.MULTILINE))
                export_count = len(re.findall(r"^export\s", content, re.MULTILINE))
                fn_count = len(re.findall(r"(?:function\s+\w+|=>\s*\{|const\s+\w+\s*=\s*(?:async\s+)?\()", content))
                entries.append({
                    "file": filepath, "loc": loc,
                    "imports": import_count, "exports": export_count, "functions": fn_count,
                })
        except (OSError, UnicodeDecodeError):
            continue
    return sorted(entries, key=lambda e: -e["loc"])


def cmd_large(args):
    entries = detect_large_files(Path(args.path), args.threshold)
    if args.json:
        print(json.dumps({"count": len(entries), "threshold": args.threshold, "entries": entries}, indent=2))
        return

    if not entries:
        print(c(f"No files over {args.threshold} lines.", "green"))
        return

    print(c(f"\nLarge files (>{args.threshold} LOC): {len(entries)}\n", "bold"))
    rows = []
    for e in entries[: args.top]:
        rows.append([rel(e["file"]), str(e["loc"]), str(e["imports"]), str(e["exports"]), str(e["functions"])])
    print_table(["File", "LOC", "Imports", "Exports", "Fns"], rows, [60, 6, 8, 8, 4])
