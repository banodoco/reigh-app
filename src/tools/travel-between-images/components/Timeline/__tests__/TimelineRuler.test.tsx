import { describe, it, expect } from 'vitest';
import TimelineRuler from '../TimelineRuler';

describe('TimelineRuler', () => {
  it('exports expected members', () => {
    expect(TimelineRuler).toBeDefined();
    expect(typeof TimelineRuler).toBe('function');
  });
});
