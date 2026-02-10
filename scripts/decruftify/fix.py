"""Auto-fixers for mechanical cleanup tasks.

Supports:
- Unused imports (T1): removes unused symbols from import statements.
- Debug logs (T1): removes tagged console.log/warn/info/debug lines.
- Dead exports (T2): removes `export` keyword from declarations with zero external importers.
- Unused vars (T2): removes unused names from destructuring patterns.
"""

import re
import sys
from collections import defaultdict
from pathlib import Path

from .utils import PROJECT_ROOT, c, rel


# ── Debug log fixer ─────────────────────────────────────────


def fix_debug_logs(entries: list[dict], *, dry_run: bool = False) -> list[dict]:
    """Remove tagged console.log lines from source files.

    Handles multi-line console.log calls by tracking open parens.

    Args:
        entries: Output of detect_logs() — [{file, line, tag, content}].
        dry_run: If True, don't write files.

    Returns:
        List of {file, tags: [str], lines_removed: int} dicts.
    """
    by_file: dict[str, list[dict]] = defaultdict(list)
    for e in entries:
        by_file[e["file"]].append(e)

    results = []
    for filepath, file_entries in sorted(by_file.items()):
        try:
            p = Path(filepath) if Path(filepath).is_absolute() else PROJECT_ROOT / filepath
            original = p.read_text()
            lines = original.splitlines(keepends=True)

            lines_to_remove: set[int] = set()  # 0-indexed
            for e in file_entries:
                start = e["line"] - 1  # convert to 0-indexed
                if start >= len(lines):
                    continue
                # Find the extent of this console.log call (may span lines)
                end = _find_statement_end(lines, start)
                if end is None:
                    # Could not determine statement boundary — skip to avoid partial removal
                    print(c(f"  Warn: skipping {rel(filepath)}:{e['line']} — could not find statement end", "yellow"),
                          file=sys.stderr)
                    continue
                for idx in range(start, end + 1):
                    lines_to_remove.add(idx)
                # Remove preceding debug annotation comments (up to 3 lines)
                _mark_orphaned_comments(lines, start, lines_to_remove)

            # Find variable declarations only used in removed log lines
            dead_vars = _find_dead_log_variables(lines, lines_to_remove)
            lines_to_remove |= dead_vars

            new_lines = []
            prev_blank = False
            for idx, line in enumerate(lines):
                if idx in lines_to_remove:
                    continue
                # Collapse double blank lines left behind
                is_blank = line.strip() == ""
                if is_blank and prev_blank:
                    continue
                new_lines.append(line)
                prev_blank = is_blank

            # Second pass: remove empty blocks left behind
            new_lines = _remove_empty_blocks(new_lines)

            new_content = "".join(new_lines)
            if new_content != original:
                tags = sorted(set(e["tag"] for e in file_entries))
                removed = len(lines) - len(new_lines)
                results.append({
                    "file": filepath,
                    "tags": tags,
                    "lines_removed": removed,
                    "log_count": len(file_entries),
                })
                if not dry_run:
                    p.write_text(new_content)
        except Exception as ex:
            print(c(f"  Skip {rel(filepath)}: {ex}", "yellow"), file=sys.stderr)

    return results


def _find_statement_end(lines: list[str], start: int) -> int | None:
    """Find the end of a statement starting at `start` by tracking parens.

    Returns the 0-indexed line number of the closing paren, or None if not found
    (which means the caller should skip this entry rather than partially removing).
    """
    depth = 0
    for idx in range(start, min(start + 80, len(lines))):
        line = lines[idx]
        # Count parens outside strings (simple approximation)
        in_str = None
        prev_ch = ""
        for ch in line:
            if in_str:
                if ch == in_str and prev_ch != "\\":
                    in_str = None
                prev_ch = ch
                continue
            if ch in "'\"`":
                in_str = ch
            elif ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth <= 0:
                    return idx
            prev_ch = ch
    return None  # Could not find statement end — skip this entry


# ── Orphaned comment cleanup ──────────────────────────────

