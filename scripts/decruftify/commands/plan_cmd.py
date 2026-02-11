"""plan command: generate prioritized markdown plan from state."""

from pathlib import Path

from ..utils import c
from ..cli import _state_path


def cmd_plan_output(args):
    """Generate a prioritized markdown plan from state."""
    from ..state import load_state
    from ..plan import generate_plan_md

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
