"""scan command: run all detectors, update persistent state, show diff."""

from pathlib import Path

from ..utils import c
from ..cli import _state_path, _write_query


def cmd_scan(args):
    """Run all detectors, update persistent state, show diff."""
    from ..state import load_state, save_state, merge_scan
    from ..plan import generate_findings

    sp = _state_path(args)
    state = load_state(sp)
    path = Path(args.path)
    include_slow = not getattr(args, "skip_slow", False)

    # Resolve language config
    from ..cli import _resolve_lang
    lang = _resolve_lang(args)
    lang_label = f" ({lang.name})" if lang else ""

    print(c(f"\nDecruftify Scan{lang_label}\n", "bold"))
    findings = generate_findings(path, include_slow=include_slow, lang=lang)

    prev_score = state.get("score", 0)
    prev_strict = state.get("strict_score", 0)
    from ..utils import rel
    diff = merge_scan(state, findings,
                      lang=lang.name if lang else None,
                      scan_path=rel(str(path)),
                      force_resolve=getattr(args, "force_resolve", False))
    save_state(state, sp)

    new_score = state["score"]
    new_strict = state.get("strict_score", 0)
    stats = state["stats"]
    print(c("\n  Scan complete", "bold"))
    print(c("  " + "─" * 50, "dim"))

    # Diff summary
    diff_parts = []
    if diff["new"]:
        diff_parts.append(c(f"+{diff['new']} new", "yellow"))
    if diff["auto_resolved"]:
        diff_parts.append(c(f"-{diff['auto_resolved']} resolved", "green"))
    if diff["reopened"]:
        diff_parts.append(c(f"↻{diff['reopened']} reopened", "red"))
    if diff_parts:
        print(f"  {' · '.join(diff_parts)}")
    else:
        print(c("  No changes since last scan", "dim"))
    if diff.get("suspect_detectors"):
        print(c(f"  ⚠ Skipped auto-resolve for: {', '.join(diff['suspect_detectors'])} (returned 0 — likely transient)", "yellow"))

    # Score
    delta = new_score - prev_score
    delta_str = f" ({'+' if delta > 0 else ''}{delta:.1f})" if delta != 0 else ""
    color = "green" if delta > 0 else ("red" if delta < 0 else "dim")
    strict_delta = new_strict - prev_strict
    strict_delta_str = f" ({'+' if strict_delta > 0 else ''}{strict_delta:.1f})" if strict_delta != 0 else ""
    strict_color = "green" if strict_delta > 0 else ("red" if strict_delta < 0 else "dim")
    print(f"  Score: {c(f'{new_score:.1f}/100{delta_str}', color)}" +
          c(f"  (strict: {new_strict:.1f}/100{strict_delta_str})", strict_color) +
          c(f"  |  {stats['open']} open / {stats['total']} total", "dim"))

    # Per-detector progress
    _show_detector_progress(state)

    # Post-scan analysis
    warnings = []
    next_action = None

    if diff["reopened"] > 5:
        warnings.append(f"{diff['reopened']} findings reopened — was a previous fix reverted? Check: git log --oneline -5")
    if diff["new"] > 10 and diff["auto_resolved"] < 3:
        warnings.append(f"{diff['new']} new findings with few resolutions — likely cascading from recent fixes. Run fixers again.")
    if diff.get("chronic_reopeners", 0) > 0:
        n = diff["chronic_reopeners"]
        warnings.append(f"⟳ {n} chronic reopener{'s' if n != 1 else ''} (reopened 2+ times). "
                        f"These keep bouncing — fix properly or wontfix. "
                        f"Run: `decruftify show --chronic` to see them.")

    by_tier = stats.get("by_tier", {})
    next_action = _suggest_next_action(by_tier)

    if warnings:
        for w in warnings:
            print(c(f"  {w}", "yellow"))
        print()

    if next_action:
        print(c(f"  Suggested next: {next_action}", "cyan"))
        print()

    # Reflection prompts
    print(c("  ── Reflect ──", "dim"))
    print(c("  1. Any new findings from cascading? (exports removed → vars now unused?)", "dim"))
    print(c("  2. Did score move as expected? If not, check reopened/new counts above.", "dim"))
    print(c("  3. Are there quick wins? Check `decruftify status` for tier breakdown.", "dim"))
    print()

    _write_query({"command": "scan", "score": new_score, "strict_score": new_strict,
                  "prev_score": prev_score, "diff": diff, "stats": stats,
                  "warnings": warnings, "next_action": next_action})


