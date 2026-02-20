-- Optimize timeline frame persistence hot path
-- 1) Remove per-row debug trigger overhead from shot_generations writes
-- 2) Replace row-by-row batch_update_timeline_frames implementation with set-based SQL

-- Disable heavy debug trigger on every shot_generations write.
DROP TRIGGER IF EXISTS log_timeline_updates_trigger ON shot_generations;

-- Recreate batch update function using set-based updates (single UPDATE statement).
DROP FUNCTION IF EXISTS batch_update_timeline_frames(jsonb);

CREATE OR REPLACE FUNCTION batch_update_timeline_frames(
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_results jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  WITH raw_updates AS (
    SELECT
      value AS update_json,
      ordinality AS ord
    FROM jsonb_array_elements(COALESCE(p_updates, '[]'::jsonb)) WITH ORDINALITY
  ),
  parsed_updates AS (
    SELECT
      (update_json->>'shot_generation_id')::uuid AS shot_generation_id,
      (update_json->>'timeline_frame')::integer AS timeline_frame,
      COALESCE(update_json->'metadata', '{}'::jsonb) AS metadata,
      ord
    FROM raw_updates
  ),
  -- If the same shot_generation_id appears multiple times, keep the last one.
  dedup_updates AS (
    SELECT DISTINCT ON (shot_generation_id)
      shot_generation_id,
      timeline_frame,
      metadata
    FROM parsed_updates
    WHERE shot_generation_id IS NOT NULL
      AND timeline_frame IS NOT NULL
    ORDER BY shot_generation_id, ord DESC
  ),
  authorized_updates AS (
    SELECT
      u.shot_generation_id,
      u.timeline_frame,
      u.metadata
    FROM dedup_updates u
    JOIN shot_generations sg ON sg.id = u.shot_generation_id
    JOIN shots s ON s.id = sg.shot_id
    JOIN projects p ON p.id = s.project_id
    WHERE p.user_id = v_user_id
  ),
  updated_rows AS (
    UPDATE shot_generations sg
    SET
      timeline_frame = u.timeline_frame,
      metadata = COALESCE(sg.metadata, '{}'::jsonb) || u.metadata,
      updated_at = NOW()
    FROM authorized_updates u
    WHERE sg.id = u.shot_generation_id
    RETURNING sg.id, sg.timeline_frame
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'shot_generation_id', id,
        'timeline_frame', timeline_frame,
        'success', true
      )
    ),
    '[]'::jsonb
  )
  INTO v_results
  FROM updated_rows;

  RETURN v_results;
END;
$$;

GRANT EXECUTE ON FUNCTION batch_update_timeline_frames(jsonb) TO authenticated;

COMMENT ON FUNCTION batch_update_timeline_frames(jsonb) IS
'Set-based batch timeline_frame update.\n'
'Input: [{"shot_generation_id": "uuid", "timeline_frame": 123, "metadata": {...}}, ...].\n'
'Returns updated rows only for shot_generations authorized to auth.uid().';
