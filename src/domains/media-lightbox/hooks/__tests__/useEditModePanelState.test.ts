import { describe, it, expect } from 'vitest';
import { useEditModePanelState } from '../useEditModePanelState';

describe('useEditModePanelState', () => {
  it('exports expected members', () => {
    expect(useEditModePanelState).toBeDefined();
  });

  it('useEditModePanelState is a callable function', () => {
    expect(typeof useEditModePanelState).toBe('function');
    expect(useEditModePanelState.name).toBeDefined();
  });
});