_DEBUG_COMMENT_KEYWORDS = ["DEBUG", "TEMP", "LOG", "TRACE", "HACK"]
_DEBUG_COMMENT_RE = re.compile(
    r"(?:DEBUG|TEMP|LOG|TRACE|TODO\s*.*debug|HACK\s*.*log)", re.IGNORECASE
)


def _mark_orphaned_comments(lines: list[str], log_start: int, lines_to_remove: set[int]):
    """Mark up to 3 preceding comment lines as orphaned if they contain debug annotations."""
    for offset in range(1, 4):  # check up to 3 lines before the log
        idx = log_start - offset
        if idx < 0:
            break
        if idx in lines_to_remove:
            continue  # already marked
        prev = lines[idx].strip()
        if not prev.startswith("//"):
            break  # stop at first non-comment line
        if _DEBUG_COMMENT_RE.search(prev):
            lines_to_remove.add(idx)
        # Continue checking even if this comment line doesn't match —
        # a multi-line debug comment block might have the keyword on line 1
        # with continuation on lines 2-3


# ── Dead variable detection ──────────────────────────────

# Matches: const/let/var identifier = ...
_VAR_DECL_RE = re.compile(r"^\s*(?:const|let|var)\s+(\w+)\s*=")
# Matches JS identifiers (for extracting references from log lines)
_IDENT_RE = re.compile(r"\b([a-zA-Z_$]\w*)\b")

# Keywords/built-ins to ignore when looking for "only used in log" variables
_IGNORE_IDENTS = frozenset([
    "console", "log", "warn", "info", "debug", "error",
    "const", "let", "var", "true", "false", "null", "undefined",
    "if", "else", "return", "function", "new", "this", "typeof",
    "length", "toString", "JSON", "stringify", "Date", "now",
    "Math", "Object", "Array", "String", "Number", "Boolean",
    "Map", "Set", "Promise", "Error",
])


def _find_dead_log_variables(lines: list[str], removed_indices: set[int]) -> set[int]:
    """Find variable declarations that were only used in removed log lines.

    For each removed log line, extract variable names referenced in it.
    For each such variable, find its declaration (const/let/var X = ...).
    If the variable appears nowhere in non-removed lines (except its own declaration),
    mark the declaration line for removal too.
    """
    # Collect all identifiers referenced in removed lines
    referenced_in_logs: set[str] = set()
    for idx in removed_indices:
        if idx < len(lines):
            for m in _IDENT_RE.finditer(lines[idx]):
                ident = m.group(1)
                if ident not in _IGNORE_IDENTS:
                    referenced_in_logs.add(ident)

    if not referenced_in_logs:
        return set()

    # Find declarations of these identifiers
    decl_lines: dict[str, int] = {}  # ident → 0-indexed line
    for idx, line in enumerate(lines):
        if idx in removed_indices:
            continue
        m = _VAR_DECL_RE.match(line)
        if m and m.group(1) in referenced_in_logs:
            decl_lines[m.group(1)] = idx

    if not decl_lines:
        return set()

    # For each declared variable, check if it appears in any non-removed,
    # non-declaration line
    dead: set[int] = set()
    for ident, decl_idx in decl_lines.items():
        used_elsewhere = False
        pattern = re.compile(r"\b" + re.escape(ident) + r"\b")
        for idx, line in enumerate(lines):
            if idx == decl_idx:
                continue  # skip declaration line itself
            if idx in removed_indices:
                continue  # skip removed lines
            if pattern.search(line):
                used_elsewhere = True
                break
        if not used_elsewhere:
            dead.add(decl_idx)

    return dead


# ── Empty block cleaner ────────────────────────────────────

# Patterns for empty blocks left behind after log removal
_EMPTY_BLOCK_RE = re.compile(
    r"""
    ^(\s*)                          # leading indent
    (?:
        (?:if|else\s+if)\s*\([^)]*\)\s*\{\s*\}  # if (...) { } or else if (...) { }
        | else\s*\{\s*\}                          # else { }
        | \}\s*else\s*\{\s*\}                     # } else { }
    )
    \s*$
    """,
    re.VERBOSE,
)

