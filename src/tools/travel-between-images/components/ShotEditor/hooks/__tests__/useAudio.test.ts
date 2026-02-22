import { describe, it, expect } from 'vitest';
import { useAudio } from '../useAudio';

describe('useAudio', () => {
  it('exports expected members', () => {
    expect(useAudio).toBeDefined();
  });

  it('useAudio is a callable function', () => {
    expect(typeof useAudio).toBe('function');
    expect(useAudio.name).toBeDefined();
  });
});
