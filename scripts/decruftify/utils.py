"""Shared utilities: paths, colors, output formatting, file discovery."""

import os
import subprocess
import sys
from functools import lru_cache
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_PATH = PROJECT_ROOT / "src"
SRC_PATH = PROJECT_ROOT / "src"

# Module-level exclusion patterns set by CLI --exclude and/or persisted config.
# Used by run_grep() and merged into find_source_files() calls.
_extra_exclusions: list[str] = []


def set_exclusions(patterns: list[str]):
    """Set global exclusion patterns (called once from CLI at startup)."""
    _extra_exclusions.clear()
    _extra_exclusions.extend(patterns)


def run_grep(cmd: list[str]) -> str:
    """Run a grep command, filtering results by active exclusions."""
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=PROJECT_ROOT)
    if not _extra_exclusions or not result.stdout:
        return result.stdout
    lines = result.stdout.splitlines()
    filtered = [l for l in lines if not any(ex in l for ex in _extra_exclusions)]
    return "\n".join(filtered) + ("\n" if filtered else "")

COLORS = {
    "reset": "\033[0m",
    "bold": "\033[1m",
    "dim": "\033[2m",
    "red": "\033[31m",
    "green": "\033[32m",
    "yellow": "\033[33m",
    "blue": "\033[34m",
    "cyan": "\033[36m",
}

NO_COLOR = os.environ.get("NO_COLOR") is not None


def c(text: str, color: str) -> str:
    if NO_COLOR or not sys.stdout.isatty():
        return str(text)
    return f"{COLORS.get(color, '')}{text}{COLORS['reset']}"


def log(msg: str):
    """Print a dim status message to stderr."""
    print(c(msg, "dim"), file=sys.stderr)


def print_table(headers: list[str], rows: list[list[str]], widths: list[int] | None = None):
    if not rows:
        return
    if not widths:
        widths = [max(len(str(h)), *(len(str(r[i])) for r in rows)) for i, h in enumerate(headers)]
    header_line = "  ".join(h.ljust(w) for h, w in zip(headers, widths))
    print(c(header_line, "bold"))
    print(c("─" * (sum(widths) + 2 * (len(widths) - 1)), "dim"))
    for row in rows:
        print("  ".join(str(v).ljust(w) for v, w in zip(row, widths)))


def display_entries(args, entries, *, label, empty_msg, columns, widths, row_fn,
                    json_payload=None, overflow=True):
    """Standard JSON/empty/table display for detect commands.

    Handles the three-branch pattern shared by most cmd wrappers:
    1. --json → dump payload  2. empty → green message  3. table → header + rows + overflow.
    Returns True if entries were displayed, False if empty.
    """
    import json as _json
    if getattr(args, "json", False):
        payload = json_payload or {"count": len(entries), "entries": entries}
        print(_json.dumps(payload, indent=2))
        return True
    if not entries:
        print(c(empty_msg, "green"))
        return False
    print(c(f"\n{label}: {len(entries)}\n", "bold"))
    top = getattr(args, "top", 20)
    rows = [row_fn(e) for e in entries[:top]]
    print_table(columns, rows, widths)
    if overflow and len(entries) > top:
        print(f"\n  ... and {len(entries) - top} more")
    return True


def rel(path: str) -> str:
    try:
        return str(Path(path).relative_to(PROJECT_ROOT))
    except ValueError:
        return path


def resolve_path(filepath: str) -> str:
    """Resolve a filepath to absolute, handling both relative and absolute."""
    p = Path(filepath)
    if p.is_absolute():
        return str(p.resolve())
    return str((PROJECT_ROOT / filepath).resolve())


@lru_cache(maxsize=16)
def _find_source_files_cached(path: str, extensions: tuple[str, ...],
                               exclusions: tuple[str, ...] | None = None) -> tuple[str, ...]:
    """Cached file discovery — returns tuple for hashability."""
    args = ["find", path]
    name_parts: list[str] = []
    for ext in extensions:
        if name_parts:
            name_parts.append("-o")
        name_parts.extend(["-name", f"*{ext}"])
    if len(extensions) > 1:
        args += ["(", *name_parts, ")"]
    else:
        args += name_parts

    result = subprocess.run(args, capture_output=True, text=True, cwd=PROJECT_ROOT)
    files = [f for f in result.stdout.strip().splitlines() if f]

    if exclusions:
        files = [f for f in files if not any(ex in f for ex in exclusions)]
    return tuple(files)


def find_source_files(path: str | Path, extensions: list[str],
                      exclusions: list[str] | None = None) -> list[str]:
    """Find all files with given extensions under a path, excluding patterns."""
    all_exclusions = list(exclusions or []) + list(_extra_exclusions)
    return list(_find_source_files_cached(
        str(path), tuple(extensions), tuple(all_exclusions) if all_exclusions else None))


def find_ts_files(path: str | Path) -> list[str]:
    """Find all .ts and .tsx files under a path."""
    return find_source_files(path, [".ts", ".tsx"])


def find_tsx_files(path: str | Path) -> list[str]:
    """Find all .tsx files under a path."""
    return find_source_files(path, [".tsx"])


def find_py_files(path: str | Path) -> list[str]:
    """Find all .py files under a path, excluding common non-source dirs."""
    return find_source_files(path, [".py"], ["__pycache__", ".venv", "node_modules"])


def get_area(filepath: str) -> str:
    """Derive an area name from a file path for grouping structural findings."""
    parts = filepath.split("/")
    if filepath.startswith("src/tools/") and len(parts) >= 3:
        return "/".join(parts[:3])
    if filepath.startswith("src/shared/components/") and len(parts) > 3:
        if not parts[3].endswith((".tsx", ".ts")):
            return "/".join(parts[:4])
        return "/".join(parts[:3])
    if filepath.startswith("src/shared/") and len(parts) >= 3:
        return "/".join(parts[:3])
    if filepath.startswith("src/pages/") and len(parts) >= 3:
        return "/".join(parts[:3])
    return "/".join(parts[:2]) if len(parts) > 1 else parts[0]
