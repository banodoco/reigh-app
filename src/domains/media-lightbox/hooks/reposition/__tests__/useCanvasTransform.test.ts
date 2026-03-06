import { describe, it, expect } from 'vitest';
import { useCanvasTransform } from '../useCanvasTransform';

describe('useCanvasTransform', () => {
  it('exports expected members', () => {
    expect(useCanvasTransform).toBeDefined();
  });

  it('useCanvasTransform is a callable function', () => {
    expect(typeof useCanvasTransform).toBe('function');
    expect(useCanvasTransform.name).toBeDefined();
  });
});
