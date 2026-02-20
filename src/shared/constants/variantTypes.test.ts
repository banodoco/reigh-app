import { describe, it, expect } from 'vitest';
import { EDIT_VARIANT_TYPES, VARIANT_TYPE } from './variantTypes';

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
});
