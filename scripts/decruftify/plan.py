"""Finding generation (detector → findings), tier assignment, plan output.

Runs all detectors, converts raw results into normalized findings with stable IDs,
assigns tiers, and generates prioritized plans.
"""

from __future__ import annotations

import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

from .utils import c

# ── Tier labels ──────────────────────────────────────────────

TIER_LABELS = {
    1: "Auto-fixable (imports, logs, dead deprecated)",
    2: "Quick fixes (unused vars, dead exports, exact dupes, orphaned files, cross-tool imports)",
    3: "Needs judgment (smells, near-dupes, single-use, small cycles, state sync)",
    4: "Major refactors (structural decomposition, large import cycles)",
}

CONFIDENCE_ORDER = {"high": 0, "medium": 1, "low": 2}


# ── Finding generation ───────────────────────────────────────

def generate_findings(path: Path, *, include_slow: bool = True, lang=None) -> list[dict]:
    """Run all detectors and convert results to normalized findings.

    Dispatches through the LangConfig phase pipeline.
    Auto-detects language when none is specified.
    """
    if lang is None:
        from .lang import get_lang, auto_detect_lang
        from .utils import PROJECT_ROOT
        detected = auto_detect_lang(PROJECT_ROOT)
        lang = get_lang(detected or "typescript")
    return _generate_findings_from_lang(path, lang, include_slow=include_slow)


def _generate_findings_from_lang(path: Path, lang, *, include_slow: bool = True) -> list[dict]:
    """Run detector phases from a LangConfig."""
    stderr = lambda msg: print(c(msg, "dim"), file=sys.stderr)

    phases = lang.phases
    if not include_slow:
        phases = [p for p in phases if not p.slow]

    findings: list[dict] = []
    total = len(phases)
    for i, phase in enumerate(phases):
        stderr(f"  [{i+1}/{total}] {phase.label}...")
        results = phase.run(path, lang)
        findings += results

    # Stamp language on all findings so state can scope by language
    for f in findings:
        f["lang"] = lang.name

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
