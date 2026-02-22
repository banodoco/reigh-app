import { describe, it, expect } from 'vitest';
import { getRectangleCorners, isPointOnShape, getClickedCornerIndex, getRectangleClickType } from '../shapeHelpers';

describe('shapeHelpers', () => {
  it('exports expected members', () => {
    expect(getRectangleCorners).toBeDefined();
    expect(isPointOnShape).toBeDefined();
    expect(getClickedCornerIndex).toBeDefined();
    expect(getRectangleClickType).toBeDefined();
  });
});
