import { describe, it, expect } from 'vitest';
import { exportStrokeMask } from '../maskExport';

describe('exportStrokeMask', () => {
  it('returns null when there are no strokes to export', () => {
    const result = exportStrokeMask({
      strokes: [],
      imageWidth: 512,
      imageHeight: 512,
    });

    expect(result).toBeNull();
  });
});