_EMPTY_CALLBACK_RE = re.compile(
    r"""
    ^\s*
    (?:
        \.then\s*\(\s*\(?[^)]*\)?\s*=>\s*\{\s*\}\s*\)  # .then(() => { })
        | \.catch\s*\(\s*\(?[^)]*\)?\s*=>\s*\{\s*\}\s*\)  # .catch((e) => { })
    )
    \s*[;,]?\s*$
    """,
    re.VERBOSE,
)


def _remove_empty_blocks(lines: list[str]) -> list[str]:
    """Remove empty blocks left behind after log removal.

    Handles: empty if/else, empty useEffect, empty catch, empty callbacks.
    Makes multiple passes until stable.
    """
    changed = True
    while changed:
        changed = False
        new_lines: list[str] = []
        i = 0
        while i < len(lines):
            line = lines[i]
            stripped = line.strip()

            # ── Empty useEffect / React.useEffect ──
            # Pattern: useEffect(() => {\n  }, [deps]); or on one line
            if re.match(r"(?:React\.)?useEffect\s*\(\s*\(\s*\)\s*=>\s*\{", stripped):
                # Find the end of this useEffect call
                end = _find_block_end(lines, i)
                if end is not None:
                    # Check if the body (between { and }) is empty or only whitespace
                    body = "".join(lines[i:end + 1])
                    # Remove everything from useEffect( to closing );
                    inner = _extract_useeffect_body(body)
                    if inner is not None and inner.strip() == "":
                        # Empty useEffect — remove it and preceding comment if orphaned
                        if new_lines and new_lines[-1].strip().startswith("//"):
                            new_lines.pop()  # Remove orphaned comment
                        changed = True
                        i = end + 1
                        continue

            # ── Empty callback: .then(() => { }) or .catch((e) => { }) ──
            if _EMPTY_CALLBACK_RE.match(stripped):
                changed = True
                i += 1
                continue

            # ── Multi-line empty callback: someFunc(() => {\n}) ──
            if re.search(r"=>\s*\{\s*$", stripped):
                j = i + 1
                while j < len(lines) and lines[j].strip() == "":
                    j += 1
                if j < len(lines) and lines[j].strip() in ("}", "})", "});", "},"):
                    # The callback body is empty — check if this is a standalone
                    # callback expression (arrow function as argument)
                    if re.search(r"\(\s*(?:\([^)]*\))?\s*=>\s*\{\s*$", stripped):
                        # Remove the entire empty callback expression
                        # But only if it's a simple argument (not a method body)
                        closing = lines[j].strip()
                        if closing in ("});", "},"):
                            changed = True
                            i = j + 1
                            continue

            # ── Multi-line empty block: line ends with { and next non-blank is } ──
            if stripped.endswith("{"):
                j = i + 1
                while j < len(lines) and lines[j].strip() == "":
                    j += 1
                if j < len(lines) and lines[j].strip() in ("}", "});"):
                    closing = lines[j].strip()

                    # Empty else block — remove else { }
                    if re.match(r"\s*else\s*\{", stripped):
                        changed = True
                        i = j + 1
                        continue

                    # } else { with empty body — replace with just }
                    if re.match(r"\s*\}\s*else\s*\{", stripped):
                        indent = line[:len(line) - len(line.lstrip())]
                        new_lines.append(f"{indent}}}\n")
                        changed = True
                        i = j + 1
                        continue

                    # Empty if/else-if block — remove entirely
                    if re.match(r"\s*(?:if|else\s+if)\s*\(", stripped):
                        changed = True
                        i = j + 1
                        continue

                    # Empty catch blocks are left alone — removing them
                    # breaks try/catch structure and is too risky.

            # ── Single-line empty block on one line ──
            if _EMPTY_BLOCK_RE.match(stripped):
                changed = True
                i += 1
                continue

            new_lines.append(line)
            i += 1

        lines = new_lines

    # Final pass: collapse double blank lines
    result = []
    prev_blank = False
    for line in lines:
        is_blank = line.strip() == ""
        if is_blank and prev_blank:
            continue
        result.append(line)
        prev_blank = is_blank
    return result



