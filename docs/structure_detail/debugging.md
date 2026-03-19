# Debugging

> **Purpose**: Tools and patterns for investigating task failures, performance issues, and system state across the full pipeline.
> **Source of Truth**: `scripts/debug.py` (CLI), `system_logs` table (server logs), `src/shared/lib/logger.ts` (frontend)

---

## Decision Table: Where to Look

| Symptom | Layer | How to Confirm | Fix |
|---------|-------|----------------|-----|
| Task never appears in DB | **Frontend** | Chrome Network tab, `create-task` response | Task creation code in `src/shared/lib/tasks/` |
| Task created with bad params | **Frontend** | `debug.py task <id> --json` → inspect params | Payload builders: `segmentTaskPayload.ts`, `payloadBuilder.ts` |
| Task stuck Queued (short) | **Worker / Edge** | `debug.py queue`, worker heartbeat | `claim-next-task` edge fn, `cloud_enabled` setting |
| Task stuck Queued (long, many tasks) | **Orchestrator** | `debug.py workers`, `debug.py queue` | Orchestrator config, RunPod quotas |
| Task In Progress then Failed | **Worker** | `debug.py task <id>`, worker SSH logs | Edit `~/Documents/Reigh-Worker/` → push → pull on pod |
| Task Complete but no generation | **Edge function** | `debug.py task <id>` → system_logs | `supabase/functions/complete_task/` → deploy |
| Output video has artifacts/seams | **Worker** | `debug.py pipeline <id>` → check FPS/resolution metadata | Worker join/stitch code, see cross-model pitfalls below |
| Generation exists, not in UI | **Frontend** | React Query cache, realtime subscription | `src/` |
| Cascading failure stuck | **Edge function** | `debug.py task <id>` → system_logs errors | `supabase/functions/update-task-status/` |
| Pipeline partially complete | **Multiple** | `debug.py pipeline <id>` → find failed child | Trace the failed child separately |

---

## 1. Task Debugging CLI (`scripts/debug.py`)

The primary tool. Queries `system_logs` + task data in one shot.

```bash
# Full investigation of a specific task
debug.py task <task_id>
debug.py task <task_id> --json          # Full JSON output

# Trace a multi-task pipeline (orchestrator → children → stitch)
debug.py pipeline <task_id>             # Works with any task in the pipeline

# List recent tasks (filter by status, type, time)
debug.py tasks --status Failed --hours 2
debug.py tasks --type travel_segment --limit 20

# Current queue and worker state
debug.py queue                          # Queue depth, stuck tasks, worker capacity
debug.py workers                        # Active workers, heartbeat, pod IDs, failures

# System logs
debug.py logs --source edge_function --hours 1
debug.py logs --latest                          # Most recent browser session
debug.py logs --latest --tag MyTag              # Filter by tag

# Raw queries
debug.py query tasks status=Failed --limit 5   # Query any table by column=value
debug.py sql "SELECT ..."                       # Raw SQL (needs psycopg2)
```

Requires `.env` at project root with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (loaded via `dotenv`).

**Note**: `system_logs` has **48h retention**. For older issues, check `tasks.error_message` directly.

---

## 2. GPU Worker Debugging (SSH)

Workers run on RunPod pods. SSH details come from the RunPod dashboard.

### Starting / restarting a test worker

```bash
# SSH to pod (get host/port from RunPod dashboard)
ssh root@<HOST> -p <PORT>

# Kill existing workers
kill -9 $(pgrep -f 'python.*worker') 2>/dev/null

# Pull latest code and start
cd /workspace/Reigh-Worker
git pull
source venv/bin/activate
nohup python -u worker.py \
  --reigh-access-token <PAT_TOKEN> \
  --debug --wgp-profile 4 \
  > /tmp/worker_test.log 2>&1 &

# Verify it started (init takes ~3-4 min for CUDA/model imports)
ps aux | grep 'python.*worker' | grep -v grep
```

