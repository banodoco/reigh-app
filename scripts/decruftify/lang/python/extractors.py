"""Python extraction: function bodies, class structure, param patterns."""

import hashlib
import re
from pathlib import Path

from ...detectors.base import ClassInfo, FunctionInfo
from ...utils import PROJECT_ROOT, find_source_files


# ── Function extraction (for duplicate detection) ────────


def extract_py_functions(filepath: str) -> list[FunctionInfo]:
    """Extract function bodies from a Python file.

    Uses indentation to determine function boundaries (Python has no braces).
    Returns FunctionInfo with normalized body and hash for comparison.
    """
    p = Path(filepath) if Path(filepath).is_absolute() else PROJECT_ROOT / filepath
    try:
        content = p.read_text()
    except (OSError, UnicodeDecodeError):
        return []

    lines = content.splitlines()
    functions = []

    fn_re = re.compile(r"^(\s*)def\s+(\w+)\s*\(")

    i = 0
    while i < len(lines):
        m = fn_re.match(lines[i])
        if not m:
            i += 1
            continue

        fn_indent_str = m.group(1)
        fn_indent = len(fn_indent_str)
        name = m.group(2)
        start_line = i

        # Handle multi-line signatures: find the closing ')' then ':'
        j = i
        sig_closed = False
        while j < len(lines):
            line_text = lines[j]
            if ")" in line_text:
                after_paren = line_text[line_text.rindex(")") + 1:]
                if ":" in after_paren:
                    sig_closed = True
                    break
            if j > i and line_text.strip().endswith(":"):
                sig_closed = True
                break
            j += 1

        if not sig_closed:
            i += 1
            continue

        # Body: collect all lines indented past fn_indent (blank lines included)
        body_start = j + 1
        k = body_start
        last_content_line = j

        while k < len(lines):
            line_text = lines[k]
            stripped = line_text.strip()
            if stripped == "":
                k += 1
                continue
            line_indent = len(line_text) - len(line_text.lstrip())
            if line_indent <= fn_indent:
                break
            last_content_line = k
            k += 1

        end_line = last_content_line + 1
        body_lines = lines[start_line:end_line]
        body = "\n".join(body_lines)
        loc = end_line - start_line

        normalized = normalize_py_body(body)
        if len(normalized.splitlines()) >= 3:
            functions.append(FunctionInfo(
                name=name,
                file=filepath,
                line=start_line + 1,
                end_line=end_line,
                loc=loc,
                body=body,
                normalized=normalized,
                body_hash=hashlib.md5(normalized.encode()).hexdigest(),
            ))

        i = end_line

    return functions


def normalize_py_body(body: str) -> str:
    """Normalize a Python function body for comparison.

    Strips docstrings, comments, print/logging statements, leading whitespace.
    """
    lines = body.splitlines()
    normalized = []
    in_docstring = False
    docstring_quote = None

    for line in lines:
        stripped = line.strip()

        if in_docstring:
            if docstring_quote and docstring_quote in stripped:
                in_docstring = False
            continue

        if stripped.startswith('"""') or stripped.startswith("'''"):
            docstring_quote = stripped[:3]
            if stripped.count(docstring_quote) >= 2:
                continue
            in_docstring = True
            continue

        if not stripped:
            continue
        if stripped.startswith("#"):
            continue

        # Strip inline comments
        comment_pos = stripped.find("  #")
        if comment_pos > 0:
            stripped = stripped[:comment_pos].rstrip()

        if re.match(r"print\s*\(", stripped):
            continue
        if re.match(r"(?:logging|logger|log)\.\w+\s*\(", stripped):
            continue

        if stripped:
            normalized.append(stripped)

    return "\n".join(normalized)


# ── Class extraction (for god class detection) ────────────


def extract_py_classes(path: Path) -> list[ClassInfo]:
    """Extract Python classes with method/attribute/base-class metrics.

    Scans all .py files under path. Only includes classes >=50 LOC.
    """
    results = []
    for filepath in find_source_files(path, [".py"], ["__pycache__", ".venv", "node_modules"]):
        try:
            p = Path(filepath) if Path(filepath).is_absolute() else PROJECT_ROOT / filepath
            content = p.read_text()
            lines = content.splitlines()
        except (OSError, UnicodeDecodeError):
            continue
        results.extend(_extract_classes_from_file(filepath, lines))
    return results


