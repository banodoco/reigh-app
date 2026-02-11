"""Orphaned file detection: files with zero importers that aren't entry points."""

import json
import re
import subprocess
from pathlib import Path

from ..utils import PROJECT_ROOT, c, print_table, rel


# Patterns that indicate a file is an entry point (not orphaned even with 0 importers)
ENTRY_PATTERNS = [
    "/pages/",          # Route pages (lazy-loaded)
    "/main.tsx",        # App entry
    "/main.ts",
    "/App.tsx",
    "vite.config",
    "tailwind.config",
    "postcss.config",
    ".d.ts",            # Type declarations
    "/settings.ts",     # Tool settings (loaded dynamically)
    "/__tests__/",      # Test files
    ".test.",           # Test files
    ".spec.",           # Test files
    ".stories.",        # Storybook stories
]

# Index/barrel files — these are consumed by their parent or re-export for convenience.
# Zero importers usually means consumers import children directly (which is fine).
BARREL_NAMES = {"index.ts", "index.tsx"}


def _build_dynamic_import_targets(path: Path) -> set[str]:
    """Find files referenced by dynamic imports (import('...')) and side-effect imports.

    The dep graph only tracks `from '...'` imports. This catches:
    - React.lazy(() => import('...'))
    - import('...')  (dynamic)
    - import '...'   (side-effect, no `from`)
    """
    targets: set[str] = set()

    # Dynamic imports: import('...')
    result = subprocess.run(
        ["grep", "-rn", "--include=*.ts", "--include=*.tsx", "-E",
         r"import\s*\(\s*['\"]", str(path)],
        capture_output=True, text=True, cwd=PROJECT_ROOT,
    )
    module_re = re.compile(r"""import\s*\(\s*['"]([^'"]+)['"]""")
    for line in result.stdout.splitlines():
        m = module_re.search(line)
        if m:
            targets.add(m.group(1))

    # Side-effect imports: import '...' (no from)
    result2 = subprocess.run(
        ["grep", "-rn", "--include=*.ts", "--include=*.tsx", "-E",
         r"^import\s+['\"]", str(path)],
        capture_output=True, text=True, cwd=PROJECT_ROOT,
    )
    side_re = re.compile(r"""import\s+['"]([^'"]+)['"]""")
    for line in result2.stdout.splitlines():
        m = side_re.search(line)
        if m:
            targets.add(m.group(1))

    return targets


def _is_dynamically_imported(filepath: str, dynamic_targets: set[str]) -> bool:
    """Check if a file is referenced by any dynamic/side-effect import."""
    r = rel(filepath)
    stem = Path(filepath).stem  # e.g. "debugPolling"
    name_no_ext = str(Path(r).with_suffix(""))  # e.g. "src/shared/lib/debugPolling"

    for target in dynamic_targets:
        # Resolve @/ alias
        resolved = target.replace("@/", "src/") if target.startswith("@/") else target
        # Strip leading ./
        resolved = resolved.lstrip("./")

        # Check various match patterns
        if resolved == name_no_ext or resolved == r:
            return True
        if name_no_ext.endswith("/" + resolved) or name_no_ext.endswith(resolved):
            return True
        # Relative import might match the stem
        if resolved.endswith("/" + stem) or resolved == stem:
            return True
        # With extension
        if resolved.endswith("/" + Path(filepath).name):
            return True

    return False


def detect_orphaned_files(
    path: Path,
    graph: dict,
    extra_entry_patterns: list[str] | None = None,
    extra_barrel_names: set[str] | None = None,
) -> list[dict]:
    """Find files with zero importers that aren't known entry points.

    Uses the dep graph (which tracks file-level imports) to find files
    that nothing imports. Also checks for dynamic imports and side-effect
    imports which the dep graph doesn't track.

    Args:
        extra_entry_patterns: Additional entry-point patterns from language config
            (substring-matched against relative file paths).
        extra_barrel_names: Additional barrel file names from language config.
    """
    all_entry_patterns = ENTRY_PATTERNS
    if extra_entry_patterns:
        all_entry_patterns = ENTRY_PATTERNS + extra_entry_patterns

    all_barrel_names = BARREL_NAMES
    if extra_barrel_names:
        all_barrel_names = BARREL_NAMES | extra_barrel_names

    # Build set of dynamically-imported module specifiers
    dynamic_targets = _build_dynamic_import_targets(path)

    entries = []
    for filepath, entry in graph.items():
        if entry["importer_count"] > 0:
            continue

        r = rel(filepath)

        # Skip known entry points
        if any(p in r for p in all_entry_patterns):
            continue

        # Skip barrel files
        basename = Path(filepath).name
        if basename in all_barrel_names:
            continue

        # Skip instrumentation (side-effect imports not tracked by grep-based graph)
        if "/instrumentation/" in r:
            continue

        # Skip files that are dynamically or side-effect imported
        if _is_dynamically_imported(filepath, dynamic_targets):
            continue

        try:
            loc = len(Path(filepath).read_text().splitlines())
        except (OSError, UnicodeDecodeError):
            loc = 0

        # Skip tiny files — not worth flagging
        if loc < 10:
            continue

        entries.append({
            "file": filepath,
            "loc": loc,
        })

    return sorted(entries, key=lambda e: -e["loc"])


def cmd_orphaned(args):
    """Show files with zero importers (potential dead code)."""
    from .deps import build_dep_graph

    graph = build_dep_graph(Path(args.path))
    entries = detect_orphaned_files(Path(args.path), graph)

    if args.json:
        print(json.dumps({"count": len(entries), "entries": [
            {"file": rel(e["file"]), "loc": e["loc"]} for e in entries[:args.top]
        ]}, indent=2))
        return

    if not entries:
        print(c("\nNo orphaned files found.", "green"))
        return

    total_loc = sum(e["loc"] for e in entries)
    print(c(f"\nOrphaned files (zero importers, not entry points): "
            f"{len(entries)} files, {total_loc} LOC\n", "bold"))

    rows = []
    for e in entries[:args.top]:
        rows.append([rel(e["file"]), str(e["loc"])])
    print_table(["File", "LOC"], rows, [80, 6])
    if len(entries) > args.top:
        print(f"\n  ... and {len(entries) - args.top} more")
    print()
