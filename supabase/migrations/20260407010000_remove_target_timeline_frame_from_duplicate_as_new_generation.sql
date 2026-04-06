BEGIN;

DROP FUNCTION IF EXISTS public.duplicate_as_new_generation(uuid, uuid, uuid, integer, integer, integer);

CREATE FUNCTION public.duplicate_as_new_generation(
  p_shot_id uuid,
  p_generation_id uuid,
  p_project_id uuid,
  p_timeline_frame integer,
  p_next_timeline_frame integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_shot_id uuid;
  v_source_location text;
  v_source_thumbnail_url text;
  v_source_params jsonb := '{}'::jsonb;
  v_new_params jsonb;
  v_new_generation_id uuid;
  v_new_shot_generation_id uuid;
  v_new_timeline_frame integer;
  v_created_at timestamptz;
  v_generation_type text;
  v_offset integer := 1;
BEGIN
  IF auth.role() <> 'service_role' AND NOT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to duplicate generations in this project';
  END IF;

  SELECT s.id
  INTO v_shot_id
  FROM public.shots s
  WHERE s.id = p_shot_id
    AND s.project_id = p_project_id;

  IF v_shot_id IS NULL THEN
    RAISE EXCEPTION 'Shot % was not found in project %', p_shot_id, p_project_id;
  END IF;

  SELECT
    COALESCE(gv.location, g.location),
    COALESCE(gv.thumbnail_url, g.thumbnail_url),
    CASE
      WHEN jsonb_typeof(COALESCE(gv.params, g.params, '{}'::jsonb)) = 'object'
        THEN COALESCE(gv.params, g.params, '{}'::jsonb)
      ELSE '{}'::jsonb
    END
  INTO
    v_source_location,
    v_source_thumbnail_url,
    v_source_params
  FROM public.generations g
  LEFT JOIN public.generation_variants gv ON gv.id = g.primary_variant_id
  WHERE g.id = p_generation_id
    AND g.project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Generation % was not found in project %', p_generation_id, p_project_id;
  END IF;

  IF v_source_location IS NULL THEN
    RAISE EXCEPTION 'Generation % is missing location', p_generation_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('duplicate_as_new_generation'), hashtext(p_shot_id::text));

  v_generation_type := CASE
    WHEN v_source_location ~* '\.(mp4|webm|mov)(\?.*)?$' THEN 'video'
    ELSE 'image'
  END;

  v_new_params := v_source_params
    || jsonb_build_object(
      'source', 'timeline_duplicate',
      'source_generation_id', p_generation_id,
      'duplicated_at', statement_timestamp()
    );

  INSERT INTO public.generations (
    project_id,
    type,
    based_on,
    params
  )
  VALUES (
    p_project_id,
    v_generation_type,
    p_generation_id,
    v_new_params
  )
  RETURNING id, created_at
  INTO v_new_generation_id, v_created_at;

  INSERT INTO public.generation_variants (
    generation_id,
    project_id,
    location,
    thumbnail_url,
    is_primary,
    variant_type,
    name,
    params
  )
  VALUES (
    v_new_generation_id,
    p_project_id,
    v_source_location,
    v_source_thumbnail_url,
    TRUE,
    'original',
    'Original',
    v_new_params
  );

  v_new_timeline_frame := CASE
    WHEN p_next_timeline_frame IS NOT NULL THEN floor((p_timeline_frame + p_next_timeline_frame) / 2.0)::integer
    ELSE p_timeline_frame + 30
  END;

  v_new_timeline_frame := GREATEST(0, round(v_new_timeline_frame::numeric)::integer);

  IF EXISTS (
    SELECT 1
    FROM public.shot_generations sg
    WHERE sg.shot_id = p_shot_id
      AND sg.timeline_frame = v_new_timeline_frame
  ) THEN
    WHILE v_offset < 1000 LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM public.shot_generations sg
        WHERE sg.shot_id = p_shot_id
          AND sg.timeline_frame = v_new_timeline_frame + v_offset
      ) THEN
        v_new_timeline_frame := v_new_timeline_frame + v_offset;
        EXIT;
      END IF;

      IF v_new_timeline_frame - v_offset >= 0 AND NOT EXISTS (
        SELECT 1
        FROM public.shot_generations sg
        WHERE sg.shot_id = p_shot_id
          AND sg.timeline_frame = v_new_timeline_frame - v_offset
      ) THEN
        v_new_timeline_frame := v_new_timeline_frame - v_offset;
        EXIT;
      END IF;

      v_offset := v_offset + 1;
    END LOOP;
  END IF;

  INSERT INTO public.shot_generations (
    shot_id,
    generation_id,
    timeline_frame
  )
  VALUES (
    p_shot_id,
    v_new_generation_id,
    v_new_timeline_frame
  )
  RETURNING id
  INTO v_new_shot_generation_id;

  RETURN jsonb_build_object(
    'new_generation_id', v_new_generation_id,
    'new_shot_generation_id', v_new_shot_generation_id,
    'timeline_frame', v_new_timeline_frame,
    'location', v_source_location,
    'thumbnail_url', COALESCE(v_source_thumbnail_url, v_source_location),
    'type', v_generation_type,
    'params', v_new_params,
    'created_at', v_created_at
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.duplicate_as_new_generation(uuid, uuid, uuid, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.duplicate_as_new_generation(uuid, uuid, uuid, integer, integer) IS
'Duplicates a generation into the same shot atomically, creates a new primary variant, resolves timeline collisions in-function, and returns the hydrated data needed for direct cache updates.';

COMMIT;
