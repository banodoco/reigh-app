import { describe, it, expect } from 'vitest';
import PaneControlTab from '../PaneControlTab';

describe('PaneControlTab', () => {
  it('exports expected members', () => {
    expect(PaneControlTab).toBeDefined();
    expect(typeof PaneControlTab).toBe('function');
  });
});
