-- Backfill: restore primary variant for generations that have variants but no primary.
--
-- The old demote_orphaned_video_variants RPC set is_primary = false without
-- promoting a replacement, leaving ~178 generations in a broken state.
--
-- This migration promotes the most recently created variant to primary for each
-- affected generation. The sync_generation_from_primary_variant trigger will
-- automatically update the generation's location, thumbnail_url, and primary_variant_id.

WITH orphaned AS (
  SELECT gv.generation_id
  FROM generation_variants gv
  GROUP BY gv.generation_id
  HAVING bool_or(gv.is_primary) = false
),
to_promote AS (
  SELECT DISTINCT ON (gv.generation_id)
    gv.id as variant_id,
    gv.generation_id
  FROM generation_variants gv
  JOIN orphaned o ON o.generation_id = gv.generation_id
  ORDER BY gv.generation_id, gv.created_at DESC
)
UPDATE generation_variants gv
SET is_primary = true
FROM to_promote tp
WHERE gv.id = tp.variant_id;
