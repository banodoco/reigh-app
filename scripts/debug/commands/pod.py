"""RunPod pod management — list pods, get SSH details, launch workers."""

import os
import json
from pathlib import Path


def run(subcommand: str, options: dict):
    """Handle 'debug.py pod <subcommand>' commands."""
    try:
        import httpx
    except ImportError:
        print("❌ httpx required: pip install httpx")
        return

    api_key = _get_runpod_api_key()
    if not api_key:
        return

    if subcommand == 'list':
        _list_pods(api_key, options)
    elif subcommand == 'ssh':
        pod_id = options.get('pod_id')
        if not pod_id:
            print("❌ Pod ID required: debug.py pod ssh <pod_id>")
            return
        _show_ssh(api_key, pod_id, options)
    elif subcommand == 'worker':
        pod_id = options.get('pod_id')
        if not pod_id:
            print("❌ Pod ID required: debug.py pod worker <pod_id>")
            return
        _print_worker_commands(api_key, pod_id, options)
    else:
        print(f"Unknown pod subcommand: {subcommand}")
        print("Available: list, ssh <pod_id>, worker <pod_id>")


def _get_runpod_api_key() -> str | None:
    """Load RunPod API key from Arnold .env or environment."""
    key = os.environ.get('RUNPOD_API_KEY')
    if key:
        return key

    arnold_env = Path.home() / 'Documents' / 'Arnold' / '.env'
    if arnold_env.exists():
        for line in arnold_env.read_text().splitlines():
            if line.startswith('RUNPOD_API_KEY='):
                return line.split('=', 1)[1].strip()

    print("❌ RUNPOD_API_KEY not found. Set it in environment or ~/Documents/Arnold/.env")
    return None


def _runpod_query(api_key: str, query: str) -> dict | None:
    """Execute a RunPod GraphQL query."""
    import httpx
    try:
        resp = httpx.post(
            'https://api.runpod.io/graphql',
            json={'query': query},
            headers={'Authorization': f'Bearer {api_key}'},
            timeout=15,
        )
        if resp.status_code == 200:
            return resp.json().get('data')
        print(f"❌ RunPod API error: {resp.status_code} {resp.text[:200]}")
        return None
    except Exception as e:
        print(f"❌ RunPod API request failed: {e}")
        return None


def _list_pods(api_key: str, options: dict):
    """List all RunPod pods with status and SSH info."""
    data = _runpod_query(api_key, '''
        query { myself { pods {
            id name desiredStatus
            runtime { uptimeInSeconds gpus { id gpuUtilPercent memoryUtilPercent }
                      ports { ip isIpPublic privatePort publicPort type } }
            machine { gpuDisplayName }
            costPerHr
        }}}
    ''')
    if not data:
        return

    pods = data.get('myself', {}).get('pods', [])

    if options.get('format') == 'json':
        print(json.dumps(pods, indent=2))
        return

    print("=" * 80)
    print("RUNPOD PODS")
    print("=" * 80)

    if not pods:
        print("\n  No pods found.")
        return

    for pod in pods:
        pid = pod['id']
        name = pod.get('name', '')
        status = pod.get('desiredStatus', '?')
        gpu = pod.get('machine', {}).get('gpuDisplayName', '?')
        cost = pod.get('costPerHr', 0)
        runtime = pod.get('runtime') or {}
        uptime = runtime.get('uptimeInSeconds', 0)

        # Find SSH port
        ssh_info = ""
        for port in (runtime.get('ports') or []):
            if port.get('privatePort') == 22 and port.get('isIpPublic'):
                ssh_info = f"ssh root@{port['ip']} -p {port['publicPort']}"
                break

        symbol = {"RUNNING": "🟢", "EXITED": "🔴", "CREATED": "🟡"}.get(status, "⚪")
        uptime_str = f"{uptime // 3600}h{(uptime % 3600) // 60}m" if uptime else "—"

        print(f"\n  {symbol} {pid} ({name})")
        print(f"     Status: {status} | GPU: {gpu} | Cost: ${cost:.2f}/hr | Uptime: {uptime_str}")
        if ssh_info:
            print(f"     SSH: {ssh_info}")


