import { describe, it, expect } from 'vitest';
import { useShotEditorState } from '../useShotEditorState';

describe('useShotEditorState', () => {
  it('exports expected members', () => {
    expect(useShotEditorState).toBeDefined();
  });

  it('useShotEditorState is a callable function', () => {
    expect(typeof useShotEditorState).toBe('function');
    expect(useShotEditorState.name).toBeDefined();
  });
});
