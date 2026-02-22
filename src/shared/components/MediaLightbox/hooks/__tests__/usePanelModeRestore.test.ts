import { describe, it, expect } from 'vitest';
import { usePanelModeRestore } from '../usePanelModeRestore';

describe('usePanelModeRestore', () => {
  it('exports expected members', () => {
    expect(usePanelModeRestore).toBeDefined();
  });

  it('usePanelModeRestore is a callable function', () => {
    expect(typeof usePanelModeRestore).toBe('function');
    expect(usePanelModeRestore.name).toBeDefined();
  });
});
