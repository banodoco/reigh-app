# E2E Test: Video Generation — All Models x Guidance Modes

## Goal

Generate a video with **every model + guidance mode combination** and verify the full pipeline works:
UI → create-task → worker claims → GPU processes → complete_task → generation appears in UI.

For failures: diagnose whether the error is **frontend** (bad payload sent to backend) or **worker** (processing/GPU error), fix it, and re-test.

---

## Test Matrix

### WAN 2.2 (5 guidance modes)

| # | Model | Guidance Mode | Status | Task ID | Error Layer | Notes |
|---|-------|--------------|--------|---------|-------------|-------|
| 1 | wan-2.2 | flow (default) | | | | |
| 2 | wan-2.2 | canny | | | | |
| 3 | wan-2.2 | depth | | | | |
| 4 | wan-2.2 | raw | | | | |
| 5 | wan-2.2 | uni3c | | | | |

### LTX 2.3 Distilled (5 guidance modes)

| # | Model | Guidance Mode | Status | Task ID | Error Layer | Notes |
|---|-------|--------------|--------|---------|-------------|-------|
| 6 | ltx-2.3-fast | video (default) | | | | |
| 7 | ltx-2.3-fast | pose | | | | |
| 8 | ltx-2.3-fast | depth | | | | |
| 9 | ltx-2.3-fast | canny | | | | |
| 10 | ltx-2.3-fast | uni3c | | | | |

### LTX 2.3 Full (unguided only)

| # | Model | Guidance Mode | Status | Task ID | Error Layer | Notes |
|---|-------|--------------|--------|---------|-------------|-------|
| 11 | ltx-2.3 | (none/unguided) | | | | |

---

## Execution Workflow

### Step 1: Start the worker (keep running for entire session)

SSH to the GPU pod and start the worker. It stays running and polls for tasks continuously.

```bash
# Kill any existing worker first
ssh root@213.173.103.158 -p 10453 "pkill -f 'python worker.py' ; pkill -f 'python main.py'"

# Start worker with output to a known log file
ssh root@213.173.103.158 -p 10453 "cd /workspace/Astrid-Worker && \
  git pull && \
  source venv/bin/activate && \
  nohup python worker.py --astrid-access-token 3HKcoLeJAFFfTFFeRV6Eu7Lq --debug --wgp-profile 4 \
    > /tmp/worker_test.log 2>&1 &"

# Verify it started
ssh root@213.173.103.158 -p 10453 "sleep 3 && ps aux | grep 'python worker' | grep -v grep && tail -20 /tmp/worker_test.log"
```

The worker polls `claim-next-task` in a loop. It will pick up any Queued tasks automatically.

**Reading worker logs:**
```bash
# Tail live output
ssh root@213.173.103.158 -p 10453 "tail -f /tmp/worker_test.log"

# Search for errors
ssh root@213.173.103.158 -p 10453 "grep -i 'error\|exception\|traceback' /tmp/worker_test.log | tail -30"

# Last N lines
ssh root@213.173.103.158 -p 10453 "tail -100 /tmp/worker_test.log"
```

### Step 2: Queue a test (reset task properly)

Reset the target task — must clear ALL stale fields AND delete old child tasks:

```sql
-- Cancel everything else first
UPDATE tasks SET status = 'Cancelled'
WHERE status IN ('In Progress', 'Queued')
  AND id != '<target_task_id>';

-- Delete old child tasks from previous runs of this orchestrator
DELETE FROM tasks
WHERE params->>'orchestrator_task_id_ref' = '<target_task_id>'
   OR (params->'orchestrator_details'->>'orchestrator_task_id' = '<target_task_id>'
       AND id != '<target_task_id>');

-- Properly reset the target task
UPDATE tasks SET status = 'Queued', worker_id = NULL, error_message = NULL, attempts = 0
WHERE id = '<target_task_id>';
```

**Why delete children**: The `complete_task` edge function counts ALL child segments
with the same `run_id`. Stale children from previous runs cause "X of Y failed" errors.

**Better approach**: INSERT a fresh duplicate with a NEW run_id:
```sql
INSERT INTO tasks (id, task_type, status, project_id, params, created_at)
SELECT gen_random_uuid(), task_type, 'Queued', project_id,
       jsonb_set(
         jsonb_set(params, '{orchestrator_details,run_id}',
           to_jsonb(to_char(NOW(), 'YYYYMMDDHHMI') || 'test')),
         '{orchestrator_details,orchestrator_task_id}',
         to_jsonb('sm_test_' || left(gen_random_uuid()::text, 8))
       ),
       NOW()
FROM tasks WHERE id = '<source_task_id>';
```
**Critical**: Must replace `run_id` — `complete_task` counts ALL children with the same
run_id. Stale children from a previous run of the same source cause "X of Y failed".

