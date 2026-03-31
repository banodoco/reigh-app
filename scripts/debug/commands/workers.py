"""Worker status command — show active workers, health, failure counts."""

from debug.client import DebugClient


def run(client: DebugClient, options: dict):
    """Handle 'debug.py workers' command."""
    try:
        fmt = options.get('format', 'text')
        show_all = options.get('all', False)

        # Fetch workers — when filtering to active, query by status directly
        if not show_all:
            workers_result = client.supabase.table('workers').select(
                'id, status, current_model, last_heartbeat, metadata, created_at'
            ).in_('status', ['active', 'spawning', 'idle', 'error']).order('created_at', desc=True).limit(20).execute()
        else:
            workers_result = client.supabase.table('workers').select(
                'id, status, current_model, last_heartbeat, metadata, created_at'
            ).order('created_at', desc=True).limit(50).execute()

        workers = workers_result.data or []

        # Show message if no active workers
        if not show_all and not workers:
                print("\n  No active workers. Use --all to see terminated workers.")
                # Show most recently terminated as context
                recent = [w for w in (workers_result.data or []) if w.get('status') == 'terminated'][:3]
                if recent:
                    print(f"  Last {len(recent)} terminated:")
                    for w in recent:
                        print(f"    ⚫ {w['id']} — terminated, heartbeat: {(w.get('last_heartbeat') or 'never')[:19]}")
                print()
                return

        # Get current tasks for active workers
        active_ids = [w['id'] for w in workers if w.get('status') in ('active', 'idle')]
        current_tasks = {}
        if active_ids:
            tasks_result = client.supabase.table('tasks').select(
                'id, task_type, status, worker_id, created_at'
            ).in_('worker_id', active_ids).eq('status', 'In Progress').execute()
            for t in (tasks_result.data or []):
                wid = t.get('worker_id')
                if wid:
                    current_tasks.setdefault(wid, []).append(t)

        # Get last log line per active worker
        last_logs = {}
        for wid_full in active_ids:
            log_result = client.supabase.table('system_logs').select(
                'message, log_level, timestamp'
            ).eq('worker_id', wid_full).order('timestamp', desc=True).limit(1).execute()
            if log_result.data:
                last_logs[wid_full] = log_result.data[0]

        # Recent failure counts per worker (last hour)
        failures_result = client.supabase.table('tasks').select(
            'worker_id, id'
        ).eq('status', 'Failed').gte(
            'created_at',
            _hours_ago(1)
        ).limit(500).execute()

        failure_counts = {}
        for t in (failures_result.data or []):
            wid = t.get('worker_id')
            if wid:
                failure_counts[wid] = failure_counts.get(wid, 0) + 1

        if fmt == 'json':
            import json
            for w in workers:
                w['recent_failures'] = failure_counts.get(w['id'], 0)
                w['current_tasks'] = current_tasks.get(w['id'], [])
            print(json.dumps(workers, indent=2, default=str))
            return

        print("=" * 80)
        label = "ALL WORKERS" if show_all else "ACTIVE WORKERS"
        print(label)
        print("=" * 80)

        if not workers:
            print("\n  No workers found.")
            return

        for w in workers:
            wid = w['id']
            status = w.get('status', '?')
            model = (w.get('current_model') or 'none')[:30]
            heartbeat = w.get('last_heartbeat', '')
            metadata = w.get('metadata') or {}
            pod_id = metadata.get('runpod_id', metadata.get('pod_id', ''))
            gpu = metadata.get('gpu_type', '')
            failures = failure_counts.get(w['id'], 0)

            # Uptime
            uptime = ""
            if w.get('created_at'):
                from datetime import datetime, timezone
                try:
                    created = datetime.fromisoformat(w['created_at'].replace('Z', '+00:00'))
                    age_min = (datetime.now(timezone.utc) - created).total_seconds() / 60
                    uptime = f" | Up: {int(age_min)}m"
                except (ValueError, TypeError):
                    pass

            # Staleness
            stale = ""
            if heartbeat:
                from datetime import datetime, timezone
                try:
                    hb = datetime.fromisoformat(heartbeat.replace('Z', '+00:00'))
                    age = (datetime.now(timezone.utc) - hb).total_seconds()
                    if age > 120:
                        stale = f" ⚠️ STALE ({age:.0f}s ago)"
                    else:
                        stale = f" ({age:.0f}s ago)"
                except (ValueError, TypeError):
                    pass

            symbol = {"active": "🟢", "idle": "🟡", "error": "🔴", "terminated": "⚫"}.get(status, "⚪")
            print(f"\n  {symbol} {wid}")
            print(f"     Status: {status} | Model: {model}{uptime}")
            if pod_id:
                print(f"     Pod: {pod_id} | GPU: {gpu}")
            print(f"     Heartbeat: {heartbeat[:19] if heartbeat else 'never'}{stale}")

            # Current tasks
            tasks = current_tasks.get(w['id'], [])
            if tasks:
                for t in tasks:
                    print(f"     📋 Task: {t['id'][:16]}... ({t['task_type']})")
            elif status == 'active':
                print(f"     📋 No active tasks (idle)")

            # Last log
            log = last_logs.get(w['id'])
            if log:
                msg = (log.get('message') or '')[:120]
                ts = (log.get('timestamp') or '')[:19]
                print(f"     💬 [{ts}] {msg}")

            if failures > 0:
                print(f"     ⚠️  {failures} failures in last hour")

        print()

    except Exception as e:
        print(f"Error fetching workers: {e}")
        if options.get('debug'):
            import traceback
            traceback.print_exc()


def _hours_ago(hours: int) -> str:
    from datetime import datetime, timezone, timedelta
    return (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
