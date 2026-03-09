import { describe, it, expect } from 'vitest';
import {
  coerceVariantType,
  EDIT_VARIANT_TYPES,
  isVariantType,
  VARIANT_TYPE,
} from './variantTypes';

describe('variantTypes', () => {
  it('defines unique variant values', () => {
    const values = Object.values(VARIANT_TYPE);
    expect(new Set(values).size).toBe(values.length);
  });

  it('keeps edit variants scoped to edit-capable types', () => {
    expect(EDIT_VARIANT_TYPES).toEqual([
      VARIANT_TYPE.INPAINT,
      VARIANT_TYPE.MAGIC_EDIT,
      VARIANT_TYPE.ANNOTATED_EDIT,
      VARIANT_TYPE.EDIT,
    ]);
  });

  it('exposes helpers for narrowing persisted variant strings', () => {
    expect(isVariantType(VARIANT_TYPE.TRIMMED)).toBe(true);
    expect(isVariantType('unknown_variant')).toBe(false);
    expect(coerceVariantType(VARIANT_TYPE.CHILD_PROMOTED)).toBe(VARIANT_TYPE.CHILD_PROMOTED);
    expect(coerceVariantType('unknown_variant')).toBeNull();
  });
});
