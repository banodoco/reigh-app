-- Add missing index on shot_generations(generation_id)
--
-- Problem: sync_shot_data_update_batch() (per-statement UPDATE trigger) does:
--   SELECT sg.generation_id, sg.shot_id, jsonb_agg(sg.timeline_frame)
--   FROM shot_generations sg
--   WHERE sg.generation_id IN (affected_gen_ids)
--   GROUP BY sg.generation_id, sg.shot_id
--
-- Without an index on generation_id, this is a full table scan on every
-- timeline drag/batch reorder, causing 8+ second RPC delays.
--
-- The same scan is also done by sync_shot_to_generation() (per-row, INSERT/DELETE).
--
-- Fix: add a btree index on shot_generations.generation_id so all trigger
-- queries become index scans (O(matching rows) instead of O(total rows)).

CREATE INDEX IF NOT EXISTS idx_shot_generations_generation_id
  ON shot_generations (generation_id);

COMMENT ON INDEX idx_shot_generations_generation_id IS
'Enables fast lookup in sync_shot_data_update_batch() and sync_shot_to_generation()
triggers when aggregating shot_data for a generation. Without this index those
functions do a full table scan on every shot_generations UPDATE.';
