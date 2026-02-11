"""Python complexity signal compute functions.

Used by ComplexitySignal definitions in __init__.py for the structural phase.
"""

import re


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
