# Edge Functions Reference

> **Source of truth**: `supabase/functions/` — run `ls` for full inventory.
> Deploy individually: `npx supabase functions deploy <name> --project-ref wczysqzxlwdndgxitrvc`

---

## Non-obvious Behavior

| Function | Gotcha / Invariant |
|----------|-------------------|
| `complete_task` | Supports `create_as_generation` flag — forces a new generation instead of a variant even when `based_on` is present. Without it, `based_on` always creates a variant. |
| `claim-next-task` | Uses **model affinity**: prefers queued tasks whose model matches the worker's currently loaded model, reducing cold-start swaps. |
| `update-worker-model` | Workers report their loaded model here; this is what enables affinity matching in `claim-next-task`. |
| `create-task` | Validates credit balance **before** inserting the task; task is created in `queued` status. |
| `update-shot-pair-prompts` | Called by orchestrator tasks to write `pair_prompt` / `enhanced_prompt` back to `shot_generations` metadata. |

## Authentication

| Method | When to use |
|--------|------------|
| **PAT tokens** (`generate-pat` / `revoke-pat`) | External (local) workers — revocable, scoped to user. |
| **Service Role key** | Cloud-based processing — higher privileges, rate-limited. |

## Performance Notes

- **Task completion** side-effects (generation creation, credit deduction) now run via **SQL triggers**, not Edge Functions. The Edge Function writes the result row; triggers do the rest.
- Prefer DB functions / RPCs over multiple Edge Function calls for transactional work.

## Integration Contracts

- External workers must send payloads in **Headless-Wan2GP** format.
- All task status changes broadcast via **Supabase Realtime** (no polling needed client-side).
- Functions return standardized error JSON — see `error_handling.md`.

---

**Related**: [Task Worker Lifecycle](task_worker_lifecycle.md) | [Database & Storage](db_and_storage.md)
