import { describe, it, expect } from 'vitest';
import { useShotEditorBridge } from '../useShotEditorBridge';

describe('useShotEditorBridge', () => {
  it('exports expected members', () => {
    expect(useShotEditorBridge).toBeDefined();
  });

  it('useShotEditorBridge is a callable function', () => {
    expect(typeof useShotEditorBridge).toBe('function');
    expect(useShotEditorBridge.name).toBeDefined();
  });
});
