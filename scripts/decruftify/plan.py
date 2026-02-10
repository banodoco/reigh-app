"""Finding generation (detector → findings), tier assignment, plan output.

Runs all detectors, converts raw results into normalized findings with stable IDs,
assigns tiers, and generates prioritized plans.
"""

import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

from .utils import c, log, rel, resolve_path
from .state import make_finding

# ── Tier labels ──────────────────────────────────────────────

TIER_LABELS = {
    1: "Auto-fixable (imports, logs, dead deprecated)",
    2: "Quick fixes (unused vars, dead exports, exact dupes, high-severity smells)",
    3: "Needs judgment (smells, near-dupes, single-use, props)",
    4: "Major refactors (3+ structural signals)",
}

SMELL_TIER_MAP = {
    "high": 2,    # empty_catch, empty_if_chain, dead_useeffect — quick fixes
    "medium": 3,  # any_type, ts_ignore, hardcoded_color, etc — needs judgment
    "low": 3,     # non_null_assert, magic_number — advisory
}

CONFIDENCE_ORDER = {"high": 0, "medium": 1, "low": 2}


# ── Finding generation ───────────────────────────────────────

def generate_findings(path: Path, *, include_slow: bool = True) -> list[dict]:
    """Run all detectors and convert results to normalized findings.

    Args:
        path: Directory to scan.
        include_slow: If False, skip slow detectors (dupes). Default True.
    """
    findings = []
    stderr = lambda msg: print(c(msg, "dim"), file=sys.stderr)

    # 1. Logs — one finding per file+tag
    stderr("  [1/8] Logs...")
    from .detectors.logs import detect_logs
    log_entries = detect_logs(path)
    log_groups: dict[tuple, list] = defaultdict(list)
    for e in log_entries:
        log_groups[(e["file"], e["tag"])].append(e)
    for (file, tag), entries in log_groups.items():
        findings.append(make_finding(
            "logs", file, tag,
            tier=1, confidence="high",
            summary=f"{len(entries)} tagged logs [{tag}]",
            detail={"count": len(entries), "lines": [e["line"] for e in entries[:20]]},
        ))
    stderr(f"         {len(log_entries)} instances → {len(log_groups)} findings")

    # 2. Unused — one finding per file+symbol
    stderr("  [2/8] Unused (tsc)...")
    from .detectors.unused import detect_unused
    unused_entries = detect_unused(path)
    n_before = len(findings)
    for e in unused_entries:
        tier = 1 if e["category"] == "imports" else 2
        findings.append(make_finding(
            "unused", e["file"], e["name"],
            tier=tier, confidence="high",
            summary=f"Unused {e['category']}: {e['name']}",
            detail={"line": e["line"], "category": e["category"]},
        ))
    stderr(f"         {len(unused_entries)} instances → {len(findings) - n_before} findings")

    # 3. Dead exports — one per file+name
    stderr("  [3/8] Dead exports...")
    from .detectors.exports import detect_dead_exports
    export_entries = detect_dead_exports(path)
    n_before = len(findings)
    for e in export_entries:
        findings.append(make_finding(
            "exports", e["file"], e["name"],
            tier=2, confidence="high",
            summary=f"Dead export: {e['name']}",
            detail={"line": e.get("line"), "kind": e.get("kind")},
        ))
    stderr(f"         {len(export_entries)} instances → {len(findings) - n_before} findings")

    # 4. Deprecated — one per file+symbol, suppress properties
    stderr("  [4/8] Deprecated...")
    from .detectors.deprecated import detect_deprecated
    dep_entries = detect_deprecated(path)
    n_before = len(findings)
    for e in dep_entries:
        if e["kind"] == "property":
            continue  # suppress — migration task, not cleanup
        tier = 1 if e["importers"] == 0 else 3
        findings.append(make_finding(
            "deprecated", e["file"], e["symbol"],
            tier=tier, confidence="high",
            summary=f"Deprecated: {e['symbol']} ({e['importers']} importers)"
                    + (" → safe to delete" if e["importers"] == 0 else ""),
            detail={"importers": e["importers"], "line": e["line"]},
        ))
    stderr(f"         {len(dep_entries)} instances → {len(findings) - n_before} findings (properties suppressed)")

    # 5. Structural: synthesize large + complexity + gods + concerns into one finding per file
    #    Props stays separate (it's per-interface, not per-file)
    stderr("  [5/8] Structural analysis...")
    from .detectors.large import detect_large_files
    from .detectors.complexity import detect_complexity
    from .detectors.gods import detect_god_components
    from .detectors.concerns import detect_mixed_concerns
    from .detectors.props import detect_prop_interface_bloat
    n_before = len(findings)

    # Collect all structural signals per file
    structural: dict[str, dict] = {}
    for e in detect_large_files(path):
        f = resolve_path(e["file"])
        structural.setdefault(f, {"signals": [], "detail": {}})
        structural[f]["signals"].append(f"large ({e['loc']} LOC)")
        structural[f]["detail"]["loc"] = e["loc"]
        structural[f]["detail"]["imports"] = e["imports"]
        structural[f]["detail"]["functions"] = e["functions"]

    for e in detect_complexity(path):
        f = resolve_path(e["file"])
        structural.setdefault(f, {"signals": [], "detail": {}})
        structural[f]["signals"].append(f"complexity score {e['score']}")
        structural[f]["detail"]["complexity_score"] = e["score"]
        structural[f]["detail"]["complexity_signals"] = e["signals"]

    for e in detect_god_components(path):
        f = resolve_path(e["file"])
        structural.setdefault(f, {"signals": [], "detail": {}})
        structural[f]["signals"].append(f"{e['hook_total']} hooks ({', '.join(e['reasons'][:2])})")
        structural[f]["detail"]["hook_total"] = e["hook_total"]
        structural[f]["detail"]["hook_reasons"] = e["reasons"]

    for e in detect_mixed_concerns(path):
        f = resolve_path(e["file"])
        structural.setdefault(f, {"signals": [], "detail": {}})
        structural[f]["signals"].append(f"mixed: {', '.join(e['concerns'][:3])}")
        structural[f]["detail"]["concerns"] = e["concerns"]

    # Emit one finding per file with all signals synthesized
    for filepath, data in structural.items():
        signal_count = len(data["signals"])
        tier = 4 if signal_count >= 3 else (3 if signal_count >= 2 else 3)
        confidence = "high" if signal_count >= 3 else "medium"
        summary = "Needs decomposition: " + " · ".join(data["signals"])
        findings.append(make_finding(
            "structural", filepath, "",
            tier=tier, confidence=confidence,
            summary=summary,
            detail=data["detail"],
        ))

    # Props: still per-interface (different kind of finding)
    for e in detect_prop_interface_bloat(path):
        findings.append(make_finding(
            "props", e["file"], e["interface"],
            tier=3, confidence="medium",
            summary=f"Bloated props: {e['interface']} ({e['prop_count']} props)",
            detail={"prop_count": e["prop_count"], "line": e["line"]},
        ))
    stderr(f"         → {len(findings) - n_before} structural findings")

    # 6. Single-use — suppress 50-200 LOC (good architecture)
    stderr("  [6/8] Single-use abstractions...")
    from .detectors.single_use import detect_single_use_abstractions
    from .detectors.deps import build_dep_graph
    graph = build_dep_graph(path)
    single_entries = detect_single_use_abstractions(path, graph)
    n_before = len(findings)
    for e in single_entries:
        if 50 <= e["loc"] <= 200:
            continue  # good architecture pattern
        findings.append(make_finding(
            "single_use", e["file"], "",
            tier=3, confidence="medium",
            summary=f"Single-use ({e['loc']} LOC): only imported by {e['sole_importer']}",
            detail={"loc": e["loc"], "sole_importer": e["sole_importer"]},
        ))
    suppressed = len(single_entries) - (len(findings) - n_before)
    stderr(f"         {len(single_entries)} found, {suppressed} suppressed (50-200 LOC)")

    # 7. Code smells — one per file+smell_id
    stderr("  [7/8] Code smells...")
    from .detectors.smells import detect_smells
    smell_entries = detect_smells(path)
    n_before = len(findings)
    for e in smell_entries:
        by_file: dict[str, list] = defaultdict(list)
        for m in e["matches"]:
            by_file[m["file"]].append(m)
        for file, matches in by_file.items():
            conf = "medium" if e["severity"] != "low" else "low"
            tier = SMELL_TIER_MAP.get(e["severity"], 3)
            findings.append(make_finding(
                "smells", file, e["id"],
                tier=tier, confidence=conf,
                summary=f"{len(matches)}x {e['label']}",
                detail={"smell_id": e["id"], "severity": e["severity"],
                        "count": len(matches),
                        "lines": [m["line"] for m in matches[:10]]},
            ))
    stderr(f"         → {len(findings) - n_before} smell findings")

    # 8. Duplicates — suppress <8 LOC (optional, slow)
    if include_slow:
        stderr("  [8/8] Duplicates (may take a moment)...")
        from .detectors.dupes import detect_duplicates
        dupe_entries = detect_duplicates(path)
        n_before = len(findings)
        for e in dupe_entries:
            a, b = e["fn_a"], e["fn_b"]
            if a["loc"] < 8 and b["loc"] < 8:
                continue  # too small to extract
            # Sort pair for stable ID
            pair = sorted([(a["file"], a["name"]), (b["file"], b["name"])])
            name = f"{pair[0][1]}::{rel(pair[1][0])}::{pair[1][1]}"
            tier = 2 if e["kind"] == "exact" else 3
            conf = "high" if e["kind"] == "exact" else "medium"
            findings.append(make_finding(
                "dupes", pair[0][0], name,
                tier=tier, confidence=conf,
                summary=f"{'Exact' if e['kind'] == 'exact' else 'Near'} dupe: "
                        f"{a['name']} ({rel(a['file'])}:{a['line']}) ↔ "
                        f"{b['name']} ({rel(b['file'])}:{b['line']}) [{e['similarity']:.0%}]",
                detail={"fn_a": a, "fn_b": b,
                        "similarity": e["similarity"], "kind": e["kind"]},
            ))
        suppressed = sum(1 for e in dupe_entries
                         if e["fn_a"]["loc"] < 8 and e["fn_b"]["loc"] < 8)
        stderr(f"         {len(dupe_entries)} pairs, {suppressed} suppressed (<8 LOC)")
    else:
        stderr("  [8/8] Duplicates... skipped (use --full)")

    stderr(f"\n  Total: {len(findings)} findings")
    return findings


