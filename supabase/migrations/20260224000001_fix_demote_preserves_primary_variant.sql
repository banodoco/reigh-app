-- Fix demote_orphaned_video_variants: stop unsetting is_primary on variants.
--
-- The demote RPC was setting is_primary = false on variants when source images
-- changed, but never promoted another variant to primary. This left generations
-- with variants but NO primary variant — violating the invariant that every
-- generation with variants must have exactly one primary.
--
-- Consequences of the bug:
-- - generations.location stayed NULL (sync trigger only fires for is_primary=true)
-- - The segment strip showed a misleading gold "Regenerate" card
-- - The lightbox still worked (fetches variants directly) creating confusing UX
-- - 178 generations in the DB have this orphaned state
--
-- Fix: Only clear the generation's display fields (location, thumbnail_url).
-- Leave variant is_primary AND generation primary_variant_id untouched.
-- The variant itself is still valid, the video still exists, it was just
-- generated for different source images. Clearing location is enough to signal
-- "stale" to the strip rendering while preserving the variant relationship.
--
-- Note: sync_variant_from_generation_update uses COALESCE(NEW.location, location)
-- so setting generation.location = NULL will NOT null-out the variant's location.

CREATE OR REPLACE FUNCTION demote_orphaned_video_variants(p_shot_id UUID)
RETURNS INTEGER AS $$
DECLARE
  demoted_count INTEGER := 0;
  video_record RECORD;
  stored_gen_id UUID;
  current_gen_id UUID;
  current_timeline_frame INTEGER;
BEGIN
  -- Find all primary video variants linked to this shot via pair_shot_generation_id
  -- These are child video segments (is_child = true) with a slot link
  FOR video_record IN
    SELECT
      g.id as generation_id,
      g.pair_shot_generation_id,
      g.params->'orchestrator_details'->'input_image_generation_ids' as parent_stored_ids,
      g.params->'individual_segment_params'->>'start_image_generation_id' as child_stored_id,
      g.child_order,
      gv.id as variant_id
    FROM generations g
    JOIN generation_variants gv ON gv.generation_id = g.id
    WHERE g.is_child = true
      AND g.type = 'video'
      AND g.pair_shot_generation_id IS NOT NULL
      AND gv.is_primary = true
      AND EXISTS (
        SELECT 1 FROM shot_generations sg
        WHERE sg.id = g.pair_shot_generation_id
          AND sg.shot_id = p_shot_id
      )
  LOOP
    -- Get current generation_id AND timeline_frame at the shot_generations slot
    SELECT sg.generation_id, sg.timeline_frame
    INTO current_gen_id, current_timeline_frame
    FROM shot_generations sg
    WHERE sg.id = video_record.pair_shot_generation_id;

    -- If the slot's image has been removed from the timeline, demote immediately.
    IF current_timeline_frame IS NULL THEN
      -- Clear generation display fields only.
      -- Do NOT touch variant is_primary or generation primary_variant_id.
      -- The variant is still valid; we're just marking the generation as stale.
      UPDATE generations
      SET
        location = NULL,
        thumbnail_url = NULL,
        updated_at = NOW()
      WHERE id = video_record.generation_id;

      demoted_count := demoted_count + 1;

      RAISE NOTICE 'Cleared generation % display fields (slot removed from timeline)',
        video_record.generation_id;
      CONTINUE;
    END IF;

    -- Get stored generation_id for this segment's start image
    IF video_record.child_stored_id IS NOT NULL THEN
      stored_gen_id := video_record.child_stored_id::UUID;
    ELSIF video_record.parent_stored_ids IS NOT NULL AND video_record.child_order IS NOT NULL THEN
      stored_gen_id := (video_record.parent_stored_ids->>video_record.child_order)::UUID;
    ELSE
      CONTINUE;
    END IF;

    -- If generation_id changed, clear the generation display fields
    IF stored_gen_id IS NOT NULL AND current_gen_id IS DISTINCT FROM stored_gen_id THEN
      UPDATE generations
      SET
        location = NULL,
        thumbnail_url = NULL,
        updated_at = NOW()
      WHERE id = video_record.generation_id;

      demoted_count := demoted_count + 1;

      RAISE NOTICE 'Cleared generation % display fields (stored: %, current: %)',
        video_record.generation_id, stored_gen_id, current_gen_id;
    END IF;
  END LOOP;

  RETURN demoted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
