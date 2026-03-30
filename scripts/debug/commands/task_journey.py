"""Task journey command — reconstruct every state transition from system_logs."""

import re
from datetime import datetime, timezone, timedelta

from debug.client import DebugClient


# Patterns that indicate state transitions, checked in order.
# Each tuple: (compiled_regex, state_label, extra_extractor_or_None)
_TRANSITION_PATTERNS = [
    (re.compile(r"Creating task|Task queued", re.IGNORECASE), "Queued", "created"),
    (re.compile(r"Claimed task.*" + r"|" + r"\[CLAIM\]", re.IGNORECASE), "In Progress", None),
    (re.compile(r"status\s*=\s*Complete|COMPLETE", re.IGNORECASE), "Complete", None),
    (re.compile(r"status\s*=\s*Failed|FAILED", re.IGNORECASE), "Failed", None),
    (re.compile(r"requeuing for retry", re.IGNORECASE), "Queued", "retry"),
    (re.compile(r"update_task_status.*Queued", re.IGNORECASE), "Queued", "reset"),
]

_WORKER_RE = re.compile(r"worker[_:\s]*([a-zA-Z0-9_-]+)", re.IGNORECASE)

_STATE_ICONS = {
    "Queued": "\U0001f4cb",       # clipboard
    "In Progress": "\u25b6\ufe0f",  # play
    "Complete": "\u2705",          # check
    "Failed": "\u274c",            # cross
    "Children created": "\u2705",  # check
}


def run(client: DebugClient, task_id: str, options: dict):
    """Handle 'debug.py task_journey <task_id>' command."""
    try:
        _run_inner(client, task_id, options)
    except Exception as e:
        print(f"Error building task journey: {e}")
        if options.get("debug"):
            import traceback
            traceback.print_exc()


def _run_inner(client: DebugClient, task_id: str, options: dict):
    # 1. Current task state
    task_result = (
        client.supabase.table("tasks")
        .select("id, task_type, status, worker_id, created_at, updated_at, params, result_data, dependant_on")
        .eq("id", task_id)
        .limit(1)
        .execute()
    )
    task = (task_result.data or [None])[0]
    if not task:
        print(f"Task {task_id} not found.")
        return

    # 2. Logs — task_id match OR message contains the id
    logs_by_id = (
        client.supabase.table("system_logs")
        .select("id, timestamp, source_type, source_id, log_level, message, task_id, worker_id, metadata")
        .eq("task_id", task_id)
        .order("timestamp")
        .limit(1000)
        .execute()
    )
    logs_by_msg = (
        client.supabase.table("system_logs")
        .select("id, timestamp, source_type, source_id, log_level, message, task_id, worker_id, metadata")
        .ilike("message", f"%{task_id}%")
        .order("timestamp")
        .limit(1000)
        .execute()
    )

    # Merge and deduplicate
    seen_ids = set()
    logs = []
    for log in (logs_by_id.data or []) + (logs_by_msg.data or []):
        lid = log["id"]
        if lid not in seen_ids:
            seen_ids.add(lid)
            logs.append(log)

    logs.sort(key=lambda l: l.get("timestamp", ""))

    # 3. Child tasks
    children_result = (
        client.supabase.table("tasks")
        .select("id, task_type, status, worker_id, created_at, updated_at")
        .eq("params->>orchestrator_task_id_ref", task_id)
        .order("created_at")
        .limit(100)
        .execute()
    )
    children = children_result.data or []

    # 4. Extract state transitions
    transitions = _extract_transitions(logs, task_id, task)

    # Collect unique workers
    workers = set()
    for t in transitions:
        if t.get("worker"):
            workers.add(t["worker"])
    for c in children:
        if c.get("worker_id"):
            workers.add(c["worker_id"])

    # 5. Print
    created_at = task.get("created_at", "")
    created_short = created_at[:19].replace("T", " ") if created_at else "?"

    print("=" * 80)
    print(f"TASK JOURNEY: {task_id}")
    print("=" * 80)
    print()
    print(f"  Type: {task.get('task_type', '?')}")
    print(f"  Current status: {task.get('status', '?')}")
    print(f"  Created: {created_short}")

    # Transitions
    print()
    print("  \u2500\u2500\u2500 State Transitions \u2500\u2500\u2500")
    print()

    if not transitions:
        print("  (no transitions detected in logs)")
    else:
        _print_transitions(transitions)

    # Children
    if children:
        print()
        print("  \u2500\u2500\u2500 Children \u2500\u2500\u2500")
        print()
        for c in children:
            cid = c["id"][:8]
            ctype = (c.get("task_type") or "?")[:30]
            cstatus = (c.get("status") or "?")[:10]
            cworker = (c.get("worker_id") or "")[:30]
            print(f"  {cid}  {ctype:<30s}  {cstatus:<10s}  {cworker}")

    # Summary
    print()
    print(f"  Total transitions: {len(transitions)} | Workers involved: {len(workers)}")

    # Time span
    if created_at:
        final_ts = task.get("updated_at") or created_at
        try:
            t_start = _parse_ts(created_at)
            t_end = _parse_ts(final_ts)
            delta = t_end - t_start
            total_sec = int(delta.total_seconds())
            if total_sec < 60:
                span = f"{total_sec}s"
            elif total_sec < 3600:
                span = f"{total_sec // 60}m {total_sec % 60}s"
            else:
                h = total_sec // 3600
                m = (total_sec % 3600) // 60
                span = f"{h}h {m}m"
            print(f"  Time from creation to final state: {span}")
        except (ValueError, TypeError):
            pass

    print()


