-- Migration: Drop deprecated timeline position functions
-- Purpose: Clean up functions that are no longer used after the timeline position refactor
--
-- Deprecated functions:
-- - exchange_timeline_frames: Was only used by useTimelineFrameUpdates.ts which has been deleted
-- - exchange_shot_positions: Old version that was renamed to exchange_timeline_frames
--
-- These are safe to drop because:
-- 1. useTimelineFrameUpdates.ts has been deleted
-- 2. All timeline operations now use:
--    - batch_update_timeline_frames (for position updates)
--    - delete_and_normalize (for deletions)
--    - unposition_and_normalize (for removing from timeline)
--    - reorder_normalized (for reordering)

-- Drop the deprecated functions
DROP FUNCTION IF EXISTS exchange_timeline_frames(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS exchange_shot_positions(uuid, uuid, uuid);

-- Log completion
DO $$
BEGIN
  RAISE NOTICE '✅ Dropped deprecated timeline functions:';
  RAISE NOTICE '   - exchange_timeline_frames';
  RAISE NOTICE '   - exchange_shot_positions';
  RAISE NOTICE '';
  RAISE NOTICE 'Active timeline functions:';
  RAISE NOTICE '   - batch_update_timeline_frames';
  RAISE NOTICE '   - delete_and_normalize';
  RAISE NOTICE '   - unposition_and_normalize';
  RAISE NOTICE '   - reorder_normalized';
  RAISE NOTICE '   - normalize_shot_timeline';
END $$;
