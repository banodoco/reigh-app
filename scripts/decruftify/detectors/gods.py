"""God component detection (excessive hooks = too many responsibilities)."""

import json
import re
from pathlib import Path

from ..utils import PROJECT_ROOT, c, find_tsx_files, print_table, rel


def detect_god_components(path: Path) -> list[dict]:
    """Find components that do too many things: multiple contexts, many effects, mixed concerns."""
    entries = []
    for filepath in find_tsx_files(path):
        try:
            p = Path(filepath) if Path(filepath).is_absolute() else PROJECT_ROOT / filepath
            content = p.read_text()
            lines = content.splitlines()
            loc = len(lines)
            if loc < 100:
                continue

            context_hooks = len(re.findall(r"use\w+Context\s*\(", content))
            use_effects = len(re.findall(r"useEffect\s*\(", content))
            use_states = len(re.findall(r"useState\s*[<(]", content))
            use_refs = len(re.findall(r"useRef\s*[<(]", content))
            custom_hooks = len(re.findall(r"use[A-Z]\w+\s*\(", content))

            # God component: lots of hooks = lots of responsibilities
            hook_total = context_hooks + use_effects + use_states + use_refs
            reasons = []
            if context_hooks >= 3:
                reasons.append(f"{context_hooks} context hooks")
            if use_effects >= 4:
                reasons.append(f"{use_effects} useEffects")
            if use_states >= 5:
                reasons.append(f"{use_states} useStates")
            if custom_hooks >= 8:
                reasons.append(f"{custom_hooks} custom hooks")
            if hook_total >= 10:
                reasons.append(f"{hook_total} total hooks")

            if len(reasons) >= 2 or hook_total >= 15:
                entries.append({
                    "file": filepath, "loc": loc,
                    "context_hooks": context_hooks, "use_effects": use_effects,
                    "use_states": use_states, "custom_hooks": custom_hooks,
                    "hook_total": hook_total,
                    "reasons": reasons,
                })
        except (OSError, UnicodeDecodeError):
            continue
    return sorted(entries, key=lambda e: -e["hook_total"])


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
        rows.append([rel(e["file"]), str(e["loc"]), str(e["hook_total"]), reasons])
    print_table(["File", "LOC", "Hooks", "Why"], rows, [55, 5, 6, 45])
