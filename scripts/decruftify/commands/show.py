"""show command: dig into findings by file, directory, detector, or pattern."""

import json
from collections import defaultdict
from pathlib import Path

from ..utils import c
from ..cli import _state_path, _write_query


def cmd_show(args):
    """Show all findings for a file, directory, detector, or pattern."""
    from ..state import load_state, match_findings

    sp = _state_path(args)
    state = load_state(sp)

    if not state.get("last_scan"):
        print(c("No scans yet. Run: decruftify scan", "yellow"))
        return

    chronic = getattr(args, "chronic", False)
    pattern = args.pattern

    if chronic:
        # Show chronic reopeners regardless of pattern
        matches = [f for f in state["findings"].values()
                   if f.get("reopen_count", 0) >= 2 and f["status"] == "open"]
        status_filter = "open"
        pattern = pattern or "<chronic>"
    else:
        if not pattern:
            print(c("Pattern required (or use --chronic). Try: decruftify show --help", "yellow"))
            return
        status_filter = getattr(args, "status", "open")
        matches = match_findings(state, pattern, status_filter)

    if not matches:
        print(c(f"No {status_filter} findings matching: {pattern}", "yellow"))
        _write_query({"command": "show", "query": pattern, "status_filter": status_filter,
                      "total": 0, "findings": []})
        return

    # Always write structured query file
    _write_show_query(matches, pattern, status_filter)

    # Optional: also write to a custom output file
    output_file = getattr(args, "output", None)
    if output_file:
        _write_json_output(matches, output_file, pattern, status_filter)
        return

    by_file: dict[str, list] = defaultdict(list)
    for f in matches:
        by_file[f["file"]].append(f)

    from ..plan import CONFIDENCE_ORDER
    sorted_files = sorted(by_file.items(), key=lambda x: -len(x[1]))
    top = getattr(args, "top", 20) or 20

    print(c(f"\n  {len(matches)} {status_filter} findings matching '{pattern}'\n", "bold"))

    shown_files = sorted_files[:top]
    remaining_files = sorted_files[top:]
    remaining_findings = sum(len(fs) for _, fs in remaining_files)

    for filepath, findings in shown_files:
        findings.sort(key=lambda f: (f["tier"], CONFIDENCE_ORDER.get(f["confidence"], 9)))
        print(c(f"  {filepath}", "cyan") + c(f"  ({len(findings)} findings)", "dim"))

        for f in findings:
            status_icon = {"open": "○", "fixed": "✓", "wontfix": "—", "false_positive": "✗",
                          "auto_resolved": "◌"}.get(f["status"], "?")
            print(f"    {status_icon} T{f['tier']} [{f['confidence']}] {f['summary']}")

            detail = f.get("detail", {})
            detail_parts = []
            if detail.get("line"):
                detail_parts.append(f"line {detail['line']}")
            if detail.get("lines"):
                detail_parts.append(f"lines {', '.join(str(l) for l in detail['lines'][:5])}")
            if detail.get("category"):
                detail_parts.append(f"category: {detail['category']}")
            if detail.get("importers") is not None:
                detail_parts.append(f"importers: {detail['importers']}")
            if detail.get("count"):
                detail_parts.append(f"count: {detail['count']}")
            if detail.get("kind"):
                detail_parts.append(f"kind: {detail['kind']}")
            if detail.get("signals"):
                detail_parts.append(f"signals: {', '.join(detail['signals'][:3])}")
            if detail.get("concerns"):
                detail_parts.append(f"concerns: {', '.join(detail['concerns'][:3])}")
            if detail.get("hook_total"):
                detail_parts.append(f"hooks: {detail['hook_total']}")
            if detail.get("prop_count"):
                detail_parts.append(f"props: {detail['prop_count']}")
            if detail.get("smell_id"):
                detail_parts.append(f"smell: {detail['smell_id']}")
            if detail.get("fn_a"):
                a, b = detail["fn_a"], detail["fn_b"]
                detail_parts.append(f"{a['name']}:{a.get('line','')} ↔ {b['name']}:{b.get('line','')}")
            if detail.get("target"):
                detail_parts.append(f"target: {detail['target']}")
            if detail.get("sole_tool"):
                detail_parts.append(f"sole tool: {detail['sole_tool']}")
            if detail.get("direction"):
                detail_parts.append(f"direction: {detail['direction']}")
            if detail.get("family"):
                detail_parts.append(f"family: {detail['family']}")
            if detail.get("patterns_used"):
                detail_parts.append(f"patterns: {', '.join(detail['patterns_used'])}")
            if detail.get("review"):
                detail_parts.append(f"review: {detail['review'][:80]}")
            if detail.get("majority"):
                detail_parts.append(f"majority: {detail['majority']}")
            if detail.get("minority"):
                detail_parts.append(f"minority: {detail['minority']}")
            if detail.get("outliers"):
                detail_parts.append(f"outliers: {', '.join(detail['outliers'][:5])}")

            if detail_parts:
                print(c(f"      {' · '.join(detail_parts)}", "dim"))
            if f.get("reopen_count", 0) >= 2:
                print(c(f"      ⟳ reopened {f['reopen_count']} times — fix properly or wontfix", "red"))
            if f.get("note"):
                print(c(f"      note: {f['note']}", "dim"))
            print(c(f"      {f['id']}", "dim"))
        print()

    if remaining_findings:
        print(c(f"  ... and {len(remaining_files)} more files ({remaining_findings} findings). Use --top {top + 20} to see more.\n", "dim"))

    by_detector: dict[str, int] = defaultdict(int)
    by_tier: dict[int, int] = defaultdict(int)
    for f in matches:
        by_detector[f["detector"]] += 1
        by_tier[f["tier"]] += 1

    print(c("  Summary:", "bold"))
    print(c(f"    By tier:     {', '.join(f'T{t}:{n}' for t, n in sorted(by_tier.items()))}", "dim"))
    print(c(f"    By detector: {', '.join(f'{d}:{n}' for d, n in sorted(by_detector.items(), key=lambda x: -x[1]))}", "dim"))
    print()


