# Task & Worker Lifecycle

## Overview

Reigh uses an async task queue pattern for all AI generation workloads. This decouples the UI from long-running operations and enables distributed processing.

## Flow Diagram

### High-Level Overview
```
┌─────────┐     ┌──────────────┐     ┌─────────┐     ┌────────────┐
│ Client  │────▶│ create_task  │────▶│   DB    │◀────│   Worker   │
│   UI    │     │ Edge Function│     │ (tasks) │     │  (Express) │
└─────────┘     └──────────────┘     └─────────┘     └────────────┘
     ▲                                      │                 │
     │                                      │                 │
     │          ┌──────────────┐           │                 │
     └──────────│   Realtime   │◀──────────┴─────────────────┘
                │  Broadcast   │         (status updates)
                └──────────────┘
```

## Detailed Steps

### 1. Task Creation
- Client calls `/supabase/functions/create_task` with:
  - `tool_id` (e.g., 'image-generation')
  - `input` (tool-specific parameters)
  - `cost` (pre-calculated credits)
- Edge Function validates user has sufficient credits
- Inserts row into `tasks` table with `status = 'Queued'`
- Returns task ID to client

### 2. Worker Polling & Task Processing
- **External Workers** (Headless-Wan2GP) poll via `claim_next_task` Edge Function:
  - Uses **model affinity**: prefers tasks matching worker's `current_model` to avoid model reloads
  - Falls back to FIFO (oldest first) if no model match or worker hasn't reported a model
  - Updates to `In Progress` with `worker_id`
  - Returns task details
- **Model Tracking**: Workers call `update-worker-model` after loading a model to enable affinity matching
- **Task Processing** now uses **Database Triggers** (instant):
  - When task status → `Complete`: SQL trigger `create_generation_on_task_complete` runs
  - Creates generations and shot_generations automatically in the database
  - Normalizes image paths and handles all edge cases
  - Broadcasts real-time updates via Supabase Realtime
- Worker processes based on `tool_id`:
  - Image generation → FAL API
  - Video processing → FFmpeg
  - Prompt enhancement → OpenAI

## Worker Types

### Local Express Worker
- Basic task processor (`/src/server/services/taskProcessingService.ts`)
- Handles simple tasks like prompt enhancement and basic image generation
- Runs alongside the main application in development