# ── Plan generation ──────────────────────────────────────────

def generate_plan_md(state: dict) -> str:
    """Generate a prioritized markdown plan from state."""
    findings = state["findings"]
    score = state.get("score", 0)
    stats = state.get("stats", {})

    lines = [
        f"# Decruftify Plan — {date.today().isoformat()}",
        "",
        f"**Score: {score}/100** | "
        f"{stats.get('open', 0)} open | "
        f"{stats.get('fixed', 0)} fixed | "
        f"{stats.get('wontfix', 0)} wontfix | "
        f"{stats.get('auto_resolved', 0)} auto-resolved",
        "",
    ]

    # Tier breakdown
    by_tier = stats.get("by_tier", {})
    for tier_num in [1, 2, 3, 4]:
        ts = by_tier.get(str(tier_num), {})
        t_open = ts.get("open", 0)
        t_total = sum(ts.values())
        t_addressed = t_total - t_open
        pct = round(t_addressed / t_total * 100) if t_total else 100
        label = TIER_LABELS.get(tier_num, f"Tier {tier_num}")
        lines.append(f"- **Tier {tier_num}** ({label}): {t_open} open / {t_total} total ({pct}% addressed)")
    lines.append("")

    # Group open findings by tier, then by file
    open_findings = [f for f in findings.values() if f["status"] == "open"]
    by_tier_file: dict[int, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    for f in open_findings:
        by_tier_file[f["tier"]][f["file"]].append(f)

    for tier_num in [1, 2, 3, 4]:
        tier_files = by_tier_file.get(tier_num, {})
        if not tier_files:
            continue
        label = TIER_LABELS.get(tier_num, f"Tier {tier_num}")
        tier_count = sum(len(fs) for fs in tier_files.values())
        lines.extend([
            "---",
            f"## Tier {tier_num}: {label} ({tier_count} open)",
            "",
        ])

        # Sort files by finding count (most findings first)
        sorted_files = sorted(tier_files.items(), key=lambda x: -len(x[1]))
        for filepath, file_findings in sorted_files:
            # Sort findings within file: high confidence first
            file_findings.sort(key=lambda f: (CONFIDENCE_ORDER.get(f["confidence"], 9), f["id"]))
            lines.append(f"### `{filepath}` ({len(file_findings)} findings)")
            lines.append("")
            for f in file_findings:
                conf_badge = f"[{f['confidence']}]"
                lines.append(f"- [ ] {conf_badge} {f['summary']}")
                lines.append(f"      `{f['id']}`")
            lines.append("")

    # Addressed findings summary
    addressed = [f for f in findings.values() if f["status"] != "open"]
    if addressed:
        by_status: dict[str, int] = defaultdict(int)
        for f in addressed:
            by_status[f["status"]] += 1
        lines.extend([
            "---",
            "## Addressed",
            "",
        ])
        for status, count in sorted(by_status.items()):
            lines.append(f"- **{status}**: {count}")

        # Show wontfix items with their reasons
        wontfix = [f for f in addressed if f["status"] == "wontfix" and f.get("note")]
        if wontfix:
            lines.extend(["", "### Wontfix (with explanations)", ""])
            for f in wontfix[:30]:
                lines.append(f"- `{f['id']}` — {f['note']}")
        lines.append("")

    return "\n".join(lines)


# ── Next item selection ──────────────────────────────────────

def get_next_item(state: dict, tier: int | None = None) -> dict | None:
    """Get the highest-priority open finding."""
    items = get_next_items(state, tier, 1)
    return items[0] if items else None


def get_next_items(state: dict, tier: int | None = None, count: int = 1) -> list[dict]:
    """Get the N highest-priority open findings.

    Priority: tier (ascending) → confidence (high first) → detail count.
    """
    open_findings = [f for f in state["findings"].values() if f["status"] == "open"]
    if tier is not None:
        open_findings = [f for f in open_findings if f["tier"] == tier]
    if not open_findings:
        return []

    open_findings.sort(key=lambda f: (
        f["tier"],
        CONFIDENCE_ORDER.get(f["confidence"], 9),
        -f.get("detail", {}).get("count", 0),
        f["id"],
    ))
    return open_findings[:count]