def _write_show_query(matches: list[dict], pattern: str, status_filter: str):
    """Write show results to the standard query file."""
    by_file: dict[str, list] = defaultdict(list)
    by_detector: dict[str, int] = defaultdict(int)
    by_tier: dict[int, int] = defaultdict(int)
    for f in matches:
        by_file[f["file"]].append(f)
        by_detector[f["detector"]] += 1
        by_tier[f["tier"]] += 1

    _write_query({
        "command": "show",
        "query": pattern,
        "status_filter": status_filter,
        "total": len(matches),
        "summary": {
            "by_tier": {f"T{t}": n for t, n in sorted(by_tier.items())},
            "by_detector": dict(sorted(by_detector.items(), key=lambda x: -x[1])),
            "files": len(by_file),
        },
        "by_file": {
            fp: [{"id": f["id"], "tier": f["tier"], "confidence": f["confidence"],
                  "summary": f["summary"], "detail": f.get("detail", {})}
                 for f in fs]
            for fp, fs in sorted(by_file.items(), key=lambda x: -len(x[1]))
        },
    })


def _write_json_output(matches: list[dict], output_file: str, pattern: str, status_filter: str):
    """Write matched findings as structured JSON to a file."""
    by_file: dict[str, list] = defaultdict(list)
    by_detector: dict[str, int] = defaultdict(int)
    by_tier: dict[int, int] = defaultdict(int)
    for f in matches:
        by_file[f["file"]].append(f)
        by_detector[f["detector"]] += 1
        by_tier[f["tier"]] += 1

    output = {
        "query": pattern,
        "status_filter": status_filter,
        "total": len(matches),
        "summary": {
            "by_tier": {f"T{t}": n for t, n in sorted(by_tier.items())},
            "by_detector": dict(sorted(by_detector.items(), key=lambda x: -x[1])),
            "files": len(by_file),
        },
        "by_file": {
            fp: [{"id": f["id"], "tier": f["tier"], "confidence": f["confidence"],
                  "summary": f["summary"], "detail": f.get("detail", {})}
                 for f in fs]
            for fp, fs in sorted(by_file.items(), key=lambda x: -len(x[1]))
        },
    }

    Path(output_file).parent.mkdir(parents=True, exist_ok=True)
    Path(output_file).write_text(json.dumps(output, indent=2) + "\n")
    print(c(f"Wrote {len(matches)} findings to {output_file}", "green"))