def _extract_classes_from_file(filepath: str, lines: list[str]) -> list[ClassInfo]:
    """Extract ClassInfo objects from a single Python file."""
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

        # Extract methods as FunctionInfo (with LOC)
        methods = _extract_methods(lines, class_start + 1, class_end, class_indent)

        # Extract attributes from __init__
        attributes = _extract_init_attributes(lines, class_start, class_end)

        # Parse base classes (excluding common mixins)
        base_list = [b.strip() for b in bases.split(",") if b.strip()] if bases else []
        non_mixin_bases = [b for b in base_list
                           if not b.endswith("Mixin") and b not in ("object", "ABC")]

        results.append(ClassInfo(
            name=class_name,
            file=filepath,
            line=class_start + 1,
            loc=class_loc,
            methods=methods,
            attributes=attributes,
            base_classes=non_mixin_bases,
        ))

        i = class_end

    return results


def _extract_methods(lines: list[str], start: int, end: int,
                     class_indent: int) -> list[FunctionInfo]:
    """Extract methods from a class body as FunctionInfo objects."""
    methods = []
    method_re = re.compile(r"^\s+def\s+(\w+)")

    i = start
    while i < end:
        m = method_re.match(lines[i])
        if not m:
            i += 1
            continue

        method_name = m.group(1)
        method_indent = len(lines[i]) - len(lines[i].lstrip())
        method_start = i

        j = i + 1
        while j < end:
            if lines[j].strip() == "":
                j += 1
                continue
            if len(lines[j]) - len(lines[j].lstrip()) <= method_indent:
                break
            j += 1

        method_loc = j - method_start
        methods.append(FunctionInfo(
            name=method_name,
            file="",  # not needed for method-level analysis
            line=method_start + 1,
            end_line=j,
            loc=method_loc,
            body="",  # not needed for god-class detection
        ))
        i = j

    return methods


def _extract_init_attributes(lines: list[str], class_start: int,
                              class_end: int) -> list[str]:
    """Extract self.x = ... attribute names from __init__."""
    attrs = set()
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
                attrs.add(attr_m.group(1))

    return sorted(attrs)


# ── Param extraction (for passthrough detection) ──────────


def extract_py_params(param_str: str) -> list[str]:
    """Extract parameter names from a Python function signature.

    Handles: simple names, defaults (p=val), type annotations (p: int),
    *args, **kwargs. Filters out self and cls.
    """
    params = []
    param_str = " ".join(param_str.split())
    for token in param_str.split(","):
        token = token.strip()
        if not token or token == "self" or token == "cls":
            continue
        clean = token.lstrip("*")
        name = clean.split(":")[0].split("=")[0].strip()
        if name and name.isidentifier():
            params.append(name)
    return params


def py_passthrough_pattern(name: str) -> str:
    """Match same-name keyword arg: param=param in a function call."""
    escaped = re.escape(name)
    return rf"\b{escaped}\s*=\s*{escaped}\b"


# ── Complexity helpers ────────────────────────────────────


def compute_max_params(content: str, lines: list[str]) -> tuple[int, str] | None:
    """Find the function with the most parameters. Returns (count, label) or None."""
    param_re = re.compile(r"def\s+\w+\s*\(([^)]*)\)", re.DOTALL)
    max_params = 0
    for m in param_re.finditer(content):
        params = [p.strip() for p in m.group(1).split(",") if p.strip()]
        real_params = [p for p in params
                       if p not in ("self", "cls") and not p.startswith("*")]
        if len(real_params) > max_params:
            max_params = len(real_params)
    if max_params > 7:
        return max_params, f"function with {max_params} params"
    return None


def compute_nesting_depth(content: str, lines: list[str]) -> tuple[int, str] | None:
    """Find maximum nesting depth by indentation. Returns (depth, label) or None."""
    max_indent = 0
    for line in lines:
        stripped = line.lstrip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(line) - len(stripped)
        level = indent // 4
        if level > max_indent:
            max_indent = level
    if max_indent > 4:
        return max_indent, f"nesting depth {max_indent}"
    return None


def compute_long_functions(content: str, lines: list[str]) -> tuple[int, str] | None:
    """Find functions >80 LOC. Returns (longest_loc, label) or None."""
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

    if results:
        longest = max(results, key=lambda x: x[1])
        return longest[1], f"long function ({longest[0]}: {longest[1]} LOC)"
    return None