def _extract_transitions(logs, task_id, task):
    """Walk logs and extract state transitions."""
    transitions = []

    # Synthetic first transition from task creation
    created_at = task.get("created_at", "")
    if created_at:
        transitions.append({
            "time": created_at,
            "state": "Queued",
            "detail": "created",
            "worker": None,
        })

    for log in logs:
        msg = log.get("message") or ""
        ts = log.get("timestamp", "")
        worker = log.get("worker_id") or ""

        matched = False
        for pattern, state, extra in _TRANSITION_PATTERNS:
            if pattern.search(msg):
                # Try to extract worker from message if not in field
                if not worker:
                    wm = _WORKER_RE.search(msg)
                    if wm:
                        worker = wm.group(1)

                detail = extra or ""

                # For failures, grab a snippet of the message as detail
                if state == "Failed":
                    detail = _failure_snippet(msg)
                elif state == "In Progress" and worker:
                    detail = f"worker: {worker}"
                elif state == "Queued" and extra == "retry":
                    # Try to find attempt number
                    attempt_match = re.search(r"attempt\s*(\d+)\s*/\s*(\d+)", msg, re.IGNORECASE)
                    if attempt_match:
                        detail = f"requeued, attempt {attempt_match.group(1)}/{attempt_match.group(2)}"
                    else:
                        detail = "requeued"
                elif state == "Queued" and extra == "reset":
                    detail = "manual reset"

                transitions.append({
                    "time": ts,
                    "state": state,
                    "detail": detail,
                    "worker": worker or None,
                })
                matched = True
                break

        # Also detect children-created messages
        if not matched:
            children_match = re.search(r"(\d+)\s*segment.*?(\d+)\s*stitch|children\s*created", msg, re.IGNORECASE)
            if children_match:
                transitions.append({
                    "time": ts,
                    "state": "Children created",
                    "detail": msg[:60].strip(),
                    "worker": worker or None,
                })

    return transitions


def _failure_snippet(msg: str) -> str:
    """Extract a reason from a failure log message (up to 120 chars)."""
    max_len = 120
    # Try to grab the tail after a status code or colon
    for pattern in [
        re.compile(r"\d{3}:\s*(.{5,200})"),
        re.compile(r"(?:error|failed|failure)[:\s]+(.{5,200})", re.IGNORECASE),
    ]:
        m = pattern.search(msg)
        if m:
            snippet = m.group(1).strip()
            if len(snippet) > max_len:
                snippet = snippet[:max_len - 3] + "..."
            return snippet
    # Fallback: last 120 chars
    if len(msg) > max_len:
        return msg[-max_len:].strip()
    return msg.strip()


def _print_transitions(transitions):
    """Print transitions with collapse for repeated sequences."""
    i = 0
    while i < len(transitions):
        t = transitions[i]
        time_str = _format_time(t["time"])
        icon = _STATE_ICONS.get(t["state"], " ")
        state_str = t["state"]
        detail = t.get("detail") or ""

        # Check for repeated identical transitions
        repeat_count = 0
        if i + 1 < len(transitions):
            j = i + 1
            while j < len(transitions) and transitions[j]["state"] == t["state"] and transitions[j].get("detail") == detail:
                repeat_count += 1
                j += 1

        if detail:
            print(f"  [{time_str}]  {icon} {state_str:<30s}  {detail}")
        else:
            print(f"  [{time_str}]  {icon} {state_str}")

        # If next 3+ transitions are identical, collapse
        if repeat_count >= 3:
            # Print first of the repeats, then "... (repeated N more times) ...", then last
            next_t = transitions[i + 1]
            next_time = _format_time(next_t["time"])
            next_detail = next_t.get("detail") or ""
            next_icon = _STATE_ICONS.get(next_t["state"], " ")
            if next_detail:
                print(f"  [{next_time}]  {next_icon} {next_t['state']:<30s}  {next_detail}")
            else:
                print(f"  [{next_time}]  {next_icon} {next_t['state']}")
            print(f"  ... (repeated {repeat_count - 1} more times) ...")
            # Print the last one
            last_t = transitions[i + repeat_count]
            last_time = _format_time(last_t["time"])
            last_detail = last_t.get("detail") or ""
            last_icon = _STATE_ICONS.get(last_t["state"], " ")
            if last_detail:
                print(f"  [{last_time}]  {last_icon} {last_t['state']:<30s}  {last_detail}")
            else:
                print(f"  [{last_time}]  {last_icon} {last_t['state']}")
            i += repeat_count + 1
        else:
            i += 1


def _format_time(ts: str) -> str:
    """Extract HH:MM:SS from an ISO timestamp."""
    if not ts:
        return "??:??:??"
    try:
        # Handle both 'T' separator and space
        if "T" in ts:
            time_part = ts.split("T")[1]
        elif " " in ts:
            time_part = ts.split(" ")[1]
        else:
            return ts[:8]
        return time_part[:8]
    except (IndexError, ValueError):
        return ts[:8]


def _parse_ts(ts: str) -> datetime:
    """Parse an ISO timestamp into a datetime."""
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def _hours_ago(hours: int) -> str:
    """Return an ISO timestamp for N hours ago."""
    return (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
