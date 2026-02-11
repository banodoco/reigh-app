"""Shared utilities: paths, colors, output formatting."""

import os
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_PATH = PROJECT_ROOT / "src"
SRC_PATH = PROJECT_ROOT / "src"

# ── ANSI colors ──────────────────────────────────────────────

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


def grep(pattern: str, path: str | Path, *extra_args: str,
         extensions: list[str] | None = None) -> str:
    """Run grep and return stdout. Common wrapper to avoid repetition."""
    if extensions is None:
        extensions = [".ts", ".tsx"]
    include_args = [f"--include=*{ext}" for ext in extensions]
    result = subprocess.run(
        ["grep", "-rn", *include_args, "-E", pattern, str(path), *extra_args],
        capture_output=True, text=True, cwd=PROJECT_ROOT,
    )
    return result.stdout


def find_source_files(path: str | Path, extensions: list[str],
                      exclusions: list[str] | None = None) -> list[str]:
    """Find all files with given extensions under a path, excluding patterns."""
    args = ["find", str(path)]
    # Build -name conditions joined with -o
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
    return files


def find_ts_files(path: str | Path) -> list[str]:
    """Find all .ts and .tsx files under a path."""
    return find_source_files(path, [".ts", ".tsx"])


def find_tsx_files(path: str | Path) -> list[str]:
    """Find all .tsx files under a path."""
    return find_source_files(path, [".tsx"])


def read_file(filepath: str) -> str:
    """Read a file, resolving relative paths against PROJECT_ROOT."""
    p = Path(filepath) if Path(filepath).is_absolute() else PROJECT_ROOT / filepath
    return p.read_text()


def parse_grep_lines(output: str) -> list[tuple[str, int, str]]:
    """Parse grep -rn output into (filepath, lineno, content) tuples."""
    results = []
    for line in output.splitlines():
        parts = line.split(":", 2)
        if len(parts) >= 3:
            results.append((parts[0], int(parts[1]), parts[2]))
    return results


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
