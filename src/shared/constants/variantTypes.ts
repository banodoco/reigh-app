/**
 * Variant type constants for generation_variants.variant_type.
 *
 * Variant types describe the nature/source of a variant:
 * - original: Direct upload or primary generation output
 * - upscaled: Result of upscaling
 * - edit/inpaint/magic_edit/annotated_edit: Image editing operations
 * - trimmed: Video trim operation
 * - travel_segment/travel_stitch: Video travel outputs
 * - join_clips_segment/clip_join: Join clips outputs
 * - repositioned: Result of reposition operation
 * - regenerated: Result of regeneration with variations
 * - child_promoted: Variant promoted to generation
 *
 * NOTE: variant_type is orthogonal to tool_type - variant_type describes
 * what kind of processing was done, while tool_type describes which tool
 * created the generation.
 */

export const VARIANT_TYPE = {
  // Base types
  ORIGINAL: 'original',
  UPSCALED: 'upscaled',

  // Image editing types
  EDIT: 'edit',
  INPAINT: 'inpaint',
  MAGIC_EDIT: 'magic_edit',
  ANNOTATED_EDIT: 'annotated_edit',

  // Video editing types
  TRIMMED: 'trimmed',
  REPOSITIONED: 'repositioned',

  // Travel between images outputs
  TRAVEL_SEGMENT: 'travel_segment',
  TRAVEL_STITCH: 'travel_stitch',
  INDIVIDUAL_SEGMENT: 'individual_segment',

  // Join clips outputs
  JOIN_CLIPS_SEGMENT: 'join_clips_segment',
  CLIP_JOIN: 'clip_join',

  // Other
  REGENERATED: 'regenerated',
  CHILD_PROMOTED: 'child_promoted',
} as const;

type VariantType = typeof VARIANT_TYPE[keyof typeof VARIANT_TYPE];

/**
 * Variant types that represent image edits (should appear in "Based on this" section).
 * Used by derived items query in useGenerations.
 */
export const EDIT_VARIANT_TYPES = [
  VARIANT_TYPE.INPAINT,
  VARIANT_TYPE.MAGIC_EDIT,
  VARIANT_TYPE.ANNOTATED_EDIT,
  VARIANT_TYPE.EDIT,
] as const;

type EditVariantType = typeof EDIT_VARIANT_TYPES[number];
