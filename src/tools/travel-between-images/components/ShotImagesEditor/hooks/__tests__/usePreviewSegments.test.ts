import { describe, it, expect } from 'vitest';
import { usePreviewSegments } from '../usePreviewSegments';

describe('usePreviewSegments', () => {
  it('exports expected members', () => {
    expect(usePreviewSegments).toBeDefined();
  });

  it('usePreviewSegments is a callable function', () => {
    expect(typeof usePreviewSegments).toBe('function');
    expect(usePreviewSegments.name).toBeDefined();
  });
});
