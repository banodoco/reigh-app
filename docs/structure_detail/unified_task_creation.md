# Canonical Astrid execution and task admission

Status: post-cutover CPU boundary, 2026-09-10.

Reigh is the client/editor and timeline consumer. Browser generation producers use the canonical task-creation client in `src/shared/lib/taskCreation/createTask.ts`, which admits a typed request through `src/integrations/astrid/client.ts`. Astrid Runtime owns task, run, receipt, event-history, and settlement authority. The Worker executes the admitted work through Runtime's `GenericPackHost`; Runtime settlement publishes output and provenance to CAS, and Reigh reads the result through the canonical gallery or timeline readback path.

## Supported execution path

```text
UI producer
  -> Reigh createTask
  -> Astrid Runtime admission (family, project, CAS/input refs, idempotency)
  -> Worker Runtime/GenericPackHost execution
  -> Runtime-owned settlement and receipts
  -> CAS/gallery/timeline readback
```

This path is the authority for supported image, video, character-animation, and related producers. Input identity, ordered inputs, output validation, idempotency, and publication are carried by the admitted Runtime task and its settlement fence.

The `supabase/functions/ai-timeline-agent` surface remains a timeline editing and read-context surface. Its timeline commands and existing canonical producer integrations may consume returned CAS media, but the agent does not create tasks, inspect legacy task rows, poll legacy workers, or perform generation settlement.

## Retired legacy boundary

`supabase/functions/create-task` now performs only CORS/auth bootstrap. An authenticated POST returns the stable non-retryable `410 legacy_task_endpoint_removed` response before any task, route, materialization, or recovery database operation.

The agent's historical `create_task`, `get_tasks`, and `delegateToBanodocoAgent` names are fail-closed compatibility stubs and are not model-visible. `run generate` is likewise retired from the live agent registry. There is no browser-side fallback to route derivation, `materialized_inputs`, legacy `task_types`, direct task insertion, or legacy task lifecycle writes.

## Worker and route boundary

The retained Worker route catalog and Stage1 substrate describe execution capability only. They are not an admission authority and do not justify a browser producer or a direct task-table write. Supported claim, progress, and settlement operations use the Runtime edge contract. Older Reigh status/retry helpers that still resolve Supabase function URLs are retained only as unreachable compatibility residue; they are not a supported Runtime path and remain covered by the residual reachability scan. The supported Worker has no direct database fallback for task lifecycle writes.

## Acceptance evidence

- Reigh source boundary: commit `87a98d3`.
- Worker retry boundary: commit `50c6bf1`; supported launcher lineage remains `41df4b0`.
- Affected Reigh edge suite: 190 tests passed.
- Canonical producer regression suite: 39 tests passed.
- Strict island typecheck and targeted lint passed.
- Worker focused residual suite: 30 tests passed.

These are CPU boundary claims. They do not claim GPU/model/provider availability. Final CR2 closure remains a separate evidence and review step.
