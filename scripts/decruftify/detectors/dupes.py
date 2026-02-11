"""Duplicate / near-duplicate function detection via body hashing + difflib similarity."""

import difflib
import hashlib
import json
import re
from pathlib import Path

from ..utils import PROJECT_ROOT, c, find_ts_files, print_table, rel


def _extract_functions(filepath: str) -> list[dict]:
    """Extract function/component bodies from a TS/TSX file."""
    p = Path(filepath) if Path(filepath).is_absolute() else PROJECT_ROOT / filepath
    try:
        content = p.read_text()
    except (OSError, UnicodeDecodeError):
        return []

    lines = content.splitlines()
    functions = []

    # Match: export function X, const X = (, function X, const X: ... = (
    fn_re = re.compile(
        r"^(?:export\s+)?(?:"
        r"(?:function\s+(\w+))|"                          # function Name
        r"(?:const\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:\([^)]*\)|[^=])*=>)|"  # const Name = (...) =>
        r"(?:const\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*function)"  # const Name = function
        r")"
    )

    i = 0
    while i < len(lines):
        line = lines[i]
        m = fn_re.match(line.strip())
        if m:
            name = m.group(1) or m.group(2) or m.group(3)
            if not name:
                i += 1
                continue

            # Find the function body by tracking braces
            start_line = i
            brace_depth = 0
            found_open = False
            j = i
            while j < len(lines):
                for ch in lines[j]:
                    if ch == '{':
                        brace_depth += 1
                        found_open = True
                    elif ch == '}':
                        brace_depth -= 1
                if found_open and brace_depth <= 0:
                    break
                j += 1

            if found_open and j > start_line:
                body_lines = lines[start_line:j + 1]
                body = "\n".join(body_lines)
                # Normalize: strip whitespace, comments, log statements
                normalized = _normalize_body(body)
                if len(normalized.splitlines()) >= 3:  # skip trivial functions
                    functions.append({
                        "file": filepath,
                        "name": name,
                        "line": start_line + 1,
                        "end_line": j + 1,
                        "loc": j - start_line + 1,
                        "body": body,
                        "normalized": normalized,
                        "hash": hashlib.md5(normalized.encode()).hexdigest(),
                    })
                i = j + 1
                continue
        i += 1

    return functions


def _normalize_body(body: str) -> str:
    """Normalize a function body for comparison: strip comments, whitespace, names."""
    lines = body.splitlines()
    normalized = []
    for line in lines:
        stripped = line.strip()
        # Skip empty lines and comments
        if not stripped or stripped.startswith("//") or stripped.startswith("/*") or stripped.startswith("*"):
            continue
        # Skip console.log lines
        if "console." in stripped:
            continue
        normalized.append(stripped)
    return "\n".join(normalized)


def detect_duplicates(path: Path, threshold: float = 0.8) -> list[dict]:
    """Find duplicate/near-duplicate functions across the codebase."""
    all_functions = []
    for filepath in find_ts_files(path):
        if "node_modules" in filepath or ".d.ts" in filepath:
            continue
        all_functions.extend(_extract_functions(filepath))

    if not all_functions:
        return []

    # Phase 1: Exact duplicates (same hash)
    by_hash: dict[str, list] = {}
    for fn in all_functions:
        by_hash.setdefault(fn["hash"], []).append(fn)

    entries = []
    seen_pairs = set()

    # Exact duplicates
    for h, fns in by_hash.items():
        if len(fns) > 1:
            for i in range(len(fns)):
                for j in range(i + 1, len(fns)):
                    pair_key = (fns[i]["file"] + ":" + fns[i]["name"],
                                fns[j]["file"] + ":" + fns[j]["name"])
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

    # Phase 2: Near-duplicates (difflib similarity on functions >10 lines)
    # Only compare functions of similar size to limit O(n^2) comparisons
    large_fns = [fn for fn in all_functions if fn["loc"] >= 10]
    large_fns.sort(key=lambda f: f["loc"])

    for i in range(len(large_fns)):
        for j in range(i + 1, len(large_fns)):
            fa, fb = large_fns[i], large_fns[j]
            # Skip if same file and already in exact dupes
            pair_key = (fa["file"] + ":" + fa["name"], fb["file"] + ":" + fb["name"])
            if pair_key in seen_pairs:
                continue
            # Only compare functions of similar size (within 50%)
            if fb["loc"] > fa["loc"] * 1.5:
                break
            # Quick check: if hashes match, already handled
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


def cmd_dupes(args):
    threshold = getattr(args, "threshold", 0.8)
    entries = detect_duplicates(Path(args.path), threshold)
    if args.json:
        print(json.dumps({"count": len(entries), "threshold": threshold, "entries": entries}, indent=2))
        return

    if not entries:
        print(c("No duplicate functions found.", "green"))
        return

    exact = [e for e in entries if e["kind"] == "exact"]
    near = [e for e in entries if e["kind"] == "near-duplicate"]

    if exact:
        print(c(f"\nExact duplicates: {len(exact)} pairs\n", "bold"))
        rows = []
        for e in exact[:args.top]:
            a, b = e["fn_a"], e["fn_b"]
            rows.append([
                f"{a['name']} ({rel(a['file'])}:{a['line']})",
                f"{b['name']} ({rel(b['file'])}:{b['line']})",
                str(a["loc"]),
            ])
        print_table(["Function A", "Function B", "LOC"], rows, [50, 50, 5])

    if near:
        print(c(f"\nNear-duplicates (>={threshold:.0%} similar): {len(near)} pairs\n", "bold"))
        rows = []
        for e in near[:args.top]:
            a, b = e["fn_a"], e["fn_b"]
            rows.append([
                f"{a['name']} ({rel(a['file'])}:{a['line']})",
                f"{b['name']} ({rel(b['file'])}:{b['line']})",
                f"{e['similarity']:.0%}",
            ])
        print_table(["Function A", "Function B", "Sim"], rows, [50, 50, 5])