def _find_block_end(lines: list[str], start: int) -> int | None:
    """Find the end of a block starting at `start` by tracking all brackets."""
    paren_depth = 0
    brace_depth = 0
    bracket_depth = 0
    for idx in range(start, min(start + 30, len(lines))):
        line = lines[idx]
        in_str = None
        prev_ch = ""
        for ch in line:
            if in_str:
                if ch == in_str and prev_ch != "\\":
                    in_str = None
                prev_ch = ch
                continue
            if ch in "'\"`":
                in_str = ch
            elif ch == "(":
                paren_depth += 1
            elif ch == ")":
                paren_depth -= 1
                if paren_depth <= 0:
                    return idx
            elif ch == "{":
                brace_depth += 1
            elif ch == "}":
                brace_depth -= 1
            elif ch == "[":
                bracket_depth += 1
            elif ch == "]":
                bracket_depth -= 1
            prev_ch = ch
    return None


def _extract_useeffect_body(text: str) -> str | None:
    """Extract the body of a useEffect callback: useEffect(() => { BODY }, [deps])."""
    # Find the first { after =>
    arrow_pos = text.find("=>")
    if arrow_pos == -1:
        return None
    brace_pos = text.find("{", arrow_pos)
    if brace_pos == -1:
        return None

    # Find matching } by tracking depth
    depth = 0
    in_str = None
    prev_ch = ""
    for i in range(brace_pos, len(text)):
        ch = text[i]
        if in_str:
            if ch == in_str and prev_ch != "\\":
                in_str = None
            prev_ch = ch
            continue
        if ch in "'\"`":
            in_str = ch
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[brace_pos + 1:i]
        prev_ch = ch
    return None


# ── Unused import fixer ─────────────────────────────────────


def fix_unused_imports(entries: list[dict], *, dry_run: bool = False) -> list[dict]:
    """Remove unused imports from source files.

    Args:
        entries: Output of detect_unused(), filtered to category=="imports".
        dry_run: If True, don't write files, just report what would change.

    Returns:
        List of {file, removed: [symbols], lines_removed: int} dicts.
    """
    by_file: dict[str, list[dict]] = defaultdict(list)
    for e in entries:
        if e["category"] != "imports":
            continue
        by_file[e["file"]].append(e)

    results = []
    for filepath, file_entries in sorted(by_file.items()):
        try:
            p = Path(filepath) if Path(filepath).is_absolute() else PROJECT_ROOT / filepath
            original = p.read_text()
            lines = original.splitlines(keepends=True)

            unused_symbols = {e["name"] for e in file_entries}
            unused_by_line: dict[int, list[str]] = defaultdict(list)
            for e in file_entries:
                unused_by_line[e["line"]].append(e["name"])

            new_lines = _process_file_lines(lines, unused_symbols, unused_by_line)
            new_content = "".join(new_lines)

            if new_content != original:
                removed = [e["name"] for e in file_entries]
                lines_removed = len(lines) - len(new_lines)
                results.append({
                    "file": filepath,
                    "removed": removed,
                    "lines_removed": lines_removed,
                })
                if not dry_run:
                    p.write_text(new_content)
        except Exception as ex:
            print(c(f"  Skip {rel(filepath)}: {ex}", "yellow"), file=sys.stderr)

    return results


def _process_file_lines(lines: list[str], unused_symbols: set[str],
                        unused_by_line: dict[int, list[str]]) -> list[str]:
    """Process file lines, removing unused imports. Returns new lines."""
    result = []
    i = 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Check if this line starts an import
        if not stripped.startswith("import "):
            result.append(line)
            i += 1
            continue

        # Collect full import statement (may span multiple lines)
        import_lines = [line]
        import_start = i
        # Multi-line import: look for the closing semicolon or the from clause
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
            # Remove entire import
            i += 1
            # Also skip trailing blank line if it would create a double blank
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

        # Try to remove specific symbols from this import
        cleaned = _remove_symbols_from_import(full_import, symbols_on_this_import)
        if cleaned is None:
            # All symbols removed — drop the import entirely
            i += 1
            if i < len(lines) and lines[i].strip() == "" and result and result[-1].strip() == "":
                i += 1
            continue

        result.append(cleaned)
        i += 1
        continue

    return result


