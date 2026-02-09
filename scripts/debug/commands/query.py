"""Query command - query any table using the existing Supabase client (no extra deps)."""

import json
from typing import Dict, Any
from debug.client import DebugClient


def run(client: DebugClient, table: str, filters: list, options: Dict[str, Any]) -> None:
    """Query a table with optional column=value filters."""
    try:
        select = options.get('select', '*')
        query = client.supabase.table(table).select(select)

        for f in filters:
            if '=' not in f:
                print(f"❌ Invalid filter '{f}' — expected column=value")
                return
            col, val = f.split('=', 1)
            query = query.eq(col.strip(), val.strip())

        limit = options.get('limit', 50)
        query = query.limit(limit)

        result = query.execute()
        rows = result.data or []

        if options.get('format') == 'json':
            print(json.dumps(rows, indent=2, default=str))
        else:
            if not rows:
                print("(no rows)")
                return
            for i, row in enumerate(rows):
                if i > 0:
                    print("  ---")
                for key, value in row.items():
                    if isinstance(value, (dict, list)):
                        value = json.dumps(value, indent=2, default=str)
                    print(f"  {key}: {value}")
            print(f"\n({len(rows)} row{'s' if len(rows) != 1 else ''})")

    except Exception as e:
        msg = getattr(e, 'message', None) or str(e)
        print(f"❌ {msg}")
        if options.get('debug'):
            import traceback
            traceback.print_exc()
