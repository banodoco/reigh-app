"""CLI entry point: argparse, subcommand routing, command handlers."""

import argparse
import fnmatch
import json
import sys
from collections import defaultdict
from pathlib import Path

from .utils import DEFAULT_PATH, c, print_table, rel


# ── Command handlers ────────────────────────────────────────

def cmd_scan(args):
    """Run all detectors, update persistent state, show diff."""
    from .state import load_state, save_state, merge_scan
    from .plan import generate_findings

    sp = _state_path(args)
    state = load_state(sp)
    path = Path(args.path)
    include_slow = not getattr(args, "skip_slow", False)

    print(c("\nDecruftify Scan\n", "bold"))
    findings = generate_findings(path, include_slow=include_slow)

    prev_score = state.get("score", 0)
    diff = merge_scan(state, findings)
    save_state(state, sp)

    new_score = state["score"]
    stats = state["stats"]
    print(c("\n  Scan complete", "bold"))
    print(c("  " + "─" * 50, "dim"))
    print(f"  New findings:     {c(str(diff['new']), 'yellow' if diff['new'] else 'dim')}")
    print(f"  Auto-resolved:    {c(str(diff['auto_resolved']), 'green' if diff['auto_resolved'] else 'dim')}")
    print(f"  Reopened:         {c(str(diff['reopened']), 'red' if diff['reopened'] else 'dim')}")
    if diff.get("suspect_detectors"):
        print(c(f"  ⚠ Skipped auto-resolve for: {', '.join(diff['suspect_detectors'])} (returned 0 — likely transient)", "yellow"))
    print(c("  " + "─" * 50, "dim"))
    print(f"  Open: {stats['open']}  |  Total: {stats['total']}")

    delta = new_score - prev_score
    delta_str = f" ({'+' if delta > 0 else ''}{delta})" if delta != 0 else ""
    color = "green" if delta > 0 else ("red" if delta < 0 else "dim")
    print(f"  Score: {c(f'{new_score}/100{delta_str}', color)}")
    print()

    _write_query({"command": "scan", "score": new_score, "prev_score": prev_score,
                  "diff": diff, "stats": stats})


def cmd_status(args):
    """Show score dashboard."""
    from .state import load_state

    sp = _state_path(args)
    state = load_state(sp)
    stats = state.get("stats", {})

    if getattr(args, "json", False):
        print(json.dumps({"score": state.get("score", 0), "stats": stats,
                          "scan_count": state.get("scan_count", 0),
                          "last_scan": state.get("last_scan")}, indent=2))
        return

    if not state.get("last_scan"):
        print(c("No scans yet. Run: decruftify scan", "yellow"))
        return

    from .plan import TIER_LABELS
    score = state.get("score", 0)
    by_tier = stats.get("by_tier", {})

    print(c(f"\n  Decruftify Score: {score}/100", "bold"))
    print(c(f"  Scans: {state.get('scan_count', 0)} | Last: {state.get('last_scan', 'never')}", "dim"))
    print(c("  " + "─" * 60, "dim"))

    rows = []
    for tier_num in [1, 2, 3, 4]:
        ts = by_tier.get(str(tier_num), {})
        t_open = ts.get("open", 0)
        t_fixed = ts.get("fixed", 0) + ts.get("auto_resolved", 0)
        t_wontfix = ts.get("wontfix", 0) + ts.get("false_positive", 0)
        t_total = sum(ts.values())
        pct = round((t_total - t_open) / t_total * 100) if t_total else 100
        bar_len = 20
        filled = round(pct / 100 * bar_len)
        bar = c("█" * filled, "green") + c("░" * (bar_len - filled), "dim")
        label = TIER_LABELS.get(tier_num, "")
        rows.append([f"Tier {tier_num}", bar, f"{pct}%",
                     str(t_open), str(t_fixed), str(t_wontfix)])

    print_table(["Tier", "Progress", "%", "Open", "Fixed", "Skip"], rows,
                [40, 22, 5, 6, 6, 6])

    ignores = state.get("config", {}).get("ignore", [])
    if ignores:
        print(c(f"\n  Ignore list ({len(ignores)}):", "dim"))
        for p in ignores[:10]:
            print(c(f"    {p}", "dim"))
    print()

    _write_query({"command": "status", "score": score, "stats": stats,
                  "scan_count": state.get("scan_count", 0),
                  "last_scan": state.get("last_scan"),
                  "by_tier": by_tier, "ignores": ignores})