### Reading worker logs

```bash
# Tail live output
ssh root@<HOST> -p <PORT> "tail -f /tmp/worker_test.log"

# Search for errors
ssh root@<HOST> -p <PORT> "grep -i 'error\|exception\|traceback' /tmp/worker_test.log | tail -30"

# Search for a specific task
ssh root@<HOST> -p <PORT> "grep '<task_id>' /tmp/worker_test.log | tail -20"

# Key markers to grep for
ssh root@<HOST> -p <PORT> "grep -E 'UPLOAD_INTERMEDIATE|complete_task|generate_vace.*returned|FINAL_STITCH|Failed' /tmp/worker_test.log | tail -20"
```

### Worker system checks

| Action | Command |
|--------|---------|
| GPU status | `nvidia-smi` |
| Worker process | `ps aux \| grep python` |
| Disk space | `df -h /workspace` |
| Git state | `git -C /workspace/Reigh-Worker log --oneline -3` |
| Guardian heartbeat | `tail -20 /tmp/guardian_*.log` |

### Worker auth modes

The worker supports three auth modes for Supabase:

| Mode | How to use | When |
|------|-----------|------|
| **PAT** (recommended for testing) | `--reigh-access-token <token>` | Local/manual testing |
| **Service role key** | `SUPABASE_SERVICE_ROLE_KEY` env var | Cloud workers |
| **Anon key** | `SUPABASE_ANON_KEY` env var | Fallback |

**PAT gotcha**: The PAT works for edge function calls (`Authorization: Bearer <PAT>`) but must NOT be sent as the `apikey` header — Supabase gateway rejects non-anon/service keys in `apikey`. Edge functions that handle their own auth must have `verify_jwt = false` in `supabase/config.toml`.

### Fix & retry loop

1. Edit `~/Documents/Reigh-Worker/` locally
2. `git push`
3. SSH to pod: `cd /workspace/Reigh-Worker && git pull`
4. Kill and restart worker (see above)
5. Wait ~3-4 min for init
6. Queue a test task (see below)
7. Watch logs → on error, goto 1

---

## 3. Queuing Test Tasks from DB

### Duplicate an existing task (preferred)

Insert a fresh copy with a new `run_id` to avoid stale children:

```sql
INSERT INTO tasks (id, task_type, status, project_id, params, created_at)
SELECT gen_random_uuid(), task_type, 'Queued', project_id,
       jsonb_set(
         jsonb_set(params, '{orchestrator_details,run_id}',
           to_jsonb(to_char(NOW(), 'YYYYMMDDHH24MI') || 'test')),
         '{orchestrator_details,orchestrator_task_id}',
         to_jsonb('test_' || left(gen_random_uuid()::text, 8))
       ),
       NOW()
FROM tasks WHERE id = '<source_task_id>';
```

**Why new run_id**: `complete_task` counts ALL children with the same `run_id`. Stale children from a previous run cause "X of Y failed".

### Cancel interfering tasks

```sql
UPDATE tasks SET status = 'Cancelled'
WHERE status IN ('In Progress', 'Queued')
  AND id != '<target_task_id>';
```

### Check cloud_enabled

Workers can only claim tasks from users with cloud processing enabled:

```sql
SELECT u.settings->'ui'->'generationMethods'->'inCloud' as cloud_enabled
FROM tasks t JOIN projects p ON p.id = t.project_id JOIN users u ON u.id = p.user_id
WHERE t.id = '<task_id>';
```

### Monitor task progress

