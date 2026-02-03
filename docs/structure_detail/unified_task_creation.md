# Unified Task Creation System

## Purpose

Single `create-task` edge function replaces per-tool edge functions. Parameter processing happens client-side; the edge function only authenticates and inserts into `tasks`.

## Source of Truth

| What | Where |
|------|-------|
| Shared utilities (`createTask`, `generateTaskId`, etc.) | `src/shared/lib/taskCreation.ts` |
| Task-specific helpers | `src/shared/lib/tasks/*.ts` |
| Edge function | `supabase/functions/create-task/` |
| Task type routing | `task_types` table (DB) |

## Architecture

```
UI Component
  → Task Helper (src/shared/lib/tasks/*.ts) — validates, builds payload
    → createTask() (src/shared/lib/taskCreation.ts)
      → create-task Edge Function — authenticates, inserts row
        → DB Trigger: on_task_created — looks up task_types, sets run_type
          → Worker picks up task (see task_worker_lifecycle.md)
```

## Authentication Flow

The `create-task` edge function supports three auth methods, checked in order:

| Method | When Used | How It Works |
|--------|-----------|--------------|
| Service Role | Internal/server calls | Token matches `SERVICE_ROLE_KEY` |
| JWT | Frontend (Supabase auth) | Decodes JWT, extracts `payload.sub` as user ID |
| PAT | External API integrations | Looks up token in `user_api_tokens` table |

## The `task_type` to `task_types` Contract

When `createTask({ task_type: 'travel_orchestrator', ... })` is called:

1. `task_type` string is stored in `tasks.task_type` column
2. DB trigger `on_task_created` looks up this string in `task_types.name`
3. The matching row's `run_type` (`'gpu'` or `'api'`) determines which worker pool claims it
4. **If no matching `task_types` row exists, defaults to `run_type='gpu'`**

The `task_types` table also carries `category`, `base_cost_per_second`, and `cost_factors` for billing. See the table definition in migrations.

## Full Task Lifecycle

```
┌──────────────────────────────────────────────────────────────────┐
│                   TASK CREATION (this doc)                        │
├──────────────────────────────────────────────────────────────────┤
│  UI → Task Helper → createTask() → create-task EF               │
│       │  Validates params, builds payload    │  Auth + INSERT    │
│       │                                      ▼                   │
│       │                          tasks row (status='Pending')    │
│       │                                      │                   │
│       ▼                                      ▼                   │
│                      DB Trigger: on_task_created                 │
│                      Looks up task_types → sets run_type         │
└──────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│              TASK EXECUTION (task_worker_lifecycle.md)            │
├──────────────────────────────────────────────────────────────────┤
│  Worker polls for tasks matching its run_type                    │
│       → Claims task (status → 'Processing')                      │
│       → Executes (GPU inference / API call)                      │
│       → Calls complete-task EF                                   │
│            → status → 'Complete' or 'Failed'                     │
│            → Creates generation records                          │
│            → Triggers realtime updates                           │
└──────────────────────────────────────────────────────────────────┘
```

## API Param Naming Conventions

| Context | Convention | Example |
|---------|------------|---------|
| API params (to backend) | `snake_case` | `structure_video_path` |
| React props (UI-only) | `camelCase` | `onStructureVideoChange` |
| Config objects (API-bound) | `snake_case` fields | `structureVideoConfig.structure_video_path` |
| Hook return values | `camelCase` wrapper | `structureVideoConfig` (contains snake_case fields) |

**Why:** API-bound config objects use `snake_case` so they can be spread directly into the request payload without field-name conversion.

### Adding a new API param

| Step | Location |
|------|----------|
| 1. Add to API interface | `src/shared/lib/tasks/*.ts` (e.g., add field to `VideoStructureApiParams`) |
| 2. Add default (if needed) | Same file, in the `DEFAULT_*` constant |
| 3. Add to UI config | Hook file — TypeScript enforces via `extends` |
| 4. Done | Param flows through automatically via spread |

## Key Invariants

- Every `task_type` string passed to `createTask()` should have a matching `task_types.name` row. Missing rows silently default to `run_type='gpu'`.
- Task helpers in `src/shared/lib/tasks/` own all validation and payload construction. The edge function is intentionally thin.
- The `create-task` edge function never transforms params — it stores them as-is in `tasks.params`.
- Authentication order matters: Service Role > JWT > PAT. First match wins.
- `generateTaskId()` creates a prefixed UUID stored in `tasks.params`, not as the DB primary key.

## Error Handling

Errors follow the patterns in `error_handling.md`. Common categories:

| Error Type | Cause |
|------------|-------|
| Validation | Missing/invalid params (caught client-side in task helper) |
| Authentication | Missing or invalid token in edge function |
| Authorization | User doesn't own the target project |
| Database | Constraint violations on INSERT |
