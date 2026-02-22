import { describe, it, expect } from 'vitest';
import { useShotEditorController } from '../useShotEditorController';

describe('useShotEditorController', () => {
  it('exports expected members', () => {
    expect(useShotEditorController).toBeDefined();
  });

  it('useShotEditorController is a callable function', () => {
    expect(typeof useShotEditorController).toBe('function');
    expect(useShotEditorController.name).toBeDefined();
  });
});