def _is_import_complete(text: str) -> bool:
    """Check if an import statement is complete (has semicolon or from clause ending)."""
    stripped = text.strip()
    if stripped.endswith(";"):
        return True
    # import 'foo' (side effect, no semicolon sometimes in some configs)
    if "from " in stripped and ("'" in stripped.split("from ")[-1] or '"' in stripped.split("from ")[-1]):
        # Check if the string literal is closed
        after_from = stripped.split("from ", 1)[-1].strip()
        if (after_from.startswith("'") and after_from.count("'") >= 2) or \
           (after_from.startswith('"') and after_from.count('"') >= 2):
            return True
    return False


def _remove_symbols_from_import(import_stmt: str, symbols_to_remove: set[str]) -> str | None:
    """Remove specific symbols from an import statement.

    Returns the cleaned import string, or None if the import should be removed entirely.
    """
    # Parse the import to understand its structure
    # Match: import [Default, ] { Named1, Named2 } from 'module'
    # Or: import Default from 'module'
    # Or: import { Named } from 'module'
    # Or: import type { Named } from 'module'

    stmt = import_stmt.strip()

    # Extract the from clause
    from_match = re.search(r"""from\s+(['"].*?['"]);?\s*$""", stmt, re.DOTALL)
    if not from_match:
        return import_stmt  # Can't parse, leave alone

    from_clause = from_match.group(0).rstrip()
    if not from_clause.endswith(";"):
        from_clause += ";"
    before_from = stmt[:from_match.start()].strip()

    # Check for type keyword
    type_prefix = ""
    if before_from.startswith("import type"):
        type_prefix = "type "
        before_from = before_from[len("import type"):].strip()
    elif before_from.startswith("import"):
        before_from = before_from[len("import"):].strip()
    else:
        return import_stmt  # Can't parse

    # Split into default import and named imports
    default_import = None
    named_imports = []

    # Check for { ... } block
    brace_match = re.search(r'\{([^}]*)\}', before_from, re.DOTALL)
    if brace_match:
        named_str = brace_match.group(1)
        named_imports = [n.strip() for n in named_str.split(",") if n.strip()]
        before_brace = before_from[:brace_match.start()].strip().rstrip(",").strip()
        if before_brace:
            default_import = before_brace
    else:
        # No braces — just a default import
        default_import = before_from.strip().rstrip(",").strip()

    # Remove the specified symbols
    remove_default = default_import in symbols_to_remove if default_import else False
    remaining_named = [n for n in named_imports if n not in symbols_to_remove
                       and n.split(" as ")[0].strip() not in symbols_to_remove]

    new_default = None if remove_default else default_import
    new_named = remaining_named

    # If nothing remains, remove the entire import
    if not new_default and not new_named:
        return None

    # Reconstruct
    parts = []
    if new_default:
        parts.append(new_default)
    if new_named:
        if len(new_named) <= 3:
            parts.append("{ " + ", ".join(new_named) + " }")
        else:
            # Multi-line format for many imports
            inner = ",\n  ".join(new_named)
            parts.append("{\n  " + inner + "\n}")

    # Detect original indentation
    indent = ""
    for ch in import_stmt:
        if ch in " \t":
            indent += ch
        else:
            break

    return f"{indent}import {type_prefix}{', '.join(parts)} {from_clause}\n"


# ── Dead exports fixer ─────────────────────────────────────

# Matches: export [declare] (const|let|function|class|type|interface|enum) name
_EXPORT_DECL_RE = re.compile(
    r"^(\s*)export\s+(declare\s+)?"
    r"((?:const|let|var|function|async\s+function|class|abstract\s+class|type|interface|enum)\s)"
)


