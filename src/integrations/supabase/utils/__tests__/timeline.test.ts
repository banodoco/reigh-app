import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the env module to avoid import.meta.env errors
vi.mock('@/integrations/supabase/config/env', () => ({
  __CORRUPTION_TRACE_ENABLED__: true,
}));

import { addCorruptionEvent, __CORRUPTION_TIMELINE__ } from '../timeline';

describe('addCorruptionEvent', () => {
  beforeEach(() => {
    // Clear the timeline before each test
    __CORRUPTION_TIMELINE__.length = 0;
  });

  it('adds an event to the timeline', () => {
    addCorruptionEvent('test_event', { key: 'value' });

    expect(__CORRUPTION_TIMELINE__).toHaveLength(1);
    expect(__CORRUPTION_TIMELINE__[0].event).toBe('test_event');
    expect(__CORRUPTION_TIMELINE__[0].data).toEqual({ key: 'value' });
    expect(__CORRUPTION_TIMELINE__[0].timestamp).toBeGreaterThan(0);
  });

  it('adds event with empty data by default', () => {
    addCorruptionEvent('simple_event');

    expect(__CORRUPTION_TIMELINE__).toHaveLength(1);
    expect(__CORRUPTION_TIMELINE__[0].data).toEqual({});
  });

  it('includes a stack trace', () => {
    addCorruptionEvent('stack_event');

    expect(__CORRUPTION_TIMELINE__[0].stack).toBeDefined();
    expect(typeof __CORRUPTION_TIMELINE__[0].stack).toBe('string');
  });

  it('maintains ring buffer of max 100 entries', () => {
    // Fill with 100 entries
    for (let i = 0; i < 105; i++) {
      addCorruptionEvent(`event_${i}`);
    }

    expect(__CORRUPTION_TIMELINE__).toHaveLength(100);
    // First entries should have been evicted
    expect(__CORRUPTION_TIMELINE__[0].event).toBe('event_5');
    expect(__CORRUPTION_TIMELINE__[99].event).toBe('event_104');
  });

  it('records timestamp for each event', () => {
    const before = Date.now();
    addCorruptionEvent('timed_event');
    const after = Date.now();

    expect(__CORRUPTION_TIMELINE__[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(__CORRUPTION_TIMELINE__[0].timestamp).toBeLessThanOrEqual(after);
  });
});
