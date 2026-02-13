-- =====================================================================
-- Schedule daily verify_shot_sync() check via pg_cron
-- Created: 2026-02-13
-- Purpose: verify_shot_sync() detects mismatches between denormalized
--          shot data on generations and the source-of-truth
--          shot_generations table. Running it daily catches any sync
--          drift before it becomes a user-visible problem.
-- Risk: Read-only monitoring — no writes to application tables.
-- =====================================================================

-- Wrapper that calls verify_shot_sync() and raises warnings for any
-- mismatches found. pg_cron captures RAISE output in
-- cron.job_run_details, making results queryable after each run.
CREATE OR REPLACE FUNCTION public.run_shot_sync_check()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  mismatch_count INTEGER;
  rec RECORD;
BEGIN
  -- Count mismatches first (cheap — avoids cursor overhead when clean)
  SELECT COUNT(*) INTO mismatch_count FROM verify_shot_sync();

  IF mismatch_count = 0 THEN
    RAISE NOTICE 'shot_sync_check: all generations in sync';
    RETURN 0;
  END IF;

  -- Log each mismatch so it appears in Postgres logs / job_run_details
  RAISE WARNING 'shot_sync_check: found % mismatch(es)', mismatch_count;

  FOR rec IN SELECT * FROM verify_shot_sync() LOOP
    RAISE WARNING 'shot_sync_check mismatch: generation=%, gen_shot=%, sg_shot=%, gen_frame=%, sg_frame=%, status=%',
      rec.generation_id, rec.gen_shot_id, rec.sg_shot_id,
      rec.gen_frame, rec.sg_frame, rec.status;
  END LOOP;

  RETURN mismatch_count;
END;
$$;

COMMENT ON FUNCTION public.run_shot_sync_check IS
'Wrapper around verify_shot_sync() for pg_cron. Returns mismatch count and logs details via RAISE WARNING.';

-- Schedule daily at 3 AM UTC (pg_cron extension already enabled)
SELECT cron.schedule(
  'daily-shot-sync-check',
  '0 3 * * *',
  $$SELECT run_shot_sync_check();$$
);

SELECT 'daily-shot-sync-check cron job scheduled' AS status;