def fix_dead_exports(entries: list[dict], *, dry_run: bool = False) -> list[dict]:
    """Remove `export` keyword from declarations with zero external importers.

    Args:
        entries: [{file, line, name}, ...] from detect_dead_exports().
        dry_run: If True, don't write files.

    Returns:
        List of {file, removed: [str], lines_removed: int} dicts.
    """
    by_file: dict[str, list[dict]] = defaultdict(list)
    for e in entries:
        by_file[e["file"]].append(e)

    results = []
    for filepath, file_entries in sorted(by_file.items()):
        try:
            p = Path(filepath) if Path(filepath).is_absolute() else PROJECT_ROOT / filepath
            original = p.read_text()
            lines = original.splitlines(keepends=True)

            target_lines = {e["line"] for e in file_entries}  # 1-indexed
            removed_names = []

            for line_idx in range(len(lines)):
                lineno = line_idx + 1
                if lineno not in target_lines:
                    continue

                line = lines[line_idx]
                m = _EXPORT_DECL_RE.match(line)
                if m:
                    # Remove 'export ' (and optional 'declare ') keeping the rest
                    indent = m.group(1)
                    declare = m.group(2) or ""
                    decl_keyword = m.group(3)
                    rest = line[m.end():]
                    lines[line_idx] = f"{indent}{declare}{decl_keyword}{rest}"
                    name = next((e["name"] for e in file_entries if e["line"] == lineno), "?")
                    removed_names.append(name)
                    continue

                # Handle: export { name1, name2 } — remove individual names
                stripped = line.strip()
                if stripped.startswith("export {"):
                    # Parse the export list
                    names_in_entry = {e["name"] for e in file_entries if e["line"] == lineno}
                    brace_content = re.search(r"\{([^}]*)\}", stripped)
                    if brace_content:
                        all_names = [n.strip() for n in brace_content.group(1).split(",") if n.strip()]
                        remaining = [n for n in all_names if n.split(" as ")[0].strip() not in names_in_entry]
                        if not remaining:
                            # All names dead — remove entire export statement
                            lines[line_idx] = ""
                        else:
                            # Keep remaining names
                            indent_str = line[:len(line) - len(line.lstrip())]
                            from_clause = ""
                            from_match = re.search(r"from\s+['\"].*?['\"];?\s*$", stripped)
                            if from_match:
                                from_clause = " " + from_match.group(0).rstrip()
                                if not from_clause.rstrip().endswith(";"):
                                    from_clause += ";"
                            else:
                                from_clause = ";"
                            lines[line_idx] = f"{indent_str}export {{ {', '.join(remaining)} }}{from_clause}\n"
                        removed_names.extend(names_in_entry)

            new_content = "".join(lines)
            if new_content != original:
                results.append({
                    "file": filepath,
                    "removed": removed_names,
                    "lines_removed": 0,  # We don't remove lines, just the keyword
                })
                if not dry_run:
                    p.write_text(new_content)
        except Exception as ex:
            print(c(f"  Skip {rel(filepath)}: {ex}", "yellow"), file=sys.stderr)

    return results


# ── Unused vars fixer (destructuring patterns) ──────────────

# Check if a line is inside an object destructuring pattern
_DESTR_MEMBER_RE = re.compile(r"^\s*(\w+)\s*(?:=\s*[^,]+)?\s*,?\s*$")
_REST_ELEMENT_RE = re.compile(r"\.\.\.\w+")