### Headless-Wan2GP Worker (Cloud/Local GPU)
- Advanced video generation worker: [Headless-Wan2GP](https://github.com/peteromallet/Headless-Wan2GP)
- Specialized for travel-between-images video generation tasks
- Can run locally with GPU or deployed to cloud instances
- Handles computationally intensive video generation workflows

#### Task Types Handled
- **`travel_orchestrator`** - Manages multi-segment travel workflows
- **`travel_segment`** - Creates guide videos and runs WGP generation using VACE
- **`travel_stitch`** - Stitches segment videos with crossfades and timing
- **`individual_travel_segment`** - Standalone segment regeneration (visible in TasksPane, creates variant on parent generation)
- **`image-generation`** - Fallback for basic image generation tasks

#### Deployment Options

**Local Deployment (GPU Required)**
```bash
# Clone the worker repository where the Settings modal expects it
git clone https://github.com/banodoco/Reigh-Worker.git ~/Documents/Reigh-Worker
cd ~/Documents/Reigh-Worker

# Install uv once
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

# Ubuntu 24.04+ note: install Python 3.10 packages from deadsnakes first
# sudo add-apt-repository ppa:deadsnakes/ppa && sudo apt-get update

# Sync and run
uv sync --locked --python 3.10 --extra cuda124
uv run --python 3.10 python run_worker.py --reigh-access-token <PAT_TOKEN>
```

The desktop Settings modal now stores a `Worker repo location` field. Both generated commands `cd` into that absolute path before any `uv` call, so users can paste them from a fresh shell in their home directory.

**Cloud Deployment (RunPod)**

Workers run on RunPod GPU pods (RTX 4090). Code lives on a persistent network volume at `/workspace/`.

| Path | Contents |
|------|----------|
| `/workspace/Reigh-Worker/` | Canonical worker checkout used by the startup template |
| `/workspace/Headless-Wan2GP/` | Legacy fallback checkout still supported during rollout |

**Accessing pods:**
- **SSH**: Pod IP + port from RunPod dashboard or API (`ssh root@<ip> -p <port>`)
- **Jupyter**: `https://<pod_id>-8888.proxy.runpod.net/?token=<token>` (port 8888)
- **RunPod API**: Query `myself { pods { ... } }` GraphQL endpoint with API key from Arnold `.env`

**Worker process lifecycle:**
```bash
# Logs go to /tmp/worker_startup_<worker_id>.log
# Guardian heartbeat log: /tmp/guardian_<worker_id>.log
# Worker ID format: gpu-YYYYMMDD_HHMMSS-<hash>

# Bootstrap / resync (also used for first install)
cd /workspace/Reigh-Worker
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
uv sync --locked --python 3.10 --extra cuda124

# Start (nohup so it survives SSH disconnect)
nohup uv run --python 3.10 python run_worker.py --reigh-access-token <PAT_TOKEN> > /tmp/worker.log 2>&1 &

# Restart after code change
pkill -f 'python.*run_worker' && cd /workspace/Reigh-Worker && git pull --ff-only && uv sync --locked --python 3.10 --extra cuda124 && nohup uv run --python 3.10 python run_worker.py --reigh-access-token <PAT_TOKEN> > /tmp/worker.log 2>&1 &

# Check status
ps aux | grep python
tail -50 /tmp/worker_startup_*.log
nvidia-smi
```

**Code change workflow:**
1. Edit locally at `~/Documents/Reigh-Worker` (same repo: `banodoco/Reigh-Worker`)
2. `git add . && git commit -m "fix: ..." && git push`
3. SSH to pod: `cd /workspace/Reigh-Worker && git pull --ff-only`
4. Kill + restart worker process (see above)

**Multiple pods** share the same `/workspace/` volume, so `git pull` on one updates all. The startup template still accepts transient Wan2GP subtree drift during rollout, but the canonical runtime dependency set comes from the root `uv.lock`.
Pods can be queried programmatically via RunPod GraphQL API (credentials in `~/Documents/Arnold/.env`).

**Rollback story:**
- There is no runtime pip fallback on the migrated branch.
- If the first uv-based startup fails on a machine with an older virtualenv, restore the latest `venv.pre-uv-*` or `.venv.pre-uv-*` backup and remove `.uv-migrated`.
- If the release must be rolled back, revert the uv rollout commits and return to the pre-uv revision that still bootstraps from `requirements.txt`.

#### Worker Configuration
The worker polls the same task queue but specializes in video generation:
- Connects to Supabase using environment credentials
- Claims tasks with `tool_id` matching its capabilities
- Updates task status and uploads results to designated storage buckets
- Uses PostgreSQL (Supabase) for both local development and production

### 3. Task Completion
- Worker calls `complete_task` Edge Function with:
  - Task ID
  - Output data (URLs, metadata)
  - Error info (if failed)
- Edge Function:
  - Updates task status using `func_mark_task_complete` or `func_mark_task_failed`
  - Deducts credits from user's balance
  - **Variant vs Generation Logic**: If task has `based_on` parameter, creates a `generation_variant` on the source generation. If `create_as_generation=true` flag is set, overrides this and creates a new `generation` with `based_on` for lineage tracking instead.
- **SQL Trigger** (`create_generation_on_task_complete`):
  - Automatically creates `generations` records when status → `Complete`
  - Normalizes image paths (removes local server IPs)
  - Creates `shot_generations` links if applicable
  - All processing happens instantly in the database

### 4. Real-time Updates
- **Database Triggers** automatically broadcast changes via Supabase Realtime
- **Instant processing** when tasks complete (no 10-second delay)
- Client subscribes via the realtime system (`RealtimeProvider`; see [`realtime_system.md`](realtime_system.md))
- UI updates automatically as task progresses

## Debugging

See [`debugging.md`](debugging.md) for full debugging tools (CLI, SQL views, frontend logging).

For task-specific debugging: `cd scripts && python3 debug.py task <task_id>` shows the full timeline including trigger execution and generation creation.
