"""Python god class detection (too many methods/attributes = too many responsibilities)."""

import re
from pathlib import Path

from ...utils import PROJECT_ROOT, find_source_files


def detect_god_classes(path: Path) -> list[dict]:
    """Find classes with too many methods/attributes."""
    entries = []
    for filepath in find_source_files(path, [".py"], ["__pycache__", ".venv", "node_modules"]):
        try:
            p = Path(filepath) if Path(filepath).is_absolute() else PROJECT_ROOT / filepath
            content = p.read_text()
            lines = content.splitlines()
        except (OSError, UnicodeDecodeError):
            continue

        entries.extend(_analyze_classes(filepath, content, lines))

    return sorted(entries, key=lambda e: -(e["method_count"] + e["attribute_count"]))


def _analyze_classes(filepath: str, content: str, lines: list[str]) -> list[dict]:
    """Find god classes in a single file."""
    results = []
    class_re = re.compile(r"^class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:")

    i = 0
    while i < len(lines):
        m = class_re.match(lines[i])
        if not m:
            i += 1
            continue

        class_name = m.group(1)
        bases = m.group(2) or ""
        class_start = i
        class_indent = len(lines[i]) - len(lines[i].lstrip())

        # Find class body extent
        j = i + 1
        while j < len(lines):
            if lines[j].strip() == "":
                j += 1
                continue
            line_indent = len(lines[j]) - len(lines[j].lstrip())
            if line_indent <= class_indent and lines[j].strip():
                break
            j += 1
        class_end = j
        class_loc = class_end - class_start

        if class_loc < 50:
            i = class_end
            continue

        class_body = "\n".join(lines[class_start:class_end])

        # Count methods (def inside class)
        method_count = len(re.findall(r"^\s+def\s+\w+", class_body, re.MULTILINE))

        # Count attributes (self.x = in __init__)
        init_attrs = set()
        in_init = False
        init_indent = 0
        for k in range(class_start, class_end):
            stripped = lines[k].strip()
            if re.match(r"def\s+__init__\s*\(", stripped):
                in_init = True
                init_indent = len(lines[k]) - len(lines[k].lstrip())
                continue
            if in_init:
                line_ind = len(lines[k]) - len(lines[k].lstrip())
                if lines[k].strip() and line_ind <= init_indent:
                    in_init = False
                    continue
                for attr_m in re.finditer(r"self\.(\w+)\s*=", lines[k]):
                    init_attrs.add(attr_m.group(1))
        attribute_count = len(init_attrs)

        # Count base classes (excluding common mixins)
        base_list = [b.strip() for b in bases.split(",") if b.strip()] if bases else []
        non_mixin_bases = [b for b in base_list
                          if not b.endswith("Mixin") and b not in ("object", "ABC")]

        # Find long methods (>50 LOC)
        long_methods = _find_long_methods(lines, class_start, class_end, class_indent)

        # Assess god-ness
        reasons = []
        if method_count >= 15:
            reasons.append(f"{method_count} methods")
        if attribute_count >= 10:
            reasons.append(f"{attribute_count} attributes")
        if len(non_mixin_bases) > 2:
            reasons.append(f"{len(non_mixin_bases)} base classes")
        if long_methods:
            reasons.append(f"{len(long_methods)} long methods (>50 LOC)")

        total_score = method_count + attribute_count
        if len(reasons) >= 2 or total_score >= 25:
            results.append({
                "file": filepath,
                "class_name": class_name,
                "loc": class_loc,
                "method_count": method_count,
                "attribute_count": attribute_count,
                "base_count": len(non_mixin_bases),
                "long_methods": long_methods,
                "reasons": reasons,
            })

        i = class_end

    return results


def _find_long_methods(lines: list[str], class_start: int, class_end: int,
                       class_indent: int) -> list[str]:
    """Find methods within a class that are >50 lines."""
    long_methods = []
    method_re = re.compile(r"^\s+def\s+(\w+)")

    i = class_start + 1
    while i < class_end:
        m = method_re.match(lines[i])
        if not m:
            i += 1
            continue

        method_name = m.group(1)
        method_indent = len(lines[i]) - len(lines[i].lstrip())
        method_start = i

        j = i + 1
        while j < class_end:
            if lines[j].strip() == "":
                j += 1
                continue
            if len(lines[j]) - len(lines[j].lstrip()) <= method_indent:
                break
            j += 1

        method_loc = j - method_start
        if method_loc > 50:
            long_methods.append(method_name)

        i = j

    return long_methods
