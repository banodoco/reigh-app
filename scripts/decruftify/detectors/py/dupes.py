"""Duplicate / near-duplicate Python function detection via body hashing + difflib similarity."""

import difflib
import hashlib
import re
from pathlib import Path

from ...utils import PROJECT_ROOT, find_source_files


def extract_functions(filepath: str) -> list[dict]:
    """Extract top-level and method function bodies from a Python file.

    Uses indentation to determine function extent (Python has no braces).
    Returns a list of dicts with file, name, line, end_line, loc, body,
    normalized, and hash keys.
    """
    p = Path(filepath) if Path(filepath).is_absolute() else PROJECT_ROOT / filepath
    try:
        content = p.read_text()
    except (OSError, UnicodeDecodeError):
        return []

    lines = content.splitlines()
    functions = []

    # Match: def function_name(  (with optional decorators above, but we anchor on def)
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
            # Check if signature closes on this line (has closing paren followed by colon)
            if ")" in line_text:
                # Find the last ) and check if there's a : after it (allowing -> annotation)
                after_paren = line_text[line_text.rindex(")") + 1:]
                if ":" in after_paren:
                    sig_closed = True
                    break
            # A line with just ':' at the end (after -> annotation on previous line)
            if j > i and line_text.strip().endswith(":"):
                sig_closed = True
                break
            j += 1

        if not sig_closed:
            # Malformed def, skip
            i += 1
            continue

        # Body starts at j+1. Collect all lines that are:
        #   - blank lines (included as part of the body)
        #   - lines with indent > fn_indent
        # Stop when we hit a non-blank line at indent <= fn_indent
        body_start = j + 1
        k = body_start
        last_content_line = j  # track last non-blank line for trimming trailing blanks

        while k < len(lines):
            line_text = lines[k]
            stripped = line_text.strip()
            if stripped == "":
                # Blank line: include tentatively (might be inside the function)
                k += 1
                continue
            line_indent = len(line_text) - len(line_text.lstrip())
            if line_indent <= fn_indent:
                # Dedented back to or past function level -> body ends
                break
            last_content_line = k
            k += 1

        end_line = last_content_line + 1  # exclusive end for slicing, inclusive for reporting

        body_lines = lines[start_line:end_line]
        body = "\n".join(body_lines)
        loc = end_line - start_line

        # Normalize for comparison
        normalized = _normalize_body(body)

        # Skip trivial functions (< 3 meaningful lines after normalization)
        if len(normalized.splitlines()) >= 3:
            functions.append({
                "file": filepath,
                "name": name,
                "line": start_line + 1,
                "end_line": end_line,
                "loc": loc,
                "body": body,
                "normalized": normalized,
                "hash": hashlib.md5(normalized.encode()).hexdigest(),
            })

        i = end_line
        continue

    return functions


def _normalize_body(body: str) -> str:
    """Normalize a Python function body for comparison.

    Strips comments, blank lines, print/logging statements, and leading whitespace
    to focus on structural similarity.
    """
    lines = body.splitlines()
    normalized = []
    in_docstring = False
    docstring_quote = None

    for line in lines:
        stripped = line.strip()

        # Handle docstrings (triple-quoted strings)
        if in_docstring:
            if docstring_quote and docstring_quote in stripped:
                in_docstring = False
            continue

        # Detect docstring start
        if stripped.startswith('"""') or stripped.startswith("'''"):
            docstring_quote = stripped[:3]
            # Single-line docstring: """text"""
            if stripped.count(docstring_quote) >= 2:
                continue
            in_docstring = True
            continue

        # Skip empty lines
        if not stripped:
            continue

        # Skip comment-only lines
        if stripped.startswith("#"):
            continue

        # Strip inline comments (naive but sufficient for normalization)
        # Be careful not to strip # inside strings, but for normalization this is fine
        comment_pos = stripped.find("  #")
        if comment_pos > 0:
            stripped = stripped[:comment_pos].rstrip()

        # Skip print statements
        if re.match(r"print\s*\(", stripped):
            continue

        # Skip logging calls (logging.X, logger.X, log.X)
        if re.match(r"(?:logging|logger|log)\.\w+\s*\(", stripped):
            continue

        if stripped:
            normalized.append(stripped)

    return "\n".join(normalized)


def detect_duplicates(path: Path, threshold: float = 0.8) -> list[dict]:
    """Find duplicate/near-duplicate Python functions across the codebase.

    Returns a list of dicts, each describing a pair of functions:
        {
            "fn_a": {"file": str, "name": str, "line": int, "loc": int},
            "fn_b": {"file": str, "name": str, "line": int, "loc": int},
            "similarity": float,
            "kind": "exact" | "near-duplicate",
        }
    """
    all_functions = []
    for filepath in find_source_files(path, [".py"], ["__pycache__", ".venv", "node_modules"]):
        all_functions.extend(extract_functions(filepath))

    if not all_functions:
        return []

    # Phase 1: Exact duplicates (same normalized hash)
    by_hash: dict[str, list] = {}
    for fn in all_functions:
        by_hash.setdefault(fn["hash"], []).append(fn)

    entries = []
    seen_pairs: set[tuple[str, str]] = set()

    for h, fns in by_hash.items():
        if len(fns) > 1:
            for i in range(len(fns)):
                for j in range(i + 1, len(fns)):
                    key_a = fns[i]["file"] + ":" + fns[i]["name"]
                    key_b = fns[j]["file"] + ":" + fns[j]["name"]
                    pair_key = (key_a, key_b) if key_a < key_b else (key_b, key_a)
                    if pair_key in seen_pairs:
                        continue
                    seen_pairs.add(pair_key)
                    entries.append({
                        "fn_a": {"file": fns[i]["file"], "name": fns[i]["name"],
                                 "line": fns[i]["line"], "loc": fns[i]["loc"]},
                        "fn_b": {"file": fns[j]["file"], "name": fns[j]["name"],
                                 "line": fns[j]["line"], "loc": fns[j]["loc"]},
                        "similarity": 1.0,
                        "kind": "exact",
                    })

    # Phase 2: Near-duplicates (difflib similarity on functions >= 10 lines)
    # Only compare functions of similar size to limit O(n^2) comparisons
    large_fns = [fn for fn in all_functions if fn["loc"] >= 10]
    large_fns.sort(key=lambda f: f["loc"])

    for i in range(len(large_fns)):
        for j in range(i + 1, len(large_fns)):
            fa, fb = large_fns[i], large_fns[j]

            # Only compare functions of similar size (within 50%)
            if fb["loc"] > fa["loc"] * 1.5:
                break

            # Build canonical pair key
            key_a = fa["file"] + ":" + fa["name"]
            key_b = fb["file"] + ":" + fb["name"]
            pair_key = (key_a, key_b) if key_a < key_b else (key_b, key_a)

            if pair_key in seen_pairs:
                continue

            # Same hash -> already handled as exact
            if fa["hash"] == fb["hash"]:
                continue

            ratio = difflib.SequenceMatcher(None, fa["normalized"], fb["normalized"]).ratio()
            if ratio >= threshold:
                seen_pairs.add(pair_key)
                entries.append({
                    "fn_a": {"file": fa["file"], "name": fa["name"],
                             "line": fa["line"], "loc": fa["loc"]},
                    "fn_b": {"file": fb["file"], "name": fb["name"],
                             "line": fb["line"], "loc": fb["loc"]},
                    "similarity": round(ratio, 3),
                    "kind": "near-duplicate",
                })

    return sorted(entries, key=lambda e: -e["similarity"])
