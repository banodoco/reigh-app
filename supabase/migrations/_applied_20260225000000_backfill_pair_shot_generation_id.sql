-- Backfill pair_shot_generation_id for all child video segments where it is NULL.
-- Two strategies: (A) from orchestrator_details JSONB, (B) via child_order positional lookup.

-- Step A: Backfill from orchestrator_details JSONB array (batch-generated segments)
-- These have pair_shot_generation_ids array in the parent's params but no individual column value.
UPDATE generations g
SET pair_shot_generation_id = (
  g.params->'orchestrator_details'->'pair_shot_generation_ids'->>(g.child_order::int)
)::uuid
WHERE g.type = 'video'
  AND g.is_child = true
  AND g.pair_shot_generation_id IS NULL
  AND g.child_order IS NOT NULL
  AND (g.params->'orchestrator_details'->'pair_shot_generation_ids'->>(g.child_order::int)) IS NOT NULL
  AND (g.params->'orchestrator_details'->'pair_shot_generation_ids'->>(g.child_order::int))::text ~ '^[0-9a-f]{8}-';

-- Step B: Backfill via child_order → N-th image slot in the parent's shot (last resort)
-- For segments with no JSONB data: find the shot through the parent generation's
-- shot_generations row, then pick the child_order-th image slot.
WITH parent_shots AS (
  SELECT DISTINCT ON (sg.generation_id)
    sg.generation_id AS parent_generation_id,
    sg.shot_id
  FROM shot_generations sg
  WHERE sg.generation_id IN (
    SELECT DISTINCT parent_generation_id
    FROM generations
    WHERE type = 'video'
      AND is_child = true
      AND pair_shot_generation_id IS NULL
      AND child_order IS NOT NULL
  )
  ORDER BY sg.generation_id, sg.timeline_frame DESC NULLS LAST
),
candidates AS (
  SELECT
    c.id AS generation_id,
    (
      SELECT sg_img.id
      FROM shot_generations sg_img
      JOIN generations g_img ON g_img.id = sg_img.generation_id
      WHERE sg_img.shot_id = ps.shot_id
        AND sg_img.timeline_frame IS NOT NULL
        AND sg_img.timeline_frame >= 0
        AND g_img.type != 'video'
      ORDER BY sg_img.timeline_frame
      LIMIT 1 OFFSET c.child_order
    ) AS inferred_pair_shot_generation_id
  FROM generations c
  JOIN parent_shots ps ON ps.parent_generation_id = c.parent_generation_id
  WHERE c.type = 'video'
    AND c.is_child = true
    AND c.pair_shot_generation_id IS NULL
    AND c.child_order IS NOT NULL
)
UPDATE generations g
SET pair_shot_generation_id = candidates.inferred_pair_shot_generation_id
FROM candidates
WHERE g.id = candidates.generation_id
  AND candidates.inferred_pair_shot_generation_id IS NOT NULL;
