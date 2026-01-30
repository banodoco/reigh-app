-- ============================================================================
-- FIX: Restore orchestrator_status schema + secure active_workers_health
-- ============================================================================
-- Previous migration accidentally changed orchestrator_status from aggregate
-- counts to individual rows. This fixes that and adds security_invoker.
-- Also adds security_invoker to active_workers_health.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. orchestrator_status - Restore original aggregate schema with security
-- ============================================================================
DROP VIEW IF EXISTS orchestrator_status;

CREATE VIEW orchestrator_status
WITH (security_invoker = true)
AS
SELECT
    -- Task counts by status (with enum casting)
    -- With security_invoker, this only counts the current user's tasks
    COUNT(CASE WHEN t.status = 'Queued'::task_status THEN 1 END) as queued_tasks,
    COUNT(CASE WHEN t.status = 'In Progress'::task_status THEN 1 END) as running_tasks,
    COUNT(CASE WHEN t.status = 'Complete'::task_status THEN 1 END) as completed_tasks,
    COUNT(CASE WHEN t.status = 'Failed'::task_status THEN 1 END) as error_tasks,
    COUNT(CASE WHEN t.status = 'Failed'::task_status THEN 1 END) as failed_tasks,

    -- Worker counts by status (workers table allows authenticated SELECT)
    (SELECT COUNT(*) FROM workers WHERE status = 'inactive') as inactive_workers,
    (SELECT COUNT(*) FROM workers WHERE status = 'active') as active_workers,
    (SELECT COUNT(*) FROM workers WHERE status = 'terminated') as terminated_workers,

    -- Include external workers
    (SELECT COUNT(*) FROM workers WHERE instance_type = 'external' AND status = 'active') as external_workers,

    -- Health metrics (these will be filtered to current user's tasks)
    (SELECT COUNT(*) FROM workers WHERE status IN ('active', 'external') AND last_heartbeat < NOW() - INTERVAL '5 minutes') as stale_workers,
    (SELECT COUNT(*) FROM tasks WHERE status = 'In Progress'::task_status AND generation_started_at < NOW() - INTERVAL '10 minutes') as stuck_tasks,

    -- Current timestamp
    NOW() as snapshot_time
FROM tasks t;

GRANT SELECT ON orchestrator_status TO authenticated;

COMMENT ON VIEW orchestrator_status IS
  'Orchestrator status counts. With security_invoker, task counts are filtered to current user only.';

-- ============================================================================
-- 2. active_workers_health - Add security_invoker
-- ============================================================================
-- This view joins workers to tasks. Without security_invoker, it could expose
-- task info (current_task_id, current_task_type) across users.

DROP VIEW IF EXISTS active_workers_health;

CREATE VIEW active_workers_health
WITH (security_invoker = true)
AS
SELECT
    w.id,
    w.instance_type,
    w.status,
    w.created_at,
    w.last_heartbeat,
    CASE
        WHEN w.last_heartbeat IS NOT NULL THEN
            EXTRACT(EPOCH FROM (NOW() - w.last_heartbeat))
        ELSE NULL
    END as heartbeat_age_seconds,

    -- VRAM metrics from metadata (if available)
    (w.metadata->>'vram_total_mb')::int as vram_total_mb,
    (w.metadata->>'vram_used_mb')::int as vram_used_mb,
    CASE
        WHEN (w.metadata->>'vram_total_mb')::int > 0 THEN
            ROUND(((w.metadata->>'vram_used_mb')::numeric * 100.0) / (w.metadata->>'vram_total_mb')::numeric, 1)
        ELSE NULL
    END as vram_usage_percent,

    -- Current task info (filtered by RLS with security_invoker)
    t.id as current_task_id,
    t.status::text as current_task_status,
    t.task_type as current_task_type,
    CASE
        WHEN t.generation_started_at IS NOT NULL THEN
            EXTRACT(EPOCH FROM (NOW() - t.generation_started_at))
        ELSE NULL
    END as current_task_age_seconds
FROM workers w
LEFT JOIN tasks t ON t.worker_id = w.id AND t.status = 'In Progress'::task_status
WHERE w.status IN ('active', 'inactive');

GRANT SELECT ON active_workers_health TO authenticated;

COMMENT ON VIEW active_workers_health IS
  'Worker health metrics with current task info. Task info filtered to user via security_invoker.';

-- ============================================================================
-- 3. VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ VIEW SECURITY FIX APPLIED:';
  RAISE NOTICE '   - orchestrator_status: Schema restored, security_invoker added';
  RAISE NOTICE '   - active_workers_health: security_invoker added';
END $$;

COMMIT;
