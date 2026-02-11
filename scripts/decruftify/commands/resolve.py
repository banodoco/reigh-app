"""resolve and ignore commands: mark findings, manage ignore list."""

import sys

from ..utils import c
from ..cli import _state_path, _write_query


def cmd_resolve(args):
    """Resolve finding(s) matching one or more patterns."""
    from ..state import load_state, save_state, resolve_findings

    if args.status == "wontfix" and not args.note:
        print(c("Error: --note is required for wontfix (explain why).", "red"))
        sys.exit(1)

    sp = _state_path(args)
    state = load_state(sp)
    prev_score = state.get("score", 0)

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
    print(f"\n  Score: {state['score']}/100{delta_str}" +
          c(f"  (strict: {state.get('strict_score', 0)}/100)", "dim"))

    print(c("\n  ── Retro ──", "dim"))
    print(c("  1. Was there a good loop here? Was anything too frictional?", "dim"))
    print(c("  2. Could the process be improved? (batch-resolve, auto-fix, ignore patterns?)", "dim"))
    print(c("  3. Were there related problems nearby we might have missed?", "dim"))
    print(c("  4. Was the scope appropriate? Too narrow (missed nearby issues)? Too broad?", "dim"))
    print()

    _write_query({"command": "resolve", "patterns": args.patterns, "status": args.status,
                  "resolved": all_resolved, "count": len(all_resolved),
                  "score": state["score"], "strict_score": state.get("strict_score", 0),
                  "prev_score": prev_score,
                  "retro": [
                      "Was there a good loop? Anything frictional?",
                      "Process improvements? (batch-resolve, auto-fix, ignore patterns?)",
                      "Related problems nearby we might have missed?",
                      "Was the scope appropriate? Too narrow or too broad?",
                  ]})


def cmd_ignore_pattern(args):
    """Add a pattern to the ignore list."""
    from ..state import load_state, save_state, add_ignore

    sp = _state_path(args)
    state = load_state(sp)
    removed = add_ignore(state, args.pattern)
    save_state(state, sp)

    print(c(f"Added ignore pattern: {args.pattern}", "green"))
    if removed:
        print(f"  Removed {removed} matching findings from state.")
    print(f"  Score: {state['score']}/100" +
          c(f"  (strict: {state.get('strict_score', 0)}/100)", "dim"))
    print()
