"""Unused import fixer: removes unused symbols from import statements."""

import re
from collections import defaultdict

from .common import apply_fixer


def fix_unused_imports(entries: list[dict], *, dry_run: bool = False) -> list[dict]:
    """Remove unused imports from source files.

    Args:
        entries: Output of detect_unused(), filtered to category=="imports".
        dry_run: If True, don't write files, just report what would change.

    Returns:
        List of {file, removed: [symbols], lines_removed: int} dicts.
    """
    # Filter to imports only and group by file
    import_entries = [e for e in entries if e["category"] == "imports"]

    def transform(lines, file_entries):
        unused_symbols = {e["name"] for e in file_entries}
        unused_by_line: dict[int, list[str]] = defaultdict(list)
        for e in file_entries:
            unused_by_line[e["line"]].append(e["name"])

        new_lines = _process_file_lines(lines, unused_symbols, unused_by_line)
        removed = [e["name"] for e in file_entries]
        return new_lines, removed

    return apply_fixer(import_entries, transform, dry_run=dry_run)


def _process_file_lines(lines: list[str], unused_symbols: set[str],
                        unused_by_line: dict[int, list[str]]) -> list[str]:
    """Process file lines, removing unused imports. Returns new lines."""
    result = []
    i = 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped.startswith("import "):
            result.append(line)
            i += 1
            continue

        # Collect full import statement (may span multiple lines)
        import_lines = [line]
        import_start = i
        while not _is_import_complete("".join(import_lines)):
            i += 1
            if i >= len(lines):
                break
            import_lines.append(lines[i])

        full_import = "".join(import_lines)
        lineno = import_start + 1  # 1-indexed

        # Check if "(entire import)" is flagged for this line
        if "(entire import)" in unused_symbols and any(
            "(entire import)" in unused_by_line.get(ln, [])
            for ln in range(lineno, lineno + len(import_lines))
        ):
            i += 1
            if i < len(lines) and lines[i].strip() == "" and result and result[-1].strip() == "":
                i += 1
            continue

        # Check if any named symbols in this import are unused
        symbols_on_this_import = set()
        for ln in range(lineno, lineno + len(import_lines)):
            for sym in unused_by_line.get(ln, []):
                if sym != "(entire import)":
                    symbols_on_this_import.add(sym)

        if not symbols_on_this_import:
            result.extend(import_lines)
            i += 1
            continue

        cleaned = _remove_symbols_from_import(full_import, symbols_on_this_import)
        if cleaned is None:
            i += 1
            if i < len(lines) and lines[i].strip() == "" and result and result[-1].strip() == "":
                i += 1
            continue

        result.append(cleaned)
        i += 1
        continue

    return result


def _is_import_complete(text: str) -> bool:
    """Check if an import statement is complete."""
    stripped = text.strip()
    if stripped.endswith(";"):
        return True
    if "from " in stripped and ("'" in stripped.split("from ")[-1] or '"' in stripped.split("from ")[-1]):
        after_from = stripped.split("from ", 1)[-1].strip()
        if (after_from.startswith("'") and after_from.count("'") >= 2) or \
           (after_from.startswith('"') and after_from.count('"') >= 2):
            return True
    return False


def _remove_symbols_from_import(import_stmt: str, symbols_to_remove: set[str]) -> str | None:
    """Remove specific symbols from an import statement.

    Returns the cleaned import string, or None if the import should be removed entirely.
    """
    stmt = import_stmt.strip()

    from_match = re.search(r"""from\s+(['"].*?['"]);?\s*$""", stmt, re.DOTALL)
    if not from_match:
        return import_stmt

    from_clause = from_match.group(0).rstrip()
    if not from_clause.endswith(";"):
        from_clause += ";"
    before_from = stmt[:from_match.start()].strip()

    type_prefix = ""
    if before_from.startswith("import type"):
        type_prefix = "type "
        before_from = before_from[len("import type"):].strip()
    elif before_from.startswith("import"):
        before_from = before_from[len("import"):].strip()
    else:
        return import_stmt

    default_import = None
    named_imports = []

    brace_match = re.search(r'\{([^}]*)\}', before_from, re.DOTALL)
    if brace_match:
        named_str = brace_match.group(1)
        named_imports = [n.strip() for n in named_str.split(",") if n.strip()]
        before_brace = before_from[:brace_match.start()].strip().rstrip(",").strip()
        if before_brace:
            default_import = before_brace
    else:
        default_import = before_from.strip().rstrip(",").strip()

    remove_default = default_import in symbols_to_remove if default_import else False
    remaining_named = [n for n in named_imports if n not in symbols_to_remove
                       and n.split(" as ")[0].strip() not in symbols_to_remove]

    new_default = None if remove_default else default_import
    new_named = remaining_named

    if not new_default and not new_named:
        return None

    parts = []
    if new_default:
        parts.append(new_default)
    if new_named:
        if len(new_named) <= 3:
            parts.append("{ " + ", ".join(new_named) + " }")
        else:
            inner = ",\n  ".join(new_named)
            parts.append("{\n  " + inner + "\n}")

    indent = ""
    for ch in import_stmt:
        if ch in " \t":
            indent += ch
        else:
            break

    return f"{indent}import {type_prefix}{', '.join(parts)} {from_clause}\n"
