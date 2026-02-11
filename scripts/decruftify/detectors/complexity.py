"""Complexity signal detection: imports, useEffects, prop destructuring, etc."""

import json
import re
from pathlib import Path

from ..utils import PROJECT_ROOT, c, find_ts_files, print_table, rel


def detect_complexity(path: Path) -> list[dict]:
    """Detect files with complexity signals: many imports, prop drilling, mixed concerns."""
    entries = []
    for filepath in find_ts_files(path):
        try:
            p = Path(filepath) if Path(filepath).is_absolute() else PROJECT_ROOT / filepath
            content = p.read_text()
            lines = content.splitlines()
            loc = len(lines)
            if loc < 50:  # skip tiny files
                continue

            signals = []
            score = 0

            # 1. Import count (>15 imports = complexity signal)
            import_count = len(re.findall(r"^import\s", content, re.MULTILINE))
            if import_count > 15:
                signals.append(f"{import_count} imports")
                score += min(import_count - 15, 20)

            # 2. Prop drilling: destructured props with >8 items
            long_destructures = re.findall(r"\{\s*(\w+(?:\s*,\s*\w+){8,})\s*\}", content)
            if long_destructures:
                max_props = max(len(d.split(",")) for d in long_destructures)
                signals.append(f"destructure w/{max_props} props")
                score += max_props - 8

            # 3. useEffect count (>3 = often mixed concerns)
            effect_count = len(re.findall(r"useEffect\s*\(", content))
            if effect_count > 3:
                signals.append(f"{effect_count} useEffects")
                score += (effect_count - 3) * 3

            # 4. Inline type definitions (types defined in component files, not in types.ts)
            if not filepath.endswith("types.ts"):
                inline_types = len(re.findall(r"^(?:export\s+)?(?:type|interface)\s+\w+", content, re.MULTILINE))
                if inline_types > 3:
                    signals.append(f"{inline_types} inline types")
                    score += inline_types - 3

            # 5. TODO/FIXME/HACK comments
            todo_count = len(re.findall(r"//\s*(?:TODO|FIXME|HACK|XXX)", content, re.IGNORECASE))
            if todo_count > 0:
                signals.append(f"{todo_count} TODOs")
                score += todo_count * 2

            # 6. Nested ternaries (hard to read)
            # Exclude optional chaining (?.) and nullish coalescing (??)
            nested_ternary = len(re.findall(r"[^?]\?[^?.:\n][^:\n]*[^?]\?[^?.]", content))
            if nested_ternary > 2:
                signals.append(f"{nested_ternary} nested ternaries")
                score += nested_ternary * 3

            if signals and score >= 15:
                entries.append({
                    "file": filepath, "loc": loc, "score": score,
                    "signals": signals,
                })
        except (OSError, UnicodeDecodeError):
            continue
    return sorted(entries, key=lambda e: -e["score"])


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
