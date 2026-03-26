# Unified Task Creation System

## Purpose

Single `create-task` edge function handles all task creation. Clients send minimal intent (family + input); the edge function resolves defaults, validates, formats params, and inserts into `tasks`.

## Source of Truth

| What | Where |
|------|-------|
| Client helper (`createTask`) | `src/shared/lib/taskCreation/createTask.ts` |
| Shared utilities (`generateTaskId`, etc.) | `src/shared/lib/taskCreation/` |
| Edge function + resolvers | `supabase/functions/create-task/` |
| Family resolvers | `supabase/functions/create-task/resolvers/` |
| Task type routing | `task_types` table (DB) |

## Architecture

```
UI Component
  → createTask({ family, project_id, input })
    → create-task Edge Function
      → Auth (JWT/PAT/service-role)
      → Resolver dispatch (family → resolver function)
        → Resolver: validates, fills defaults, formats params, generates IDs
      → INSERT into tasks table (batch: N inserts in a loop)
      → Response: { task_id } or { task_ids } for batch
        → DB Trigger: on_task_created — looks up task_types, sets run_type
          → Worker picks up task (see task_worker_lifecycle.md)
```

## Request Format

```json
{
  "family": "image_generation",
  "project_id": "...",
  "input": {
    "prompt": "a sunset over mountains",
    "model_name": "wan_2_2_t2i",
    "count": 4
  },
  "idempotency_key": "..."
}
```

## Response Format

Single task:
```json
{ "task_id": "...", "status": "Task queued" }
```

Batch (count > 1):
```json
{ "task_ids": ["...", "..."], "status": "Task queued" }
```

With metadata (e.g., travel):
```json
{ "task_id": "...", "status": "Task queued", "meta": { "parentGenerationId": "..." } }
```

## Task Families

| Family | Resolver | Batch | Notes |
|--------|----------|-------|-------|
| `image_generation` | `imageGeneration.ts` | Yes (prompts × count) | Resolution scaling, LoRA formatting, references, hires fix |
| `image_upscale` | `imageUpscale.ts` | No | Lineage tracking |
| `video_enhance` | `videoEnhance.ts` | No | Interpolation + upscale modes |
| `z_image_turbo_i2i` | `zImageTurboI2I.ts` | Yes (numImages) | Different LoRA format ({path, scale}) |
| `magic_edit` | `magicEdit.ts` | Yes (numImages) | Resolution from project settings |
| `masked_edit` | `maskedEdit.ts` | Yes (num_generations) | Inpaint + annotated edit |
| `join_clips` | `joinClips.ts` | No | Phase config, VACE, per-join overrides |
| `individual_travel_segment` | `individualTravelSegment.ts` | No | DB queries for generation routing |
| `travel_between_images` | `travelBetweenImages.ts` | No | Returns parentGenerationId in meta |
| `crossfade_join` | `crossfadeJoin.ts` | No | Simple crossfade |
| `edit_video_orchestrator` | `editVideoOrchestrator.ts` | No | Video editing orchestration |
| `character_animate` | `characterAnimate.ts` | No | Character animation |

## Adding a New Task Family

1. Create `supabase/functions/create-task/resolvers/myFamily.ts`
2. Implement the `TaskFamilyResolver` interface: `(request, context) => Promise<ResolverResult>`
3. Register in `resolvers/registry.ts`
4. Ensure a matching `task_types.name` row exists in DB

## Resolver Interface

```typescript
interface ResolveRequest {
  family: string;
  project_id: string;
  input: Record<string, unknown>;
}

interface ResolverContext {
  supabaseAdmin: SupabaseClient;
  projectId: string;
  aspectRatio: string | null;
  logger: Logger;
}

interface ResolverResult {
  tasks: TaskInsertObject[];
  meta?: Record<string, unknown>;
}
```

## Authentication Flow

| Method | When Used | How It Works |
|--------|-----------|--------------|
| Service Role | Internal/server calls | Token matches `SERVICE_ROLE_KEY` |
| JWT | Frontend (Supabase auth) | Decodes JWT, extracts `payload.sub` as user ID |
| PAT | External API integrations | Looks up token in `user_api_tokens` table |

## Batch Idempotency

- Client sends a stable `idempotency_key` with each request
- For batch (count > 1), server derives per-task keys: `SHA-256(clientKey + ":" + taskIndex)`
- Retries produce identical keys → duplicates recovered via existing 23505 handler

## The `task_type` to `task_types` Contract

When a resolver produces `{ task_type: 'travel_orchestrator', ... }`:

1. `task_type` string is stored in `tasks.task_type` column
2. DB trigger `on_task_created` looks up this string in `task_types.name`
3. The matching row's `run_type` (`'gpu'` or `'api'`) determines which worker pool claims it
4. **If no matching `task_types` row exists, defaults to `run_type='gpu'`**

## Key Invariants

- All param building, validation, defaults, and formatting happens in server-side resolvers, not client-side.
- Resolvers must produce params blobs that match what workers expect — workers are not changed.
- The `family` field is required on every request. There is no raw `{ params, task_type }` path.
- Authentication order matters: Service Role > JWT > PAT. First match wins.
- `generateTaskId()` creates a prefixed UUID stored in `tasks.params`, not as the DB primary key.
- Resolution is resolved server-side from project's `aspect_ratio` setting.

## Error Handling

| Error Type | Cause |
|------------|-------|
| Validation | Missing/invalid params (caught in resolver, returned as 400) |
| Authentication | Missing or invalid token |
| Authorization | User doesn't own the target project |
| Unknown family | `family` value not in resolver registry |
| Database | Constraint violations on INSERT |
