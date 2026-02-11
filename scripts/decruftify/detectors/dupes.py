"""Duplicate / near-duplicate function detection via body hashing + difflib similarity."""

import difflib
import json
from pathlib import Path

from ..utils import c, find_ts_files, print_table, rel


def detect_duplicates(functions, threshold: float = 0.8) -> list[dict]:
    """Find duplicate/near-duplicate functions.

    Args:
        functions: list of objects with .file, .name, .line, .loc, .normalized, .body_hash attrs
                   (e.g. FunctionInfo from detectors.base, or compatible dicts).
        threshold: similarity threshold for near-duplicates.
    """
    if not functions:
        return []

    # Phase 1: Exact duplicates (same hash)
    by_hash: dict[str, list] = {}
    for fn in functions:
        by_hash.setdefault(fn.body_hash, []).append(fn)

    entries = []
    seen_pairs = set()

    for h, fns in by_hash.items():
        if len(fns) > 1:
            for i in range(len(fns)):
                for j in range(i + 1, len(fns)):
                    pair_key = (f"{fns[i].file}:{fns[i].name}",
                                f"{fns[j].file}:{fns[j].name}")
                    if pair_key in seen_pairs:
                        continue
                    seen_pairs.add(pair_key)
                    entries.append({
                        "fn_a": {"file": fns[i].file, "name": fns[i].name,
                                 "line": fns[i].line, "loc": fns[i].loc},
                        "fn_b": {"file": fns[j].file, "name": fns[j].name,
                                 "line": fns[j].line, "loc": fns[j].loc},
                        "similarity": 1.0,
                        "kind": "exact",
                    })

    # Phase 2: Near-duplicates (difflib similarity on functions >= 10 LOC)
    large_fns = [fn for fn in functions if fn.loc >= 10]
    large_fns.sort(key=lambda f: f.loc)

    for i in range(len(large_fns)):
        for j in range(i + 1, len(large_fns)):
            fa, fb = large_fns[i], large_fns[j]
            pair_key = (f"{fa.file}:{fa.name}", f"{fb.file}:{fb.name}")
            if pair_key in seen_pairs:
                continue
            if fb.loc > fa.loc * 1.5:
                break
            if fa.body_hash == fb.body_hash:
                continue

            ratio = difflib.SequenceMatcher(None, fa.normalized, fb.normalized).ratio()
            if ratio >= threshold:
                seen_pairs.add(pair_key)
                entries.append({
                    "fn_a": {"file": fa.file, "name": fa.name,
                             "line": fa.line, "loc": fa.loc},
                    "fn_b": {"file": fb.file, "name": fb.name,
                             "line": fb.line, "loc": fb.loc},
                    "similarity": round(ratio, 3),
                    "kind": "near-duplicate",
                })

    return sorted(entries, key=lambda e: -e["similarity"])


def cmd_dupes(args):
    threshold = getattr(args, "threshold", 0.8)

    # Use language-specific extractor if available
    from ..cli import _resolve_lang
    lang = _resolve_lang(args)
    if lang and lang.extract_functions:
        functions = lang.extract_functions(Path(args.path))
    else:
        # Default: TS extraction
        from ..lang.typescript.extractors import extract_ts_functions
        functions = []
        for filepath in find_ts_files(Path(args.path)):
            if "node_modules" in filepath or ".d.ts" in filepath:
                continue
            functions.extend(extract_ts_functions(filepath))

    entries = detect_duplicates(functions, threshold)
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
