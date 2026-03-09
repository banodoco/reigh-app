export const VARIANT_TYPE = {
  ORIGINAL: 'original',
  UPSCALED: 'upscaled',
  EDIT: 'edit',
  INPAINT: 'inpaint',
  MAGIC_EDIT: 'magic_edit',
  ANNOTATED_EDIT: 'annotated_edit',
  TRIMMED: 'trimmed',
  REPOSITIONED: 'repositioned',
  LOADED: 'loaded',
  TRAVEL_SEGMENT: 'travel_segment',
  TRAVEL_STITCH: 'travel_stitch',
  INDIVIDUAL_SEGMENT: 'individual_segment',
  JOIN_CLIPS_SEGMENT: 'join_clips_segment',
  CLIP_JOIN: 'clip_join',
  JOIN_FINAL_STITCH: 'join_final_stitch',
  REGENERATED: 'regenerated',
  CHILD_PROMOTED: 'child_promoted',
} as const;

export type VariantType = typeof VARIANT_TYPE[keyof typeof VARIANT_TYPE];

export const EDIT_VARIANT_TYPES = [
  VARIANT_TYPE.INPAINT,
  VARIANT_TYPE.MAGIC_EDIT,
  VARIANT_TYPE.ANNOTATED_EDIT,
  VARIANT_TYPE.EDIT,
] as const;

type EditVariantType = typeof EDIT_VARIANT_TYPES[number];

const VARIANT_TYPE_VALUES = new Set<VariantType>(Object.values(VARIANT_TYPE));

export function isVariantType(value: unknown): value is VariantType {
  return typeof value === 'string' && VARIANT_TYPE_VALUES.has(value as VariantType);
}

export function coerceVariantType(value: unknown): VariantType | null {
  return isVariantType(value) ? value : null;
}