```sql
-- Poll task status
SELECT id, status, worker_id, EXTRACT(EPOCH FROM (NOW() - created_at))::int as age_secs
FROM tasks WHERE id = '<task_id>';

-- System logs for a task (all sources combined)
SELECT timestamp, source_type, log_level, LEFT(message, 200)
FROM system_logs WHERE task_id = '<task_id>' ORDER BY timestamp;

-- Check for error metadata
SELECT timestamp, log_level, message, metadata::text
FROM system_logs WHERE task_id = '<task_id>' AND log_level IN ('WARNING', 'ERROR')
ORDER BY timestamp;

-- Worker heartbeat
SELECT id, status, current_model, last_heartbeat, NOW() - last_heartbeat as stale_for
FROM workers ORDER BY last_heartbeat DESC LIMIT 3;
```

---

## 4. Orchestrator (Worker Scaling & Health)

The **Headless WGP Orchestrator** (`~/Documents/Headless_WGP_Orchestrator`) is the control plane that scales GPU workers and dispatches API tasks. It runs on Railway.

### Architecture

Two parallel pipelines:
- **GPU Orchestrator** — monitors task demand, spawns/terminates RunPod pods, monitors worker health
- **API Orchestrator** — claims and dispatches lightweight tasks (image editing via fal.ai/Wavespeed)

### Control loop (GPU, ~30s cycles)

1. **State**: Fetch active workers + count queued/active tasks via `task-counts` edge function
2. **Scaling**: Compute target GPU count (`TASKS_PER_GPU_THRESHOLD=3`)
3. **Health**: Check heartbeats, detect stuck/dead workers
4. **Lifecycle**: Spawn new RunPod pods or terminate idle/unhealthy ones
5. **Periodic**: Clean up orphaned tasks, check storage

### Key config (env vars)

| Var | Default | Purpose |
|-----|---------|---------|
| `MIN_ACTIVE_GPUS` | 2 | Floor — always keep this many running |
| `MAX_ACTIVE_GPUS` | 10 | Ceiling |
| `TASKS_PER_GPU_THRESHOLD` | 3 | Scale up when queued tasks / GPUs > this |
| `GPU_IDLE_TIMEOUT_SEC` | 600 | Terminate after 10 min idle |
| `MAX_CONSECUTIVE_TASK_FAILURES` | 3 | Restart worker after N consecutive failures |

### CLI

```bash
# From ~/Documents/Headless_WGP_Orchestrator
python -m gpu_orchestrator.main status       # Health overview
python -m gpu_orchestrator.main single       # Run one cycle
python -m gpu_orchestrator.main continuous   # Daemon mode
python -m api_orchestrator.main              # API task loop
```

### Debugging orchestrator issues

| Symptom | Check |
|---------|-------|
| Workers not spawning | Orchestrator logs on Railway, `task-counts` edge function, RunPod API quotas |
| Workers spawning but not claiming | Worker startup script, `claim-next-task` edge fn, `cloud_enabled` user setting |
| Workers dying repeatedly | `MAX_CONSECUTIVE_TASK_FAILURES`, worker heartbeat in `workers` table, RunPod pod logs |
| Orphaned tasks (stuck In Progress) | Orchestrator periodic cleanup, `workers` table heartbeat staleness |
| Too many workers | `MAX_ACTIVE_GPUS`, `GPU_IDLE_TIMEOUT_SEC`, check if tasks are completing |

### DB queries

```sql
-- Active workers and their health
SELECT id, status, current_model, last_heartbeat,
       NOW() - last_heartbeat as stale_for,
       metadata->>'runpod_id' as pod_id
FROM workers WHERE status = 'active' ORDER BY last_heartbeat DESC;

-- Worker failure streaks
SELECT w.id, COUNT(*) as recent_failures
FROM workers w JOIN tasks t ON t.worker_id = w.id
WHERE t.status = 'Failed' AND t.created_at > NOW() - interval '1 hour'
GROUP BY w.id ORDER BY recent_failures DESC;
```

### Deploy

```bash
# From ~/Documents/Headless_WGP_Orchestrator
./deploy_to_railway.sh          # Both
./deploy_to_railway.sh --gpu    # GPU orchestrator only
./deploy_to_railway.sh --api    # API orchestrator only
```

---

## 5. Edge Function Debugging