def _match_findings(state: dict, pattern: str, status_filter: str = "open") -> list[dict]:
    """Match findings against a pattern. Shared by cmd_show and JSON output."""
    matches = []
    for fid, f in state["findings"].items():
        if status_filter != "all" and f["status"] != status_filter:
            continue

        matched = False
        if fid == pattern:
            matched = True
        elif "*" in pattern:
            matched = fnmatch.fnmatch(fid, pattern)
        elif "::" in pattern and fid.startswith(pattern):
            matched = True
        elif "::" not in pattern and f.get("detector") == pattern:
            matched = True
        elif "::" not in pattern and (f["file"] == pattern or f["file"].startswith(pattern.rstrip("/") + "/")):
            matched = True

        if matched:
            matches.append(f)
    return matches


def cmd_show(args):
    """Show all findings for a file, directory, detector, or pattern."""
    from .state import load_state

    sp = _state_path(args)
    state = load_state(sp)

    if not state.get("last_scan"):
        print(c("No scans yet. Run: decruftify scan", "yellow"))
        return

    pattern = args.pattern
    status_filter = getattr(args, "status", "open")
    matches = _match_findings(state, pattern, status_filter)

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

    from .plan import CONFIDENCE_ORDER
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

            if detail_parts:
                print(c(f"      {' · '.join(detail_parts)}", "dim"))
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


def cmd_next(args):
    """Show next highest-priority open finding(s)."""
    from .state import load_state
    from .plan import get_next_items, TIER_LABELS

    sp = _state_path(args)
    state = load_state(sp)
    tier = getattr(args, "tier", None)
    count = getattr(args, "count", 1) or 1

    items = get_next_items(state, tier, count)
    if not items:
        print(c("Nothing to do! Score: 100/100", "green"))
        _write_query({"command": "next", "items": [], "score": state.get("score", 0)})
        return

    # Always write structured query file
    _write_query({
        "command": "next",
        "score": state.get("score", 0),
        "items": [{"id": f["id"], "tier": f["tier"], "confidence": f["confidence"],
                   "file": f["file"], "summary": f["summary"], "detail": f.get("detail", {})}
                  for f in items],
    })

    output_file = getattr(args, "output", None)
    if output_file:
        output = [{"id": f["id"], "tier": f["tier"], "confidence": f["confidence"],
                   "file": f["file"], "summary": f["summary"], "detail": f.get("detail", {})}
                  for f in items]
        Path(output_file).parent.mkdir(parents=True, exist_ok=True)
        Path(output_file).write_text(json.dumps(output, indent=2) + "\n")
        print(c(f"Wrote {len(items)} items to {output_file}", "green"))
        return

    for i, item in enumerate(items):
        if i > 0:
            print()
        label = f"  [{i+1}/{len(items)}]" if len(items) > 1 else "  Next item"
        print(c(f"{label} (Tier {item['tier']}, {item['confidence']} confidence):", "bold"))
        print(c("  " + "─" * 60, "dim"))
        print(f"  {c(item['summary'], 'yellow')}")
        print(f"  File: {item['file']}")
        print(c(f"  ID:   {item['id']}", "dim"))

        detail = item.get("detail", {})
        if detail.get("lines"):
            print(f"  Lines: {', '.join(str(l) for l in detail['lines'][:8])}")
        if detail.get("category"):
            print(f"  Category: {detail['category']}")
        if detail.get("importers") is not None:
            print(f"  Active importers: {detail['importers']}")

    if len(items) == 1:
        item = items[0]
        print(c("\n  Resolve with:", "dim"))
        print(f"    decruftify resolve \"{item['id']}\" fixed --note \"<what you did>\"")
        print(f"    decruftify resolve \"{item['id']}\" wontfix --note \"<why>\"")
    print()


