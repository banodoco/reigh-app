BEGIN;

-- Ensure every shot has one canonical parent generation for segment/batch video outputs.
-- IMPORTANT: If a shot already has a parent generation, this function reuses it and never replaces it.
CREATE OR REPLACE FUNCTION public.ensure_shot_parent_generation(
  p_shot_id uuid,
  p_project_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_project_id uuid;
  v_owner_id uuid;
  v_parent_generation_id uuid;
BEGIN
  SELECT s.project_id, p.user_id
  INTO v_project_id, v_owner_id
  FROM public.shots s
  JOIN public.projects p ON p.id = s.project_id
  WHERE s.id = p_shot_id
  FOR UPDATE;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Shot not found: %', p_shot_id;
  END IF;

  IF p_project_id IS NOT NULL AND p_project_id <> v_project_id THEN
    RAISE EXCEPTION 'Shot % does not belong to project %', p_shot_id, p_project_id;
  END IF;

  IF auth.role() <> 'service_role' AND v_owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Permission denied: you do not own this shot';
  END IF;

  SELECT g.id
  INTO v_parent_generation_id
  FROM public.shot_generations sg
  JOIN public.generations g ON g.id = sg.generation_id
  WHERE sg.shot_id = p_shot_id
    AND g.type = 'video'
    AND g.parent_generation_id IS NULL
    AND (
      g.params->'orchestrator_details' IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.generations c WHERE c.parent_generation_id = g.id)
    )
  ORDER BY g.created_at DESC
  LIMIT 1;

  IF v_parent_generation_id IS NOT NULL THEN
    RETURN v_parent_generation_id;
  END IF;

  v_parent_generation_id := gen_random_uuid();

  INSERT INTO public.generations (
    id,
    project_id,
    type,
    is_child,
    location,
    params,
    created_at
  )
  VALUES (
    v_parent_generation_id,
    v_project_id,
    'video',
    false,
    NULL,
    jsonb_build_object(
      'tool_type', 'travel-between-images',
      'created_from', 'shot_parent_generation',
      'orchestrator_details', jsonb_build_object(
        'shot_id', p_shot_id,
        'num_new_segments_to_generate', 0,
        'input_image_paths_resolved', '[]'::jsonb
      )
    ),
    now()
  );

  INSERT INTO public.shot_generations (shot_id, generation_id, timeline_frame, metadata)
  VALUES (p_shot_id, v_parent_generation_id, NULL, '{}'::jsonb);

  RETURN v_parent_generation_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ensure_shot_parent_generation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_shot_parent_generation(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.ensure_shot_parent_generation(uuid, uuid) IS
'Returns the existing canonical parent generation for a shot, or creates one if missing. Never replaces existing parent generations.';

-- Keep shot creation atomic with canonical parent creation.
CREATE OR REPLACE FUNCTION public.insert_shot_at_position(
  p_project_id uuid,
  p_shot_name text,
  p_position integer
)
RETURNS TABLE(shot_id uuid, shot_name text, shot_position integer, success boolean)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_shot_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to insert shot into this project';
  END IF;

  UPDATE public.shots
  SET position = position + 1
  WHERE project_id = p_project_id
    AND position >= p_position;

  INSERT INTO public.shots (name, project_id, position)
  VALUES (p_shot_name, p_project_id, p_position)
  RETURNING id INTO v_shot_id;

  PERFORM public.ensure_shot_parent_generation(v_shot_id, p_project_id);

  RETURN QUERY
  SELECT v_shot_id, p_shot_name, p_position, TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY
  SELECT NULL::uuid, NULL::text, NULL::integer, FALSE;
END;
$function$;

COMMENT ON FUNCTION public.insert_shot_at_position(uuid, text, integer) IS
'Inserts a shot at a specific position and guarantees a canonical parent generation for that shot.';

-- Keep create_shot_with_image behavior, while also ensuring canonical parent generation exists.
CREATE OR REPLACE FUNCTION public.create_shot_with_image(
  p_project_id uuid,
  p_shot_name text,
  p_generation_id uuid
)
RETURNS TABLE(shot_id uuid, shot_name text, shot_generation_id uuid, success boolean)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_shot_id uuid;
  v_shot_generation_id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND NOT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to insert shot into this project';
  END IF;

  INSERT INTO public.shots (name, project_id)
  VALUES (p_shot_name, p_project_id)
  RETURNING id INTO v_shot_id;

  INSERT INTO public.shot_generations (shot_id, generation_id, timeline_frame)
  VALUES (v_shot_id, p_generation_id, 0)
  RETURNING id INTO v_shot_generation_id;

  PERFORM public.ensure_shot_parent_generation(v_shot_id, p_project_id);

  RETURN QUERY
  SELECT v_shot_id, p_shot_name, v_shot_generation_id, TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY
  SELECT NULL::uuid, NULL::text, NULL::uuid, FALSE;
END;
$function$;

COMMENT ON FUNCTION public.create_shot_with_image(uuid, text, uuid) IS
'Creates a shot with the initial image and ensures a canonical parent generation for video segment outputs.';

-- Backfill: create canonical parents only for shots that currently have none.
WITH shots_missing_parent AS (
  SELECT s.id, s.project_id
  FROM public.shots s
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.shot_generations sg
    JOIN public.generations g ON g.id = sg.generation_id
    WHERE sg.shot_id = s.id
      AND g.type = 'video'
      AND g.parent_generation_id IS NULL
      AND (
        g.params->'orchestrator_details' IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.generations c WHERE c.parent_generation_id = g.id)
      )
  )
),
created_parents AS (
  INSERT INTO public.generations (
    id,
    project_id,
    type,
    is_child,
    location,
    params,
    created_at
  )
  SELECT
    gen_random_uuid(),
    smp.project_id,
    'video',
    false,
    NULL,
    jsonb_build_object(
      'tool_type', 'travel-between-images',
      'created_from', 'shot_parent_generation_backfill',
      'orchestrator_details', jsonb_build_object(
        'shot_id', smp.id,
        'num_new_segments_to_generate', 0,
        'input_image_paths_resolved', '[]'::jsonb
      )
    ),
    now()
  FROM shots_missing_parent smp
  RETURNING id, params
),
parent_links AS (
  SELECT
    cp.id AS generation_id,
    (cp.params->'orchestrator_details'->>'shot_id')::uuid AS shot_id
  FROM created_parents cp
)
INSERT INTO public.shot_generations (shot_id, generation_id, timeline_frame, metadata)
SELECT
  pl.shot_id,
  pl.generation_id,
  NULL,
  '{}'::jsonb
FROM parent_links pl;

COMMIT;
