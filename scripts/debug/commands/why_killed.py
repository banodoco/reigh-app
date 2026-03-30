"""Why-killed command — diagnose why a worker was killed by the orchestrator."""

from datetime import datetime, timezone, timedelta
from debug.client import DebugClient


def run(client: DebugClient, worker_id: str, options: dict):
    """Handle 'debug.py why-killed <worker_id>' command."""
    try:
        # 1. Find the kill event in system_logs
        kill_result = client.supabase.table('system_logs').select(
            'id, timestamp, message, metadata'
        ).eq(
            'source_type', 'orchestrator_gpu'
        ).ilike(
            'message', '%MARKING AS ERROR%'
        ).ilike(
            'message', f'%{worker_id}%'
        ).order('timestamp', desc=True).limit(1).execute()

        kill_log = (kill_result.data or [None])[0]

        # 2. If no kill log found, check worker status directly
        if not kill_log:
            worker_result = client.supabase.table('workers').select(
                'id, status, last_heartbeat, metadata, created_at'
            ).eq('id', worker_id).execute()

            worker = (worker_result.data or [None])[0]

            print("=" * 80)
            print(f"WHY KILLED: {worker_id}")
            print("=" * 80)

            if not worker:
                print(f"\n  Worker not found in database.")
                return

            if worker.get('status') in ('terminated', 'error'):
                print(f"\n  Worker status: {worker['status']}")
                print(f"  Created:       {_fmt_ts(worker.get('created_at'))}")
                print(f"  Last heartbeat: {_fmt_ts(worker.get('last_heartbeat'))}")
                metadata = worker.get('metadata') or {}
                if metadata.get('error'):
                    print(f"  Error:         {metadata['error']}")
                print("\n  No orchestrator kill event found in system_logs.")
                print("  The worker may have been terminated by another mechanism.")
            else:
                print(f"\n  Worker status: {worker['status']}")
                print("  No kill event found. Worker may still be alive or was cleaned up externally.")

            return

        # 3. Parse kill event details
        kill_ts_str = kill_log.get('timestamp', '')
        kill_message = kill_log.get('message', '')
        kill_metadata = kill_log.get('metadata') or {}

        kill_dt = _parse_ts(kill_ts_str)

        # Extract reason from metadata or message
        kill_reason = kill_metadata.get('reason', '')
        error_code = kill_metadata.get('error_code', '')

        if not kill_reason:
            # Try to parse reason from message text
            # Typical format: "MARKING AS ERROR worker_id: <reason>"
            colon_idx = kill_message.find(': ', kill_message.find(worker_id))
            if colon_idx >= 0:
                kill_reason = kill_message[colon_idx + 2:].strip()
            else:
                kill_reason = kill_message

        # 4. Get worker's task history
        tasks_result = client.supabase.table('tasks').select(
            'id, task_type, status, created_at, updated_at'
        ).eq('worker_id', worker_id).order('created_at').execute()

        worker_tasks = tasks_result.data or []

        # 5. Get worker logs in the 10 minutes before the kill
        if kill_dt:
            window_start = (kill_dt - timedelta(minutes=10)).isoformat()
            window_end = kill_ts_str
        else:
            window_start = _hours_ago(1)
            window_end = None

        logs_query = client.supabase.table('system_logs').select(
            'id, timestamp, message, log_level, source_type, metadata'
        ).eq('worker_id', worker_id).gte('timestamp', window_start)

        if window_end:
            logs_query = logs_query.lte('timestamp', window_end)

        logs_query = logs_query.order('timestamp').limit(200)
        logs_result = logs_query.execute()
        worker_logs = logs_result.data or []

        # 6. Build the activity timeline
        activity_events = []

        for log in worker_logs:
            msg = log.get('message', '')
            ts = log.get('timestamp', '')
            ts_short = ts[11:19] if len(ts) >= 19 else ts
            meta = log.get('metadata') or {}

            msg_lower = msg.lower()

            if 'claim' in msg_lower and 'task' in msg_lower:
                task_id = meta.get('task_id', '')
                task_type = meta.get('task_type', '')
                if not task_id:
                    task_id = _extract_id_from_msg(msg)
                activity_events.append({
                    'ts': ts,
                    'ts_short': ts_short,
                    'icon': '\U0001f4cb',
                    'label': f"Claimed task {task_id[:8]} ({task_type})" if task_type else f"Claimed task {task_id[:8]}",
                    'type': 'claim',
                })
            elif 'complete' in msg_lower and ('task' in msg_lower or 'generation' in msg_lower):
                task_id = meta.get('task_id', '')
                task_type = meta.get('task_type', '')
                if not task_id:
                    task_id = _extract_id_from_msg(msg)
                activity_events.append({
                    'ts': ts,
                    'ts_short': ts_short,
                    'icon': '\u2705',
                    'label': f"Completed task {task_id[:8]} ({task_type})" if task_type else f"Completed task {task_id[:8]}",
                    'type': 'complete',
                })
            elif 'fail' in msg_lower or 'error' in msg_lower:
                task_id = meta.get('task_id', '')
                activity_events.append({
                    'ts': ts,
                    'ts_short': ts_short,
                    'icon': '\u274c',
                    'label': f"Failed task {task_id[:8]}" if task_id else msg[:60],
                    'type': 'fail',
                })

        # Also build events from tasks table as fallback
        if not activity_events and worker_tasks:
            for t in worker_tasks:
                t_created = t.get('created_at', '')
                t_updated = t.get('updated_at', '')
                t_status = t.get('status', '')
                t_type = t.get('task_type', '')
                t_id = t.get('id', '')

                activity_events.append({
                    'ts': t_created,
                    'ts_short': t_created[11:19] if len(t_created) >= 19 else t_created,
                    'icon': '\U0001f4cb',
                    'label': f"Claimed task {t_id[:8]} ({t_type})",
                    'type': 'claim',
                })

                if t_status == 'Complete' and t_updated:
                    activity_events.append({
                        'ts': t_updated,
                        'ts_short': t_updated[11:19] if len(t_updated) >= 19 else t_updated,
                        'icon': '\u2705',
                        'label': f"Completed task {t_id[:8]} ({t_type})",
                        'type': 'complete',
                    })
                elif t_status == 'Failed' and t_updated:
                    activity_events.append({
                        'ts': t_updated,
                        'ts_short': t_updated[11:19] if len(t_updated) >= 19 else t_updated,
                        'icon': '\u274c',
                        'label': f"Failed task {t_id[:8]} ({t_type})",
                        'type': 'fail',
                    })

        # Sort events chronologically
        activity_events.sort(key=lambda e: e['ts'])

        # 7. Print diagnostic report
        print("=" * 80)
        print(f"WHY KILLED: {worker_id}")
        print("=" * 80)
        print()
        print(f"  Kill reason: {kill_reason}")
        print(f"  Kill time:   {_fmt_ts(kill_ts_str)}")
        if error_code:
            print(f"  Error code:  {error_code}")
        print()

        # Activity timeline
        print("  \u2500\u2500\u2500 Activity Before Kill \u2500\u2500\u2500")
        print()

        if activity_events:
            for event in activity_events:
                print(f"  [{event['ts_short']}] {event['icon']} {event['label']}")

            # Check for gap between last activity and kill
            last_event = activity_events[-1]
            last_event_dt = _parse_ts(last_event['ts'])
            if last_event_dt and kill_dt:
                gap = (kill_dt - last_event_dt).total_seconds()
                if gap > 30:
                    print(f"  ... no more activity ...")
        else:
            print("  (no activity events found)")

        # Add the kill event itself
        kill_ts_short = kill_ts_str[11:19] if len(kill_ts_str) >= 19 else kill_ts_str
        print(f"  [{kill_ts_short}] \U0001f480 KILLED")
        print()

        # 8. Diagnosis section
        print("  \u2500\u2500\u2500 Diagnosis \u2500\u2500\u2500")
        print()

        # Find last completion time
        last_completion = None
        for event in reversed(activity_events):
            if event['type'] == 'complete':
                last_completion = event
                break

        any_claims = any(e['type'] == 'claim' for e in activity_events)

        if last_completion and kill_dt:
            last_complete_dt = _parse_ts(last_completion['ts'])
            if last_complete_dt:
                idle_seconds = (kill_dt - last_complete_dt).total_seconds()
                idle_str = _format_duration(idle_seconds)

                # Parse effective_age_sec from kill reason (e.g. "...idle with queued tasks (1181s)")
                import re
                age_match = re.search(r'\((\d+)s\)', kill_reason or '')
                reported_age = int(age_match.group(1)) if age_match else None

                # The key diagnostic: does the reported age (total worker age) diverge
                # significantly from the actual idle time? If so, the orchestrator used
                # the wrong metric.
                if reported_age and reported_age > idle_seconds * 1.5:
                    print(f"  \u26a0\ufe0f  SUSPICIOUS: Kill used total worker age ({reported_age}s) but actual")
                    print(f"     idle time was only {idle_str}. The worker was productive recently.")
                    print(f"     This suggests the timeout compared total age, not idle duration.")
                elif idle_seconds < 300:
                    print(f"  \u26a0\ufe0f  SUSPICIOUS: Worker completed a task only {idle_str} before being killed.")
                elif idle_seconds >= 600:
                    print(f"  \u2705 EXPECTED: Worker was genuinely idle for {idle_str} before kill.")
                else:
                    print(f"  \u2139\ufe0f  BORDERLINE: Worker idle for {idle_str} before kill.")

                print()
                print(f"  Last task completion: {last_completion['ts_short']} ({idle_str} before kill)")
                if reported_age:
                    print(f"  Reported age in kill reason: {reported_age}s")
                    print(f"  Actual idle time: {idle_seconds:.0f}s")

        elif not any_claims:
            print(f"  \u2705 EXPECTED: Worker never became productive.")
            print(f"     No task claims were found for this worker.")

        elif not last_completion:
            # Had claims but no completions
            last_claim = None
            for event in reversed(activity_events):
                if event['type'] == 'claim':
                    last_claim = event
                    break

            if last_claim and kill_dt:
                last_claim_dt = _parse_ts(last_claim['ts'])
                if last_claim_dt:
                    gap_seconds = (kill_dt - last_claim_dt).total_seconds()
                    gap_str = _format_duration(gap_seconds)
                    print(f"  \u2139\ufe0f  Worker claimed tasks but never completed any.")
                    print(f"     Last claim was {gap_str} before the kill.")
            else:
                print(f"  \u2139\ufe0f  Worker claimed tasks but never completed any.")

        print()

    except Exception as e:
        print(f"Error analyzing kill: {e}")
        if options.get('debug'):
            import traceback
            traceback.print_exc()


def _hours_ago(hours: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()


def _parse_ts(ts_str: str):
    """Parse an ISO timestamp string to a datetime object."""
    if not ts_str:
        return None
    try:
        return datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
    except (ValueError, TypeError):
        return None


def _fmt_ts(ts_str: str) -> str:
    """Format a timestamp for display (YYYY-MM-DD HH:MM:SS)."""
    if not ts_str:
        return 'unknown'
    return ts_str[:19].replace('T', ' ')


def _format_duration(seconds: float) -> str:
    """Format seconds into a human-readable duration like '3m 26s'."""
    if seconds < 60:
        return f"{seconds:.0f}s"
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    if minutes < 60:
        return f"{minutes}m {secs}s"
    hours = int(minutes // 60)
    mins = minutes % 60
    return f"{hours}h {mins}m {secs}s"


def _extract_id_from_msg(msg: str) -> str:
    """Try to extract a UUID-like ID from a log message."""
    import re
    match = re.search(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', msg, re.IGNORECASE)
    if match:
        return match.group(0)
    return '?'
