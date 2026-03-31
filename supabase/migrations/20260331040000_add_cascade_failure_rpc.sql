-- Replace PostgREST JSON path filters with a direct SQL function for cascading failures.
-- PostgREST has a persistent issue resolving the `params` column in .or() JSON path filters,
-- producing "column tasks.params does not exist" errors despite the column existing.

create or replace function public.cascade_task_failure(
  p_orchestrator_task_id uuid,
  p_failed_task_id uuid,
  p_failure_status text,
  p_is_orchestrator_task boolean
)
returns setof uuid
language sql
security definer
set search_path = public
as $$
  update tasks
  set
    status = p_failure_status,
    updated_at = now(),
    error_message = 'Cascaded ' || lower(p_failure_status) || ' from related task ' || p_failed_task_id::text
  where
    id <> p_failed_task_id
    and status not in ('Complete', 'Failed', 'Cancelled')
    and (
      -- Match the orchestrator itself (when a child fails)
      (not p_is_orchestrator_task and id = p_orchestrator_task_id)
      -- Match sub-tasks by any param path referencing the orchestrator
      or params->>'orchestrator_task_id_ref' = p_orchestrator_task_id::text
      or params->'orchestration_contract'->>'orchestrator_task_id' = p_orchestrator_task_id::text
      or params->>'orchestrator_task_id' = p_orchestrator_task_id::text
      or params->'orchestrator_details'->>'orchestrator_task_id' = p_orchestrator_task_id::text
      or params->'originalParams'->'orchestrator_details'->>'orchestrator_task_id' = p_orchestrator_task_id::text
    )
  returning id;
$$;
