import { describe, it, expect } from 'vitest';
import { useVideoMetadata } from '../../video/useVideoMetadata';

describe('useVideoMetadata', () => {
  it('exports expected members', () => {
    expect(useVideoMetadata).toBeDefined();
  });

  it('useVideoMetadata is a callable function', () => {
    expect(typeof useVideoMetadata).toBe('function');
    expect(useVideoMetadata.name).toBeDefined();
  });
});
