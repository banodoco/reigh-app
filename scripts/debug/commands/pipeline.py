"""Pipeline tracing command — trace orchestrator → children → stitch."""

from debug.client import DebugClient


def run(client: DebugClient, task_id: str, options: dict):
    """Handle 'debug.py pipeline <id>' command."""
    try:
        fmt = options.get('format', 'text')

        # Fetch the root task
        root_result = client.supabase.table('tasks').select(
            'id, task_type, status, error_message, worker_id, created_at, generation_started_at, generation_processed_at, params, output_location'
        ).eq('id', task_id).execute()

        if not root_result.data:
            print(f"Task {task_id} not found")
            return

        root = root_result.data[0]

        # Find children by orchestrator_task_id_ref
        children_result = client.supabase.table('tasks').select(
            'id, task_type, status, error_message, worker_id, created_at, generation_started_at, generation_processed_at, params, output_location'
        ).eq('params->>orchestrator_task_id_ref', task_id).order('created_at').execute()

        children = children_result.data or []

        # If this task IS a child, find the parent and siblings
        orch_ref = (root.get('params') or {}).get('orchestrator_task_id_ref')
        parent = None
        siblings = []
        if orch_ref and orch_ref != task_id:
            parent_result = client.supabase.table('tasks').select(
                'id, task_type, status, error_message, created_at'
            ).eq('id', orch_ref).execute()
            parent = parent_result.data[0] if parent_result.data else None

            siblings_result = client.supabase.table('tasks').select(
                'id, task_type, status, error_message, created_at, generation_started_at, generation_processed_at, params, output_location'
            ).eq('params->>orchestrator_task_id_ref', orch_ref).order('created_at').execute()
            siblings = siblings_result.data or []

        if fmt == 'json':
            import json
            print(json.dumps({
                'root': root,
                'children': children,
                'parent': parent,
                'siblings': siblings,
            }, indent=2, default=str))
            return

        # Text output
        print("=" * 80)
        print(f"PIPELINE TRACE")
        print("=" * 80)

        if parent:
            print(f"\n  Parent: {parent['id'][:20]}... ({parent['task_type']}) — {parent['status']}")

        _print_task_row("ROOT", root)

        if children:
            print(f"\n  Children ({len(children)}):")
            for i, child in enumerate(children):
                _print_task_row(f"  [{i}]", child, indent=4)

                # Check for transition metadata (FPS, resolution)
                output_loc = child.get('output_location') or ''
                if output_loc.startswith('{'):
                    try:
                        import json
                        meta = json.loads(output_loc)
                        fps = meta.get('fps')
                        res = meta.get('resolution')
                        frames = meta.get('frames')
                        gap = meta.get('gap_frames')
                        parts = []
                        if fps: parts.append(f"fps={fps}")
                        if res: parts.append(f"res={res[0]}x{res[1]}" if isinstance(res, list) else f"res={res}")
                        if frames: parts.append(f"frames={frames}")
                        if gap: parts.append(f"gap={gap}")
                        if parts:
                            print(f"         Transition metadata: {', '.join(parts)}")
                    except (json.JSONDecodeError, TypeError):
                        pass

        if siblings and not children:
            print(f"\n  Siblings ({len(siblings)}):")
            for i, sib in enumerate(siblings):
                marker = " ← THIS" if sib['id'] == task_id else ""
                _print_task_row(f"  [{i}]", sib, indent=4, suffix=marker)

        # Summary
        if children:
            statuses = {}
            for c in children:
                s = c['status']
                statuses[s] = statuses.get(s, 0) + 1
            print(f"\n  Summary: {statuses}")

        print()

    except Exception as e:
        print(f"Error tracing pipeline: {e}")
        if options.get('debug'):
            import traceback
            traceback.print_exc()


def _print_task_row(label: str, task: dict, indent: int = 2, suffix: str = ""):
    status = task['status']
    task_type = task['task_type']
    tid = task['id'][:16]
    error = task.get('error_message')
    worker = (task.get('worker_id') or '')[:20]

    # Timing
    timing = ""
    if task.get('generation_started_at') and task.get('generation_processed_at'):
        from datetime import datetime
        try:
            started = datetime.fromisoformat(task['generation_started_at'].replace('+00:00', '+00:00'))
            completed = datetime.fromisoformat(task['generation_processed_at'].replace('+00:00', '+00:00'))
            duration = (completed - started).total_seconds()
            timing = f" ({duration:.0f}s)"
        except (ValueError, TypeError):
            pass

    prefix = " " * indent
    symbol = {"Complete": "✓", "Failed": "✗", "Queued": "○", "In Progress": "◉", "Cancelled": "–"}.get(status, "?")
    print(f"{prefix}{label} {symbol} {tid}... {task_type:30s} {status:12s}{timing} {worker}{suffix}")
    if error and status == 'Failed':
        print(f"{prefix}     Error: {error[:100]}")
