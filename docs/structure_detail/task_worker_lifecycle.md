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

### Detailed Processing Flow  
For a complete step-by-step breakdown with error handling, see: [**Task Processing Deep Dive**](task_processing_deep_dive.md)

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
# Clone the worker repository
git clone https://github.com/peteromallet/Headless-Wan2GP.git
cd Headless-Wan2GP

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your Supabase credentials and API keys

# Run the worker
python main.py
```

**Cloud Deployment**
- Deploy to GPU-enabled cloud instances (AWS, Google Cloud, etc.)
- Requires CUDA-compatible GPU for video generation
- Configure with production Supabase credentials
- Multiple workers can run simultaneously for parallel processing

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
- Client subscribes using `useWebSocket` hook
- UI updates automatically as task progresses

## Debugging

See [`debugging.md`](debugging.md) for full debugging tools (CLI, SQL views, frontend logging).

For task-specific debugging: `cd scripts && python3 debug.py task <task_id>` shows the full timeline including trigger execution and generation creation.