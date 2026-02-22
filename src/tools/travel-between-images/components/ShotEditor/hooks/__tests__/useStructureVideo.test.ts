import { describe, it, expect } from 'vitest';
import { useStructureVideo } from '../useStructureVideo';

describe('useStructureVideo', () => {
  it('exports expected members', () => {
    expect(useStructureVideo).toBeDefined();
  });

  it('useStructureVideo is a callable function', () => {
    expect(typeof useStructureVideo).toBe('function');
    expect(useStructureVideo.name).toBeDefined();
  });
});