def fix_unused_vars(entries: list[dict], *, dry_run: bool = False) -> list[dict]:
    """Remove unused names from destructuring patterns.

    Handles two patterns:
    1. Multi-line destructuring: name on its own line → remove line
    2. Single-line destructuring: const { a, unused, b } = ... → remove unused

    Skips:
    - Array destructuring (positional — can't just remove)
    - Destructuring with rest elements (removing changes ...rest)
    - Function parameters
    - Standalone variable declarations (may have side effects)

    Args:
        entries: [{file, line, name, category}, ...] from detect_unused(), category=="vars".
        dry_run: If True, don't write files.

    Returns:
        List of {file, removed: [str], lines_removed: int, skip_reasons: dict} dicts.
        skip_reasons maps reason string → count for entries that were skipped.
    """
    by_file: dict[str, list[dict]] = defaultdict(list)
    for e in entries:
        by_file[e["file"]].append(e)

    results = []
    # Global skip reason tracking
    _skip_reasons: dict[str, int] = defaultdict(int)

    for filepath, file_entries in sorted(by_file.items()):
        try:
            p = Path(filepath) if Path(filepath).is_absolute() else PROJECT_ROOT / filepath
            original = p.read_text()
            lines = original.splitlines(keepends=True)

            lines_to_remove: set[int] = set()  # 0-indexed
            inline_removals: dict[int, set[str]] = defaultdict(set)  # line_idx → names to remove
            removed_names: list[str] = []

            for e in file_entries:
                name = e["name"]
                line_idx = e["line"] - 1
                if line_idx < 0 or line_idx >= len(lines):
                    _skip_reasons["out_of_range"] += 1
                    continue

                src = lines[line_idx]
                stripped = src.strip()

                # Pattern 1: Multi-line destructuring member (name on its own line)
                # e.g., "  unusedProp," or "  unusedProp = defaultVal,"
                if _is_destr_member_line(stripped, name):
                    # Check context: is this inside a { } destructuring?
                    destr_start = _find_destr_open_brace(lines, line_idx)
                    if destr_start is not None:
                        # Check for rest element in this destructuring
                        destr_text = _get_destr_text(lines, destr_start, line_idx + 20)
                        if _REST_ELEMENT_RE.search(destr_text):
                            _skip_reasons["rest_element"] += 1
                            continue  # Skip — removing would change ...rest
                        lines_to_remove.add(line_idx)
                        removed_names.append(name)
                    else:
                        _skip_reasons["no_destr_context"] += 1
                    continue

                # Pattern 2: Single-line object destructuring
                # e.g., "const { a, unused, b } = useHook();"
                if re.match(r"\s*(?:const|let|var)\s*\{", stripped):
                    destr_text = _collect_full_statement(lines, line_idx)
                    if _REST_ELEMENT_RE.search(destr_text):
                        _skip_reasons["rest_element"] += 1
                        continue  # Skip — rest element present
                    inline_removals[line_idx].add(name)
                    removed_names.append(name)
                    continue

                # Classify why we're skipping
                if re.match(r"\s*(?:const|let|var)\s*\[", stripped):
                    _skip_reasons["array_destructuring"] += 1
                elif re.search(r"(?:function|=>)\s*\(", stripped) or re.match(r"\s*\(", stripped):
                    _skip_reasons["function_param"] += 1
                elif re.match(r"\s*(?:const|let|var)\s+\w+\s*=", stripped):
                    _skip_reasons["standalone_var"] += 1
                else:
                    _skip_reasons["other"] += 1

            # Apply inline removals (single-line destructuring edits)
            for line_idx, names_to_remove in inline_removals.items():
                new_line = _remove_names_from_destr(lines, line_idx, names_to_remove)
                if new_line is not None:
                    lines[line_idx] = new_line

            # Apply line removals (multi-line members)
            new_lines = []
            prev_blank = False
            for idx, line in enumerate(lines):
                if idx in lines_to_remove:
                    continue
                is_blank = line.strip() == ""
                if is_blank and prev_blank:
                    continue
                new_lines.append(line)
                prev_blank = is_blank

            # Fix trailing commas: if we removed the last member before },
            # the previous member now has a trailing comma which is fine in TS.
            # But if we removed a middle member, commas are already correct.

            new_content = "".join(new_lines)
            if new_content != original:
                lines_removed = len(original.splitlines()) - len(new_content.splitlines())
                results.append({
                    "file": filepath,
                    "removed": removed_names,
                    "lines_removed": lines_removed,
                })
                if not dry_run:
                    p.write_text(new_content)
        except Exception as ex:
            print(c(f"  Skip {rel(filepath)}: {ex}", "yellow"), file=sys.stderr)

    # Attach skip reasons to the result list for the CLI to display
    results = _ResultsWithSkipReasons(results)
    results.skip_reasons = dict(_skip_reasons)
    return results


