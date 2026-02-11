"""Naming consistency analysis: flag directories with mixed filename conventions.

Handles known third-party convention clashes:
- src/shared/components/ui: shadcn uses kebab-case, project uses camelCase → expected
- Hooks named use-*.ts: shadcn convention, not a project inconsistency
- PascalCase files in lib/: class-style modules are a valid convention choice
"""

import json
from collections import defaultdict
from pathlib import Path

from ..utils import c, find_ts_files, print_table, rel

# Standard names that don't follow any convention — skip these
SKIP_NAMES = {
    "index.ts", "index.tsx", "types.ts", "types.tsx",
    "constants.ts", "constants.tsx", "utils.ts", "utils.tsx",
    "helpers.ts", "helpers.tsx", "settings.ts", "settings.tsx",
    "main.ts", "main.tsx", "App.tsx", "vite-env.d.ts",
}

# Directories where mixed conventions are expected (third-party code)
SKIP_DIRS = {
    "src/shared/components/ui",  # shadcn components use kebab-case
}


def _classify_convention(filename: str) -> str | None:
    """Classify a filename (without extension) into a naming convention."""
    stem = filename.rsplit(".", 1)[0] if "." in filename else filename
    if not stem:
        return None

    # kebab-case: contains hyphens, all lowercase
    if "-" in stem and stem == stem.lower():
        return "kebab-case"
    # PascalCase: starts with uppercase, no hyphens
    if stem[0].isupper() and "-" not in stem:
        return "PascalCase"
    # camelCase: starts with lowercase, has uppercase letters, no hyphens
    if stem[0].islower() and any(c.isupper() for c in stem) and "-" not in stem:
        return "camelCase"
    # all lowercase, no hyphens = could be either camelCase or kebab, treat as camelCase
    if stem.islower() and "-" not in stem:
        return "camelCase"
    return None


def _is_third_party_convention(filename: str, convention: str, dirname: str) -> bool:
    """Check if a file's convention is expected from a third-party source."""
    stem = filename.rsplit(".", 1)[0] if "." in filename else filename

    # shadcn hooks: use-*.ts / use-*.tsx (kebab-case with use- prefix)
    if convention == "kebab-case" and stem.startswith("use-"):
        return True

    return False


def detect_naming_inconsistencies(path: Path, file_finder=None,
                                   skip_names: set[str] | None = None,
                                   skip_dirs: set[str] | None = None) -> list[dict]:
    """Find directories where minority naming convention is significant.

    Thresholds:
    - Minority must have >= 5 files (absolute)
    - Minority must be >= 15% of total files (proportional)
    - Skips known third-party directories and convention patterns
    """
    finder = file_finder or find_ts_files
    all_skip_names = skip_names or SKIP_NAMES
    all_skip_dirs = skip_dirs or SKIP_DIRS
    files = finder(path)

    # Group files by directory and classify
    dir_files: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))

    for filepath in files:
        p = Path(filepath)
        dirname = str(p.parent)
        rdir = rel(dirname)
        filename = p.name

        if filename in all_skip_names:
            continue
        if rdir in all_skip_dirs:
            continue

        convention = _classify_convention(filename)
        if convention:
            # Filter out known third-party convention files
            if _is_third_party_convention(filename, convention, rdir):
                continue
            dir_files[dirname][convention].append(filename)

    entries = []
    for dirname, conventions in dir_files.items():
        if len(conventions) < 2:
            continue  # all files use same convention

        # Find majority convention
        sorted_conventions = sorted(conventions.items(), key=lambda x: -len(x[1]))
        majority_name, majority_files = sorted_conventions[0]
        total = sum(len(fs) for fs in conventions.values())

        for conv_name, conv_files in sorted_conventions[1:]:
            # Absolute threshold: need at least 5 minority files
            if len(conv_files) < 5:
                continue
            # Proportional threshold: minority must be >= 15% of total
            if len(conv_files) / total < 0.15:
                continue

            entries.append({
                "directory": rel(dirname),
                "majority": majority_name,
                "majority_count": len(majority_files),
                "minority": conv_name,
                "minority_count": len(conv_files),
                "total_files": total,
                "outliers": sorted(conv_files[:10]),
            })

    return sorted(entries, key=lambda e: -e["minority_count"])


def cmd_naming(args):
    """Raw detector access: show naming inconsistencies per directory."""
    entries = detect_naming_inconsistencies(Path(args.path))

    if args.json:
        print(json.dumps({
            "count": len(entries),
            "entries": entries,
        }, indent=2))
        return

    if not entries:
        print(c("\nNo naming inconsistencies found.", "green"))
        print()
        return

    print(c(f"\nNaming inconsistencies: {len(entries)} directories\n", "bold"))
    rows = []
    for e in entries[:args.top]:
        outlier_str = ", ".join(e["outliers"][:5])
        if len(e["outliers"]) > 5:
            outlier_str += f" (+{len(e['outliers']) - 5})"
        rows.append([
            e["directory"],
            f"{e['majority']} ({e['majority_count']})",
            f"{e['minority']} ({e['minority_count']})",
            outlier_str,
        ])
    print_table(
        ["Directory", "Majority", "Minority", "Outlier Files"],
        rows,
        [45, 20, 20, 40],
    )
    print()