### Deploy a single function

```bash
npx supabase functions deploy <function_name> --project-ref wczysqzxlwdndgxitrvc
```

Add `--no-verify-jwt` if the function needs to accept PAT auth directly (most do).

### Common edge function issues

| Issue | Cause | Fix |
|-------|-------|-----|
| 401 "Invalid Token or Protected Header" | `verify_jwt` enabled + PAT auth | Add to `config.toml` with `verify_jwt = false`, redeploy with `--no-verify-jwt` |
| 409 "Invalid status transition" | Duplicate status update (e.g., In Progress → In Progress) | Usually harmless; check if the real update succeeded |
| "column tasks.params does not exist" | SQL bug in cascading failure logic | Bug in `update-task-status` — needs fix |
| Task Complete but output_location empty | Two-step completion failed | Use `output_location` override in `complete_task` payload |

### What writes to `system_logs`

| Source | `source_type` | What's logged |
|--------|---------------|---------------|
| Edge Functions | `edge_function` | `create-task`, `claim-next-task`, `update-task-status`, `complete_task`, `calculate-task-cost` |
| Workers (GPU) | `worker` | Task processing steps, errors, via heartbeat |
| Orchestrators | `orchestrator_gpu/api` | Cycle tracking, segment coordination |
| Browser (with flag) | `browser` | ALL console output when `VITE_PERSIST_LOGS=true` |

---

## 6. Frontend Debug Logging

Logging is **opt-in** — nothing prints unless you set an env flag.

```bash
VITE_DEBUG_LOGS=true npm run dev                        # Console only
VITE_PERSIST_LOGS=true VITE_DEBUG_LOGS=true npm run dev # Console + persist to system_logs
```

| Function | Behavior |
|----------|----------|
| `logError(tag, ...data)` | **Always logs + persists**, even without flag |
| `forceFlush()` | Immediately flush buffer — call before navigation |
| `useRenderLogger(tag, props?)` | Incrementing render counter to spot hot re-renders |

Use **unique `[TagName]` prefixes** for investigation: `console.log('[VideoLoadSpeedIssue] loadTime:', loadTime, 'ms')`. Debug logs are dev-only (stripped in prod).

---

## 7. Model & Guidance Reference

### Model Internal Names

| UI Name | Internal Name | Guidance System | Max Frames | FPS |
|---------|---------------|-----------------|------------|-----|
| WAN 2.2 | `wan_2_2_i2v_lightning_baseline_2_2_2` | `vace` | 81 | 16 |
| LTX 2.3 Distilled | `ltx2_22B_distilled` | `ltx_control` | 241 | 24 |
| LTX 2.3 Full | `ltx2_22B` | none (unguided) | 241 | 24 |

### Guidance Mode → Kind Mapping

| Mode | WAN (vace) | LTX Distilled (ltx_control) |
|------|-----------|----------------------------|
| flow | vace preprocessing | N/A |
| raw | vace (no preprocessing) | N/A |
| canny | vace preprocessing | ltx_control |
| depth | vace preprocessing | ltx_control |
| uni3c | uni3c system | uni3c system |
| pose | N/A | ltx_control |
| video | N/A | ltx_control |

### Common cross-model pitfalls

- **WAN phase_config sent to LTX**: Phase configs contain WAN Lightning loras. LTX has `supportsPhaseConfig: false`. Individual segment regeneration path must strip phase_config for non-phase models.
- **FPS mismatch in join/stitch**: Segment handler generates transitions at a fixed FPS (default 16). Stitch handler must resample downloaded clips to match. FPS is recorded in transition JSON metadata.
- **Resolution mismatch in join/stitch**: Segment handler standardizes clip aspect ratios before generation. Stitch handler must do the same. Resolution is recorded in transition JSON metadata.

---

**Related**: [Task Worker Lifecycle](./task_worker_lifecycle.md) | [Edge Functions](./edge_functions.md)