def cmd_resolve(args):
    """Resolve finding(s) matching one or more patterns."""
    from .state import load_state, save_state, resolve_findings

    if args.status == "wontfix" and not args.note:
        print(c("Error: --note is required for wontfix (explain why).", "red"))
        sys.exit(1)

    sp = _state_path(args)
    state = load_state(sp)
    prev_score = state.get("score", 0)

    # Resolve all patterns in one pass
    all_resolved = []
    for pattern in args.patterns:
        resolved = resolve_findings(state, pattern, args.status, args.note)
        all_resolved.extend(resolved)

    if not all_resolved:
        print(c(f"No open findings matching: {' '.join(args.patterns)}", "yellow"))
        return

    save_state(state, sp)
    print(c(f"\nResolved {len(all_resolved)} finding(s) as {args.status}:", "green"))
    for fid in all_resolved[:20]:
        print(f"  {fid}")
    if len(all_resolved) > 20:
        print(f"  ... and {len(all_resolved) - 20} more")
    delta = state["score"] - prev_score
    delta_str = f" ({'+' if delta > 0 else ''}{delta})" if delta else ""
    print(f"\n  Score: {state['score']}/100{delta_str}")

    # Retrospective prompt
    print(c("\n  ── Retro ──", "dim"))
    print(c("  1. Was there a good loop here? Was anything too frictional?", "dim"))
    print(c("  2. Could the process be improved? (batch-resolve, auto-fix, ignore patterns?)", "dim"))
    print(c("  3. Were there related problems nearby we might have missed?", "dim"))
    print(c("  4. Was the scope appropriate? Too narrow (missed nearby issues)? Too broad?", "dim"))
    print()

    _write_query({"command": "resolve", "patterns": args.patterns, "status": args.status,
                  "resolved": all_resolved, "count": len(all_resolved),
                  "score": state["score"], "prev_score": prev_score,
                  "retro": [
                      "Was there a good loop? Anything frictional?",
                      "Process improvements? (batch-resolve, auto-fix, ignore patterns?)",
                      "Related problems nearby we might have missed?",
                      "Was the scope appropriate? Too narrow or too broad?",
                  ]})


def cmd_ignore_pattern(args):
    """Add a pattern to the ignore list."""
    from .state import load_state, save_state, add_ignore

    sp = _state_path(args)
    state = load_state(sp)
    removed = add_ignore(state, args.pattern)
    save_state(state, sp)

    print(c(f"Added ignore pattern: {args.pattern}", "green"))
    if removed:
        print(f"  Removed {removed} matching findings from state.")
    print(f"  Score: {state['score']}/100")
    print()


def cmd_fix(args):
    """Auto-fix mechanical issues."""
    import subprocess
    fixer_name = args.fixer
    dry_run = getattr(args, "dry_run", False)
    path = Path(args.path)

    fixer = _get_fixer(fixer_name)
    if fixer is None:
        print(c(f"Unknown fixer: {fixer_name}", "red"))
        sys.exit(1)

    # Safety: warn about uncommitted changes when not dry-running
    if not dry_run:
        _warn_uncommitted_changes()

    # Step 1: Detect
    print(c(f"\nDetecting {fixer['label']}...", "dim"), file=sys.stderr)
    entries = fixer["detect"](path)
    file_count = len(set(e["file"] for e in entries))
    print(c(f"  Found {len(entries)} {fixer['label']} across {file_count} files\n", "dim"), file=sys.stderr)

    if not entries:
        print(c(f"No {fixer['label']} found.", "green"))
        return

    # Step 2: Fix
    results = fixer["fix"](entries, dry_run=dry_run)
    total_items = sum(len(r["removed"]) for r in results)
    total_lines = sum(r.get("lines_removed", 0) for r in results)
    verb = fixer.get("dry_verb", "Would fix") if dry_run else fixer.get("verb", "Fixed")

    lines_str = f" ({total_lines} lines)" if total_lines else ""
    print(c(f"\n  {verb} {total_items} {fixer['label']} across {len(results)} files{lines_str}\n", "bold"))
    for r in results[:30]:
        syms = ", ".join(r["removed"][:5])
        if len(r["removed"]) > 5:
            syms += f" (+{len(r['removed']) - 5})"
        extra = f"  ({r['lines_removed']} lines)" if r.get("lines_removed") else ""
        print(f"  {rel(r['file'])}{extra}  →  {syms}")
    if len(results) > 30:
        print(f"  ... and {len(results) - 30} more files")

    # Dry-run: show before/after samples
    if dry_run and results:
        _show_dry_run_samples(entries, results, fixer_name)

    # Step 3: Resolve in state
    if not dry_run:
        sp = _state_path(args)
        from .state import load_state, save_state
        state = load_state(sp)
        prev_score = state.get("score", 0)

        resolved_ids = _resolve_fixer_results(state, results, fixer["detector"], fixer_name)
        save_state(state, sp)

        delta = state["score"] - prev_score
        delta_str = f" ({'+' if delta > 0 else ''}{delta})" if delta else ""
        print(f"\n  Auto-resolved {len(resolved_ids)} findings in state")
        print(f"  Score: {state['score']}/100{delta_str}")

        # Step 4: Post-fix hooks (e.g., cascade cleanup)
        post_fix = fixer.get("post_fix")
        if post_fix:
            post_fix(path, state, prev_score, dry_run)
            save_state(state, sp)

        _write_query({"command": "fix", "fixer": fixer_name,
                      "files_fixed": len(results), "items_fixed": total_items,
                      "findings_resolved": len(resolved_ids),
                      "score": state["score"], "prev_score": prev_score})
    else:
        _write_query({"command": "fix", "fixer": fixer_name, "dry_run": True,
                      "files_would_fix": len(results), "items_would_fix": total_items})

    print()


