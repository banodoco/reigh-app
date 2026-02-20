-- Replace per-row UPDATE trigger with a per-statement UPDATE trigger
--
-- Problem: sync_shot_to_generation_jsonb fires FOR EACH ROW on UPDATE.
-- For a 12-row batch update (typical timeline drag), this runs 12 times.
-- Each call does 2 SELECT + 1 UPDATE against `generations` → ~36 DB ops,
-- all inside the same transaction → 8-24s RPC latency.
--
-- Fix:
--   • INSERT/DELETE keep the per-row trigger (these are rare, overhead OK).
--   • UPDATE gets a per-statement trigger using REFERENCING NEW TABLE AS new_table,
--     which re-aggregates all affected generation_ids in a SINGLE SQL pass → O(1).
--
-- Net effect: a 12-row timeline drag goes from ~36 DB round-trips to ~2.

-- ── 1. Replace the combined per-row trigger with INSERT/DELETE only ────────────
-- Drop the combined trigger created in 20260218180000 (handles INSERT, UPDATE, DELETE).
DROP TRIGGER IF EXISTS sync_shot_generations_jsonb ON shot_generations;

-- Re-attach the same function, but INSERT/DELETE only.
CREATE TRIGGER sync_shot_generations_jsonb_row
AFTER INSERT OR DELETE ON shot_generations
FOR EACH ROW
EXECUTE FUNCTION sync_shot_to_generation_jsonb();

COMMENT ON TRIGGER sync_shot_generations_jsonb_row ON shot_generations IS
'Keeps generations.shot_data in sync for INSERT and DELETE via sync_shot_to_generation_jsonb().
Per-row — these operations are rare so overhead is acceptable.';

-- ── 2. Batch UPDATE function ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_shot_data_update_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Collect every distinct generation_id touched by this UPDATE statement,
  -- re-aggregate their shot_data in a single pass, and write one UPDATE to
  -- generations instead of one UPDATE per row.
  WITH affected_gen_ids AS (
    SELECT DISTINCT generation_id
    FROM new_table
    WHERE generation_id IS NOT NULL
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
      WHERE sg.generation_id IN (SELECT generation_id FROM affected_gen_ids)
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
'Per-statement replacement for the per-row UPDATE path of sync_shot_to_generation_jsonb().
Re-aggregates shot_data for all generation_ids touched by the UPDATE statement in a single
SQL pass (O(1) queries) instead of one re-aggregate per updated row (O(N) queries).
Only touches generations.shot_data — does not reference shot_id or timeline_frame.';

-- ── 3. Attach per-statement trigger for UPDATE ────────────────────────────────
DROP TRIGGER IF EXISTS sync_shot_generations_update_batch ON shot_generations;

CREATE TRIGGER sync_shot_generations_update_batch
AFTER UPDATE ON shot_generations
REFERENCING NEW TABLE AS new_table
FOR EACH STATEMENT
EXECUTE FUNCTION sync_shot_data_update_batch();

COMMENT ON TRIGGER sync_shot_generations_update_batch ON shot_generations IS
'Keeps generations.shot_data in sync for UPDATE via sync_shot_data_update_batch().
Per-statement with REFERENCING NEW TABLE — processes all rows in the statement
in one aggregation pass regardless of batch size.';