def _show_detector_progress(state: dict):
    """Show per-detector progress bars — the heartbeat of a scan."""
    findings = state["findings"]
    if not findings:
        return

    STRUCTURAL_MERGE = {"large", "complexity", "gods", "concerns"}
    by_det: dict[str, dict] = {}
    for f in findings.values():
        det = f.get("detector", "unknown")
        if det in STRUCTURAL_MERGE:
            det = "structural"
        if det not in by_det:
            by_det[det] = {"open": 0, "total": 0}
        by_det[det]["total"] += 1
        if f["status"] == "open":
            by_det[det]["open"] += 1

    DET_ORDER = ["logs", "unused", "exports", "deprecated", "structural", "props",
                 "single_use", "coupling", "cycles", "orphaned", "patterns", "naming",
                 "smells", "react", "dupes"]
    order_map = {d: i for i, d in enumerate(DET_ORDER)}
    sorted_dets = sorted(by_det.items(), key=lambda x: order_map.get(x[0], 99))

    print(c("  " + "─" * 50, "dim"))
    bar_len = 15
    for det, ds in sorted_dets:
        total = ds["total"]
        open_count = ds["open"]
        addressed = total - open_count
        pct = round(addressed / total * 100) if total else 100

        filled = round(pct / 100 * bar_len)
        if pct == 100:
            bar = c("█" * bar_len, "green")
        elif open_count <= 2:
            bar = c("█" * filled, "green") + c("░" * (bar_len - filled), "dim")
        else:
            bar = c("█" * filled, "yellow") + c("░" * (bar_len - filled), "dim")

        det_label = det.replace("_", " ").ljust(12)
        if open_count > 0:
            open_str = c(f"{open_count:3d} open", "yellow")
        else:
            open_str = c("  ✓", "green")

        print(f"  {det_label} {bar} {pct:3d}%  {open_str}  {c(f'/ {total}', 'dim')}")

    print()


def _suggest_next_action(by_tier: dict) -> str | None:
    """Suggest the highest-value next command based on tier breakdown."""
    t1 = by_tier.get("1", {})
    t2 = by_tier.get("2", {})
    t1_open = t1.get("open", 0)
    t2_open = t2.get("open", 0)

    if t1_open > 0:
        return f"`decruftify fix debug-logs --dry-run` or `fix unused-imports --dry-run` ({t1_open} T1 items)"
    if t2_open > 0:
        return (f"`decruftify fix unused-vars --dry-run` or `fix unused-params --dry-run` "
                f"or `fix dead-useeffect --dry-run` ({t2_open} T2 items)")

    t3_open = by_tier.get("3", {}).get("open", 0)
    t4_open = by_tier.get("4", {}).get("open", 0)
    structural_open = t3_open + t4_open
    if structural_open > 0:
        return (f"{structural_open} structural items open (T3: {t3_open}, T4: {t4_open}). "
                f"Run `decruftify show structural --status open` to review by area, "
                f"then create per-area task docs in tasks/ for sub-agent decomposition.")

    t3_debt = by_tier.get("3", {}).get("wontfix", 0)
    t4_debt = by_tier.get("4", {}).get("wontfix", 0)
    structural_debt = t3_debt + t4_debt
    if structural_debt > 0:
        return (f"{structural_debt} structural items remain as debt (T3: {t3_debt}, T4: {t4_debt}). "
                f"Run `decruftify status` for area breakdown. "
                f"Create per-area task docs and farm to sub-agents for decomposition.")

    return None
