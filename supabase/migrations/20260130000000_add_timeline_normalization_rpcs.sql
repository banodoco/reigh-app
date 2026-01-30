-- Migration: Add timeline normalization RPCs
-- Purpose: Provide atomic operations that delete/unposition items and normalize remaining positions
-- This ensures timeline always starts at 0 and gaps don't exceed 81 frames

-- Constants used for normalization
-- MAX_FRAME_GAP = 81 (matches frontend timelineNormalization.ts)

--------------------------------------------------------------------------------
-- Helper function: Normalize timeline positions for a shot
-- Returns the new positions as jsonb array
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION normalize_shot_timeline(
  p_shot_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_gap constant integer := 81;
  v_items record;
  v_sorted_items jsonb;
  v_result jsonb := '[]'::jsonb;
  v_current_position integer := 0;
  v_prev_frame integer;
  v_item jsonb;
  v_gap integer;
  v_new_gap integer;
  v_min_frame integer;
  v_has_large_gap boolean := false;
  v_needs_normalization boolean := false;
BEGIN
  -- Get all positioned items for this shot (excluding videos), sorted by frame
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', sg.id,
      'timeline_frame', sg.timeline_frame
    ) ORDER BY sg.timeline_frame
  )
  INTO v_sorted_items
  FROM shot_generations sg
  JOIN shots s ON sg.shot_id = s.id
  JOIN projects p ON s.project_id = p.id
  WHERE sg.shot_id = p_shot_id
    AND sg.timeline_frame IS NOT NULL
    AND p.user_id = p_user_id
    -- Exclude videos
    AND COALESCE(sg.type, '') NOT IN ('video', 'video_travel_output')
    AND NOT (COALESCE(sg.output_file_path, '') LIKE '%.mp4');

  -- If no items or empty, nothing to normalize
  IF v_sorted_items IS NULL OR jsonb_array_length(v_sorted_items) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Check if normalization is needed
  -- Get minimum frame
  v_min_frame := (v_sorted_items->0->>'timeline_frame')::integer;

  -- Check for large gaps
  FOR i IN 1..jsonb_array_length(v_sorted_items) - 1 LOOP
    v_gap := (v_sorted_items->i->>'timeline_frame')::integer -
             (v_sorted_items->(i-1)->>'timeline_frame')::integer;
    IF v_gap > v_max_gap THEN
      v_has_large_gap := true;
      EXIT;
    END IF;
  END LOOP;

  -- If already starts at 0 and no large gaps, no normalization needed
  IF v_min_frame = 0 AND NOT v_has_large_gap THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Calculate and apply normalized positions
  v_current_position := 0;
  v_prev_frame := NULL;

  FOR i IN 0..jsonb_array_length(v_sorted_items) - 1 LOOP
    v_item := v_sorted_items->i;

    IF i = 0 THEN
      -- First item goes to frame 0
      v_current_position := 0;
    ELSE
      -- Calculate gap and apply max constraint
      v_gap := (v_item->>'timeline_frame')::integer - v_prev_frame;
      v_new_gap := LEAST(v_gap, v_max_gap);
      v_current_position := v_current_position + v_new_gap;
    END IF;

    -- Update the record
    UPDATE shot_generations
    SET
      timeline_frame = v_current_position,
      metadata = COALESCE(metadata, '{}'::jsonb) || '{"user_positioned": true}'::jsonb,
      updated_at = NOW()
    WHERE id = (v_item->>'id')::uuid;

    -- Add to result
    v_result := v_result || jsonb_build_object(
      'shot_generation_id', v_item->>'id',
      'timeline_frame', v_current_position
    );

    v_prev_frame := (v_item->>'timeline_frame')::integer;
  END LOOP;

  RETURN v_result;
END;
$$;

--------------------------------------------------------------------------------
-- delete_and_normalize: Delete a shot_generation and normalize remaining
--------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS delete_and_normalize(uuid, uuid);

