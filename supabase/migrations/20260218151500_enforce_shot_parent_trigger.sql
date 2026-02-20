BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_shot_parent_generation_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM public.ensure_shot_parent_generation(NEW.id, NEW.project_id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_ensure_shot_parent_generation ON public.shots;

CREATE TRIGGER trg_ensure_shot_parent_generation
AFTER INSERT ON public.shots
FOR EACH ROW
EXECUTE FUNCTION public.ensure_shot_parent_generation_after_insert();

COMMENT ON FUNCTION public.ensure_shot_parent_generation_after_insert() IS
'Ensures each newly inserted shot has a canonical parent generation.';

COMMIT;
