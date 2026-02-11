"""God class/component detection via configurable rule-based analysis."""

import json
from pathlib import Path

from ..utils import c, print_table, rel


def detect_gods(classes, rules, min_reasons: int = 2) -> list[dict]:
    """Find god classes/components — entities with too many responsibilities.

    Args:
        classes: list of ClassInfo objects (from extractors).
        rules: list of GodRule objects defining thresholds.
        min_reasons: minimum rule violations to flag as god.

    Returns list of dicts with file, name, loc, reasons, signal_text, detail.
    """
    entries = []
    for cls in classes:
        reasons = []
        for rule in rules:
            value = rule.extract(cls)
            if value >= rule.threshold:
                reasons.append(f"{value} {rule.description}")

        if len(reasons) >= min_reasons:
            entries.append({
                "file": cls.file,
                "name": cls.name,
                "loc": cls.loc,
                "reasons": reasons,
                "signal_text": f"{cls.name} ({', '.join(reasons[:2])})",
                "detail": {**cls.metrics, "name": cls.name},
            })
    return sorted(entries, key=lambda e: -e["loc"])


# ── Legacy entry point (for detect CLI command) ──────────


def detect_god_components(path: Path) -> list[dict]:
    """Find React god components. Wrapper for backward compatibility."""
    from ..lang.typescript.extractors import extract_ts_components
    from .base import GodRule

    rules = [
        GodRule("context_hooks", "context hooks", lambda c: c.metrics.get("context_hooks", 0), 3),
        GodRule("use_effects", "useEffects", lambda c: c.metrics.get("use_effects", 0), 4),
        GodRule("use_states", "useStates", lambda c: c.metrics.get("use_states", 0), 5),
        GodRule("custom_hooks", "custom hooks", lambda c: c.metrics.get("custom_hooks", 0), 8),
        GodRule("hook_total", "total hooks", lambda c: c.metrics.get("hook_total", 0), 10),
    ]

    classes = extract_ts_components(path)
    gods = detect_gods(classes, rules, min_reasons=2)

    # Also flag if total hooks >= 15 (even with < 2 reasons)
    flagged_files = {e["file"] for e in gods}
    for cls in classes:
        if cls.file in flagged_files:
            continue
        if cls.metrics.get("hook_total", 0) >= 15:
            gods.append({
                "file": cls.file,
                "name": cls.name,
                "loc": cls.loc,
                "reasons": [f"{cls.metrics['hook_total']} total hooks"],
                "signal_text": f"{cls.name} ({cls.metrics['hook_total']} total hooks)",
                "detail": {**cls.metrics, "name": cls.name},
                # Legacy fields for cmd_god_components
                "hook_total": cls.metrics.get("hook_total", 0),
                "context_hooks": cls.metrics.get("context_hooks", 0),
                "use_effects": cls.metrics.get("use_effects", 0),
                "use_states": cls.metrics.get("use_states", 0),
                "custom_hooks": cls.metrics.get("custom_hooks", 0),
            })

    # Add legacy fields to all entries for backward compat
    for e in gods:
        if "hook_total" not in e:
            e["hook_total"] = e["detail"].get("hook_total", 0)
            e["context_hooks"] = e["detail"].get("context_hooks", 0)
            e["use_effects"] = e["detail"].get("use_effects", 0)
            e["use_states"] = e["detail"].get("use_states", 0)
            e["custom_hooks"] = e["detail"].get("custom_hooks", 0)

    return sorted(gods, key=lambda e: -e.get("hook_total", 0))


def cmd_god_components(args):
    entries = detect_god_components(Path(args.path))
    if args.json:
        print(json.dumps({"count": len(entries), "entries": entries}, indent=2))
        return
    if not entries:
        print(c("No god components found.", "green"))
        return
    print(c(f"\nGod components: {len(entries)} files\n", "bold"))
    rows = []
    for e in entries[:args.top]:
        reasons = ", ".join(e["reasons"])
        rows.append([rel(e["file"]), str(e["loc"]), str(e.get("hook_total", 0)), reasons])
    print_table(["File", "LOC", "Hooks", "Why"], rows, [55, 5, 6, 45])
