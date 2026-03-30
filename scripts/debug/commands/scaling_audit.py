"""Scaling audit command — replay orchestrator decisions and flag contradictions."""

import re
from datetime import datetime, timezone, timedelta

from debug.client import DebugClient


def run(client: DebugClient, options: dict):
    """Handle 'debug.py scaling_audit' command."""
    try:
        hours = int(options.get('hours', 3))
        cutoff = _hours_ago(hours)

        # ── 1. Query orchestrator logs ────────────────────────────────────
        logs_result = client.supabase.table('system_logs').select(
            'id, timestamp, message, worker_id, metadata'
        ).eq(
            'source_type', 'orchestrator_gpu'
        ).gte(
            'timestamp', cutoff
        ).order(
            'timestamp', desc=False
        ).limit(5000).execute()

        logs = logs_result.data or []

        # ── 2. Extract events ─────────────────────────────────────────────
        spawns = {}       # worker_id -> spawn timestamp
        kills = {}        # worker_id -> {timestamp, reason}
        promotions = {}   # worker_id -> promotion timestamp
        total_promoted = 0
        total_failed_in_cycle = 0

        for log in logs:
            msg = log.get('message', '')
            ts = log.get('timestamp', '')
            wid = log.get('worker_id')
            meta = log.get('metadata') or {}

            # Worker spawns: "Creating worker: {worker_id}"
            spawn_match = re.search(r'Creating worker:\s*(\S+)', msg)
            if spawn_match:
                spawn_id = spawn_match.group(1)
                spawns[spawn_id] = ts

            # Worker kills: "MARKING AS ERROR: {reason}"
            kill_match = re.search(r'MARKING AS ERROR:\s*(.+)', msg)
            if kill_match and wid:
                kills[wid] = {
                    'timestamp': ts,
                    'reason': kill_match.group(1).strip(),
                }

            # Cycle summaries with promotion/failure counts
            if 'workers_promoted' in meta:
                count = meta.get('workers_promoted', 0)
                if isinstance(count, (int, float)) and count > 0:
                    total_promoted += int(count)

            if 'workers_failed' in meta:
                count = meta.get('workers_failed', 0)
                if isinstance(count, (int, float)) and count > 0:
                    total_failed_in_cycle += int(count)

            # Try to detect per-worker promotion from logs
            if wid and ('promoted' in msg.lower() or 'gpu_ready' in msg.lower()):
                if wid not in promotions:
                    promotions[wid] = ts

        # ── 3. Query completed/failed tasks in window ─────────────────────
        tasks_result = client.supabase.table('tasks').select(
            'id, worker_id, status, updated_at, created_at'
        ).in_(
            'status', ['Complete', 'Failed']
        ).gte(
            'created_at', cutoff
        ).limit(5000).execute()

        tasks = tasks_result.data or []

        # Build worker -> completed tasks mapping
        worker_tasks = {}  # worker_id -> list of {updated_at, status}
        for t in tasks:
            wid = t.get('worker_id')
            if not wid:
                continue
            if wid not in worker_tasks:
                worker_tasks[wid] = []
            worker_tasks[wid].append({
                'updated_at': t.get('updated_at') or t.get('created_at'),
                'status': t.get('status'),
            })

        # ── 3b. Supplement with workers table (catches workers missed by log parsing) ──
        workers_result = client.supabase.table('workers').select(
            'id, status, created_at, metadata'
        ).gte('created_at', cutoff).order('created_at').limit(100).execute()

        for w in (workers_result.data or []):
            wid = w['id']
            if wid not in spawns:
                spawns[wid] = w.get('created_at', '')
            if w.get('status') in ('error', 'terminated'):
                meta = w.get('metadata') or {}
                if wid not in kills:
                    kills[wid] = {
                        'timestamp': w.get('created_at', ''),
                        'reason': meta.get('termination_reason', meta.get('error', f"status={w['status']}")),
                    }

        # ── 4. Analyze each worker ────────────────────────────────────────
        all_worker_ids = set(spawns.keys()) | set(kills.keys()) | set(promotions.keys()) | set(worker_tasks.keys())

        issues = []       # (severity, worker_id, details)
        healthy = []      # (worker_id, details)

        productive_kills = 0
        wasted_spawns = 0

        for wid in sorted(all_worker_ids):
            was_killed = wid in kills
            was_spawned = wid in spawns
            was_promoted = wid in promotions
            completed = [
                t for t in worker_tasks.get(wid, [])
                if t['status'] in ('Complete', 'Completed')
            ]
            task_count = len(completed)

            if was_killed:
                kill_info = kills[wid]
                kill_ts = _parse_ts(kill_info['timestamp'])
                reason = kill_info['reason']

                # Check if worker completed tasks within 5 min of kill
                recent_completions = []
                if kill_ts and completed:
                    for t in completed:
                        t_ts = _parse_ts(t['updated_at'])
                        if t_ts and kill_ts:
                            delta = (kill_ts - t_ts).total_seconds()
                            if 0 <= delta <= 300:  # within 5 min before kill
                                recent_completions.append((t_ts, delta))

                if recent_completions:
                    # PRODUCTIVE WORKER KILLED
                    recent_completions.sort(key=lambda x: x[1])
                    last_ts, last_delta = recent_completions[0]
                    productive_kills += 1
                    issues.append(('red', wid, {
                        'type': 'PRODUCTIVE WORKER KILLED',
                        'reason': reason,
                        'kill_time': _fmt_time(kill_ts),
                        'last_task_time': _fmt_time(last_ts),
                        'last_task_delta': _fmt_duration(last_delta),
                        'tasks_before_kill': task_count,
                    }))

                elif 'Spawning timeout' in reason or 'spawn' in reason.lower():
                    # Never initialized
                    wasted_spawns += 1
                    issues.append(('yellow', wid, {
                        'type': 'WORKER NEVER INITIALIZED',
                        'reason': reason,
                    }))

                elif '1800' in reason or 'startup' in reason.lower():
                    # Startup timeout
                    wasted_spawns += 1
                    issues.append(('yellow', wid, {
                        'type': 'STARTUP TIMEOUT',
                        'reason': reason,
                    }))

                elif task_count == 0 and not was_promoted:
                    # Killed before doing anything useful
                    wasted_spawns += 1
                    issues.append(('yellow', wid, {
                        'type': 'WORKER NEVER INITIALIZED',
                        'reason': reason,
                    }))

                else:
                    # Killed but not recently productive — healthy lifecycle
                    healthy.append((wid, {
                        'promoted_at': _fmt_time(_parse_ts(promotions.get(wid, ''))) if wid in promotions else None,
                        'tasks_completed': task_count,
                    }))
            else:
                # Still alive or unknown
                healthy.append((wid, {
                    'promoted_at': _fmt_time(_parse_ts(promotions.get(wid, ''))) if wid in promotions else None,
                    'tasks_completed': task_count,
                    'alive': True,
                }))

        still_alive = len([h for h in healthy if h[1].get('alive')])

        # ── 5. Print report ───────────────────────────────────────────────
        print("=" * 80)
        print(f"SCALING AUDIT (last {hours} hours)")
        print("=" * 80)

        print(f"""
  Summary:
    Workers spawned:    {len(spawns)}
    Workers promoted:   {total_promoted or len(promotions)}
    Workers killed:     {len(kills)}
    Workers still alive: {still_alive}
""")

        if issues:
            print("  " + "\u2500" * 3 + " Issues Found " + "\u2500" * 3)
            print()
            for severity, wid, details in issues:
                issue_type = details['type']
                if severity == 'red':
                    symbol = "\U0001f534"
                    print(f"  {symbol} {issue_type}")
                    print(f"     Worker: {wid}")
                    print(f"     Kill reason: {details['reason']}")
                    print(f"     Kill time: {details['kill_time']}")
                    print(f"     Last task completed: {details['last_task_time']} ({details['last_task_delta']} before kill)")
                    print(f"     Tasks completed before kill: {details['tasks_before_kill']}")
                    if details.get('last_task_delta'):
                        # Parse seconds from delta for advice
                        print(f"     \u2192 Worker was actively productive. Kill was premature.")
                elif severity == 'yellow':
                    symbol = "\U0001f7e1"
                    print(f"  {symbol} {issue_type}")
                    print(f"     Worker: {wid}")
                    print(f"     Kill reason: {details['reason']}")
                    print(f"     \u2192 Worker failed to start within timeout.")
                print()

        if healthy:
            print("  " + "\u2500" * 3 + " Healthy Workers " + "\u2500" * 3)
            print()
            for wid, details in healthy:
                alive_tag = " (still running)" if details.get('alive') else ""
                promoted = f"Promoted at {details['promoted_at']}, " if details.get('promoted_at') else ""
                task_count = details.get('tasks_completed', 0)
                print(f"  \u2705 {wid}{alive_tag}")
                print(f"     {promoted}completed {task_count} tasks, no issues")
            print()

        # Churn rate
        total_spawned = len(spawns) or 1
        normal_lifecycle = len(healthy)
        utilization = int((normal_lifecycle / total_spawned) * 100) if total_spawned else 0

        print("  " + "\u2500" * 3 + " Churn Rate " + "\u2500" * 3)
        print()
        print(f"  Workers spawned: {len(spawns)} | Productive kills: {productive_kills} | Wasted spawns: {wasted_spawns}")
        print(f"  Effective utilization: {utilization}% ({normal_lifecycle} of {len(spawns)} workers completed their lifecycle normally)")
        print()

    except Exception as e:
        print(f"Error running scaling audit: {e}")
        if options.get('debug'):
            import traceback
            traceback.print_exc()


def _hours_ago(hours: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()


def _parse_ts(ts_str: str) -> datetime | None:
    if not ts_str:
        return None
    try:
        return datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
    except (ValueError, TypeError):
        return None


def _fmt_time(dt: datetime | None) -> str | None:
    if not dt:
        return None
    return dt.strftime('%H:%M:%S')


def _fmt_duration(seconds: float) -> str:
    seconds = int(seconds)
    if seconds < 60:
        return f"{seconds}s"
    minutes = seconds // 60
    secs = seconds % 60
    if secs:
        return f"{minutes}m {secs}s"
    return f"{minutes}m"
