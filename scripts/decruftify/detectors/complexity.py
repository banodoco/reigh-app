"""Complexity signal detection: configurable per-language complexity signals."""

import json
import re
from pathlib import Path

from ..utils import PROJECT_ROOT, c, find_ts_files, print_table, rel


def detect_complexity(path: Path, signals=None, file_finder=None,
                      threshold: int = 15, min_loc: int = 50) -> list[dict]:
    """Detect files with complexity signals.

    Args:
        path: Directory to scan.
        signals: list of ComplexitySignal objects. If None, uses legacy TS signals.
        file_finder: callable(path) -> list[str]. If None, uses find_ts_files.
        threshold: minimum score to flag a file.
        min_loc: minimum LOC to consider.
    """
    finder = file_finder or find_ts_files
    sigs = signals or _ts_signals()

    entries = []
    for filepath in finder(path):
        try:
            p = Path(filepath) if Path(filepath).is_absolute() else PROJECT_ROOT / filepath
            content = p.read_text()
            lines = content.splitlines()
            loc = len(lines)
            if loc < min_loc:
                continue

            file_signals = []
            score = 0

            for sig in sigs:
                if sig.compute:
                    result = sig.compute(content, lines)
                    if result:
                        count, label = result
                        file_signals.append(label)
                        excess = max(0, count - sig.threshold) if sig.threshold else count
                        score += excess * sig.weight
                elif sig.pattern:
                    count = len(re.findall(sig.pattern, content, re.MULTILINE))
                    if count > sig.threshold:
                        file_signals.append(f"{count} {sig.name}")
                        score += (count - sig.threshold) * sig.weight

            if file_signals and score >= threshold:
                entries.append({
                    "file": filepath, "loc": loc, "score": score,
                    "signals": file_signals,
                })
        except (OSError, UnicodeDecodeError):
            continue
    return sorted(entries, key=lambda e: -e["score"])


# ── Legacy TS signals (used when no signals provided) ────


def _ts_signals():
    """Build default TypeScript complexity signals."""
    from .base import ComplexitySignal
    return [
        ComplexitySignal("imports", r"^import\s", weight=1, threshold=15),
        ComplexitySignal("destructured props", None, weight=1, threshold=8,
                         compute=_compute_ts_destructure_props),
        ComplexitySignal("useEffects", r"useEffect\s*\(", weight=3, threshold=3),
        ComplexitySignal("inline types", None, weight=1, threshold=3,
                         compute=_compute_ts_inline_types),
        ComplexitySignal("TODOs", r"//\s*(?:TODO|FIXME|HACK|XXX)", weight=2, threshold=0),
        ComplexitySignal("nested ternaries", r"[^?]\?[^?.:\n][^:\n]*[^?]\?[^?.]",
                         weight=3, threshold=2),
    ]


def _compute_ts_destructure_props(content, lines):
    long_destructures = re.findall(r"\{\s*(\w+(?:\s*,\s*\w+){8,})\s*\}", content)
    if not long_destructures:
        return None
    max_props = max(len(d.split(",")) for d in long_destructures)
    return max_props, f"destructure w/{max_props} props"


def _compute_ts_inline_types(content, lines):
    # Only applies to non-types.ts files; caller should filter, but we'll be lenient
    inline_types = len(re.findall(
        r"^(?:export\s+)?(?:type|interface)\s+\w+", content, re.MULTILINE))
    if inline_types > 3:
        return inline_types, f"{inline_types} inline types"
    return None


def cmd_complexity(args):
    entries = detect_complexity(Path(args.path))
    if args.json:
        print(json.dumps({"count": len(entries), "entries": entries}, indent=2))
        return

    if not entries:
        print(c("No significant complexity signals found.", "green"))
        return

    print(c(f"\nComplexity signals: {len(entries)} files\n", "bold"))
    rows = []
    for e in entries[: args.top]:
        sigs = ", ".join(e["signals"][:4])
        rows.append([rel(e["file"]), str(e["loc"]), str(e["score"]), sigs])
    print_table(["File", "LOC", "Score", "Signals"], rows, [55, 5, 6, 45])