def _warn_uncommitted_changes():
    """Warn if there are uncommitted changes and suggest git push."""
    import subprocess
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"], capture_output=True, text=True, timeout=5
        )
        if result.stdout.strip():
            print(c("\n  ⚠ You have uncommitted changes. Consider running:", "yellow"))
            print(c("    git add -A && git commit -m 'pre-fix checkpoint' && git push", "yellow"))
            print(c("    This ensures you can revert if the fixer produces unexpected results.\n", "dim"))
    except Exception:
        pass


def _show_dry_run_samples(entries: list[dict], results: list[dict], fixer_name: str):
    """Show before/after samples for dry-run to help understand what will happen."""
    import random
    random.seed(42)

    # Pick up to 5 random files from results
    sample_results = random.sample(results, min(5, len(results)))

    print(c("\n  ── Sample changes (before → after) ──", "cyan"))
    for r in sample_results:
        filepath = r["file"]
        removed_set = set(r["removed"])
        try:
            p = Path(filepath) if Path(filepath).is_absolute() else Path(".") / filepath
            lines = p.read_text().splitlines()

            # Find entries for this file that match the removed names
            file_entries = [
                e for e in entries
                if e["file"] == filepath and e.get("name", "") in removed_set
            ]
            if not file_entries:
                continue

            # Show up to 2 changes per file
            shown = 0
            for e in file_entries[:2]:
                line_idx = e.get("line", e.get("detail", {}).get("line", 0)) - 1
                if line_idx < 0 or line_idx >= len(lines):
                    continue

                name = e.get("name", e.get("summary", "?"))
                context_start = max(0, line_idx - 1)
                context_end = min(len(lines), line_idx + 2)

                if shown == 0:
                    print(c(f"\n  {rel(filepath)}:", "cyan"))

                print(c(f"    {name} (line {line_idx + 1}):", "dim"))
                for i in range(context_start, context_end):
                    marker = c("  →", "red") if i == line_idx else "   "
                    print(f"    {marker} {i+1:4d}  {lines[i][:90]}")
                shown += 1
        except Exception:
            continue

    skipped = sum(len(r["removed"]) for r in results)
    detected = len(entries)
    if detected > skipped:
        print(c(f"\n  Note: {detected - skipped} of {detected} entries were skipped (complex patterns, rest elements, etc.)", "dim"))
    print()


def _get_fixer(name: str) -> dict | None:
    """Lazy-load and return fixer config by name."""
    if name == "unused-imports":
        from .detectors.unused import detect_unused
        from .fix import fix_unused_imports
        return {
            "label": "unused imports",
            "detect": lambda path: detect_unused(path, category="imports"),
            "fix": fix_unused_imports,
            "detector": "unused",
            "verb": "Removed", "dry_verb": "Would remove",
        }
    elif name == "debug-logs":
        from .detectors.logs import detect_logs
        from .fix import fix_debug_logs
        return {
            "label": "tagged debug logs",
            "detect": detect_logs,
            "fix": _wrap_debug_logs_fix(fix_debug_logs),
            "detector": "logs",
            "verb": "Removed", "dry_verb": "Would remove",
            "post_fix": _cascade_import_cleanup,
        }
    elif name == "dead-exports":
        from .detectors.exports import detect_dead_exports
        from .fix import fix_dead_exports
        return {
            "label": "dead exports",
            "detect": detect_dead_exports,
            "fix": fix_dead_exports,
            "detector": "exports",
            "verb": "De-exported", "dry_verb": "Would de-export",
        }
    elif name == "unused-vars":
        from .detectors.unused import detect_unused
        from .fix import fix_unused_vars
        return {
            "label": "unused vars",
            "detect": lambda path: detect_unused(path, category="vars"),
            "fix": fix_unused_vars,
            "detector": "unused",
            "verb": "Removed", "dry_verb": "Would remove",
        }
    return None


