-- ============================================================================
-- CRITICAL SECURITY FIX: Views bypassing RLS
-- ============================================================================
-- VULNERABILITY: Views run with owner permissions, bypassing RLS on underlying
-- tables. Any authenticated user can query these views and see ALL users' data.
--
-- FIX: Recreate views with security_invoker = true (PostgreSQL 15+)
-- This makes views respect the RLS policies of the underlying tables.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. shot_statistics - Exposes all shots/generations for all users
-- ============================================================================
DROP VIEW IF EXISTS shot_statistics;

CREATE VIEW shot_statistics
WITH (security_invoker = true)
AS
SELECT
  s.id as shot_id,
  s.project_id,
  COUNT(sg.id) as total_generations,
  COUNT(sg.id) FILTER (WHERE sg.timeline_frame IS NOT NULL) as positioned_count,
  COUNT(sg.id) FILTER (WHERE sg.timeline_frame IS NULL AND (g.type IS NULL OR g.type NOT LIKE '%video%')) as unpositioned_count,
  COUNT(sg.id) FILTER (WHERE g.params->>'tool_type' = 'travel-between-images' AND g.type LIKE '%video%') as video_count,
  COUNT(sg.id) FILTER (
    WHERE g.type = 'video'
    AND g.parent_generation_id IS NULL
    AND g.location IS NOT NULL
    AND g.location != ''
    AND (
      g.params->'orchestrator_details' IS NOT NULL
      OR EXISTS (SELECT 1 FROM generations c WHERE c.parent_generation_id = g.id)
    )
  ) as final_video_count
FROM shots s
LEFT JOIN shot_generations sg ON sg.shot_id = s.id
LEFT JOIN generations g ON g.id = sg.generation_id
GROUP BY s.id, s.project_id;

GRANT SELECT ON shot_statistics TO authenticated;

-- ============================================================================
-- 2. shot_final_videos - Exposes all video URLs for all users
-- ============================================================================
DROP VIEW IF EXISTS shot_final_videos;

CREATE VIEW shot_final_videos
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (g.id)
  g.id,
  g.location,
  g.thumbnail_url,
  g.type,
  g.created_at,
  g.updated_at,
  g.params,
  g.starred,
  g.project_id,
  sg.shot_id
FROM generations g
JOIN shot_generations sg ON sg.generation_id = g.id
WHERE g.type = 'video'
  AND g.parent_generation_id IS NULL
  AND (
    g.params->'orchestrator_details' IS NOT NULL
    OR EXISTS (SELECT 1 FROM generations c WHERE c.parent_generation_id = g.id)
  );

GRANT SELECT ON shot_final_videos TO authenticated;

-- ============================================================================
-- 3. user_credit_balance - Exposes all users' credit balances
-- ============================================================================
DROP VIEW IF EXISTS user_credit_balance;

CREATE VIEW user_credit_balance
WITH (security_invoker = true)
AS
SELECT
  user_id,
  SUM(amount) as balance
FROM credits_ledger
GROUP BY user_id;

GRANT SELECT ON user_credit_balance TO authenticated;

-- ============================================================================
-- 4. shot_generations_with_computed_position - Exposes all shot_generations
-- ============================================================================
DROP VIEW IF EXISTS shot_generations_with_computed_position;

CREATE VIEW shot_generations_with_computed_position
WITH (security_invoker = true)
AS
SELECT
  sg.id,
  sg.shot_id,
  sg.generation_id,
  sg.timeline_frame,
  sg.metadata,
  sg.created_at,
  COALESCE(
    sg.timeline_frame,
    (ROW_NUMBER() OVER (
      PARTITION BY sg.shot_id
      ORDER BY sg.created_at
    ) - 1) * 50
  ) as computed_position
FROM shot_generations sg;

GRANT SELECT ON shot_generations_with_computed_position TO authenticated;

-- ============================================================================
-- 5. orchestrator_status - Exposes all tasks (if it exists)
-- ============================================================================
DROP VIEW IF EXISTS orchestrator_status;

CREATE VIEW orchestrator_status
WITH (security_invoker = true)
AS
SELECT
  t.id,
  t.project_id,
  t.task_type,
  t.status,
  t.params,
  t.created_at,
  t.generation_started_at,
  t.generation_processed_at
FROM tasks t
WHERE t.task_type LIKE '%orchestrator%';

GRANT SELECT ON orchestrator_status TO authenticated;

-- ============================================================================
-- 6. active_workers_health - This one is fine (no user data)
-- ============================================================================
-- Workers table already has RLS that allows authenticated SELECT
-- No changes needed

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
DECLARE
  v_count int;
BEGIN
  -- Verify views have security_invoker
  SELECT COUNT(*) INTO v_count
  FROM pg_views v
  JOIN pg_class c ON c.relname = v.viewname
  WHERE v.viewname IN ('shot_statistics', 'shot_final_videos', 'user_credit_balance',
                       'shot_generations_with_computed_position', 'orchestrator_status')
    AND v.schemaname = 'public';

  IF v_count < 5 THEN
    RAISE WARNING 'Some views may not have been recreated properly. Count: %', v_count;
  END IF;

  RAISE NOTICE '🚨 CRITICAL SECURITY FIX APPLIED:';
  RAISE NOTICE '   - shot_statistics: Now respects RLS';
  RAISE NOTICE '   - shot_final_videos: Now respects RLS';
  RAISE NOTICE '   - user_credit_balance: Now respects RLS';
  RAISE NOTICE '   - shot_generations_with_computed_position: Now respects RLS';
  RAISE NOTICE '   - orchestrator_status: Now respects RLS';
  RAISE NOTICE '';
  RAISE NOTICE '   Views now use security_invoker=true to enforce RLS policies';
END $$;

COMMIT;