**Critical**: the user must have `cloud_enabled = true` or the edge function won't serve the task:
```sql
-- Check/enable cloud processing for the user
SELECT u.settings->'ui'->'generationMethods'->'inCloud' as cloud
FROM tasks t JOIN projects p ON p.id = t.project_id JOIN users u ON u.id = p.user_id
WHERE t.id = '<target_task_id>';

-- Enable if false
UPDATE users SET settings = jsonb_set(COALESCE(settings,'{}'), '{ui,generationMethods,inCloud}', 'true')
WHERE id = '<user_id>';
```

### Step 3: Observe (DB + worker stdout, in parallel)

```sql
-- Poll task status (every 10-15s)
SELECT id, status, worker_id, EXTRACT(EPOCH FROM (NOW() - created_at))::int as age_secs
FROM tasks WHERE id = '$NEW_TASK_ID';

-- System logs for the task
SELECT timestamp, source_type, log_level, LEFT(message, 200)
FROM system_logs WHERE task_id = '$NEW_TASK_ID' ORDER BY timestamp;
```

Worker stdout (from the SSH session in Step 1) shows real-time processing logs.

### Step 4: On Success
- Verify generation record exists in DB
- Verify video appears in Chrome UI
- Mark test PASS in matrix above

### Step 5: On Failure — Diagnose

| Symptom | Likely Layer | How to Confirm |
|---------|-------------|----------------|
| Task created with bad params | **Frontend** | `SELECT params FROM tasks WHERE id='...'` |
| Task stuck Queued | **Worker config** | Worker stdout, heartbeat, run_type match |
| Task In Progress then Failed | **Worker** | Worker stdout error / traceback |
| Task Complete but no generation | **Edge function** | system_logs for complete_task errors |
| Generation exists, not in UI | **Frontend** | React Query / realtime issue |

### Step 6: Fix & retry
- **Worker issue**: Edit `~/Documents/Astrid-Worker/` locally → `git push` → SSH: `git pull` in worker dir → kill & restart worker (Step 1 again)
- **Frontend issue**: Edit `src/` locally (dev server hot-reloads)
- **Edge function issue**: Edit `supabase/functions/` → deploy

Then re-queue the same source task (Step 2) and observe again.

---

## Key Technical Details

### Model Internal Names
| UI Name | Internal Name | Guidance System |
|---------|---------------|-----------------|
| WAN 2.2 | `wan_2_2_i2v_lightning_baseline_2_2_2` | `vace` |
| LTX 2.3 Distilled | `ltx2_22B_distilled` | `ltx_control` |
| LTX 2.3 Full | `ltx2_22B` | none (unguided) |

### Guidance Mode → Guidance Kind Mapping
| Mode | WAN (vace) | LTX Distilled (ltx_control) |
|------|-----------|----------------------------|
| flow | vace preprocessing | N/A |
| raw | vace (no preprocessing) | N/A |
| canny | vace preprocessing | ltx_control |
| depth | vace preprocessing | ltx_control |
| uni3c | uni3c system | uni3c system |
| pose | N/A | ltx_control |
| video | N/A | ltx_control |

### Default Parameters per Mode
| Mode | Default Strength | Extra Params |
|------|-----------------|--------------|
| flow | 1.0 | — |
| raw | 1.0 | — |
| canny | 1.0 | cannyIntensity (WAN) |
| depth | 1.0 | depthContrast (WAN) |
| uni3c | 1.0 | uni3cEndPercent: 0.1 |
| pose | 0.5 | — |
| video | 1.0 | — |

---

## Test Approach

Instead of triggering each test from the UI, tasks were created via the UI then cancelled.
To run each test: duplicate the cancelled task in DB with `status = 'Queued'`, let the worker pick it up.

### Source Tasks (all Cancelled, ready to duplicate)

| # | Model | Kind | Mode | Task ID |
|---|-------|------|------|---------|
| 1 | ltx2_22B_distilled | ltx_control | video | `9cf4964a-fc10-4c75-8615-63a8cb307b83` |
| 2 | ltx2_22B_distilled | ltx_control | pose | `a11d7ccc-f775-4c10-8e40-571a839ad115` |
| 3 | ltx2_22B_distilled | ltx_control | depth | `9efa93ec-10e5-4904-b611-604f0b39913f` |
| 4 | ltx2_22B_distilled | ltx_control | canny | `464859d9-7a35-4060-8633-896675621738` |
| 5 | ltx2_22B_distilled | uni3c | — | `f58a1bbc-a097-4513-b580-77e2b1506b19` |
| 6 | ltx2_22B | (none) | — | `12b26747-1b01-4b26-ab46-53d1efd447cb` |
| 7 | wan (vace) | vace | flow | `14392cf7-3e6b-4976-a8db-b17b162c621b` |
| 8 | wan (vace) | vace | canny | `c082a045-7c81-46a3-85c9-f1bd34dd385f` |
| 9 | wan (vace) | vace | raw | `86d5bed8-3fff-48cc-ac39-b52a9f3f6025` |
| 10 | wan (vace) | uni3c | — | `4a1e7078-43b0-4e40-9449-6fa7d3d3e2c7` |
| 11 | wan (vace) | vace | raw | `bdeba281-896e-4118-bd2d-81cbd6dfbc29` |
| 12 | wan (vace) | vace | depth | `86b41a75-af12-4151-9b44-a16fa498b777` |