def _wrap_debug_logs_fix(fix_fn):
    """Wrap debug-logs fixer to normalize result shape (tags → removed)."""
    def wrapper(entries, *, dry_run=False):
        results = fix_fn(entries, dry_run=dry_run)
        # Normalize: debug-logs uses 'tags' but pipeline expects 'removed'
        for r in results:
            r["removed"] = r.get("tags", r.get("removed", []))
        return results
    return wrapper


def _resolve_fixer_results(state: dict, results: list[dict], detector: str, fixer_name: str) -> list[str]:
    """Resolve findings in state for fixer results. Returns list of resolved IDs."""
    resolved_ids = []
    for r in results:
        rfile = rel(r["file"])
        for sym in r["removed"]:
            fid = f"{detector}::{rfile}::{sym}"
            if fid in state["findings"] and state["findings"][fid]["status"] == "open":
                state["findings"][fid]["status"] = "fixed"
                state["findings"][fid]["note"] = f"auto-fixed by decruftify fix {fixer_name}"
                resolved_ids.append(fid)
    return resolved_ids


def _cascade_import_cleanup(path: Path, state: dict, prev_score: int, dry_run: bool):
    """Post-fix hook: removing debug logs may leave orphaned imports."""
    from .detectors.unused import detect_unused
    from .fix import fix_unused_imports
    from .state import save_state

    print(c("\n  Running cascading import cleanup...", "dim"), file=sys.stderr)
    import_entries = detect_unused(path, category="imports")
    if not import_entries:
        print(c("  Cascade: no orphaned imports found", "dim"))
        return

    import_results = fix_unused_imports(import_entries, dry_run=dry_run)
    if not import_results:
        print(c("  Cascade: no orphaned imports found", "dim"))
        return

    import_removed = sum(len(r["removed"]) for r in import_results)
    import_lines = sum(r["lines_removed"] for r in import_results)
    print(c(f"  Cascade: removed {import_removed} now-orphaned imports "
            f"from {len(import_results)} files ({import_lines} lines)", "green"))

    resolved = _resolve_fixer_results(state, import_results, "unused", "debug-logs (cascade)")
    if resolved:
        print(f"  Cascade: auto-resolved {len(resolved)} import findings")


def cmd_plan_output(args):
    """Generate a prioritized markdown plan from state."""
    from .state import load_state
    from .plan import generate_plan_md

    sp = _state_path(args)
    state = load_state(sp)

    if not state.get("last_scan"):
        print(c("No scans yet. Run: decruftify scan", "yellow"))
        return

    plan_md = generate_plan_md(state)

    output = getattr(args, "output", None)
    if output:
        Path(output).parent.mkdir(parents=True, exist_ok=True)
        Path(output).write_text(plan_md)
        print(c(f"Plan written to {output}", "green"))
    else:
        print(plan_md)


def cmd_detect(args):
    """Run a single detector directly (bypass state tracking)."""
    detector = args.detector

    # Lazy-load each detector's cmd_ function via importlib (supports -m invocation)
    from importlib import import_module
    _det = lambda mod, fn: lambda: getattr(import_module(f".detectors.{mod}", __package__), fn)
    detector_cmds = {
        "logs":       _det("logs", "cmd_logs"),
        "unused":     _det("unused", "cmd_unused"),
        "exports":    _det("exports", "cmd_exports"),
        "deprecated": _det("deprecated", "cmd_deprecated"),
        "large":      _det("large", "cmd_large"),
        "complexity": _det("complexity", "cmd_complexity"),
        "gods":       _det("gods", "cmd_god_components"),
        "single-use": _det("single_use", "cmd_single_use"),
        "props":      _det("props", "cmd_props"),
        "concerns":   _det("concerns", "cmd_concerns"),
        "deps":       _det("deps", "cmd_deps"),
        "dupes":      _det("dupes", "cmd_dupes"),
        "smells":     _det("smells", "cmd_smells"),
    }

    if detector not in detector_cmds:
        print(c(f"Unknown detector: {detector}", "red"))
        print(f"  Available: {', '.join(sorted(detector_cmds))}")
        sys.exit(1)

    # Apply sensible defaults for threshold when not specified
    if args.threshold is None:
        if detector == "large":
            args.threshold = 300
        elif detector == "dupes":
            args.threshold = 0.8

    cmd_fn = detector_cmds[detector]()
    cmd_fn(args)


