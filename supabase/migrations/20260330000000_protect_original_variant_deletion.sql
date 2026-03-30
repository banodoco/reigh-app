-- Prevent deletion of original variants
-- Original variants are the source image for a generation and must never be deleted.
-- This is a DB-level safety net — the UI and application code also block this,
-- but this trigger ensures it can never happen regardless of the caller.

CREATE OR REPLACE FUNCTION prevent_original_variant_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.variant_type = 'original' THEN
    RAISE EXCEPTION 'Cannot delete the original variant (id: %). Original variants are protected.', OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Fire before the FK-clearing and promotion triggers so we reject early
CREATE TRIGGER trg_prevent_original_variant_deletion
BEFORE DELETE ON generation_variants
FOR EACH ROW
WHEN (OLD.variant_type = 'original')
EXECUTE FUNCTION prevent_original_variant_deletion();

COMMENT ON FUNCTION prevent_original_variant_deletion() IS 'Prevents deletion of original variants — the source image must always be preserved';