### Worker Start Command (RunPod SSH)

```bash
# From RunPod pod, inside /workspace/Astrid-Worker
[ ! -f "worker.py" ] && cd Astrid-Worker
git pull && \
source venv/bin/activate && \
python worker.py --astrid-access-token 3HKcoLeJAFFfTFFeRV6Eu7Lq --debug --wgp-profile 4
```

## Iteration Log

### Iteration 1: Worker startup fixes
- **Bug 1**: `server.py:main()` → `import_module("worker").main()` infinite recursion. Fixed by replacing with actual worker loop.
- **Bug 2**: `worker.py` shim missing `if __name__ == "__main__"` guard. Added.
- **Bug 3**: `_resolve_worker_db_client_key` defaulted to `anon` mode, rejected `--astrid-access-token`. Fixed fallback: `service_key or access_token or anon_key`.
- **Bug 4**: `validate_config` required `SUPABASE_SERVICE_KEY` even with access token auth. Made non-fatal.
- **Bug 5**: Missing `postgrest` pip package on pod. Installed.

### Iteration 2: Runtime crashes
- **Bug 6**: `GuidanceTracker` and `apply_structure_motion_with_tracking` not exported from `source.media.structure.__init__`. Added to `_ATTR_EXPORTS`.
- **Bug 7**: `_save_queue_state` called in shutdown but never defined. Guarded with `hasattr`.

### Iteration 3: Task claiming
- **Bug 8**: `task-counts` edge function excludes orchestrator tasks from counts. Worker saw `queued_only=0` and skipped claim attempt even though `travel_orchestrator` was Queued. Removed early return so worker always falls through to `claim-next-task`.
- **Bug 9**: `claim-next-task` returned 204 because user had `cloud_enabled=false` in settings. Enabled it. Also: when resetting tasks, must clear `worker_id`, `error_message`, `attempts` — not just set status to Queued.
- **Bug 10**: Reusing cancelled tasks fails — stale children from previous runs cause "X of Y failed", and other workers/recovery logic cancel re-queued tasks. Solution: always INSERT a fresh duplicate task rather than updating the old one.

### Iteration 4: First successful runs
- **LTX 2.3 Distilled + uni3c**: PASS (task `85bb1b9b`). Generated and uploaded successfully. BUT: `use_uni3c` kwargs were ignored by WGP — uni3c was disabled. `video_prompt_type=S` (start image only). Video generated as basic i2v, not motion-controlled.
- **WAN 2.2 + VACE canny**: PASS (task `4f883205`). Full pipeline including stitch.

### Iteration 5: LTX control (canny) failure
- **Bug 10**: IC-LoRA `ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors` was in `ckpts/` but WGP looks in `loras/ltx2/`. Symlinked.
- **Bug 11**: LTX `video_prompt_type` was `S` (start image) even when guide video existed without mask. Fixed to use `VG` when guide exists.
- Added `[LTX_GUIDANCE]` and `[LTX_WGP_HANDOFF]` logging to clearly trace what params reach WGP.

### Current test task
`840cc1fb-3209-4d01-b3dd-39104a5a9c50` — LTX 2.3 Distilled + uni3c guidance

**Loop** (be patient — worker init takes ~4 min):
1. Reset task: `UPDATE tasks SET status='Queued' WHERE id='840cc1fb-...'`
2. Kill + pull + start worker on RunPod
3. Wait ~4 min for init (grep `[WORKER]` markers in log)
4. Watch logs for task claim + processing
5. On error → fix locally → push → goto 1

## Session Info

- **Arnold Pod SSH**: `ssh root@213.173.99.14 -p 12102`
- **Worker Log**: `/tmp/worker_test.log`
- **Worker Dir**: `/workspace/Astrid-Worker`
- **Local Worker**: `~/Documents/Astrid-Worker`
- **Init time**: ~3-4 min (heavy WGP/CUDA imports)

---

## Results Summary

| Model | Modes Tested | Pass | Fail | Blocked |
|-------|-------------|------|------|---------|
| WAN 2.2 | 0/5 | | | |
| LTX 2.3 Distilled | 0/5 | | | |
| LTX 2.3 Full | 0/1 | | | |
| **Total** | **0/11** | | | |
