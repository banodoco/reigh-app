-- Emergency fix: drop broken triggers created by 20260218175000
--
-- Problem: 20260218175000_batch_trigger_for_timeline_updates.sql created:
--   1. sync_shot_generations_row   → calls sync_shot_to_generation()
--   2. sync_shot_generations_update_batch → calls sync_shot_to_generation_update_batch()
--
-- Both functions reference generations.shot_id and generations.timeline_frame,
-- columns that DO NOT EXIST on the generations table (they were planned but
-- never applied / later dropped). Every INSERT, UPDATE, or DELETE on
-- shot_generations now raises:
--   ERROR: column "shot_id" of relation "generations" does not exist
--
-- Fix: drop both broken triggers and replace with a single trigger
-- that uses sync_shot_to_generation_jsonb(), which only touches
-- generations.shot_data (the column that actually exists).

-- ── 1. Drop broken triggers ───────────────────────────────────────────────────
DROP TRIGGER IF EXISTS sync_shot_generations_row ON shot_generations;
DROP TRIGGER IF EXISTS sync_shot_generations_update_batch ON shot_generations;
DROP FUNCTION IF EXISTS sync_shot_to_generation_update_batch();

-- ── 2. Attach the safe function to a per-row trigger for all ops ──────────────
-- sync_shot_to_generation_jsonb() does a full re-aggregate of shot_data for
-- the affected generation_id. It only updates generations.shot_data (which
-- exists). It handles INSERT, UPDATE, and DELETE.
DROP TRIGGER IF EXISTS sync_shot_generations_jsonb ON shot_generations;

CREATE TRIGGER sync_shot_generations_jsonb
AFTER INSERT OR UPDATE OR DELETE ON shot_generations
FOR EACH ROW
EXECUTE FUNCTION sync_shot_to_generation_jsonb();

COMMENT ON TRIGGER sync_shot_generations_jsonb ON shot_generations IS
'Keeps generations.shot_data in sync via sync_shot_to_generation_jsonb().
Fires per-row for INSERT/UPDATE/DELETE. Only touches generations.shot_data.
Replaced the broken sync_shot_generations_row and sync_shot_generations_update_batch
triggers from 20260218175000 which referenced non-existent generations.shot_id column.';
