"""Python complexity signal detection."""

import re
from pathlib import Path

from ...utils import PROJECT_ROOT, find_source_files


def detect_complexity(path: Path) -> list[dict]:
    """Detect files with complexity signals."""
    entries = []
    for filepath in find_source_files(path, [".py"], ["__pycache__", ".venv", "node_modules"]):
        try:
            p = Path(filepath) if Path(filepath).is_absolute() else PROJECT_ROOT / filepath
            content = p.read_text()
            lines = content.splitlines()
            loc = len(lines)
            if loc < 50:
                continue

            signals = []
            score = 0

            # 1. Import count (>20 imports)
            import_count = len(re.findall(r"^(?:import |from )", content, re.MULTILINE))
            if import_count > 20:
                signals.append(f"{import_count} imports")
                score += min(import_count - 20, 20)

            # 2. Functions with many parameters (>7)
            param_re = re.compile(r"def\s+\w+\s*\(([^)]*)\)", re.DOTALL)
            max_params = 0
            for m in param_re.finditer(content):
                params = [p.strip() for p in m.group(1).split(",") if p.strip()]
                # Exclude self, cls, *args, **kwargs from count
                real_params = [p for p in params
                              if p not in ("self", "cls") and not p.startswith("*")]
                if len(real_params) > max_params:
                    max_params = len(real_params)
            if max_params > 7:
                signals.append(f"function with {max_params} params")
                score += (max_params - 7) * 2

            # 3. Deep nesting (>4 levels by indentation)
            max_indent = 0
            for line in lines:
                stripped = line.lstrip()
                if not stripped or stripped.startswith("#"):
                    continue
                indent = len(line) - len(stripped)
                # Assume 4-space indent (most common)
                level = indent // 4
                if level > max_indent:
                    max_indent = level
            if max_indent > 4:
                signals.append(f"nesting depth {max_indent}")
                score += (max_indent - 4) * 3

            # 4. Long functions (>80 LOC)
            long_fns = _find_long_functions(lines)
            if long_fns:
                longest = max(long_fns, key=lambda x: x[1])
                signals.append(f"long function ({longest[0]}: {longest[1]} LOC)")
                score += sum(max(0, loc - 80) for _, loc in long_fns)

            # 5. Many classes in one file (>3)
            class_count = len(re.findall(r"^class\s+\w+", content, re.MULTILINE))
            if class_count > 3:
                signals.append(f"{class_count} classes")
                score += (class_count - 3) * 3

            # 6. Nested comprehensions
            nested_comp = len(re.findall(
                r"\[.*\bfor\b.*\bfor\b.*\]|\{.*\bfor\b.*\bfor\b.*\}", content))
            if nested_comp > 2:
                signals.append(f"{nested_comp} nested comprehensions")
                score += nested_comp * 2

            # 7. TODO/FIXME/HACK comments
            todo_count = len(re.findall(r"#\s*(?:TODO|FIXME|HACK|XXX)", content, re.IGNORECASE))
            if todo_count > 0:
                signals.append(f"{todo_count} TODOs")
                score += todo_count * 2

            if signals and score >= 15:
                entries.append({
                    "file": filepath, "loc": loc, "score": score,
                    "signals": signals,
                })
        except (OSError, UnicodeDecodeError):
            continue

    return sorted(entries, key=lambda e: -e["score"])


def _find_long_functions(lines: list[str]) -> list[tuple[str, int]]:
    """Find top-level and class-level functions >80 LOC."""
    results = []
    fn_re = re.compile(r"^(\s*)def\s+(\w+)")

    i = 0
    while i < len(lines):
        m = fn_re.match(lines[i])
        if not m:
            i += 1
            continue

        fn_indent = len(m.group(1))
        fn_name = m.group(2)
        fn_start = i

        j = i + 1
        while j < len(lines):
            if lines[j].strip() == "":
                j += 1
                continue
            line_indent = len(lines[j]) - len(lines[j].lstrip())
            if line_indent <= fn_indent and lines[j].strip():
                break
            j += 1

        fn_loc = j - fn_start
        if fn_loc > 80:
            results.append((fn_name, fn_loc))
        i = j

    return results
