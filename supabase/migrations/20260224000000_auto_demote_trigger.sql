-- Auto-demote orphaned video variants when an image is removed from the timeline.
-- Replaces explicit JS demoteOrphanedVariants calls in useDeleteActions.ts.
-- The demote_orphaned_video_variants RPC is idempotent (safe when nothing to demote).

CREATE OR REPLACE FUNCTION trigger_demote_on_timeline_remove()
RETURNS TRIGGER AS $$
BEGIN
  -- Fire demote only when an image is removed from the timeline
  -- (timeline_frame transitions from a value to NULL)
  IF OLD.timeline_frame IS NOT NULL AND NEW.timeline_frame IS NULL THEN
    PERFORM demote_orphaned_video_variants(NEW.shot_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER auto_demote_on_timeline_remove
  AFTER UPDATE OF timeline_frame ON shot_generations
  FOR EACH ROW
  EXECUTE FUNCTION trigger_demote_on_timeline_remove();