CREATE OR REPLACE FUNCTION delete_and_normalize(
  p_shot_id uuid,
  p_shot_generation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_deleted_frame integer;
  v_result jsonb;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Verify the shot_generation exists and user has access
  SELECT sg.timeline_frame
  INTO v_deleted_frame
  FROM shot_generations sg
  JOIN shots s ON sg.shot_id = s.id
  JOIN projects p ON s.project_id = p.id
  WHERE sg.id = p_shot_generation_id
    AND sg.shot_id = p_shot_id
    AND p.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shot generation not found or access denied: %', p_shot_generation_id;
  END IF;

  -- Delete the shot_generation record
  DELETE FROM shot_generations
  WHERE id = p_shot_generation_id;

  RAISE NOTICE '[delete_and_normalize] Deleted shot_generation % (was at frame %)',
    p_shot_generation_id, v_deleted_frame;

  -- Normalize remaining items
  v_result := normalize_shot_timeline(p_shot_id, v_user_id);

  RETURN jsonb_build_object(
    'deleted_id', p_shot_generation_id,
    'deleted_frame', v_deleted_frame,
    'normalized_positions', v_result
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION delete_and_normalize(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION delete_and_normalize(uuid, uuid) IS
'Deletes a shot_generation and normalizes remaining timeline positions.
Normalization shifts timeline to start at 0 and compresses gaps > 81 frames.
Returns: {"deleted_id": uuid, "deleted_frame": int, "normalized_positions": [...]}';

--------------------------------------------------------------------------------
-- unposition_and_normalize: Set timeline_frame = NULL and normalize remaining
--------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS unposition_and_normalize(uuid, uuid);

CREATE OR REPLACE FUNCTION unposition_and_normalize(
  p_shot_id uuid,
  p_shot_generation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_old_frame integer;
  v_result jsonb;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Verify the shot_generation exists and user has access
  SELECT sg.timeline_frame
  INTO v_old_frame
  FROM shot_generations sg
  JOIN shots s ON sg.shot_id = s.id
  JOIN projects p ON s.project_id = p.id
  WHERE sg.id = p_shot_generation_id
    AND sg.shot_id = p_shot_id
    AND p.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shot generation not found or access denied: %', p_shot_generation_id;
  END IF;

  -- Set timeline_frame to NULL (unposition)
  UPDATE shot_generations
  SET
    timeline_frame = NULL,
    metadata = COALESCE(metadata, '{}'::jsonb) - 'user_positioned',
    updated_at = NOW()
  WHERE id = p_shot_generation_id;

  RAISE NOTICE '[unposition_and_normalize] Unpositioned shot_generation % (was at frame %)',
    p_shot_generation_id, v_old_frame;

  -- Normalize remaining items
  v_result := normalize_shot_timeline(p_shot_id, v_user_id);

  RETURN jsonb_build_object(
    'unpositioned_id', p_shot_generation_id,
    'old_frame', v_old_frame,
    'normalized_positions', v_result
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION unposition_and_normalize(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION unposition_and_normalize(uuid, uuid) IS
'Sets timeline_frame = NULL for a shot_generation and normalizes remaining positions.
Normalization shifts timeline to start at 0 and compresses gaps > 81 frames.
Returns: {"unpositioned_id": uuid, "old_frame": int, "normalized_positions": [...]}';

--------------------------------------------------------------------------------
-- reorder_normalized: Reorder items with proper normalized positioning
-- Takes new order as array of shot_generation_ids, calculates optimal positions
--------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS reorder_normalized(uuid, uuid[]);

CREATE OR REPLACE FUNCTION reorder_normalized(
  p_shot_id uuid,
  p_new_order uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_default_gap constant integer := 50;
  v_current_frame integer := 0;
  v_id uuid;
  v_result jsonb := '[]'::jsonb;
  v_verified_count integer;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Verify all items exist and user has access
  SELECT COUNT(*)
  INTO v_verified_count
  FROM shot_generations sg
  JOIN shots s ON sg.shot_id = s.id
  JOIN projects p ON s.project_id = p.id
  WHERE sg.id = ANY(p_new_order)
    AND sg.shot_id = p_shot_id
    AND p.user_id = v_user_id;

  IF v_verified_count != array_length(p_new_order, 1) THEN
    RAISE EXCEPTION 'Some shot_generation IDs not found or access denied';
  END IF;

  -- Apply positions in order: 0, 50, 100, 150, ...
  FOREACH v_id IN ARRAY p_new_order
  LOOP
    UPDATE shot_generations
    SET
      timeline_frame = v_current_frame,
      metadata = COALESCE(metadata, '{}'::jsonb) || '{"user_positioned": true}'::jsonb,
      updated_at = NOW()
    WHERE id = v_id;

    v_result := v_result || jsonb_build_object(
      'shot_generation_id', v_id,
      'timeline_frame', v_current_frame
    );

    v_current_frame := v_current_frame + v_default_gap;
  END LOOP;

  RAISE NOTICE '[reorder_normalized] Reordered % items for shot %',
    array_length(p_new_order, 1), p_shot_id;

  RETURN v_result;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION reorder_normalized(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION reorder_normalized(uuid, uuid[]) IS
'Reorders shot_generation items with evenly spaced positions starting at 0.
Takes an array of shot_generation_ids in desired order.
Assigns positions: 0, 50, 100, 150, etc.
Returns: [{"shot_generation_id": uuid, "timeline_frame": int}, ...]';

--------------------------------------------------------------------------------
-- Grant execute on helper function
--------------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION normalize_shot_timeline(uuid, uuid) TO authenticated;

--------------------------------------------------------------------------------
-- Log completion
--------------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE '✅ Created timeline normalization RPCs:';
  RAISE NOTICE '   - normalize_shot_timeline(shot_id, user_id) - helper function';
  RAISE NOTICE '   - delete_and_normalize(shot_id, shot_generation_id)';
  RAISE NOTICE '   - unposition_and_normalize(shot_id, shot_generation_id)';
  RAISE NOTICE '   - reorder_normalized(shot_id, new_order[])';
END $$;