def _show_ssh(api_key: str, pod_id: str, options: dict):
    """Show SSH connection details for a pod."""
    data = _runpod_query(api_key, f'''
        query {{ pod(input: {{podId: "{pod_id}"}}) {{
            id name desiredStatus
            runtime {{ ports {{ ip isIpPublic privatePort publicPort type }} }}
        }}}}
    ''')
    if not data or not data.get('pod'):
        print(f"Pod {pod_id} not found")
        return

    pod = data['pod']
    for port in (pod.get('runtime') or {}).get('ports', []):
        if port.get('privatePort') == 22 and port.get('isIpPublic'):
            cmd = f"ssh root@{port['ip']} -p {port['publicPort']}"
            print(f"\n  {cmd}\n")
            return

    print(f"  Pod {pod_id} has no public SSH port (status: {pod.get('desiredStatus')})")


def _print_worker_commands(api_key: str, pod_id: str, options: dict):
    """Print commands to set up and start a worker on a pod."""
    data = _runpod_query(api_key, f'''
        query {{ pod(input: {{podId: "{pod_id}"}}) {{
            id name desiredStatus
            runtime {{ ports {{ ip isIpPublic privatePort publicPort type }} }}
        }}}}
    ''')
    if not data or not data.get('pod'):
        print(f"Pod {pod_id} not found")
        return

    pod = data['pod']
    ssh_cmd = None
    for port in (pod.get('runtime') or {}).get('ports', []):
        if port.get('privatePort') == 22 and port.get('isIpPublic'):
            ssh_cmd = f"ssh root@{port['ip']} -p {port['publicPort']}"
            break

    if not ssh_cmd:
        print(f"  Pod {pod_id} has no public SSH port")
        return

    print(f"""
=== Worker Setup for Pod {pod_id} ===

1. SSH in:
   {ssh_cmd}

2. Bootstrap / resync:
   cd /workspace/Reigh-Worker 2>/dev/null || {{ git clone https://github.com/banodoco/Reigh-Worker.git /workspace/Reigh-Worker && cd /workspace/Reigh-Worker; }}
   if [ ! -x "$HOME/.local/bin/uv" ]; then curl -LsSf https://astral.sh/uv/install.sh | sh; fi
   export PATH="$HOME/.local/bin:$PATH"
   if [ ! -f .uv-migrated ]; then
     ts=$(date +%Y%m%d%H%M%S)
     [ -d venv ] && mv venv "venv.pre-uv-$ts"
     [ -d .venv ] && mv .venv ".venv.pre-uv-$ts"
   fi
   git pull --ff-only
   uv sync --locked --python 3.10 --extra cuda124
   touch .uv-migrated

3. Start worker:
   cd /workspace/Reigh-Worker
   export PATH="$HOME/.local/bin:$PATH"
   nohup uv run --python 3.10 python run_worker.py \\
     --reigh-access-token <PAT_TOKEN> \\
     --debug --wgp-profile 4 --idle-release-minutes 15 \\
     > /tmp/worker_test.log 2>&1 &

4. Verify:
   ps aux | grep 'python.*run_worker' | grep -v grep
   tail -f /tmp/worker_test.log

5. Kill:
   kill -9 $(pgrep -f 'python.*run_worker')

6. Roll back a first-migration failure:
   cd /workspace/Reigh-Worker
   rm -f .uv-migrated
   mv venv.pre-uv-<timestamp> venv        # or mv .venv.pre-uv-<timestamp> .venv
   # There is no runtime pip fallback on this branch.
   # For a full release rollback, revert the uv rollout commits first, then use that older revision's requirements.txt bootstrap.

=== Quick run-path restart (existing setup) ===
   {ssh_cmd} "kill -9 $(pgrep -f 'python.*run_worker') 2>/dev/null; \\
     export PATH=\\\"$HOME/.local/bin:$PATH\\\"; cd /workspace/Reigh-Worker && git pull --ff-only && \\
     uv sync --locked --python 3.10 --extra cuda124 && \\
     nohup uv run --python 3.10 python run_worker.py --reigh-access-token <PAT_TOKEN> --debug --wgp-profile 4 --idle-release-minutes 15 \\
     > /tmp/worker_test.log 2>&1 &"
""")
