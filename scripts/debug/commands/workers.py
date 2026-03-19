"""Worker status command — show active workers, health, failure counts."""

from debug.client import DebugClient


def run(client: DebugClient, options: dict):
    """Handle 'debug.py workers' command."""
    try:
        fmt = options.get('format', 'text')

        # Active workers
        workers_result = client.supabase.table('workers').select(
            'id, status, current_model, last_heartbeat, metadata'
        ).order('last_heartbeat', desc=True).limit(20).execute()

        workers = workers_result.data or []

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
            print(json.dumps(workers, indent=2, default=str))
            return

        print("=" * 80)
        print("WORKERS")
        print("=" * 80)

        if not workers:
            print("\n  No workers found.")
            return

        for w in workers:
            wid = w['id'][:30]
            status = w.get('status', '?')
            model = (w.get('current_model') or 'none')[:30]
            heartbeat = w.get('last_heartbeat', '')
            metadata = w.get('metadata') or {}
            pod_id = metadata.get('runpod_id', metadata.get('pod_id', ''))
            gpu = metadata.get('gpu_type', '')
            failures = failure_counts.get(w['id'], 0)

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
            print(f"     Status: {status} | Model: {model}")
            if pod_id:
                print(f"     Pod: {pod_id} | GPU: {gpu}")
            print(f"     Heartbeat: {heartbeat[:19] if heartbeat else 'never'}{stale}")
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
