"""Queue status command — show current queue depth, stuck tasks, worker capacity."""

from debug.client import DebugClient


def run(client: DebugClient, options: dict):
    """Handle 'debug.py queue' command."""
    try:
        fmt = options.get('format', 'text')

        # Queued tasks
        queued_result = client.supabase.table('tasks').select(
            'id, task_type, status, created_at, params'
        ).eq('status', 'Queued').order('created_at').limit(100).execute()
        queued = queued_result.data or []

        # In Progress tasks
        active_result = client.supabase.table('tasks').select(
            'id, task_type, status, worker_id, generation_started_at'
        ).eq('status', 'In Progress').order('generation_started_at').limit(100).execute()
        active = active_result.data or []

        # Active workers
        workers_result = client.supabase.table('workers').select(
            'id, status'
        ).eq('status', 'active').execute()
        active_workers = len(workers_result.data or [])

        if fmt == 'json':
            import json
            print(json.dumps({
                'queued': queued,
                'active': active,
                'active_workers': active_workers,
            }, indent=2, default=str))
            return

        print("=" * 80)
        print("QUEUE STATUS")
        print("=" * 80)

        print(f"\n  Queued: {len(queued)} | In Progress: {len(active)} | Active Workers: {active_workers}")

        if queued:
            # Group by type
            by_type = {}
            for t in queued:
                tt = t['task_type']
                by_type[tt] = by_type.get(tt, 0) + 1
            print(f"\n  Queued by type:")
            for tt, count in sorted(by_type.items(), key=lambda x: -x[1]):
                print(f"    {tt}: {count}")

            # Oldest queued
            oldest = queued[0]
            from datetime import datetime, timezone
            try:
                created = datetime.fromisoformat(oldest['created_at'].replace('Z', '+00:00'))
                age = (datetime.now(timezone.utc) - created).total_seconds()
                print(f"\n  Oldest queued: {oldest['id'][:16]}... ({oldest['task_type']}) — waiting {age:.0f}s")
            except (ValueError, TypeError):
                pass

        if active:
            # Check for stuck tasks (In Progress > 10 min)
            from datetime import datetime, timezone
            stuck = []
            for t in active:
                if t.get('generation_started_at'):
                    try:
                        started = datetime.fromisoformat(t['generation_started_at'].replace('Z', '+00:00'))
                        age = (datetime.now(timezone.utc) - started).total_seconds()
                        if age > 600:  # 10 min
                            stuck.append((t, age))
                    except (ValueError, TypeError):
                        pass

            if stuck:
                print(f"\n  ⚠️  Possibly stuck ({len(stuck)} tasks In Progress > 10 min):")
                for t, age in stuck[:5]:
                    worker = (t.get('worker_id') or 'no-worker')[:20]
                    print(f"    {t['id'][:16]}... {t['task_type']:30s} {age:.0f}s  worker={worker}")

        if active_workers > 0 and queued:
            ratio = len(queued) / active_workers
            print(f"\n  Tasks/Worker ratio: {ratio:.1f} (threshold for scale-up: 3)")

        print()

    except Exception as e:
        print(f"Error fetching queue: {e}")
        if options.get('debug'):
            import traceback
            traceback.print_exc()