# ── Helpers ─────────────────────────────────────────────────

QUERY_FILE = Path(".decruftify/query.json")


def _write_query(data: dict):
    """Write structured query output to .decruftify/query.json.

    Every query command calls this so the LLM can always Read the file
    instead of parsing terminal output.
    """
    QUERY_FILE.parent.mkdir(parents=True, exist_ok=True)
    QUERY_FILE.write_text(json.dumps(data, indent=2, default=str) + "\n")


def _state_path(args) -> Path | None:
    """Get state file path from args, or None for default."""
    p = getattr(args, "state", None)
    return Path(p) if p else None


# ── CLI parser ──────────────────────────────────────────────

DETECTOR_NAMES = [
    "logs", "unused", "exports", "deprecated", "large", "complexity",
    "gods", "single-use", "props", "concerns", "deps", "dupes", "smells",
]

USAGE_EXAMPLES = """
workflow:
  scan                          Run all detectors, update state, show diff
  status                        Score dashboard with per-tier progress
  tree                          Annotated codebase tree (zoom with --focus)
  show <pattern>                Dig into findings by file/dir/detector/ID
  resolve <pattern> <status>    Mark findings as fixed/wontfix/false_positive
  ignore <pattern>              Suppress findings matching a pattern
  plan                          Generate prioritized markdown plan

examples:
  decruftify scan --skip-slow
  decruftify tree --focus shared/components --sort findings --depth 3
  decruftify tree --detail --focus shared/components/MediaLightbox --min-loc 300
  decruftify show src/shared/components/PromptEditorModal.tsx
  decruftify show gods
  decruftify show "src/shared/components/MediaLightbox"
  decruftify resolve fixed "unused::src/foo.tsx::React" "unused::src/bar.tsx::React"
  decruftify resolve fixed "logs::src/foo.tsx::*" --note "removed debug logs"
  decruftify resolve wontfix deprecated --note "migration in progress"
  decruftify ignore "smells::*::async_no_await"
  decruftify detect logs --top 10
  decruftify detect dupes --threshold 0.9
"""


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="decruftify",
        description="Decruftify — codebase health tracker",
        epilog=USAGE_EXAMPLES,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # ── Core workflow ────────────────────────────────────────

    p_scan = sub.add_parser("scan", help="Run all detectors, update state, show diff")
    p_scan.add_argument("--path", type=str, default=str(DEFAULT_PATH))
    p_scan.add_argument("--state", type=str, default=None)
    p_scan.add_argument("--skip-slow", action="store_true", help="Skip slow detectors (dupes)")

    p_status = sub.add_parser("status", help="Score dashboard with per-tier progress")
    p_status.add_argument("--state", type=str, default=None)
    p_status.add_argument("--json", action="store_true")

    p_tree = sub.add_parser("tree", help="Annotated codebase tree (text)")
    p_tree.add_argument("--path", type=str, default=str(DEFAULT_PATH))
    p_tree.add_argument("--state", type=str, default=None)
    p_tree.add_argument("--depth", type=int, default=2, help="Max depth (default: 2)")
    p_tree.add_argument("--focus", type=str, default=None,
                        help="Zoom into subdirectory (e.g. shared/components/MediaLightbox)")
    p_tree.add_argument("--min-loc", type=int, default=0, help="Hide items below this LOC")
    p_tree.add_argument("--sort", choices=["loc", "findings", "coupling"], default="loc")
    p_tree.add_argument("--detail", action="store_true", help="Show finding summaries per file")

    p_show = sub.add_parser("show", help="Dig into findings by file, directory, detector, or ID")
    p_show.add_argument("pattern", help="File path, directory, detector name, finding ID, or glob")
    p_show.add_argument("--state", type=str, default=None)
    p_show.add_argument("--status", choices=["open", "fixed", "wontfix", "false_positive",
                                              "auto_resolved", "all"], default="open")
    p_show.add_argument("--top", type=int, default=20, help="Max files to show (default: 20)")
    p_show.add_argument("--output", type=str, metavar="FILE", help="Write JSON to file instead of terminal")

    p_next = sub.add_parser("next", help="Show next highest-priority open finding")
    p_next.add_argument("--state", type=str, default=None)
    p_next.add_argument("--tier", type=int, choices=[1, 2, 3, 4], default=None)
    p_next.add_argument("--count", type=int, default=1, help="Number of items to show (default: 1)")
    p_next.add_argument("--output", type=str, metavar="FILE", help="Write JSON to file instead of terminal")

    p_resolve = sub.add_parser("resolve", help="Mark finding(s) as fixed/wontfix/false_positive")
    p_resolve.add_argument("status", choices=["fixed", "wontfix", "false_positive"])
    p_resolve.add_argument("patterns", nargs="+", metavar="PATTERN",
                           help="Finding ID(s), prefix, detector name, file path, or glob")
    p_resolve.add_argument("--note", type=str, default=None, help="Explanation (required for wontfix)")
    p_resolve.add_argument("--state", type=str, default=None)

    p_ignore = sub.add_parser("ignore", help="Add pattern to ignore list, remove matching findings")
    p_ignore.add_argument("pattern", help="File path, glob, or detector::prefix")
    p_ignore.add_argument("--state", type=str, default=None)

    p_fix = sub.add_parser("fix", help="Auto-fix mechanical issues")
    p_fix.add_argument("fixer", choices=["unused-imports", "debug-logs", "dead-exports", "unused-vars"],
                       help="What to fix")
    p_fix.add_argument("--path", type=str, default=str(DEFAULT_PATH))
    p_fix.add_argument("--state", type=str, default=None)
    p_fix.add_argument("--dry-run", action="store_true", help="Show what would change without modifying files")

    p_plan = sub.add_parser("plan", help="Generate prioritized markdown plan from state")
    p_plan.add_argument("--state", type=str, default=None)
    p_plan.add_argument("--output", type=str, metavar="FILE", help="Write to file instead of stdout")

    # ── Visualization ────────────────────────────────────────

    p_viz = sub.add_parser("viz", help="Generate interactive HTML treemap")
    p_viz.add_argument("--path", type=str, default=str(DEFAULT_PATH))
    p_viz.add_argument("--output", type=str, default=None)
    p_viz.add_argument("--state", type=str, default=None)

    # ── Raw detector access ──────────────────────────────────

    p_detect = sub.add_parser("detect",
        help="Run a single detector directly (bypass state)",
        epilog=f"detectors: {', '.join(DETECTOR_NAMES)}")
    p_detect.add_argument("detector", choices=DETECTOR_NAMES, help="Detector to run")
    p_detect.add_argument("--top", type=int, default=20)
    p_detect.add_argument("--path", type=str, default=str(DEFAULT_PATH))
    p_detect.add_argument("--json", action="store_true")
    p_detect.add_argument("--fix", action="store_true", help="Auto-fix (logs only)")
    p_detect.add_argument("--category", choices=["imports", "vars", "params", "all"], default="all",
                          help="Filter unused by category")
    p_detect.add_argument("--threshold", type=float, default=None,
                          help="LOC threshold (large) or similarity (dupes)")
    p_detect.add_argument("--file", type=str, default=None, help="Show deps for specific file")

    return parser


# ── Main ─────────────────────────────────────────────────────

def main():
    parser = create_parser()
    args = parser.parse_args()

    commands = {
        "scan": cmd_scan,
        "status": cmd_status,
        "show": cmd_show,
        "next": cmd_next,
        "resolve": cmd_resolve,
        "ignore": cmd_ignore_pattern,
        "fix": cmd_fix,
        "plan": cmd_plan_output,
        "detect": cmd_detect,
    }

    # Lazy-loaded commands
    if args.command == "tree":
        from .visualize import cmd_tree
        commands["tree"] = cmd_tree
    elif args.command == "viz":
        from .visualize import cmd_viz
        commands["viz"] = cmd_viz

    try:
        commands[args.command](args)
    except KeyboardInterrupt:
        print("\nInterrupted.")
        sys.exit(1)


if __name__ == "__main__":
    main()