class _ResultsWithSkipReasons(list):
    """List subclass that carries skip_reasons metadata."""
    skip_reasons: dict[str, int] = {}


def _is_destr_member_line(stripped: str, name: str) -> bool:
    """Check if a stripped line is a destructuring member matching `name`.

    Matches patterns like:
      name,
      name = defaultValue,
      name: renamedAs,
      name,  // comment
    """
    # Must start with the name (possibly with `type ` prefix for inline type imports)
    patterns = [
        rf"^(?:type\s+)?{re.escape(name)}\s*[,}}]",  # name, or name}
        rf"^(?:type\s+)?{re.escape(name)}\s*=\s*[^,]+[,}}]",  # name = default,
        rf"^(?:type\s+)?{re.escape(name)}\s*:\s*\w+\s*[,}}]",  # name: alias,
        rf"^(?:type\s+)?{re.escape(name)}\s*$",  # name (last in list, no comma)
        rf"^(?:type\s+)?{re.escape(name)}\s*=\s*[^,]+\s*$",  # name = default (last)
        rf"^(?:type\s+)?{re.escape(name)}\s*,",  # name, (with trailing content/comment)
    ]
    clean = stripped.split("//")[0].strip()  # remove inline comments
    return any(re.match(p, clean) for p in patterns)


def _find_destr_open_brace(lines: list[str], member_idx: int) -> int | None:
    """Walk backwards from a member line to find the opening { of a destructuring."""
    for idx in range(member_idx - 1, max(member_idx - 30, -1), -1):
        stripped = lines[idx].strip()
        if "{" in stripped:
            return idx
        # If we hit a line that doesn't look like it's part of a destructuring, stop
        if stripped and not stripped.endswith(",") and "{" not in stripped:
            # Could be the line with = or => before the {
            if "=" in stripped or "=>" in stripped or "(" in stripped:
                continue
            break
    return None


def _get_destr_text(lines: list[str], start: int, max_end: int) -> str:
    """Get the text of a destructuring block from start to closing }."""
    text = ""
    depth = 0
    for idx in range(start, min(max_end, len(lines))):
        text += lines[idx]
        for ch in lines[idx]:
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth <= 0:
                    return text
    return text


def _collect_full_statement(lines: list[str], start: int) -> str:
    """Collect a potentially multi-line statement starting at start."""
    text = ""
    for idx in range(start, min(start + 20, len(lines))):
        text += lines[idx]
        if ";" in lines[idx] or (idx > start and "}" in lines[idx]):
            break
    return text


def _remove_names_from_destr(lines: list[str], line_idx: int, names: set[str]) -> str | None:
    """Remove specific names from a single-line object destructuring.

    Given: const { a, unused, b } = expr;
    Returns: const { a, b } = expr;\n

    Returns None if we can't safely parse/modify.
    """
    line = lines[line_idx]
    # Find the { } block
    brace_match = re.search(r"\{([^}]*)\}", line)
    if not brace_match:
        return None

    inner = brace_match.group(1)
    members = [m.strip() for m in inner.split(",") if m.strip()]

    # Filter out the unused names
    remaining = []
    for m in members:
        # Extract the name (handle `type X`, `X: alias`, `X = default`)
        member_name = m.split(":")[0].split("=")[0].strip()
        if member_name.startswith("type "):
            member_name = member_name[5:].strip()
        if member_name.startswith("..."):
            remaining.append(m)  # Always keep rest elements
            continue
        if member_name in names:
            continue  # Skip this one
        remaining.append(m)

    if not remaining:
        return None  # All removed — caller should handle

    # Reconstruct
    new_inner = ", ".join(remaining)
    before = line[:brace_match.start()]
    after = line[brace_match.end():]
    return f"{before}{{ {new_inner} }}{after}"
