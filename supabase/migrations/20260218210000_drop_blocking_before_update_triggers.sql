-- Drop BEFORE UPDATE triggers that silently revert user drag operations.
--
-- Root cause of timeline drag not persisting:
--   1. First drag saves metadata = {user_positioned: true, drag_source: 'drag'}.
--   2. Second drag fires batch_update_timeline_frames UPDATE on shot_generations.
--   3. protect_user_positioned_timeline_frames_trigger fires BEFORE UPDATE FOR EACH ROW.
--      Condition: OLD.metadata->>'drag_source' IS NOT NULL (true after first drag)
--                 AND NEW.timeline_frame != OLD.timeline_frame (true, we dragged)
--      Action: NEW.timeline_frame := OLD.timeline_frame  (REVERTS the drag!)
--   4. prevent_drag_position_overwrites_trigger also fires (but condition is now false
--      since the previous trigger already set NEW.timeline_frame = OLD.timeline_frame).
--   5. UPDATE completes with no actual frame changes. RETURNING returns 11 IDs with
--      OLD frames. Client mismatch check (ID-based only) passes. RPC reports success.
--   6. invalidateGenerations -> refetch -> server has old positions -> snap-back.
--
-- Why these triggers are now harmful rather than protective:
--   These triggers were created in Sept 2025 to prevent automated processes
--   (timeline standardization, apply_timeline_frames, update_shot_image_order)
--   from overwriting user-dragged positions. However:
--   a. Those automated functions were already disabled as no-ops in 20250925002000.
--   b. The triggers also block the user's OWN drag operations (the user IS
--      the one who should be able to update their positioned items).
--   Dropping them restores correct drag behavior without re-enabling any automated
--   position overwriting (those functions remain disabled).

DROP TRIGGER IF EXISTS protect_user_positioned_timeline_frames_trigger ON shot_generations;
DROP TRIGGER IF EXISTS prevent_drag_position_overwrites_trigger ON shot_generations;

-- Also drop the exception-raising trigger from 20250923008000 if somehow still present.
DROP TRIGGER IF EXISTS prevent_user_positioned_modification_trigger ON shot_generations;

COMMENT ON TABLE shot_generations IS
'Timeline positions: user_positioned items can be freely updated by the owner.
Automated standardization logic is permanently disabled via no-op function overrides
in 20250925002000. The old BEFORE UPDATE protection triggers have been removed
(20260218210000) as they also blocked legitimate user drag operations.';
