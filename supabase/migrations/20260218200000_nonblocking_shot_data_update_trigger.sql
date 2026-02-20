-- Fix: make sync_shot_data_update_batch non-blocking using SKIP LOCKED.
--
-- Root cause of timeline drag snap-back:
--   1. authenticated role has statement_timeout = 8s.
--   2. batch_update_timeline_frames UPDATE fires the trigger.
--   3. Trigger tries to UPDATE generations.shot_data for the affected generation.
--   4. A concurrent transaction (background worker writing generation output/status)
--      holds a row lock on that generations row.
--   5. Trigger blocks waiting for the lock — hits the 8s statement_timeout.
--   6. DB kills the statement; entire RPC transaction rolls back.
--   7. Client receives error, runs rollback(), releases lock, snap-back occurs.
--
-- Fix:
--   Acquire row locks on affected generations WITH SKIP LOCKED.
--   Rows locked by concurrent transactions are skipped immediately instead of
--   blocking. Skipped rows are stale until the next shot_generations write that
--   touches the same generation_id, which will re-sync them at that point.
--
-- This makes the trigger effectively instantaneous regardless of lock contention.

CREATE OR REPLACE FUNCTION sync_shot_data_update_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH affected_gen_ids AS (
    SELECT DISTINCT generation_id
    FROM new_table
    WHERE generation_id IS NOT NULL
  ),
  -- Acquire row locks on affected generations WITHOUT WAITING.
  -- Rows currently locked by another transaction are skipped; they will be
  -- re-aggregated on the next shot_generations write to the same generation_id.
  locked_gen_ids AS (
    SELECT id
    FROM generations
    WHERE id IN (SELECT generation_id FROM affected_gen_ids)
    FOR UPDATE SKIP LOCKED
  ),
  aggregated AS (
    SELECT
      sub.generation_id,
      COALESCE(
        jsonb_object_agg(sub.shot_id_key, sub.frames),
        '{}'::jsonb
      ) AS shot_data
    FROM (
      SELECT
        sg.generation_id,
        sg.shot_id::text AS shot_id_key,
        jsonb_agg(sg.timeline_frame ORDER BY sg.timeline_frame NULLS LAST) AS frames
      FROM shot_generations sg
      WHERE sg.generation_id IN (SELECT id FROM locked_gen_ids)
      GROUP BY sg.generation_id, sg.shot_id
    ) sub
    GROUP BY sub.generation_id
  )
  UPDATE generations g
  SET shot_data = agg.shot_data
  FROM aggregated agg
  WHERE g.id = agg.generation_id;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION sync_shot_data_update_batch() IS
'Per-statement UPDATE trigger: re-aggregates generations.shot_data for all
generation_ids touched by the UPDATE statement in a single SQL pass.
Uses SKIP LOCKED to avoid blocking on locked generations rows — locked rows
are skipped and will re-sync on the next shot_generations write.';
