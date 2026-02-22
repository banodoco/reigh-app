import { describe, it, expect } from 'vitest';
import { useShotEditorSetup } from '../useShotEditorSetup';

describe('useShotEditorSetup', () => {
  it('exports expected members', () => {
    expect(useShotEditorSetup).toBeDefined();
  });

  it('useShotEditorSetup is a callable function', () => {
    expect(typeof useShotEditorSetup).toBe('function');
    expect(useShotEditorSetup.name).toBeDefined();
  });
});
