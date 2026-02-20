-- Batch-mode shot_data sync for timeline frame updates
--
-- Problem: sync_shot_to_generation() fires FOR EACH ROW on UPDATE. For each
-- row it does a full re-aggregate of ALL shot_generations for that generation
-- (SELECT with GROUP BY + jsonb_agg) then a scalar SELECT then an UPDATE on
-- generations. For a 7-row batch drag that is 21+ sequential queries inside
-- one transaction → 8-24s RPC times.
--
-- Fix: split the single FOR EACH ROW trigger into two:
--   1. INSERT/DELETE keep the existing per-row trigger (rare operations).
--   2. UPDATE gets a new FOR EACH STATEMENT trigger using REFERENCING NEW TABLE
--      which re-aggregates all affected generation_ids in a single SQL pass.
--
-- Net effect: batch_update_timeline_frames goes from O(N) queries to O(1).

-- ── 1. Drop the existing combined trigger ────────────────────────────────────
DROP TRIGGER IF EXISTS sync_shot_generations ON shot_generations;

-- ── 2. Re-create per-row trigger for INSERT / DELETE only ────────────────────
-- The existing sync_shot_to_generation() function handles these correctly.
-- We just exclude UPDATE from its scope.
CREATE TRIGGER sync_shot_generations_row
AFTER INSERT OR DELETE ON shot_generations
FOR EACH ROW
EXECUTE FUNCTION sync_shot_to_generation();

-- ── 3. Per-statement batch function for UPDATE ───────────────────────────────
CREATE OR REPLACE FUNCTION sync_shot_to_generation_update_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Collect distinct generation_ids touched by this UPDATE statement,
  -- re-aggregate their shot_data in one pass, and write one UPDATE to
  -- generations instead of N individual updates.
  WITH affected_gen_ids AS (
    SELECT DISTINCT generation_id
    FROM new_table
    WHERE generation_id IS NOT NULL
  ),
  -- Rebuild shot_data for every affected generation from the full
  -- shot_generations table (so unchanged shots in the same generation
  -- are preserved in the JSONB map).
  aggregated_shot_data AS (
    SELECT
      sg.generation_id,
      COALESCE(
        jsonb_object_agg(
          sub.shot_id_key,
          sub.frames
        ),
        '{}'::jsonb
      ) AS shot_data
    FROM (
      SELECT
        sg.generation_id,
        sg.shot_id::text AS shot_id_key,
        jsonb_agg(sg.timeline_frame ORDER BY sg.timeline_frame NULLS LAST) AS frames
      FROM shot_generations sg
      WHERE sg.generation_id IN (SELECT generation_id FROM affected_gen_ids)
      GROUP BY sg.generation_id, sg.shot_id
    ) sub
    JOIN (SELECT generation_id FROM affected_gen_ids) ag
      ON ag.generation_id = sub.generation_id
    GROUP BY sub.generation_id
  ),
  -- Pick the primary (most-recent) scalar values for shot_id + timeline_frame.
  primary_scalars AS (
    SELECT DISTINCT ON (sg.generation_id)
      sg.generation_id,
      sg.shot_id        AS primary_shot_id,
      sg.timeline_frame AS primary_timeline_frame
    FROM shot_generations sg
    WHERE sg.generation_id IN (SELECT generation_id FROM affected_gen_ids)
    ORDER BY sg.generation_id, sg.created_at DESC NULLS LAST, sg.id DESC
  )
  UPDATE generations g
  SET
    shot_data      = asd.shot_data,
    shot_id        = ps.primary_shot_id,
    timeline_frame = ps.primary_timeline_frame
  FROM aggregated_shot_data asd
  JOIN primary_scalars ps ON ps.generation_id = asd.generation_id
  WHERE g.id = asd.generation_id;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION sync_shot_to_generation_update_batch() IS
'Per-statement replacement for the per-row UPDATE path of sync_shot_to_generation().
Re-aggregates shot_data for all generation_ids touched by the statement in a single
SQL pass (O(1) queries) instead of one re-aggregate per row (O(N) queries).';

-- ── 4. Attach the per-statement trigger for UPDATE only ──────────────────────
CREATE TRIGGER sync_shot_generations_update_batch
AFTER UPDATE ON shot_generations
REFERENCING NEW TABLE AS new_table
FOR EACH STATEMENT
EXECUTE FUNCTION sync_shot_to_generation_update_batch();
