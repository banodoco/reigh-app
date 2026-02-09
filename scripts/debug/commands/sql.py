"""SQL command - execute arbitrary SQL against the database."""

import json
import os
import sys
from typing import Dict, Any

def run(query: str, options: Dict[str, Any]) -> None:
    """Execute a SQL query and print results."""
    try:
        import psycopg2
        import psycopg2.extras
    except ImportError:
        print("❌ psycopg2 not installed. Install with: pip install psycopg2-binary")
        sys.exit(1)

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("❌ DATABASE_URL not set in environment")
        sys.exit(1)

    try:
        conn = psycopg2.connect(database_url)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(query)

        if cur.description:
            rows = cur.fetchall()
            if options.get('format') == 'json':
                print(json.dumps([dict(r) for r in rows], indent=2, default=str))
            else:
                if not rows:
                    print("(no rows)")
                    return
                # Print as formatted table
                for row in rows:
                    row_dict = dict(row)
                    for key, value in row_dict.items():
                        if isinstance(value, (dict, list)):
                            value = json.dumps(value, indent=2, default=str)
                        print(f"  {key}: {value}")
                    print()
        else:
            print(f"✅ Query executed ({cur.rowcount} rows affected)")

        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"❌ SQL error: {e}")
        if options.get('debug'):
            import traceback
            traceback.print_exc()
        sys.exit(1)
